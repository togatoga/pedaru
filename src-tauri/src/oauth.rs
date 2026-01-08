//! OAuth 2.0 PKCE flow implementation for Google authentication
//!
//! This module handles the OAuth authorization flow for desktop applications
//! using the PKCE (Proof Key for Code Exchange) extension.
//!
//! All OAuth credentials and tokens are stored in Stronghold (encrypted).
//!
//! **Security Note**: Sensitive data (tokens, secrets) are wrapped in `SecureString`
//! to prevent accidental logging. The Debug output will show `SecureString(****)`
//! instead of actual values.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::thread;
use tauri::AppHandle;
use tiny_http::{Response, Server};

use crate::error::{OAuthError, PedaruError};
use crate::secrets;
use crate::secure_string::SecureString;

/// Google OAuth endpoints
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

/// Required OAuth scopes for Google Drive access
const SCOPES: &str = "https://www.googleapis.com/auth/drive.readonly";

/// OAuth credentials stored in database
/// SecureString fields will show as "SecureString(****)" in Debug output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthCredentials {
    pub client_id: String,
    pub client_secret: SecureString,
}

/// OAuth tokens from Google (internal use only)
/// SecureString fields will show as "SecureString(****)" in Debug output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: SecureString,
    pub refresh_token: Option<SecureString>,
    pub expires_in: Option<i64>,
    pub token_type: String,
    pub scope: Option<String>,
}

/// Complete authentication state (internal use only)
/// SecureString fields will show as "SecureString(****)" in Debug output
#[derive(Debug, Clone)]
pub struct AuthState {
    pub client_id: String,
    pub client_secret: SecureString,
    pub access_token: Option<SecureString>,
    pub refresh_token: Option<SecureString>,
    pub token_expiry: Option<i64>,
}

/// Authentication status for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub configured: bool,
}

/// State during OAuth flow
struct OAuthFlowState {
    code_verifier: String,
    state: String,
}

/// Global state for OAuth callback handling
static OAUTH_FLOW_STATE: Mutex<Option<OAuthFlowState>> = Mutex::new(None);
static OAUTH_CALLBACK_CODE: Mutex<Option<String>> = Mutex::new(None);

/// Generate a random code verifier for PKCE (43-128 chars, URL-safe)
fn generate_code_verifier() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.r#gen()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

/// Generate code challenge from verifier (SHA256 + Base64URL)
fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    URL_SAFE_NO_PAD.encode(hash)
}

/// Generate a random state parameter for CSRF protection
fn generate_state() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.r#gen()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

/// Save OAuth credentials to Stronghold (encrypted)
pub fn save_credentials(
    app: &AppHandle,
    credentials: &OAuthCredentials,
) -> Result<(), PedaruError> {
    secrets::store_secret(app, secrets::keys::GOOGLE_CLIENT_ID, &credentials.client_id)?;
    secrets::store_secret(
        app,
        secrets::keys::GOOGLE_CLIENT_SECRET,
        credentials.client_secret.expose(),
    )?;
    eprintln!("[Pedaru] Saved OAuth credentials to Stronghold");
    Ok(())
}

/// Load OAuth credentials from Stronghold
pub fn load_credentials(app: &AppHandle) -> Result<Option<OAuthCredentials>, PedaruError> {
    let client_id = secrets::get_secret(app, secrets::keys::GOOGLE_CLIENT_ID)?;
    let client_secret = secrets::get_secret(app, secrets::keys::GOOGLE_CLIENT_SECRET)?;

    match (client_id, client_secret) {
        (Some(id), Some(secret)) => Ok(Some(OAuthCredentials {
            // client_id is not sensitive, expose it
            client_id: id.expose().to_string(),
            client_secret: secret,
        })),
        _ => Ok(None),
    }
}

/// Load complete auth state from Stronghold
pub fn load_auth_state(app: &AppHandle) -> Result<Option<AuthState>, PedaruError> {
    let client_id = secrets::get_secret(app, secrets::keys::GOOGLE_CLIENT_ID)?;
    let client_secret = secrets::get_secret(app, secrets::keys::GOOGLE_CLIENT_SECRET)?;

    match (client_id, client_secret) {
        (Some(id), Some(secret)) => {
            let access_token = secrets::get_secret(app, secrets::keys::GOOGLE_ACCESS_TOKEN)?;
            let refresh_token = secrets::get_secret(app, secrets::keys::GOOGLE_REFRESH_TOKEN)?;
            let token_expiry = secrets::get_secret(app, secrets::keys::GOOGLE_TOKEN_EXPIRY)?
                .and_then(|s| s.expose().parse::<i64>().ok());

            Ok(Some(AuthState {
                // client_id is not sensitive, expose it
                client_id: id.expose().to_string(),
                client_secret: secret,
                access_token,
                refresh_token,
                token_expiry,
            }))
        }
        _ => Ok(None),
    }
}

/// Save tokens to Stronghold (encrypted)
pub fn save_tokens(
    app: &AppHandle,
    access_token: &str,
    refresh_token: Option<&str>,
    expires_in: Option<i64>,
) -> Result<(), PedaruError> {
    // Store access token
    secrets::store_secret(app, secrets::keys::GOOGLE_ACCESS_TOKEN, access_token)?;

    // Store refresh token if provided (keep existing if not)
    if let Some(token) = refresh_token {
        secrets::store_secret(app, secrets::keys::GOOGLE_REFRESH_TOKEN, token)?;
    }

    // Calculate and store token expiry
    if let Some(expires) = expires_in {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let expiry = now + expires;
        secrets::store_secret(app, secrets::keys::GOOGLE_TOKEN_EXPIRY, &expiry.to_string())?;
    }

    eprintln!("[Pedaru] Saved OAuth tokens to Stronghold");
    Ok(())
}

/// Clear tokens from Stronghold (logout)
pub fn clear_tokens(app: &AppHandle) -> Result<(), PedaruError> {
    secrets::delete_secret(app, secrets::keys::GOOGLE_ACCESS_TOKEN)?;
    secrets::delete_secret(app, secrets::keys::GOOGLE_REFRESH_TOKEN)?;
    secrets::delete_secret(app, secrets::keys::GOOGLE_TOKEN_EXPIRY)?;
    eprintln!("[Pedaru] Cleared OAuth tokens from Stronghold");
    Ok(())
}

/// Start OAuth flow and return authorization URL
pub fn start_auth_flow(app: &AppHandle) -> Result<String, PedaruError> {
    let credentials =
        load_credentials(app)?.ok_or(PedaruError::OAuth(OAuthError::NotConfigured))?;

    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state = generate_state();

    // Store flow state for later verification
    {
        let mut flow_state = OAUTH_FLOW_STATE.lock().unwrap();
        *flow_state = Some(OAuthFlowState {
            code_verifier: code_verifier.clone(),
            state: state.clone(),
        });
    }

    // Clear any previous callback code
    {
        let mut callback_code = OAUTH_CALLBACK_CODE.lock().unwrap();
        *callback_code = None;
    }

    // Start callback server in background
    let app_handle = app.clone();
    thread::spawn(move || {
        if let Err(e) = run_callback_server(&app_handle) {
            eprintln!("OAuth callback server error: {}", e);
        }
    });

    // Build authorization URL
    let redirect_uri = "http://localhost:8585/callback";
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        GOOGLE_AUTH_URL,
        urlencoding::encode(&credentials.client_id),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(SCOPES),
        urlencoding::encode(&state),
        urlencoding::encode(&code_challenge),
    );

    Ok(auth_url)
}

/// Run local HTTP server to receive OAuth callback
fn run_callback_server(app: &AppHandle) -> Result<(), PedaruError> {
    let server = Server::http("127.0.0.1:8585")
        .map_err(|e| PedaruError::OAuth(OAuthError::CallbackServerFailed(e.to_string())))?;

    eprintln!("OAuth callback server started on port 8585");

    // Wait for callback (with timeout using recv_timeout)
    let timeout = std::time::Duration::from_secs(300); // 5 minutes

    // Use recv_timeout to wait for a single request with timeout
    while let Ok(Some(request)) = server.recv_timeout(timeout) {
        let url = request.url();
        eprintln!("Received callback: {}", url);

        if url.starts_with("/callback") {
            // Parse query parameters
            if let Some(query_start) = url.find('?') {
                let query = &url[query_start + 1..];
                let params: std::collections::HashMap<_, _> = query
                    .split('&')
                    .filter_map(|p| {
                        let mut parts = p.splitn(2, '=');
                        Some((parts.next()?, parts.next()?))
                    })
                    .collect();

                if let Some(code) = params.get("code") {
                    let code = urlencoding::decode(code).unwrap_or_default().to_string();

                    // Verify state
                    let expected_state = {
                        let flow_state = OAUTH_FLOW_STATE.lock().unwrap();
                        flow_state.as_ref().map(|s| s.state.clone())
                    };

                    let received_state = params
                        .get("state")
                        .map(|s| urlencoding::decode(s).unwrap_or_default().to_string());

                    if expected_state == received_state {
                        // Exchange code for tokens
                        if let Err(e) = exchange_code_for_tokens(app, &code) {
                            eprintln!("Token exchange failed: {}", e);
                            let response = Response::from_string(
                                "<html><body><h1>Authentication Failed</h1><p>Please try again.</p></body></html>"
                            ).with_header(
                                tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap()
                            );
                            let _ = request.respond(response);
                        } else {
                            let response = Response::from_string(
                                "<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to Pedaru.</p><script>setTimeout(() => window.close(), 2000);</script></body></html>"
                            ).with_header(
                                tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap()
                            );
                            let _ = request.respond(response);
                        }
                    } else {
                        eprintln!(
                            "State mismatch! Expected: {:?}, Received: {:?}",
                            expected_state, received_state
                        );
                        let response = Response::from_string(
                            "<html><body><h1>Authentication Failed</h1><p>State verification failed.</p></body></html>"
                        ).with_header(
                            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap()
                        );
                        let _ = request.respond(response);
                    }
                } else if let Some(error) = params.get("error") {
                    eprintln!("OAuth error: {}", error);
                    let response = Response::from_string(format!(
                        "<html><body><h1>Authentication Failed</h1><p>Error: {}</p></body></html>",
                        error
                    ))
                    .with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..])
                            .unwrap(),
                    );
                    let _ = request.respond(response);
                }
            }

            // Only handle one callback
            break;
        }
    }

    eprintln!("OAuth callback server stopped");
    Ok(())
}

/// Exchange authorization code for tokens
fn exchange_code_for_tokens(app: &AppHandle, code: &str) -> Result<(), PedaruError> {
    let credentials =
        load_credentials(app)?.ok_or(PedaruError::OAuth(OAuthError::NotConfigured))?;

    let code_verifier = {
        let flow_state = OAUTH_FLOW_STATE.lock().unwrap();
        flow_state.as_ref().map(|s| s.code_verifier.clone())
    }
    .ok_or(PedaruError::OAuth(OAuthError::AuthorizationFailed(
        "No flow state".to_string(),
    )))?;

    let redirect_uri = "http://localhost:8585/callback";

    // Use blocking reqwest client for sync context
    let client = reqwest::blocking::Client::new();
    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", credentials.client_id.as_str()),
            ("client_secret", credentials.client_secret.expose()),
            ("code", code),
            ("code_verifier", code_verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .map_err(|e| PedaruError::OAuth(OAuthError::HttpRequestFailed(e.to_string())))?;

    if !response.status().is_success() {
        let error_text = response.text().unwrap_or_default();
        return Err(PedaruError::OAuth(OAuthError::TokenExchangeFailed(
            error_text,
        )));
    }

    let token_response: TokenResponse = response
        .json()
        .map_err(|e| PedaruError::OAuth(OAuthError::InvalidResponse(e.to_string())))?;

    save_tokens(
        app,
        token_response.access_token.expose(),
        token_response.refresh_token.as_ref().map(|t| t.expose()),
        token_response.expires_in,
    )?;

    // Clear flow state
    {
        let mut flow_state = OAUTH_FLOW_STATE.lock().unwrap();
        *flow_state = None;
    }

    Ok(())
}

/// Refresh access token using refresh token (async version)
///
/// Returns the new access token as a plain String for use in API calls.
pub async fn refresh_access_token(app: &AppHandle) -> Result<String, PedaruError> {
    let auth_state = load_auth_state(app)?.ok_or(PedaruError::OAuth(OAuthError::NotConfigured))?;

    let refresh_token =
        auth_state
            .refresh_token
            .ok_or(PedaruError::OAuth(OAuthError::TokenRefreshFailed(
                "No refresh token".to_string(),
            )))?;

    let client = reqwest::Client::new();
    let response = client
        .post(GOOGLE_TOKEN_URL)
        .form(&[
            ("client_id", auth_state.client_id.as_str()),
            ("client_secret", auth_state.client_secret.expose()),
            ("refresh_token", refresh_token.expose()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| PedaruError::OAuth(OAuthError::HttpRequestFailed(e.to_string())))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(PedaruError::OAuth(OAuthError::TokenRefreshFailed(
            error_text,
        )));
    }

    let token_response: TokenResponse = response
        .json()
        .await
        .map_err(|e| PedaruError::OAuth(OAuthError::InvalidResponse(e.to_string())))?;

    // Get the access token value before saving
    let access_token_value = token_response.access_token.expose().to_string();

    save_tokens(
        app,
        token_response.access_token.expose(),
        token_response.refresh_token.as_ref().map(|t| t.expose()),
        token_response.expires_in,
    )?;

    Ok(access_token_value)
}

/// Get valid access token (refreshing if necessary) - async version
///
/// Returns the access token as a plain String for use in API calls.
pub async fn get_valid_access_token(app: &AppHandle) -> Result<String, PedaruError> {
    let auth_state = load_auth_state(app)?.ok_or(PedaruError::OAuth(OAuthError::NotConfigured))?;

    let access_token = auth_state.access_token.ok_or(PedaruError::GoogleDrive(
        crate::error::GoogleDriveError::NotAuthenticated,
    ))?;

    // Check if token is expired (with 5 minute buffer)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    if let Some(expiry) = auth_state.token_expiry
        && now >= expiry - 300
    {
        // Token expired or expiring soon, refresh it
        return refresh_access_token(app).await;
    }

    // Return the exposed access token for API use
    Ok(access_token.expose().to_string())
}

/// Get current authentication status
pub fn get_auth_status(app: &AppHandle) -> Result<AuthStatus, PedaruError> {
    let auth_state = load_auth_state(app)?;

    match auth_state {
        Some(state) => Ok(AuthStatus {
            configured: true,
            authenticated: state.access_token.is_some(),
        }),
        None => Ok(AuthStatus {
            configured: false,
            authenticated: false,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_verifier_length() {
        let verifier = generate_code_verifier();
        assert!(verifier.len() >= 43);
        assert!(verifier.len() <= 128);
    }

    #[test]
    fn test_code_challenge_generation() {
        let verifier = "test_verifier_12345";
        let challenge = generate_code_challenge(verifier);
        // Challenge should be base64url encoded SHA256 hash
        assert!(!challenge.is_empty());
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
    }

    #[test]
    fn test_state_generation() {
        let state1 = generate_state();
        let state2 = generate_state();
        // States should be unique
        assert_ne!(state1, state2);
    }
}
