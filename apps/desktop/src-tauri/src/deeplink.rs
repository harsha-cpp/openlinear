//! Deep link OAuth handler for GitHub authentication
//!
//! Handles `openlinear://callback?code=...` deep links from GitHub OAuth flow.
//! On receiving a callback, extracts the auth code and forwards it to the Express
//! API to exchange for a token, then emits the result to the frontend.

use serde::Serialize;
use tauri::Emitter;
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

const DEFAULT_API_BASE_URL: &str = "http://localhost:3001";

/// Payload emitted to frontend after OAuth callback processing
#[derive(Clone, Serialize)]
pub struct AuthCallbackResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_connect_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Set up the deep link handler on app startup.
/// Registers a listener for `openlinear://` URL scheme.
pub fn setup_deep_link_handler(app: &tauri::App) {
    let handle = app.handle().clone();

    #[cfg(any(target_os = "linux", windows))]
    if let Err(err) = app.deep_link().register_all() {
        println!("[DeepLink] Failed to register scheme handlers: {err}");
    }

    let mut urls_found = false;

    match app.deep_link().get_current() {
        Ok(Some(urls)) => {
            for url in urls {
                println!("[DeepLink] Found URL via get_current(): {}", url);
                handle_deep_link_url(&handle, &url);
                urls_found = true;
            }
        }
        Ok(None) => {
            println!("[DeepLink] get_current() returned None");
        }
        Err(err) => {
            println!("[DeepLink] Failed to read initial deep link URL: {err}");
        }
    }

    if !urls_found {
        for arg in std::env::args().skip(1) {
            println!("[DeepLink] Checking arg: {}", arg);
            if let Ok(url) = Url::parse(&arg) {
                if url.scheme() == "openlinear" {
                    println!("[DeepLink] Found URL in command-line args: {}", url);
                    handle_deep_link_url(&handle, &url);
                    urls_found = true;
                }
            }
        }
    }

    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            println!("[DeepLink] Received URL via on_open_url: {}", url);
            handle_deep_link_url(&handle, &url);
        }
    });

    println!("[DeepLink] Handler setup complete, URLs found: {}", urls_found);
}

pub fn handle_deep_link_arg<R: tauri::Runtime>(handle: &tauri::AppHandle<R>, arg: &str) {
    if let Ok(url) = Url::parse(arg) {
        if url.scheme() == "openlinear" {
            handle_deep_link_url(handle, &url);
        }
    }
}

fn handle_deep_link_url<R: tauri::Runtime>(handle: &tauri::AppHandle<R>, url: &Url) {
    println!("[DeepLink] Received: {}", url);

    if !is_oauth_callback_url(url) {
        return;
    }

    let handle_clone = handle.clone();
    let url_owned = url.to_string();

    tauri::async_runtime::spawn(async move {
        let result = process_oauth_callback(&url_owned).await;
        let _ = handle_clone.emit("auth:callback", result);
    });
}

fn is_oauth_callback_url(url: &Url) -> bool {
    if url.scheme() != "openlinear" {
        return false;
    }

    let host = url.host_str().unwrap_or_default();
    let path = url.path().trim_matches('/');

    host.eq_ignore_ascii_case("callback") || path.eq_ignore_ascii_case("callback")
}

/// Parse the OAuth callback URL and exchange the code for a token
async fn process_oauth_callback(url_str: &str) -> AuthCallbackResult {
    if let Ok(url) = Url::parse(url_str) {
        if let Some((_, token)) = url.query_pairs().find(|(key, _)| key == "token") {
            return AuthCallbackResult {
                success: true,
                token: Some(token.to_string()),
                github_connect_token: None,
                error: None,
            };
        }

        if let Some((_, github_connect_token)) = url
            .query_pairs()
            .find(|(key, _)| key == "github_connect_token")
        {
            return AuthCallbackResult {
                success: true,
                token: None,
                github_connect_token: Some(github_connect_token.to_string()),
                error: None,
            };
        }

        if let Some((_, value)) = url.query_pairs().find(|(key, _)| key == "error") {
            let error_desc = url
                .query_pairs()
                .find(|(k, _)| k == "error_description")
                .map(|(_, v)| v.to_string())
                .unwrap_or_else(|| value.to_string());

            return AuthCallbackResult {
                success: false,
                token: None,
                github_connect_token: None,
                error: Some(error_desc),
            };
        }
    }

    // Parse the deep link URL to extract the code parameter
    let (code, state) = match extract_code_and_state_from_url(url_str) {
        Ok(result) => result,
        Err(e) => {
            return AuthCallbackResult {
                success: false,
                token: None,
                github_connect_token: None,
                error: Some(e),
            };
        }
    };

    // Call the Express API to exchange code for token
    match exchange_code_for_token(&code, state.as_deref()).await {
        Ok(token) => AuthCallbackResult {
            success: true,
            token: Some(token),
            github_connect_token: None,
            error: None,
        },
        Err(e) => AuthCallbackResult {
            success: false,
            token: None,
            github_connect_token: None,
            error: Some(e),
        },
    }
}

/// Extract the OAuth code and state from the callback URL
fn extract_code_and_state_from_url(url_str: &str) -> Result<(String, Option<String>), String> {
    let url = Url::parse(url_str).map_err(|e| format!("Failed to parse URL: {}", e))?;

    // Check for error parameter first
    for (key, value) in url.query_pairs() {
        if key == "error" {
            let error_desc = url
                .query_pairs()
                .find(|(k, _)| k == "error_description")
                .map(|(_, v)| v.to_string())
                .unwrap_or_else(|| value.to_string());
            return Err(error_desc);
        }
    }

    // Extract the code parameter
    let code = url
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| "Missing 'code' parameter in callback URL".to_string())?;
    let state = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.to_string());

    Ok((code, state))
}

/// Call the Express API to exchange the OAuth code for a JWT token.
/// The Express endpoint redirects with the token in the URL, so we intercept
/// the redirect and extract the token from the Location header.
async fn exchange_code_for_token(code: &str, state: Option<&str>) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let api_base_url = std::env::var("OPENLINEAR_API_URL")
        .unwrap_or_else(|_| DEFAULT_API_BASE_URL.to_string());
    let mut callback_url = Url::parse(&format!("{}/api/auth/github/callback", api_base_url))
        .map_err(|e| format!("Failed to build auth callback URL: {}", e))?;
    callback_url.query_pairs_mut().append_pair("code", code);
    if let Some(state) = state {
        callback_url.query_pairs_mut().append_pair("state", state);
    }

    let response = client
        .get(callback_url)
        .send()
        .await
        .map_err(|e| format!("Failed to call auth API: {}", e))?;

    // The Express endpoint redirects to FRONTEND_URL?token=XXX or ?error=XXX
    // We need to parse the Location header to extract the token
    let status = response.status();

    if status.is_redirection() {
        if let Some(location) = response.headers().get("location") {
            let location_str = location
                .to_str()
                .map_err(|_| "Invalid Location header")?;

            return extract_token_from_redirect(location_str);
        }
        return Err("Redirect response missing Location header".to_string());
    }

    // If not a redirect, the call likely failed
    Err(format!("Unexpected response status: {}", status))
}

/// Extract the token (or error) from the redirect URL
fn extract_token_from_redirect(location: &str) -> Result<String, String> {
    let url = Url::parse(location).map_err(|e| format!("Failed to parse redirect URL: {}", e))?;

    // Check for error first
    for (key, value) in url.query_pairs() {
        if key == "error" {
            return Err(value.to_string());
        }
    }

    // Extract the token
    url.query_pairs()
        .find(|(key, _)| key == "token")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| "Token not found in redirect URL".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_code_from_url_success() {
        let url = "openlinear://callback?code=abc123&state=xyz";
        let (code, state) = extract_code_and_state_from_url(url).unwrap();
        assert_eq!(code, "abc123");
        assert_eq!(state.as_deref(), Some("xyz"));
    }

    #[test]
    fn test_extract_code_from_url_missing_code() {
        let url = "openlinear://callback?state=xyz";
        let result = extract_code_and_state_from_url(url);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing 'code' parameter"));
    }

    #[test]
    fn test_extract_code_from_url_with_error() {
        let url = "openlinear://callback?error=access_denied&error_description=User+denied+access";
        let result = extract_code_and_state_from_url(url);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("User denied access"));
    }

    #[test]
    fn test_extract_token_from_redirect_success() {
        let location = "http://localhost:3000?token=jwt.token.here";
        let token = extract_token_from_redirect(location).unwrap();
        assert_eq!(token, "jwt.token.here");
    }

    #[test]
    fn test_extract_token_from_redirect_with_error() {
        let location = "http://localhost:3000?error=auth_failed";
        let result = extract_token_from_redirect(location);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("auth_failed"));
    }

    #[tokio::test]
    async fn test_process_oauth_callback_with_token_in_deeplink() {
        let url = "openlinear://callback?token=jwt.token.here";
        let result = process_oauth_callback(url).await;
        assert!(result.success);
        assert_eq!(result.token.as_deref(), Some("jwt.token.here"));
        assert!(result.github_connect_token.is_none());
        assert!(result.error.is_none());
    }

    #[tokio::test]
    async fn test_process_oauth_callback_with_github_connect_token_in_deeplink() {
        let url = "openlinear://callback?github_connect_token=jwt.connect.token";
        let result = process_oauth_callback(url).await;
        assert!(result.success);
        assert!(result.token.is_none());
        assert_eq!(result.github_connect_token.as_deref(), Some("jwt.connect.token"));
        assert!(result.error.is_none());
    }

    #[tokio::test]
    async fn test_process_oauth_callback_with_error_in_deeplink() {
        let url = "openlinear://callback?error=access_denied";
        let result = process_oauth_callback(url).await;
        assert!(!result.success);
        assert!(result.token.is_none());
        assert!(result.github_connect_token.is_none());
        assert_eq!(result.error.as_deref(), Some("access_denied"));
    }
}
