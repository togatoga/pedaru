//! Error types for the Pedaru PDF viewer
//!
//! This module defines a structured error hierarchy using thiserror,
//! organized by error category for better error handling and reporting.

use thiserror::Error;

/// Top-level application error type
#[derive(Error, Debug)]
pub enum PedaruError {
    #[error("PDF error: {0}")]
    Pdf(#[from] PdfError),

    #[error("File I/O error: {0}")]
    Io(#[from] IoError),

    #[error("Database error: {0}")]
    Database(#[from] DatabaseError),

    #[error("Menu error: {0}")]
    Menu(#[from] MenuError),

    #[error("Configuration error: {0}")]
    Config(#[from] ConfigError),

    #[error("OAuth error: {0}")]
    OAuth(#[from] OAuthError),

    #[error("Google Drive error: {0}")]
    GoogleDrive(#[from] GoogleDriveError),

    #[error("Gemini API error: {0}")]
    Gemini(#[from] GeminiError),

    #[error("Secrets storage error: {0}")]
    Secrets(String),

    #[error("File already imported: {0}")]
    AlreadyImported(String),
}

/// PDF-specific errors (loading, parsing, metadata extraction)
#[derive(Error, Debug)]
pub enum PdfError {
    #[error("Failed to load PDF file '{path}': {source}")]
    LoadFailed {
        path: String,
        #[source]
        source: lopdf::Error,
    },
}

/// File I/O errors
#[derive(Error, Debug)]
pub enum IoError {
    #[error("Failed to read file '{path}': {source}")]
    ReadFailed {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("Failed to create directory '{path}': {source}")]
    CreateDirFailed {
        path: String,
        #[source]
        source: std::io::Error,
    },
}

/// Database errors (SQLite operations)
#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Failed to get database path: {0}")]
    PathResolutionFailed(String),

    #[error("Failed to open database: {source}")]
    OpenFailed {
        #[source]
        source: rusqlite::Error,
    },

    #[error("Failed to execute query: {0}")]
    QueryFailed(String),

    #[error("Database not found at expected location")]
    NotFound,
}

/// Menu construction errors
#[derive(Error, Debug)]
pub enum MenuError {
    #[error("Failed to build menu: {0}")]
    BuildFailed(String),

    #[error("Failed to set application menu: {0}")]
    SetMenuFailed(String),
}

/// Configuration/path errors
#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to resolve app config directory: {0}")]
    ConfigDirResolutionFailed(String),
}

/// OAuth authentication errors
#[derive(Error, Debug)]
pub enum OAuthError {
    #[error("OAuth not configured: client credentials not set")]
    NotConfigured,

    #[error("OAuth callback server failed to start: {0}")]
    CallbackServerFailed(String),

    #[error("OAuth authorization failed: {0}")]
    AuthorizationFailed(String),

    #[error("Token exchange failed: {0}")]
    TokenExchangeFailed(String),

    #[error("Token refresh failed: {0}")]
    TokenRefreshFailed(String),

    #[error("HTTP request failed: {0}")]
    HttpRequestFailed(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),
}

/// Google Drive API errors
#[derive(Error, Debug)]
pub enum GoogleDriveError {
    #[error("Not authenticated with Google")]
    NotAuthenticated,

    #[error("API request failed: {0}")]
    ApiRequestFailed(String),

    #[error("Failed to list files: {0}")]
    ListFilesFailed(String),

    #[error("Failed to download file: {0}")]
    DownloadFailed(String),

    #[error("Download cancelled: {0}")]
    DownloadCancelled(String),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Invalid folder ID: {0}")]
    InvalidFolderId(String),
}

/// Gemini API errors
#[derive(Error, Debug)]
pub enum GeminiError {
    #[error("API key not configured")]
    ApiKeyMissing,

    #[error("API request failed: {0}")]
    ApiRequestFailed(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),
}

/// Convenience type alias for internal use
pub type Result<T> = std::result::Result<T, PedaruError>;

/// Extension trait for converting errors to Tauri-compatible String format
pub trait IntoTauriError {
    fn into_tauri_error(self) -> String;
}

impl IntoTauriError for PedaruError {
    fn into_tauri_error(self) -> String {
        format!("{:#}", anyhow::Error::from(self))
    }
}

impl IntoTauriError for anyhow::Error {
    fn into_tauri_error(self) -> String {
        format!("{:#}", self)
    }
}
