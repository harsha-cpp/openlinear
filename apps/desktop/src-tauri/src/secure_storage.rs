use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "com.openlinear.app";

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct StoredSecret {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
pub struct SecureStorageResult {
    pub success: bool,
    pub error: Option<String>,
}

pub mod keys {
    pub const GITHUB_TOKEN: &str = "github_token";
    pub const OPENAI_API_KEY: &str = "openai_api_key";
    pub const ANTHROPIC_API_KEY: &str = "anthropic_api_key";
    pub const CUSTOM_API_KEY: &str = "custom_api_key";
}

pub fn validate_key(key: &str) -> Result<&'static str, String> {
    match key {
        keys::GITHUB_TOKEN => Ok(keys::GITHUB_TOKEN),
        keys::OPENAI_API_KEY => Ok(keys::OPENAI_API_KEY),
        keys::ANTHROPIC_API_KEY => Ok(keys::ANTHROPIC_API_KEY),
        keys::CUSTOM_API_KEY => Ok(keys::CUSTOM_API_KEY),
        _ => Err("Invalid secret key provided".to_string()),
    }
}

pub fn set_secret(key: String, value: String) -> Result<(), String> {
    let valid_key = validate_key(&key)?;
    let entry = Entry::new(SERVICE_NAME, valid_key).map_err(|_| "Failed to access secure storage".to_string())?;
    entry.set_password(&value).map_err(|_| "Failed to store secret".to_string())?;
    Ok(())
}

pub fn get_secret(key: String) -> Result<String, String> {
    let valid_key = validate_key(&key)?;
    let entry = Entry::new(SERVICE_NAME, valid_key).map_err(|_| "Failed to access secure storage".to_string())?;
    entry.get_password().map_err(|_| "Failed to retrieve secret".to_string())
}

pub fn delete_secret(key: String) -> Result<(), String> {
    let valid_key = validate_key(&key)?;
    let entry = Entry::new(SERVICE_NAME, valid_key).map_err(|_| "Failed to access secure storage".to_string())?;
    entry.delete_credential().map_err(|_| "Failed to delete secret".to_string())?;
    Ok(())
}

pub fn has_secret(key: String) -> bool {
    if let Ok(valid_key) = validate_key(&key) {
        if let Ok(entry) = Entry::new(SERVICE_NAME, valid_key) {
            return entry.get_password().is_ok();
        }
    }
    false
}

pub fn list_secrets() -> Result<Vec<String>, String> {
    let mut existing_keys = Vec::new();
    let all_keys = vec![
        keys::GITHUB_TOKEN,
        keys::OPENAI_API_KEY,
        keys::ANTHROPIC_API_KEY,
        keys::CUSTOM_API_KEY,
    ];
    
    for key in all_keys {
        if has_secret(key.to_string()) {
            existing_keys.push(key.to_string());
        }
    }
    
    Ok(existing_keys)
}

#[tauri::command]
pub fn store_secret(key: String, value: String) -> SecureStorageResult {
    match set_secret(key, value) {
        Ok(_) => SecureStorageResult {
            success: true,
            error: None,
        },
        Err(e) => SecureStorageResult {
            success: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub fn retrieve_secret(key: String) -> Result<String, String> {
    get_secret(key)
}

#[tauri::command]
pub fn remove_secret(key: String) -> SecureStorageResult {
    match delete_secret(key) {
        Ok(_) => SecureStorageResult {
            success: true,
            error: None,
        },
        Err(e) => SecureStorageResult {
            success: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub fn check_secret_exists(key: String) -> bool {
    has_secret(key)
}

#[tauri::command]
pub fn get_all_secret_keys() -> Result<Vec<String>, String> {
    list_secrets()
}

#[allow(dead_code)]
pub fn register_commands(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.invoke_handler(tauri::generate_handler![
        store_secret,
        retrieve_secret,
        remove_secret,
        check_secret_exists,
        get_all_secret_keys,
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_key() {
        assert_eq!(validate_key("github_token"), Ok(keys::GITHUB_TOKEN));
        assert_eq!(validate_key("openai_api_key"), Ok(keys::OPENAI_API_KEY));
        assert_eq!(validate_key("anthropic_api_key"), Ok(keys::ANTHROPIC_API_KEY));
        assert_eq!(validate_key("custom_api_key"), Ok(keys::CUSTOM_API_KEY));
        assert_eq!(validate_key("invalid_key"), Err("Invalid secret key provided".to_string()));
    }

    #[test]
    fn test_secret_roundtrip() {
        let key = keys::GITHUB_TOKEN.to_string();
        let value = "test_secret_value".to_string();

        // Ensure clean state
        let _ = delete_secret(key.clone());

        // Store secret
        assert!(set_secret(key.clone(), value.clone()).is_ok());

        // Check exists
        assert!(has_secret(key.clone()));

        // Retrieve secret
        let retrieved = get_secret(key.clone());
        assert!(retrieved.is_ok());
        assert_eq!(retrieved.unwrap(), value);

        // List secrets
        let list = list_secrets();
        assert!(list.is_ok());
        assert!(list.unwrap().contains(&key));

        // Delete secret
        assert!(delete_secret(key.clone()).is_ok());

        // Check exists again
        assert!(!has_secret(key.clone()));
    }

    #[test]
    fn test_invalid_key_rejection() {
        let key = "invalid_key".to_string();
        let value = "test_secret_value".to_string();

        // Store secret
        let set_res = set_secret(key.clone(), value.clone());
        assert!(set_res.is_err());
        assert_eq!(set_res.unwrap_err(), "Invalid secret key provided");

        // Retrieve secret
        let get_res = get_secret(key.clone());
        assert!(get_res.is_err());
        assert_eq!(get_res.unwrap_err(), "Invalid secret key provided");

        // Delete secret
        let del_res = delete_secret(key.clone());
        assert!(del_res.is_err());
        assert_eq!(del_res.unwrap_err(), "Invalid secret key provided");

        // Check exists
        assert!(!has_secret(key.clone()));
    }
}
