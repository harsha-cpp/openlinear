mod deeplink;
mod opencode;
mod secure_storage;
mod sidecar;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in argv {
                deeplink::handle_deep_link_arg(app, &arg);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            deeplink::setup_deep_link_handler(app);

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = sidecar::start_api_server_with_saved_database_url(app_handle).await {
                    if err != "API server is already running" {
                        eprintln!("[Sidecar] Failed to start API server during app setup: {err}");
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            opencode::check_opencode,
            opencode::pick_local_folder,
            sidecar::start_api_server,
            sidecar::stop_api_server,
            secure_storage::store_secret,
            secure_storage::retrieve_secret,
            secure_storage::remove_secret,
            secure_storage::check_secret_exists,
            secure_storage::get_all_secret_keys
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            let _ = sidecar::stop_api_server_sync();
        }
    });
}
