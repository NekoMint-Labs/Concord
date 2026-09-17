mod backend;
mod endpoint;
mod commands;
mod data_dir;

use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared: backend::SharedBackend = Arc::new(Mutex::new(backend::Backend { connection: None, child: None, error: None }));
    let on_setup = shared.clone();
    let on_exit = shared.clone();
    let exiting = Arc::new(AtomicBool::new(false));
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(shared)
        .invoke_handler(tauri::generate_handler![commands::connection_info, commands::import_document])
        .setup(move |app| {
            if let Err(error) = backend::spawn(app.handle(), on_setup.clone()) {
                if let Ok(mut state) = on_setup.lock() { state.error = Some(error); }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to initialize desktop host");
    app.run(move |handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if !exiting.swap(true, Ordering::SeqCst) {
                api.prevent_exit();
                let state = on_exit.clone();
                let app = handle.clone();
                tauri::async_runtime::spawn(async move {
                    backend::shutdown(state).await;
                    app.exit(0);
                });
            }
        }
    });
}
