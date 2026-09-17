use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

#[derive(Clone, Serialize)]
pub struct ConnectionInfo {
    pub endpoint: String,
    pub token: String,
}

pub struct Backend {
    pub connection: Option<ConnectionInfo>,
    pub child: Option<CommandChild>,
    pub error: Option<String>,
}

pub type SharedBackend = Arc<Mutex<Backend>>;

pub fn spawn(app: &AppHandle, shared: SharedBackend) -> Result<(), String> {
    let default = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let data = crate::data_dir::resolve(default, std::env::var_os("CCA_DESKTOP_DATA_DIR"))?;
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    // Two independent UUIDs give a fresh secret on every launch. Never commit it.
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    let command = app.shell().sidecar("cca-sidecar").map_err(|e| e.to_string())?
        .args(["serve", "--host", "127.0.0.1", "--port", "0"])
        .env("CCA_PROFILE", "desktop")
        .env("CCA_DATA_DIR", data.to_string_lossy().to_string())
        // Embedded storage is always scoped to this application data directory,
        // never inherited from a development shell's server configuration.
        .env("CCA_DATABASE_URL", "")
        .env("CCA_RUNTIME_DATABASE_URL", "")
        .env("CCA_STORAGE", "local")
        .env("CCA_API_TOKEN", token.clone())
        .env("CCA_RUNTIME", "dbos")
        .env("CCA_DIAGNOSTIC_RUNTIME", "false")
        .env("PYTHONUNBUFFERED", "1");
    let (mut events, child) = command.spawn().map_err(|e| format!("Python sidecar failed to start: {e}"))?;
    shared.lock().map_err(|_| "Backend state lock failed")?.child = Some(child);
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    if line.trim().starts_with("CCA_ENDPOINT=") {
                        if let Ok(mut state) = shared.lock() {
                            match crate::endpoint::parse_announcement(&line) {
                                Some(endpoint) => {
                                    if state.connection.as_ref().is_some_and(|info| info.endpoint != endpoint) {
                                        state.error = Some("Python sidecar changed its connection unexpectedly.".into());
                                    } else {
                                        state.connection = Some(ConnectionInfo { endpoint, token: token.clone() });
                                    }
                                }
                                None => state.error = Some("Python sidecar announced an invalid local endpoint.".into()),
                            }
                        }
                    }
                }
                CommandEvent::Error(_) => {
                    if let Ok(mut state) = shared.lock() {
                        state.error = Some("Python sidecar I/O failed. Restart the desktop application.".into());
                    }
                }
                CommandEvent::Terminated(payload) => {
                    if let Ok(mut state) = shared.lock() {
                        state.error = Some(format!("Python sidecar exited (code {:?}). Local data is retained; restart the application.", payload.code));
                        state.child = None;
                    }
                    break;
                }
                _ => {} // Never forward raw process logs or credentials into the webview.
            }
        }
    });
    Ok(())
}

pub fn current(shared: &SharedBackend) -> Result<Option<ConnectionInfo>, String> {
    let state = shared.lock().map_err(|_| "Backend state lock failed")?;
    if let Some(error) = &state.error { return Err(error.clone()); }
    Ok(state.connection.clone())
}

pub async fn ready(shared: &SharedBackend) -> Result<ConnectionInfo, String> {
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_millis(800)).build().map_err(|e| e.to_string())?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    while tokio::time::Instant::now() < deadline {
        if let Some(info) = current(shared)? {
            if let Ok(response) = client.get(format!("{}/api/profile", info.endpoint)).bearer_auth(&info.token).send().await {
                if response.status().is_success() { return Ok(info); }
            }
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    Err("Python core did not become healthy within the startup deadline. Check bundled dependencies and available disk space.".into())
}

pub async fn shutdown(shared: SharedBackend) {
    if let Ok(Some(info)) = current(&shared) {
        if let Ok(client) = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(2)).build() {
            let _ = client.post(format!("{}/api/desktop/shutdown", info.endpoint)).bearer_auth(info.token).send().await;
        }
    }
    // Let Uvicorn and DBOS finish their bounded shutdown before force-killing.
    // The event reader clears `child` on Terminated; no mutex spans an await.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    while tokio::time::Instant::now() < deadline {
        let alive = shared.lock().map(|state| state.child.is_some()).unwrap_or(false);
        if !alive { return; }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if let Ok(mut state) = shared.lock() {
        if let Some(child) = state.child.take() { let _ = child.kill(); }
    }
}
