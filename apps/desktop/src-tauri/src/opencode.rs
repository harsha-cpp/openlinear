use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use which::which;

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

fn get_opencode_version(binary_path: &std::path::Path) -> Option<String> {
    Command::new(binary_path)
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
        .filter(|s| !s.is_empty())
}

#[tauri::command]
pub fn check_opencode() -> OpenCodeStatus {
    match which("opencode") {
        Ok(path) => {
            let version = get_opencode_version(&path);
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
    let dialog = match default_home_dir() {
        Some(path) => rfd::FileDialog::new().set_directory(path),
        None => rfd::FileDialog::new(),
    };

    dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

fn default_home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
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
}
