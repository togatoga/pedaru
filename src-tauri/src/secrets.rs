//! Secure secrets management using OS Keychain
//!
//! This module provides secure storage for sensitive data like API keys and OAuth tokens.
//! It uses the OS keychain (via keyring-rs) for cross-platform secure storage:
//! - macOS: Keychain
//! - Windows: Credential Manager
//! - Linux: Secret Service (gnome-keyring, KWallet, etc.)
//!
//! All secrets are stored in a single JSON entry to minimize keychain access prompts.
//!
//! **Security Note**: All secret values are wrapped in `SecureString` to prevent
//! accidental logging. Use `.expose()` only when the actual value is needed.

use crate::error::PedaruError;
use crate::secure_string::SecureString;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

/// Service name for keyring storage
const KEYRING_SERVICE: &str = "pedaru";
/// Single key for all secrets (stored as JSON)
const KEYRING_KEY: &str = "secrets";

/// In-memory cache of all secrets to avoid repeated keychain access
/// Values are stored as SecureString to prevent accidental logging
static SECRETS_CACHE: RwLock<Option<HashMap<String, SecureString>>> = RwLock::new(None);

/// Keys for secrets stored in keyring
pub mod keys {
    pub const GEMINI_API_KEY: &str = "gemini_api_key";
    pub const GOOGLE_CLIENT_ID: &str = "google_client_id";
    pub const GOOGLE_CLIENT_SECRET: &str = "google_client_secret";
    pub const GOOGLE_ACCESS_TOKEN: &str = "google_access_token";
    pub const GOOGLE_REFRESH_TOKEN: &str = "google_refresh_token";
    pub const GOOGLE_TOKEN_EXPIRY: &str = "google_token_expiry";
}

/// All secrets stored as a single JSON object
/// Note: Debug is intentionally not derived to prevent accidental logging
#[derive(Clone, Serialize, Deserialize, Default)]
struct AllSecrets {
    #[serde(flatten)]
    secrets: HashMap<String, SecureString>,
}

/// Load all secrets from keychain into cache (called once on first access)
fn load_secrets_from_keychain() -> Result<HashMap<String, SecureString>, PedaruError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_KEY)
        .map_err(|e| PedaruError::Secrets(format!("Failed to create keyring entry: {}", e)))?;

    match entry.get_password() {
        Ok(json) => {
            let all_secrets: AllSecrets = serde_json::from_str(&json).unwrap_or_default();
            Ok(all_secrets.secrets)
        }
        Err(keyring::Error::NoEntry) => Ok(HashMap::new()),
        Err(e) => Err(PedaruError::Secrets(format!(
            "Failed to load secrets from keychain: {}",
            e
        ))),
    }
}

/// Save all secrets from cache to keychain
fn save_secrets_to_keychain(secrets: &HashMap<String, SecureString>) -> Result<(), PedaruError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_KEY)
        .map_err(|e| PedaruError::Secrets(format!("Failed to create keyring entry: {}", e)))?;

    if secrets.is_empty() {
        // Delete the entry if no secrets remain
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(PedaruError::Secrets(format!(
                "Failed to delete keyring entry: {}",
                e
            ))),
        }
    } else {
        let all_secrets = AllSecrets {
            secrets: secrets.clone(),
        };
        let json = serde_json::to_string(&all_secrets)
            .map_err(|e| PedaruError::Secrets(format!("Failed to serialize secrets: {}", e)))?;

        entry.set_password(&json).map_err(|e| {
            PedaruError::Secrets(format!("Failed to save secrets to keychain: {}", e))
        })?;

        Ok(())
    }
}

/// Get or initialize the secrets cache
fn get_secrets_cache() -> Result<HashMap<String, SecureString>, PedaruError> {
    // First try to read from cache
    {
        let cache = SECRETS_CACHE.read().unwrap();
        if let Some(ref secrets) = *cache {
            return Ok(secrets.clone());
        }
    }

    // Cache is empty, load from keychain
    let secrets = load_secrets_from_keychain()?;

    // Store in cache
    {
        let mut cache = SECRETS_CACHE.write().unwrap();
        *cache = Some(secrets.clone());
    }

    Ok(secrets)
}

/// Store a secret in the OS keychain
///
/// The value is automatically wrapped in SecureString for safe storage.
pub fn store_secret(_app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), PedaruError> {
    let mut secrets = get_secrets_cache()?;
    secrets.insert(key.to_string(), SecureString::new(value));

    // Save to keychain
    save_secrets_to_keychain(&secrets)?;

    // Update cache
    {
        let mut cache = SECRETS_CACHE.write().unwrap();
        *cache = Some(secrets);
    }

    Ok(())
}

/// Retrieve a secret from the OS keychain
///
/// Returns a SecureString to prevent accidental logging.
/// Use `.expose()` only when the actual value is needed.
pub fn get_secret(_app: &tauri::AppHandle, key: &str) -> Result<Option<SecureString>, PedaruError> {
    let secrets = get_secrets_cache()?;
    Ok(secrets.get(key).cloned())
}

/// Delete a secret from the OS keychain
pub fn delete_secret(_app: &tauri::AppHandle, key: &str) -> Result<(), PedaruError> {
    let mut secrets = get_secrets_cache()?;

    if secrets.remove(key).is_some() {
        eprintln!("[Pedaru] Deleted secret: {}", key);

        // Save to keychain
        save_secrets_to_keychain(&secrets)?;

        // Update cache
        {
            let mut cache = SECRETS_CACHE.write().unwrap();
            *cache = Some(secrets);
        }
    }

    Ok(())
}

/// Delete all secrets from the OS keychain
pub fn delete_all_secrets(_app: &tauri::AppHandle) -> Result<(), PedaruError> {
    // Clear from keychain
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_KEY)
        .map_err(|e| PedaruError::Secrets(format!("Failed to create keyring entry: {}", e)))?;

    match entry.delete_credential() {
        Ok(()) => eprintln!("[Pedaru] Deleted all secrets"),
        Err(keyring::Error::NoEntry) => {}
        Err(e) => {
            eprintln!("[Pedaru] Failed to delete secrets: {}", e);
        }
    }

    // Clear cache
    {
        let mut cache = SECRETS_CACHE.write().unwrap();
        *cache = Some(HashMap::new());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    // Tests would require mocking the keyring, skipped for now
}
