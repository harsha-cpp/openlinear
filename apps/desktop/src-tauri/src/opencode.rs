//! OpenCode CLI detection module

use serde::Serialize;
use std::process::Command;
use which::which;
use std::sync::Mutex;
use tauri::Emitter;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Status of OpenCode CLI installation
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct OpenCodeStatus {
    pub found: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

impl Default for OpenCodeStatus {
    fn default() -> Self {
        Self {
            found: false,
            version: None,
            path: None,
        }
    }
}

#[tauri::command]
pub fn check_opencode() -> OpenCodeStatus {
    match which("opencode") {
        Ok(path) => {
            let version = Command::new(&path)
                .arg("--version")
                .output()
                .ok()
                .and_then(|output| {
                    if output.status.success() {
                        String::from_utf8(output.stdout).ok()
                    } else {
                        String::from_utf8(output.stderr).ok()
                    }
                })
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            OpenCodeStatus {
                found: true,
                version,
                path: Some(path.to_string_lossy().to_string()),
            }
        }
        Err(_) => OpenCodeStatus::default(),
    }
}

#[tauri::command]
pub fn pick_local_folder() -> Option<String> {
    rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[allow(dead_code)]
fn check_binary_exists(binary_name: &str) -> bool {
    which(binary_name).is_ok()
}

static OPENCODE_PROCESS: Mutex<Option<CommandChild>> = Mutex::new(None);

#[derive(Clone, Serialize)]
pub struct OpenCodeOutput {
    pub stream: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
pub struct OpenCodeExit {
    pub code: Option<i32>,
    pub signal: Option<i32>,
}

#[derive(Clone, Serialize, Default)]
pub struct ExecutionMetadataSync {
    pub version: Option<String>,
    #[serde(rename = "taskId")]
    pub task_id: String,
    #[serde(rename = "runId")]
    pub run_id: String,
    pub status: String,
    #[serde(rename = "startedAt", skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(rename = "completedAt", skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(rename = "durationMs", skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(rename = "commitSha", skip_serializing_if = "Option::is_none")]
    pub commit_sha: Option<String>,
    #[serde(rename = "prUrl", skip_serializing_if = "Option::is_none")]
    pub pr_url: Option<String>,
    #[serde(rename = "prNumber", skip_serializing_if = "Option::is_none")]
    pub pr_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<String>,
    #[serde(rename = "errorCategory", skip_serializing_if = "Option::is_none")]
    pub error_category: Option<String>,
}

#[tauri::command]
pub async fn run_opencode_task(
    app: tauri::AppHandle,
    task_id: String,
    run_id: String,
    prompt: String,
    repo_path: String,
) -> Result<(), String> {
    const METADATA_VERSION: &str = "1.0";

    {
        let guard = OPENCODE_PROCESS.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("An OpenCode task is already running".to_string());
        }
    }

    let github_token = crate::secure_storage::get_secret(crate::secure_storage::keys::GITHUB_TOKEN.to_string()).ok();
    let openai_api_key = crate::secure_storage::get_secret(crate::secure_storage::keys::OPENAI_API_KEY.to_string()).ok();
    let anthropic_api_key = crate::secure_storage::get_secret(crate::secure_storage::keys::ANTHROPIC_API_KEY.to_string()).ok();
    let custom_api_key = crate::secure_storage::get_secret(crate::secure_storage::keys::CUSTOM_API_KEY.to_string()).ok();

    if github_token.is_none() || (openai_api_key.is_none() && anthropic_api_key.is_none() && custom_api_key.is_none()) {
        let _ = app.emit(
            &format!("opencode:metadata:{}", task_id),
            ExecutionMetadataSync {
                version: Some(METADATA_VERSION.to_string()),
                task_id: task_id.clone(),
                run_id: run_id.clone(),
                status: "failed".to_string(),
                error_category: Some("AUTH".to_string()),
                outcome: Some("Missing required API keys".to_string()),
                ..Default::default()
            },
        );
        return Err("Missing required API keys".to_string());
    }

    let _ = app.emit(
        &format!("opencode:metadata:{}", task_id),
        ExecutionMetadataSync {
            version: Some(METADATA_VERSION.to_string()),
            task_id: task_id.clone(),
            run_id: run_id.clone(),
            status: "starting".to_string(),
            ..Default::default()
        },
    );

    let mut command = app
        .shell()
        .command("opencode")
        .args(["--task", &prompt, "--dir", &repo_path]);

    if let Some(token) = github_token {
        command = command.env("GITHUB_TOKEN", token);
    }
    if let Some(key) = openai_api_key {
        command = command.env("OPENAI_API_KEY", key);
    }
    if let Some(key) = anthropic_api_key {
        command = command.env("ANTHROPIC_API_KEY", key);
    }
    if let Some(key) = custom_api_key {
        command = command.env("CUSTOM_API_KEY", key);
    }

    let (mut rx, child) = match command.spawn() {
        Ok(result) => result,
        Err(e) => {
            let _ = app.emit(
                &format!("opencode:metadata:{}", task_id),
                ExecutionMetadataSync {
                    version: Some(METADATA_VERSION.to_string()),
                    task_id: task_id.clone(),
                    run_id: run_id.clone(),
                    status: "failed".to_string(),
                    error_category: Some("UNKNOWN".to_string()),
                    outcome: Some("Failed to start OpenCode task".to_string()),
                    ..Default::default()
                },
            );
            return Err(format!("Failed to spawn OpenCode: {}", e));
        }
    };

    {
        let mut guard = OPENCODE_PROCESS.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    let _ = app.emit(
        &format!("opencode:metadata:{}", task_id),
        ExecutionMetadataSync {
            version: Some(METADATA_VERSION.to_string()),
            task_id: task_id.clone(),
            run_id: run_id.clone(),
            status: "running".to_string(),
            ..Default::default()
        },
    );

    let app_handle = app.clone();
    let task_id_clone = task_id.clone();
    let run_id_clone = run_id.clone();
    
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let data = String::from_utf8_lossy(&line).to_string();
                    let _ = app_handle.emit(
                        &format!("opencode:output:{}", task_id_clone),
                        OpenCodeOutput {
                            stream: "stdout".to_string(),
                            data,
                        },
                    );
                }
                CommandEvent::Stderr(line) => {
                    let data = String::from_utf8_lossy(&line).to_string();
                    let _ = app_handle.emit(
                        &format!("opencode:output:{}", task_id_clone),
                        OpenCodeOutput {
                            stream: "stderr".to_string(),
                            data,
                        },
                    );
                }
                CommandEvent::Terminated(payload) => {
                    let status = if payload.code == Some(0) {
                        "completed".to_string()
                    } else {
                        "failed".to_string()
                    };
                    
                    let error_category = if payload.code != Some(0) {
                        Some("UNKNOWN".to_string())
                    } else {
                        None
                    };

                    let _ = app_handle.emit(
                        &format!("opencode:metadata:{}", task_id_clone),
                        ExecutionMetadataSync {
                            version: Some(METADATA_VERSION.to_string()),
                            task_id: task_id_clone.clone(),
                            run_id: run_id_clone.clone(),
                            status,
                            error_category,
                            ..Default::default()
                        },
                    );

                    let _ = app_handle.emit(
                        &format!("opencode:exit:{}", task_id_clone),
                        OpenCodeExit {
                            code: payload.code,
                            signal: payload.signal,
                        },
                    );
                    if let Ok(mut guard) = OPENCODE_PROCESS.lock() {
                        *guard = None;
                    }
                    break;
                }
                CommandEvent::Error(err) => {
                    let _ = app_handle.emit(
                        &format!("opencode:metadata:{}", task_id_clone),
                        ExecutionMetadataSync {
                            version: Some(METADATA_VERSION.to_string()),
                            task_id: task_id_clone.clone(),
                            run_id: run_id_clone.clone(),
                            status: "failed".to_string(),
                            error_category: Some("UNKNOWN".to_string()),
                            outcome: Some("OpenCode process error".to_string()),
                            ..Default::default()
                        },
                    );

                    let _ = app_handle.emit(
                        &format!("opencode:output:{}", task_id_clone),
                        OpenCodeOutput {
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

#[tauri::command]
pub async fn stop_opencode_task() -> Result<(), String> {
    let mut guard = OPENCODE_PROCESS.lock().map_err(|e| e.to_string())?;

    match guard.take() {
        Some(child) => {
            child.kill().map_err(|e| format!("Failed to kill OpenCode task: {}", e))?;
            Ok(())
        }
        None => Err("No OpenCode task is running".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opencode_status_default() {
        let status = OpenCodeStatus::default();
        assert!(!status.found);
        assert!(status.version.is_none());
        assert!(status.path.is_none());
    }

    #[test]
    fn test_check_binary_exists_with_common_binary() {
        assert!(check_binary_exists("ls"));
    }

    #[test]
    fn test_check_binary_exists_with_nonexistent_binary() {
        assert!(!check_binary_exists(
            "this-binary-definitely-does-not-exist-12345"
        ));
    }

    #[test]
    fn test_check_opencode_returns_valid_structure() {
        let status = check_opencode();

        if status.found {
            assert!(status.path.is_some());
        } else {
            assert!(status.path.is_none());
        }
    }

    #[test]
    fn test_opencode_status_serialization() {
        let status = OpenCodeStatus {
            found: true,
            version: Some("1.0.0".to_string()),
            path: Some("/usr/local/bin/opencode".to_string()),
        };

        let json = serde_json::to_string(&status).expect("Should serialize");
        assert!(json.contains("\"found\":true"));
        assert!(json.contains("\"version\":\"1.0.0\""));
        assert!(json.contains("\"path\":\"/usr/local/bin/opencode\""));
    }

    #[test]
    fn test_execution_metadata_sync_serialization() {
        let metadata = ExecutionMetadataSync {
            version: Some("1.0".to_string()),
            task_id: "task_123".to_string(),
            run_id: "run_456".to_string(),
            status: "starting".to_string(),
            ..Default::default()
        };

        let json = serde_json::to_string(&metadata).expect("Should serialize");
        assert!(json.contains("\"taskId\":\"task_123\""));
        assert!(json.contains("\"runId\":\"run_456\""));
        assert!(json.contains("\"status\":\"starting\""));
    }

    #[test]
    fn test_execution_metadata_sync_auth_error() {
        let metadata = ExecutionMetadataSync {
            version: Some("1.0".to_string()),
            task_id: "task_123".to_string(),
            run_id: "run_456".to_string(),
            status: "failed".to_string(),
            error_category: Some("AUTH".to_string()),
            outcome: Some("Missing required API keys".to_string()),
            ..Default::default()
        };

        let json = serde_json::to_string(&metadata).expect("Should serialize");
        assert!(json.contains("\"status\":\"failed\""));
        assert!(json.contains("\"errorCategory\":\"AUTH\""));
        assert!(json.contains("\"outcome\":\"Missing required API keys\""));
    }

    #[test]
    fn test_execution_metadata_sync_running_status() {
        let metadata = ExecutionMetadataSync {
            version: Some("1.0".to_string()),
            task_id: "task_123".to_string(),
            run_id: "run_456".to_string(),
            status: "running".to_string(),
            ..Default::default()
        };

        let json = serde_json::to_string(&metadata).expect("Should serialize");
        assert!(json.contains("\"status\":\"running\""));
        assert!(json.contains("\"taskId\":\"task_123\""));
        assert!(json.contains("\"runId\":\"run_456\""));
    }

    #[test]
    fn test_execution_metadata_sync_forbidden_fields_absent() {
        let metadata = ExecutionMetadataSync {
            version: Some("1.0".to_string()),
            task_id: "task_123".to_string(),
            run_id: "run_456".to_string(),
            status: "failed".to_string(),
            error_category: Some("AUTH".to_string()),
            outcome: Some("Missing required API keys".to_string()),
            ..Default::default()
        };

        let json = serde_json::to_value(&metadata).expect("Should serialize to value");
        let object = json.as_object().expect("Should be JSON object");

        assert!(!object.contains_key("prompt"));
        assert!(!object.contains_key("logs"));
        assert!(!object.contains_key("toolLogs"));
        assert!(!object.contains_key("accessToken"));
    }
}
