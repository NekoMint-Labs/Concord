use std::time::Duration;
use tokio::io::AsyncReadExt;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use crate::backend::{self, ConnectionInfo, SharedBackend};

fn require_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("Native access is restricted to the main local workspace".into()); }
    Ok(())
}

#[tauri::command]
pub async fn connection_info(window: WebviewWindow, state: State<'_, SharedBackend>) -> Result<ConnectionInfo, String> {
    require_main(&window)?;
    backend::ready(state.inner()).await
}

#[tauri::command]
pub async fn import_document(app: AppHandle, window: WebviewWindow, state: State<'_, SharedBackend>, project_id: String) -> Result<serde_json::Value, String> {
    require_main(&window)?;
    if project_id.is_empty() || project_id.len() > 80 || !project_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid project identifier".into());
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().add_filter("Project documents", &["txt", "md", "csv", "log", "pdf", "docx", "pptx", "html", "ifc"])
        .pick_file(move |selected| { let _ = sender.send(selected); });
    let selected = receiver.await.map_err(|_| "Native file dialog failed")?;
    let Some(selected) = selected else { return Ok(serde_json::json!({"cancelled": true})); };
    // The caller cannot supply a file path. Only the explicit native dialog grants access.
    let path = selected.into_path().map_err(|_| "Only local files can be imported")?;
    let file = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;
    let metadata = file.metadata().await.map_err(|e| e.to_string())?;
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    let limit = crate::import_policy::import_limit(&extension);
    if !metadata.is_file() || metadata.len() > limit {
        return Err(format!("Select a regular file no larger than {} MiB for this format", limit / (1024 * 1024)));
    }
    if !["txt", "md", "csv", "log", "pdf", "docx", "pptx", "html", "ifc"].contains(&extension.as_str()) {
        return Err("File type is not allowed".into());
    }
    let name = path.file_name().and_then(|s| s.to_str()).ok_or("Invalid filename")?.to_string();
    let mut data = Vec::new();
    file.take(limit + 1).read_to_end(&mut data).await.map_err(|e| e.to_string())?;
    if data.len() as u64 > limit { return Err("File changed and exceeds the size limit".into()); }
    let connection = backend::ready(state.inner()).await?;
    let target = if extension == "ifc" { "bim/import" } else { "documents" };
    let form = reqwest::multipart::Form::new().part("file", reqwest::multipart::Part::bytes(data).file_name(name));
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(120)).build().map_err(|e| e.to_string())?;
    let response = client.post(format!("{}/api/projects/{}/{}", connection.endpoint, project_id, target))
        .bearer_auth(connection.token).multipart(form).send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let value: serde_json::Value = response.json().await.map_err(|_| "Backend returned an invalid import response")?;
    if !status.is_success() { return Err(value.get("detail").and_then(|v| v.as_str()).unwrap_or("Import failed").to_string()); }
    Ok(value)
}
