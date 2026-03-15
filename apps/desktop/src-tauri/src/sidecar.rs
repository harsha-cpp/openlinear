use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

static API_SERVER_PROCESS: Mutex<Option<CommandChild>> = Mutex::new(None);
const DEFAULT_DATABASE_URL: &str = "postgresql://openlinear:openlinear@localhost:5432/openlinear";

#[derive(Clone, Serialize)]
pub struct SidecarOutput {
    pub stream: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
pub struct SidecarExit {
    pub code: Option<i32>,
    pub signal: Option<i32>,
}

#[tauri::command]
pub async fn start_api_server(app: tauri::AppHandle, database_url: String) -> Result<(), String> {
    start_api_server_inner(app, database_url).await
}

pub async fn start_api_server_with_saved_database_url(app: tauri::AppHandle) -> Result<(), String> {
    let database_url = load_saved_database_url(&app).unwrap_or_else(|| DEFAULT_DATABASE_URL.to_string());
    start_api_server_inner(app, database_url).await
}

async fn start_api_server_inner(app: tauri::AppHandle, database_url: String) -> Result<(), String> {
    {
        let guard = API_SERVER_PROCESS.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("API server is already running".to_string());
        }
    }

    let sidecar_command = app
        .shell()
        .sidecar("openlinear-sidecar")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .env("DATABASE_URL", database_url);

    let (mut rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn API server: {}", e))?;

    {
        let mut guard = API_SERVER_PROCESS.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let data = String::from_utf8_lossy(&line).to_string();
                    println!("[Sidecar] {}", data.trim_end());
                    let _ = app_handle.emit(
                        "sidecar:output",
                        SidecarOutput {
                            stream: "stdout".to_string(),
                            data,
                        },
                    );
                }
                CommandEvent::Stderr(line) => {
                    let data = String::from_utf8_lossy(&line).to_string();
                    eprintln!("[Sidecar] {}", data.trim_end());
                    let _ = app_handle.emit(
                        "sidecar:output",
                        SidecarOutput {
                            stream: "stderr".to_string(),
                            data,
                        },
                    );
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!(
                        "[Sidecar] exited with code {:?} signal {:?}",
                        payload.code, payload.signal
                    );
                    let _ = app_handle.emit(
                        "sidecar:exit",
                        SidecarExit {
                            code: payload.code,
                            signal: payload.signal,
                        },
                    );
                    if let Ok(mut guard) = API_SERVER_PROCESS.lock() {
                        *guard = None;
                    }
                    break;
                }
                CommandEvent::Error(err) => {
                    let _ = app_handle.emit(
                        "sidecar:output",
                        SidecarOutput {
                            stream: "stderr".to_string(),
                            data: format!("Error: {}", err),
                        },
                    );
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn load_saved_database_url(app: &tauri::AppHandle) -> Option<String> {
    let settings_path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("settings.json"))?;

    read_database_url(settings_path)
}

fn read_database_url(path: PathBuf) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    let json: Value = serde_json::from_str(&contents).ok()?;
    json.get("database_url")?.as_str().map(str::to_string)
}

#[tauri::command]
pub async fn stop_api_server() -> Result<(), String> {
    stop_api_server_sync()
}

pub fn stop_api_server_sync() -> Result<(), String> {
    let mut guard = API_SERVER_PROCESS.lock().map_err(|e| e.to_string())?;

    match guard.take() {
        Some(child) => {
            child.kill().map_err(|e| format!("Failed to kill API server: {}", e))?;
            Ok(())
        }
        None => Err("API server is not running".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sidecar_output_serialization() {
        let output = SidecarOutput {
            stream: "stdout".to_string(),
            data: "Server started on port 3001".to_string(),
        };

        let json = serde_json::to_string(&output).expect("Should serialize");
        assert!(json.contains("\"stream\":\"stdout\""));
        assert!(json.contains("Server started on port 3001"));
    }

    #[test]
    fn test_sidecar_exit_serialization() {
        let exit = SidecarExit {
            code: Some(0),
            signal: None,
        };

        let json = serde_json::to_string(&exit).expect("Should serialize");
        assert!(json.contains("\"code\":0"));
        assert!(json.contains("\"signal\":null"));
    }

    #[test]
    fn test_sidecar_exit_with_signal() {
        let exit = SidecarExit {
            code: None,
            signal: Some(9),
        };

        let json = serde_json::to_string(&exit).expect("Should serialize");
        assert!(json.contains("\"code\":null"));
        assert!(json.contains("\"signal\":9"));
    }
}
