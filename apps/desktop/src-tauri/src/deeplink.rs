use serde::Serialize;
use tauri::Emitter;
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

#[derive(Clone, Serialize)]
pub struct AuthCallbackResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub fn setup_deep_link_handler(app: &tauri::App) {
    let handle = app.handle().clone();

    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            let url_str = url.as_str();
            println!("[DeepLink] Received: {}", url_str);

            if url_str.starts_with("openlinear://callback") {
                let result = parse_callback(url_str);
                let _ = handle.emit("auth:callback", result);
            }
        }
    });
}

fn parse_callback(url_str: &str) -> AuthCallbackResult {
    let url = match Url::parse(url_str) {
        Ok(u) => u,
        Err(e) => {
            return AuthCallbackResult {
                success: false,
                token: None,
                error: Some(format!("Failed to parse callback URL: {}", e)),
            };
        }
    };

    for (key, value) in url.query_pairs() {
        if key == "error" {
            return AuthCallbackResult {
                success: false,
                token: None,
                error: Some(value.to_string()),
            };
        }
    }

    match url.query_pairs().find(|(k, _)| k == "token") {
        Some((_, token)) => AuthCallbackResult {
            success: true,
            token: Some(token.to_string()),
            error: None,
        },
        None => AuthCallbackResult {
            success: false,
            token: None,
            error: Some("Missing 'token' parameter in callback URL".to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_callback_with_token() {
        let result = parse_callback("openlinear://callback?token=abc.def.ghi");
        assert!(result.success);
        assert_eq!(result.token.as_deref(), Some("abc.def.ghi"));
        assert!(result.error.is_none());
    }

    #[test]
    fn test_parse_callback_with_error() {
        let result = parse_callback("openlinear://callback?error=access_denied");
        assert!(!result.success);
        assert!(result.token.is_none());
        assert_eq!(result.error.as_deref(), Some("access_denied"));
    }

    #[test]
    fn test_parse_callback_missing_token() {
        let result = parse_callback("openlinear://callback");
        assert!(!result.success);
        assert!(result.token.is_none());
        assert!(result.error.as_deref().unwrap().contains("Missing 'token'"));
    }

    #[test]
    fn test_parse_callback_url_encoded_token() {
        let result = parse_callback("openlinear://callback?token=eyJhbGc%3D");
        assert!(result.success);
        assert_eq!(result.token.as_deref(), Some("eyJhbGc="));
    }

    #[test]
    fn test_parse_callback_invalid_url() {
        let result = parse_callback("not a url");
        assert!(!result.success);
        assert!(result.error.is_some());
    }
}
