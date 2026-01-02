//! Bookshelf management module
//!
//! This module handles bookshelf database operations and download management
//! for PDFs synced from Google Drive.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Manager};

use crate::db::{now_timestamp, open_db};
use crate::error::{DatabaseError, IoError, PedaruError};

// ============================================================================
// Types
// ============================================================================

/// Stored folder configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredFolder {
    pub folder_id: String,
    pub folder_name: String,
    pub is_active: bool,
    pub last_synced: Option<i64>,
}

/// Bookshelf item from database
/// Source type for bookshelf items
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    GoogleDrive,
    Local,
}

impl Default for SourceType {
    fn default() -> Self {
        Self::GoogleDrive
    }
}

impl std::fmt::Display for SourceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SourceType::GoogleDrive => write!(f, "google_drive"),
            SourceType::Local => write!(f, "local"),
        }
    }
}

impl std::str::FromStr for SourceType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "google_drive" => Ok(SourceType::GoogleDrive),
            "local" => Ok(SourceType::Local),
            _ => Err(format!("Unknown source type: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookshelfItem {
    pub id: i64,
    pub drive_file_id: Option<String>,
    pub drive_folder_id: Option<String>,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub thumbnail_data: Option<String>,
    pub local_path: Option<String>,
    pub download_status: String,
    pub download_progress: f64,
    pub pdf_title: Option<String>,
    pub pdf_author: Option<String>,
    pub source_type: String,
    pub original_path: Option<String>,
    pub created_at: i64,
    pub is_favorite: bool,
    pub last_opened: Option<i64>,
}

/// Download progress event
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub drive_file_id: String,
    pub progress: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// Sync result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub new_files: i32,
    pub updated_files: i32,
    pub removed_files: i32,
}

// ============================================================================
// Download Manager
// ============================================================================

/// Global registry for tracking active downloads and their cancellation flags
static ACTIVE_DOWNLOADS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn get_active_downloads() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    ACTIVE_DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Register a download and return a cancellation flag
pub fn register_download(file_id: &str) -> Arc<AtomicBool> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let downloads = get_active_downloads();
    let mut guard = downloads.lock().expect("ACTIVE_DOWNLOADS mutex poisoned");
    guard.insert(file_id.to_string(), cancel_flag.clone());
    cancel_flag
}

/// Unregister a download
pub fn unregister_download(file_id: &str) {
    let downloads = get_active_downloads();
    let mut guard = downloads.lock().expect("ACTIVE_DOWNLOADS mutex poisoned");
    guard.remove(file_id);
}

/// Cancel a download by setting its cancellation flag
pub fn cancel_download(file_id: &str) -> bool {
    let downloads = get_active_downloads();
    let guard = downloads.lock().expect("ACTIVE_DOWNLOADS mutex poisoned");
    if let Some(cancel_flag) = guard.get(file_id) {
        cancel_flag.store(true, Ordering::SeqCst);
        true
    } else {
        false
    }
}

/// Get the cancellation flag for a download if it exists
pub fn get_cancel_flag(file_id: &str) -> Option<Arc<AtomicBool>> {
    let downloads = get_active_downloads();
    let guard = downloads.lock().expect("ACTIVE_DOWNLOADS mutex poisoned");
    guard.get(file_id).cloned()
}

/// Get downloads directory path
pub fn get_downloads_dir(app: &AppHandle) -> Result<std::path::PathBuf, PedaruError> {
    let config_dir = app.path().app_config_dir().map_err(|e| {
        PedaruError::Config(crate::error::ConfigError::ConfigDirResolutionFailed(
            e.to_string(),
        ))
    })?;
    Ok(config_dir.join("downloads"))
}

// ============================================================================
// Schema Management
// ============================================================================

/// Ensure bookshelf table has all required columns
/// This handles cases where the tauri-plugin-sql migrations haven't run yet
pub fn ensure_schema(app: &AppHandle) -> Result<(), PedaruError> {
    let conn = open_db(app)?;

    // Check and add last_opened column if missing
    let has_last_opened: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('bookshelf') WHERE name = 'last_opened'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);

    if !has_last_opened {
        eprintln!("[Pedaru] Adding last_opened column to bookshelf table");
        conn.execute("ALTER TABLE bookshelf ADD COLUMN last_opened INTEGER", [])
            .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    }

    // Check and add is_favorite column if missing
    let has_is_favorite: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('bookshelf') WHERE name = 'is_favorite'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);

    if !has_is_favorite {
        eprintln!("[Pedaru] Adding is_favorite column to bookshelf table");
        conn.execute("ALTER TABLE bookshelf ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0", [])
            .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    }

    // Cleanup zombie local files
    conn.execute(
        "DELETE FROM bookshelf WHERE source_type = 'local' AND download_status != 'completed'",
        [],
    )
    .ok(); // Ignore errors for cleanup

    conn.execute(
        "DELETE FROM bookshelf WHERE source_type = 'local' AND (local_path IS NULL OR local_path = '')",
        [],
    )
    .ok(); // Ignore errors for cleanup

    Ok(())
}

// ============================================================================
// Folder Operations
// ============================================================================

/// Add a folder to the sync list
pub fn add_sync_folder(
    app: &AppHandle,
    folder_id: &str,
    folder_name: &str,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "INSERT INTO drive_folders (folder_id, folder_name, created_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(folder_id) DO UPDATE SET
           folder_name = excluded.folder_name,
           is_active = 1",
        rusqlite::params![folder_id, folder_name, now_timestamp()],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    Ok(())
}

/// Remove a folder from the sync list (marks as inactive)
pub fn remove_sync_folder(app: &AppHandle, folder_id: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE drive_folders SET is_active = 0 WHERE folder_id = ?1",
        [folder_id],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    Ok(())
}

/// Get all active sync folders
pub fn get_sync_folders(app: &AppHandle) -> Result<Vec<StoredFolder>, PedaruError> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT folder_id, folder_name, is_active, last_synced
             FROM drive_folders
             WHERE is_active = 1
             ORDER BY folder_name",
        )
        .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    let folders = stmt
        .query_map([], |row| {
            Ok(StoredFolder {
                folder_id: row.get(0)?,
                folder_name: row.get(1)?,
                is_active: row.get::<_, i32>(2)? != 0,
                last_synced: row.get(3)?,
            })
        })
        .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(folders)
}

/// Update folder sync timestamp
pub fn update_folder_sync_time(app: &AppHandle, folder_id: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE drive_folders SET last_synced = ?1 WHERE folder_id = ?2",
        rusqlite::params![now_timestamp(), folder_id],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    Ok(())
}

// ============================================================================
// Bookshelf Item Operations
// ============================================================================

/// Upsert bookshelf item from Drive file
pub fn upsert_item(
    app: &AppHandle,
    drive_file_id: &str,
    folder_id: &str,
    file_name: &str,
    file_size: Option<i64>,
    mime_type: &str,
    modified_time: Option<&str>,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    conn.execute(
        "INSERT INTO bookshelf (
           drive_file_id, drive_folder_id, file_name, file_size,
           mime_type, drive_modified_time, created_at, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(drive_file_id) DO UPDATE SET
           file_name = excluded.file_name,
           file_size = excluded.file_size,
           drive_modified_time = excluded.drive_modified_time,
           updated_at = excluded.updated_at",
        rusqlite::params![
            drive_file_id,
            folder_id,
            file_name,
            file_size,
            mime_type,
            modified_time,
            now
        ],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    Ok(())
}

/// Get all bookshelf items
/// Sorted by last_opened (most recent first), then by file_name for items never opened
pub fn get_items(app: &AppHandle) -> Result<Vec<BookshelfItem>, PedaruError> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, drive_file_id, drive_folder_id, file_name, file_size,
                    thumbnail_data, local_path, download_status, download_progress,
                    pdf_title, pdf_author, source_type, original_path, created_at, is_favorite, last_opened
             FROM bookshelf
             ORDER BY last_opened IS NULL, last_opened DESC, file_name ASC",
        )
        .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    let items = stmt
        .query_map([], |row| {
            Ok(BookshelfItem {
                id: row.get(0)?,
                drive_file_id: row.get(1)?,
                drive_folder_id: row.get(2)?,
                file_name: row.get(3)?,
                file_size: row.get(4)?,
                thumbnail_data: row.get(5)?,
                local_path: row.get(6)?,
                download_status: row.get(7)?,
                download_progress: row.get(8)?,
                pdf_title: row.get(9)?,
                pdf_author: row.get(10)?,
                source_type: row.get::<_, String>(11).unwrap_or_else(|_| "google_drive".to_string()),
                original_path: row.get(12)?,
                created_at: row.get(13)?,
                is_favorite: row.get::<_, i64>(14).unwrap_or(0) != 0,
                last_opened: row.get(15)?,
            })
        })
        .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

/// Update download status
pub fn update_download_status(
    app: &AppHandle,
    drive_file_id: &str,
    status: &str,
    progress: f64,
    local_path: Option<&str>,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf SET
           download_status = ?1,
           download_progress = ?2,
           local_path = COALESCE(?3, local_path),
           updated_at = ?4
         WHERE drive_file_id = ?5",
        rusqlite::params![status, progress, local_path, now_timestamp(), drive_file_id],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    Ok(())
}

/// Update thumbnail data
pub fn update_thumbnail(
    app: &AppHandle,
    drive_file_id: &str,
    thumbnail_data: &str,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf SET thumbnail_data = ?1, updated_at = ?2 WHERE drive_file_id = ?3",
        rusqlite::params![thumbnail_data, now_timestamp(), drive_file_id],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    Ok(())
}

/// Update PDF metadata (title and author)
pub fn update_pdf_metadata(
    app: &AppHandle,
    drive_file_id: &str,
    pdf_title: Option<&str>,
    pdf_author: Option<&str>,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf SET pdf_title = ?1, pdf_author = ?2, updated_at = ?3 WHERE drive_file_id = ?4",
        rusqlite::params![pdf_title, pdf_author, now_timestamp(), drive_file_id],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    Ok(())
}

/// Delete local copy of a bookshelf item (deletes file and resets database)
pub fn delete_local_copy(app: &AppHandle, drive_file_id: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;

    // Get current local path
    let local_path: Option<String> = conn
        .query_row(
            "SELECT local_path FROM bookshelf WHERE drive_file_id = ?1",
            [drive_file_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    // Delete file if exists
    if let Some(path) = local_path {
        let path = std::path::Path::new(&path);
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| {
                PedaruError::Io(IoError::ReadFailed {
                    path: path.display().to_string(),
                    source: e,
                })
            })?;
        }
    }

    // Update database
    conn.execute(
        "UPDATE bookshelf SET
           local_path = NULL,
           download_status = 'pending',
           download_progress = 0,
           updated_at = ?1
         WHERE drive_file_id = ?2",
        rusqlite::params![now_timestamp(), drive_file_id],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    Ok(())
}

/// Reset download status without deleting the file
/// Used when file is known to be missing
pub fn reset_download_status(app: &AppHandle, drive_file_id: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;

    conn.execute(
        "UPDATE bookshelf SET
           local_path = NULL,
           download_status = 'pending',
           download_progress = 0,
           thumbnail_data = NULL,
           updated_at = ?1
         WHERE drive_file_id = ?2",
        rusqlite::params![now_timestamp(), drive_file_id],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    Ok(())
}

/// Reset stale "downloading" statuses to "pending" on app startup
pub fn reset_stale_downloads(app: &AppHandle) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf SET download_status = 'pending', download_progress = 0 WHERE download_status = 'downloading'",
        [],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
    Ok(())
}

/// Verify that local files exist for completed downloads
/// For cloud files: Resets status to "pending" for items where the file no longer exists
/// For local files: Deletes the database entry if the file no longer exists
pub fn verify_local_files(app: &AppHandle) -> Result<i32, PedaruError> {
    let conn = open_db(app)?;

    // Get all completed downloads with local paths
    let mut stmt = conn
        .prepare(
            "SELECT id, drive_file_id, local_path, source_type FROM bookshelf
             WHERE download_status = 'completed' AND local_path IS NOT NULL",
        )
        .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    let items: Vec<(i64, String, String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get::<_, String>(3).unwrap_or_else(|_| "google_drive".to_string()))))
        .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?
        .filter_map(|r| r.ok())
        .collect();

    let mut reset_count = 0;

    for (id, drive_file_id, local_path, source_type) in items {
        let path = std::path::Path::new(&local_path);
        if !path.exists() {
            if source_type == "local" {
                // For local files, delete the database entry entirely
                eprintln!("[Pedaru] Local file missing, deleting entry: {}", local_path);
                conn.execute("DELETE FROM bookshelf WHERE id = ?1", [id])
                    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
            } else {
                // For cloud files, reset to pending so they can be re-downloaded
                eprintln!("[Pedaru] Cloud file missing, resetting status: {}", local_path);
                conn.execute(
                    "UPDATE bookshelf SET
                       download_status = 'pending',
                       download_progress = 0,
                       local_path = NULL,
                       thumbnail_data = NULL,
                       updated_at = ?1
                     WHERE drive_file_id = ?2",
                    rusqlite::params![now_timestamp(), drive_file_id],
                )
                .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;
            }
            reset_count += 1;
        }
    }

    if reset_count > 0 {
        eprintln!("[Pedaru] Processed {} items with missing files", reset_count);
    }

    Ok(reset_count)
}

// ============================================================================
// Local File Import
// ============================================================================

/// Result of importing local files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported_count: i32,
    pub skipped_count: i32,
    pub error_count: i32,
}

/// Generate a unique ID for local files (not from Google Drive)
fn generate_local_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("local_{}", timestamp)
}

/// Import a single PDF file to the bookshelf
/// Copies the file to the downloads directory
pub fn import_local_file(app: &AppHandle, source_path: &str) -> Result<BookshelfItem, PedaruError> {
    let source = std::path::Path::new(source_path);

    // Validate file exists and is a PDF
    if !source.exists() {
        return Err(PedaruError::Io(IoError::ReadFailed {
            path: source_path.to_string(),
            source: std::io::Error::new(std::io::ErrorKind::NotFound, "File not found"),
        }));
    }

    let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("");
    if extension.to_lowercase() != "pdf" {
        return Err(PedaruError::Io(IoError::ReadFailed {
            path: source_path.to_string(),
            source: std::io::Error::new(std::io::ErrorKind::InvalidInput, "Not a PDF file"),
        }));
    }

    let file_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.pdf")
        .to_string();

    // Check if already imported (by original_path)
    let conn = open_db(app)?;
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM bookshelf WHERE original_path = ?1 AND source_type = 'local'",
            [source_path],
            |row| row.get(0),
        )
        .ok();

    if existing.is_some() {
        return Err(PedaruError::Database(DatabaseError::QueryFailed(
            "File already imported".to_string(),
        )));
    }

    // Get file size
    let file_size = std::fs::metadata(source)
        .map(|m| m.len() as i64)
        .ok();

    // Copy to downloads directory
    let downloads_dir = get_downloads_dir(app)?;
    let dest_path = downloads_dir.join(&file_name);

    // Handle filename conflicts by adding a number suffix
    let final_dest = if dest_path.exists() {
        let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let mut counter = 1;
        loop {
            let new_name = format!("{}_{}.pdf", stem, counter);
            let new_path = downloads_dir.join(&new_name);
            if !new_path.exists() {
                break new_path;
            }
            counter += 1;
        }
    } else {
        dest_path
    };

    // Copy the file
    std::fs::copy(source, &final_dest).map_err(|e| {
        PedaruError::Io(IoError::ReadFailed {
            path: source_path.to_string(),
            source: e,
        })
    })?;

    let local_path = final_dest.to_string_lossy().to_string();
    let local_id = generate_local_id();
    let now = now_timestamp();

    // Insert into database
    conn.execute(
        "INSERT INTO bookshelf (
            drive_file_id, drive_folder_id, file_name, file_size, mime_type,
            local_path, download_status, download_progress, source_type, original_path,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, 'application/pdf', ?5, 'completed', 100.0, 'local', ?6, ?7, ?8)",
        rusqlite::params![
            local_id,
            "",  // No folder ID for local files
            file_name,
            file_size,
            local_path,
            source_path,
            now,
            now
        ],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    let id = conn.last_insert_rowid();

    Ok(BookshelfItem {
        id,
        drive_file_id: Some(local_id),
        drive_folder_id: Some(String::new()),
        file_name,
        file_size,
        thumbnail_data: None,
        local_path: Some(local_path),
        download_status: "completed".to_string(),
        download_progress: 100.0,
        pdf_title: None,
        pdf_author: None,
        source_type: "local".to_string(),
        original_path: Some(source_path.to_string()),
        created_at: now,
        is_favorite: false,
        last_opened: None,
    })
}

/// Import multiple PDF files from a directory
pub fn import_local_directory(app: &AppHandle, dir_path: &str) -> Result<ImportResult, PedaruError> {
    let dir = std::path::Path::new(dir_path);

    if !dir.exists() || !dir.is_dir() {
        return Err(PedaruError::Io(IoError::ReadFailed {
            path: dir_path.to_string(),
            source: std::io::Error::new(std::io::ErrorKind::NotFound, "Directory not found"),
        }));
    }

    let mut imported_count = 0;
    let mut skipped_count = 0;
    let mut error_count = 0;

    // Read directory entries
    let entries = std::fs::read_dir(dir).map_err(|e| {
        PedaruError::Io(IoError::ReadFailed {
            path: dir_path.to_string(),
            source: e,
        })
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext.to_str().map(|s| s.to_lowercase()) == Some("pdf".to_string()) {
                    match import_local_file(app, path.to_string_lossy().as_ref()) {
                        Ok(_) => imported_count += 1,
                        Err(e) => {
                            let error_str = format!("{:?}", e);
                            if error_str.contains("already imported") {
                                skipped_count += 1;
                            } else {
                                eprintln!("[Pedaru] Failed to import {:?}: {:?}", path, e);
                                error_count += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(ImportResult {
        imported_count,
        skipped_count,
        error_count,
    })
}

/// Delete a local file from bookshelf (removes from database and deletes the copied file)
pub fn delete_local_item(app: &AppHandle, item_id: i64) -> Result<(), PedaruError> {
    let conn = open_db(app)?;

    // Get the local path first
    let local_path: Option<String> = conn
        .query_row(
            "SELECT local_path FROM bookshelf WHERE id = ?1 AND source_type = 'local'",
            [item_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    // Delete the file if it exists
    if let Some(path) = local_path {
        let path = std::path::Path::new(&path);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    // Delete from database
    conn.execute("DELETE FROM bookshelf WHERE id = ?1", [item_id])
        .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    Ok(())
}

/// Toggle favorite status for a bookshelf item
pub fn toggle_favorite(app: &AppHandle, item_id: i64) -> Result<bool, PedaruError> {
    let conn = open_db(app)?;

    // Get current favorite status
    let current: i64 = conn
        .query_row(
            "SELECT is_favorite FROM bookshelf WHERE id = ?1",
            [item_id],
            |row| row.get(0),
        )
        .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    let new_status = if current == 0 { 1 } else { 0 };

    conn.execute(
        "UPDATE bookshelf SET is_favorite = ?1 WHERE id = ?2",
        rusqlite::params![new_status, item_id],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    Ok(new_status == 1)
}

/// Update last_opened timestamp when a PDF is opened
pub fn update_last_opened(app: &AppHandle, local_path: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    conn.execute(
        "UPDATE bookshelf SET last_opened = ?1, updated_at = ?1 WHERE local_path = ?2",
        rusqlite::params![now, local_path],
    )
    .map_err(|e| PedaruError::Database(DatabaseError::QueryFailed(e.to_string())))?;

    Ok(())
}
