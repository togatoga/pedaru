//! Application settings storage
//!
//! This module handles storing and retrieving app settings.
//! - Sensitive data (API keys) are stored in Stronghold (encrypted)
//! - Non-sensitive data (model names) are stored in SQLite
//!
//! **Security Note**: API keys are wrapped in `SecureString` to prevent
//! accidental logging. The Debug output will show `SecureString(****)` instead
//! of the actual value.

use serde::{Deserialize, Serialize};

use crate::db::{now_timestamp, open_db};
use crate::error::{DatabaseError, PedaruError};
use crate::secrets;
use crate::secure_string::SecureString;

// ============================================================================
// Constants - Setting Keys (for SQLite)
// ============================================================================

pub const KEY_GEMINI_MODEL: &str = "gemini_model";
pub const KEY_GEMINI_EXPLANATION_MODEL: &str = "gemini_explanation_model";

/// Default Gemini model for translation (fast)
pub const DEFAULT_GEMINI_MODEL: &str = "gemini-2.0-flash";
/// Default Gemini model for detailed explanation (can be more capable)
pub const DEFAULT_GEMINI_EXPLANATION_MODEL: &str = "gemini-2.0-flash";

// ============================================================================
// Types
// ============================================================================

/// Gemini translation settings
///
/// api_key uses SecureString: Debug shows "SecureString(****)", JSON includes actual value.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiSettings {
    pub api_key: SecureString,
    pub model: String,
    pub explanation_model: String,
}

impl Default for GeminiSettings {
    fn default() -> Self {
        Self {
            api_key: SecureString::default(),
            model: DEFAULT_GEMINI_MODEL.to_string(),
            explanation_model: DEFAULT_GEMINI_EXPLANATION_MODEL.to_string(),
        }
    }
}

// ============================================================================
// Database Operations (for non-sensitive settings)
// ============================================================================

/// Get a setting value by key from SQLite
pub fn get_setting(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, PedaruError> {
    let conn = open_db(app)?;

    let result: Result<String, rusqlite::Error> =
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        });

    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(PedaruError::Database(DatabaseError::OpenFailed {
            source: e,
        })),
    }
}

/// Set a setting value in SQLite
pub fn set_setting(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
        rusqlite::params![key, value, now],
    )
    .map_err(|source| PedaruError::Database(DatabaseError::OpenFailed { source }))?;

    Ok(())
}

/// Get all Gemini settings
/// API key is stored in Stronghold (encrypted), model names in SQLite
pub fn get_gemini_settings(app: &tauri::AppHandle) -> Result<GeminiSettings, PedaruError> {
    // Get API key from Stronghold (encrypted) - already returns SecureString
    let api_key = secrets::get_secret(app, secrets::keys::GEMINI_API_KEY)?
        .unwrap_or_else(SecureString::default);

    // Get model names from SQLite (non-sensitive)
    let model =
        get_setting(app, KEY_GEMINI_MODEL)?.unwrap_or_else(|| DEFAULT_GEMINI_MODEL.to_string());
    let explanation_model = get_setting(app, KEY_GEMINI_EXPLANATION_MODEL)?
        .unwrap_or_else(|| DEFAULT_GEMINI_EXPLANATION_MODEL.to_string());

    Ok(GeminiSettings {
        api_key,
        model,
        explanation_model,
    })
}

/// Save Gemini settings
/// API key is stored in Stronghold (encrypted), model names in SQLite
pub fn save_gemini_settings(
    app: &tauri::AppHandle,
    settings: &GeminiSettings,
) -> Result<(), PedaruError> {
    // Store API key in Stronghold (encrypted)
    // Use .expose() to get the actual value for storage
    if settings.api_key.is_empty() {
        secrets::delete_secret(app, secrets::keys::GEMINI_API_KEY)?;
    } else {
        secrets::store_secret(
            app,
            secrets::keys::GEMINI_API_KEY,
            settings.api_key.expose(),
        )?;
    }

    // Store model names in SQLite (non-sensitive)
    set_setting(app, KEY_GEMINI_MODEL, &settings.model)?;
    set_setting(
        app,
        KEY_GEMINI_EXPLANATION_MODEL,
        &settings.explanation_model,
    )?;
    Ok(())
}
