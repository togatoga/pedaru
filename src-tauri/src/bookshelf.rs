//! Bookshelf management module
//!
//! This module handles bookshelf database operations and download management
//! for PDFs from both Google Drive (cloud) and local file imports.
//!
//! The bookshelf is split into two tables:
//! - `bookshelf_cloud`: PDFs synced from Google Drive
//! - `bookshelf_local`: PDFs imported from local filesystem

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Manager};

use crate::db::{ToDbError, now_timestamp, open_db};
use crate::error::{DatabaseError, IoError, PedaruError};

// ============================================================================
// Types - Cloud Items (Google Drive)
// ============================================================================

/// Download status for cloud items
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    #[default]
    Pending,
    Downloading,
    Completed,
    Error,
}

impl std::fmt::Display for DownloadStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DownloadStatus::Pending => write!(f, "pending"),
            DownloadStatus::Downloading => write!(f, "downloading"),
            DownloadStatus::Completed => write!(f, "completed"),
            DownloadStatus::Error => write!(f, "error"),
        }
    }
}

impl std::str::FromStr for DownloadStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(DownloadStatus::Pending),
            "downloading" => Ok(DownloadStatus::Downloading),
            "completed" => Ok(DownloadStatus::Completed),
            "error" => Ok(DownloadStatus::Error),
            _ => Err(format!("Unknown download status: {}", s)),
        }
    }
}

/// Cloud bookshelf item (from Google Drive)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudItem {
    pub id: i64,
    pub drive_file_id: String,
    pub drive_folder_id: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub thumbnail_data: Option<String>,
    pub local_path: Option<String>,
    pub download_status: DownloadStatus,
    pub download_progress: f64,
    pub pdf_title: Option<String>,
    pub pdf_author: Option<String>,
    pub is_favorite: bool,
    pub last_opened: Option<i64>,
    pub created_at: i64,
}

// ============================================================================
// Types - Local Items
// ============================================================================

/// Local bookshelf item (imported from filesystem)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalItem {
    pub id: i64,
    pub file_path: String,
    pub original_path: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub thumbnail_data: Option<String>,
    pub pdf_title: Option<String>,
    pub pdf_author: Option<String>,
    pub is_favorite: bool,
    pub last_opened: Option<i64>,
    pub imported_at: i64,
}

// ============================================================================
// Types - Common
// ============================================================================

/// Stored folder configuration (for Google Drive)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredFolder {
    pub folder_id: String,
    pub folder_name: String,
    pub is_active: bool,
    pub last_synced: Option<i64>,
}

/// Download progress event (for cloud items)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub drive_file_id: String,
    pub progress: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// Sync result (for cloud items)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub new_files: i32,
    pub updated_files: i32,
    pub removed_files: i32,
}

/// Result of importing local files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported_count: i32,
    pub skipped_count: i32,
    pub error_count: i32,
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
// Folder Operations (Google Drive)
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
    .db_err()?;
    Ok(())
}

/// Remove a folder from the sync list (marks as inactive)
pub fn remove_sync_folder(app: &AppHandle, folder_id: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE drive_folders SET is_active = 0 WHERE folder_id = ?1",
        [folder_id],
    )
    .db_err()?;
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
        .db_err()?;

    let folders = stmt
        .query_map([], |row| {
            Ok(StoredFolder {
                folder_id: row.get(0)?,
                folder_name: row.get(1)?,
                is_active: row.get::<_, i32>(2)? != 0,
                last_synced: row.get(3)?,
            })
        })
        .db_err()?
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
    .db_err()?;
    Ok(())
}

// ============================================================================
// Cloud Item Operations (Google Drive)
// ============================================================================

/// Upsert cloud item from Drive file
pub fn upsert_cloud_item(
    app: &AppHandle,
    drive_file_id: &str,
    folder_id: &str,
    file_name: &str,
    file_size: Option<i64>,
    modified_time: Option<&str>,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    conn.execute(
        "INSERT INTO bookshelf_cloud (
           drive_file_id, drive_folder_id, file_name, file_size,
           drive_modified_time, created_at, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
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
            modified_time,
            now
        ],
    )
    .db_err()?;

    Ok(())
}

/// Get all cloud items
/// Sorted by last_opened (most recent first), then by file_name for items never opened
pub fn get_cloud_items(app: &AppHandle) -> Result<Vec<CloudItem>, PedaruError> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, drive_file_id, drive_folder_id, file_name, file_size,
                    thumbnail_data, local_path, download_status, download_progress,
                    pdf_title, pdf_author, is_favorite, last_opened, created_at
             FROM bookshelf_cloud
             ORDER BY last_opened IS NULL, last_opened DESC, file_name ASC",
        )
        .db_err()?;

    let items = stmt
        .query_map([], |row| {
            let status_str: String = row.get(7)?;
            let download_status = status_str.parse().unwrap_or_default();
            Ok(CloudItem {
                id: row.get(0)?,
                drive_file_id: row.get(1)?,
                drive_folder_id: row.get(2)?,
                file_name: row.get(3)?,
                file_size: row.get(4)?,
                thumbnail_data: row.get(5)?,
                local_path: row.get(6)?,
                download_status,
                download_progress: row.get(8)?,
                pdf_title: row.get(9)?,
                pdf_author: row.get(10)?,
                is_favorite: row.get::<_, i64>(11)? != 0,
                last_opened: row.get(12)?,
                created_at: row.get(13)?,
            })
        })
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

/// Update download status for cloud item
pub fn update_download_status(
    app: &AppHandle,
    drive_file_id: &str,
    status: &str,
    progress: f64,
    local_path: Option<&str>,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf_cloud SET
           download_status = ?1,
           download_progress = ?2,
           local_path = COALESCE(?3, local_path),
           updated_at = ?4
         WHERE drive_file_id = ?5",
        rusqlite::params![status, progress, local_path, now_timestamp(), drive_file_id],
    )
    .db_err()?;
    Ok(())
}

/// Update thumbnail data for cloud item
pub fn update_cloud_thumbnail(
    app: &AppHandle,
    drive_file_id: &str,
    thumbnail_data: &str,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf_cloud SET thumbnail_data = ?1, updated_at = ?2 WHERE drive_file_id = ?3",
        rusqlite::params![thumbnail_data, now_timestamp(), drive_file_id],
    )
    .db_err()?;
    Ok(())
}

/// Update PDF metadata for cloud item
pub fn update_cloud_metadata(
    app: &AppHandle,
    drive_file_id: &str,
    pdf_title: Option<&str>,
    pdf_author: Option<&str>,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf_cloud SET pdf_title = ?1, pdf_author = ?2, updated_at = ?3 WHERE drive_file_id = ?4",
        rusqlite::params![pdf_title, pdf_author, now_timestamp(), drive_file_id],
    )
    .db_err()?;
    Ok(())
}

/// Delete local copy of a cloud item (deletes file and resets database)
pub fn delete_cloud_local_copy(app: &AppHandle, drive_file_id: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;

    // Get current local path
    let local_path: Option<String> = conn
        .query_row(
            "SELECT local_path FROM bookshelf_cloud WHERE drive_file_id = ?1",
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
        "UPDATE bookshelf_cloud SET
           local_path = NULL,
           download_status = 'pending',
           download_progress = 0,
           updated_at = ?1
         WHERE drive_file_id = ?2",
        rusqlite::params![now_timestamp(), drive_file_id],
    )
    .db_err()?;

    Ok(())
}

/// Reset download status for cloud item without deleting the file
pub fn reset_cloud_download_status(
    app: &AppHandle,
    drive_file_id: &str,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;

    conn.execute(
        "UPDATE bookshelf_cloud SET
           local_path = NULL,
           download_status = 'pending',
           download_progress = 0,
           thumbnail_data = NULL,
           updated_at = ?1
         WHERE drive_file_id = ?2",
        rusqlite::params![now_timestamp(), drive_file_id],
    )
    .db_err()?;

    Ok(())
}

/// Reset stale "downloading" statuses to "pending" on app startup
pub fn reset_stale_downloads(app: &AppHandle) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf_cloud SET download_status = 'pending', download_progress = 0 WHERE download_status = 'downloading'",
        [],
    )
    .db_err()?;
    Ok(())
}

/// Verify that local files exist for completed cloud downloads
/// Resets status to "pending" for items where the file no longer exists
pub fn verify_cloud_files(app: &AppHandle) -> Result<i32, PedaruError> {
    let conn = open_db(app)?;

    let mut stmt = conn
        .prepare(
            "SELECT drive_file_id, local_path FROM bookshelf_cloud
             WHERE download_status = 'completed' AND local_path IS NOT NULL",
        )
        .db_err()?;

    let items: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    let mut reset_count = 0;

    for (drive_file_id, local_path) in items {
        let path = std::path::Path::new(&local_path);
        if !path.exists() {
            eprintln!(
                "[Pedaru] Cloud file missing, resetting status: {}",
                local_path
            );
            conn.execute(
                "UPDATE bookshelf_cloud SET
                   download_status = 'pending',
                   download_progress = 0,
                   local_path = NULL,
                   thumbnail_data = NULL,
                   updated_at = ?1
                 WHERE drive_file_id = ?2",
                rusqlite::params![now_timestamp(), drive_file_id],
            )
            .db_err()?;
            reset_count += 1;
        }
    }

    if reset_count > 0 {
        eprintln!(
            "[Pedaru] Reset {} cloud items with missing files",
            reset_count
        );
    }

    Ok(reset_count)
}

/// Remove cloud items from inactive (removed) folders
/// Only removes items that are not downloaded (pending status)
/// Returns the number of items removed
pub fn remove_items_from_inactive_folders(app: &AppHandle) -> Result<i32, PedaruError> {
    let conn = open_db(app)?;

    // Get list of active folder IDs
    let mut stmt = conn
        .prepare("SELECT folder_id FROM drive_folders WHERE is_active = 1")
        .db_err()?;
    let active_folder_ids: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    if active_folder_ids.is_empty() {
        // No active folders - remove all non-downloaded cloud items
        let count = conn
            .execute(
                "DELETE FROM bookshelf_cloud WHERE download_status != 'completed'",
                [],
            )
            .db_err()?;
        eprintln!("[Pedaru] Removed {} cloud items (no active folders)", count);
        return Ok(count as i32);
    }

    // Build placeholders for IN clause
    let placeholders: Vec<String> = (0..active_folder_ids.len())
        .map(|i| format!("?{}", i + 1))
        .collect();
    let in_clause = placeholders.join(", ");

    // Delete items from inactive folders that are not downloaded
    let query = format!(
        "DELETE FROM bookshelf_cloud WHERE drive_folder_id NOT IN ({}) AND download_status != 'completed'",
        in_clause
    );

    let params: Vec<&dyn rusqlite::ToSql> = active_folder_ids
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();

    let count = conn.execute(&query, params.as_slice()).db_err()?;

    if count > 0 {
        eprintln!(
            "[Pedaru] Removed {} cloud items from inactive folders",
            count
        );
    }

    Ok(count as i32)
}

/// Toggle favorite status for cloud item
pub fn toggle_cloud_favorite(app: &AppHandle, item_id: i64) -> Result<bool, PedaruError> {
    let conn = open_db(app)?;

    let current: i64 = conn
        .query_row(
            "SELECT is_favorite FROM bookshelf_cloud WHERE id = ?1",
            [item_id],
            |row| row.get(0),
        )
        .db_err()?;

    let new_status = if current == 0 { 1 } else { 0 };

    conn.execute(
        "UPDATE bookshelf_cloud SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![new_status, now_timestamp(), item_id],
    )
    .db_err()?;

    Ok(new_status == 1)
}

/// Update last_opened timestamp for cloud item (by local_path)
pub fn update_cloud_last_opened(app: &AppHandle, local_path: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    conn.execute(
        "UPDATE bookshelf_cloud SET last_opened = ?1, updated_at = ?1 WHERE local_path = ?2",
        rusqlite::params![now, local_path],
    )
    .db_err()?;

    Ok(())
}

// ============================================================================
// Local Item Operations
// ============================================================================

/// Get all local items
/// Sorted by last_opened (most recent first), then by file_name for items never opened
pub fn get_local_items(app: &AppHandle) -> Result<Vec<LocalItem>, PedaruError> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, original_path, file_name, file_size,
                    thumbnail_data, pdf_title, pdf_author, is_favorite, last_opened, imported_at
             FROM bookshelf_local
             ORDER BY last_opened IS NULL, last_opened DESC, file_name ASC",
        )
        .db_err()?;

    let items = stmt
        .query_map([], |row| {
            Ok(LocalItem {
                id: row.get(0)?,
                file_path: row.get(1)?,
                original_path: row.get(2)?,
                file_name: row.get(3)?,
                file_size: row.get(4)?,
                thumbnail_data: row.get(5)?,
                pdf_title: row.get(6)?,
                pdf_author: row.get(7)?,
                is_favorite: row.get::<_, i64>(8)? != 0,
                last_opened: row.get(9)?,
                imported_at: row.get(10)?,
            })
        })
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

/// Update thumbnail data for local item
pub fn update_local_thumbnail(
    app: &AppHandle,
    item_id: i64,
    thumbnail_data: &str,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf_local SET thumbnail_data = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![thumbnail_data, now_timestamp(), item_id],
    )
    .db_err()?;
    Ok(())
}

/// Update PDF metadata for local item
pub fn update_local_metadata(
    app: &AppHandle,
    item_id: i64,
    pdf_title: Option<&str>,
    pdf_author: Option<&str>,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE bookshelf_local SET pdf_title = ?1, pdf_author = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![pdf_title, pdf_author, now_timestamp(), item_id],
    )
    .db_err()?;
    Ok(())
}

/// Verify that local files exist
/// Deletes database entries for items where the file no longer exists
pub fn verify_local_files(app: &AppHandle) -> Result<i32, PedaruError> {
    let conn = open_db(app)?;

    let mut stmt = conn
        .prepare("SELECT id, file_path FROM bookshelf_local")
        .db_err()?;

    let items: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    let mut deleted_count = 0;

    for (id, file_path) in items {
        let path = std::path::Path::new(&file_path);
        if !path.exists() {
            eprintln!("[Pedaru] Local file missing, deleting entry: {}", file_path);
            conn.execute("DELETE FROM bookshelf_local WHERE id = ?1", [id])
                .db_err()?;
            deleted_count += 1;
        }
    }

    if deleted_count > 0 {
        eprintln!(
            "[Pedaru] Deleted {} local items with missing files",
            deleted_count
        );
    }

    Ok(deleted_count)
}

/// Toggle favorite status for local item
pub fn toggle_local_favorite(app: &AppHandle, item_id: i64) -> Result<bool, PedaruError> {
    let conn = open_db(app)?;

    let current: i64 = conn
        .query_row(
            "SELECT is_favorite FROM bookshelf_local WHERE id = ?1",
            [item_id],
            |row| row.get(0),
        )
        .db_err()?;

    let new_status = if current == 0 { 1 } else { 0 };

    conn.execute(
        "UPDATE bookshelf_local SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![new_status, now_timestamp(), item_id],
    )
    .db_err()?;

    Ok(new_status == 1)
}

/// Update last_opened timestamp for local item (by file_path)
pub fn update_local_last_opened(app: &AppHandle, file_path: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    conn.execute(
        "UPDATE bookshelf_local SET last_opened = ?1, updated_at = ?1 WHERE file_path = ?2",
        rusqlite::params![now, file_path],
    )
    .db_err()?;

    Ok(())
}

/// Import a single PDF file to the bookshelf
/// Copies the file to the downloads directory
pub fn import_local_file(app: &AppHandle, source_path: &str) -> Result<LocalItem, PedaruError> {
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
            "SELECT id FROM bookshelf_local WHERE original_path = ?1",
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
    let file_size = std::fs::metadata(source).map(|m| m.len() as i64).ok();

    // Copy to downloads directory
    let downloads_dir = get_downloads_dir(app)?;

    // Ensure downloads directory exists
    if !downloads_dir.exists() {
        std::fs::create_dir_all(&downloads_dir).map_err(|e| {
            PedaruError::Io(IoError::CreateDirFailed {
                path: downloads_dir.display().to_string(),
                source: e,
            })
        })?;
    }

    let dest_path = downloads_dir.join(&file_name);

    // Handle filename conflicts by adding a number suffix
    let final_dest = if dest_path.exists() {
        let stem = source
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
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

    let file_path = final_dest.to_string_lossy().to_string();
    let now = now_timestamp();

    // Insert into database
    conn.execute(
        "INSERT INTO bookshelf_local (
            file_path, original_path, file_name, file_size,
            imported_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![file_path, source_path, file_name, file_size, now],
    )
    .db_err()?;

    let id = conn.last_insert_rowid();

    Ok(LocalItem {
        id,
        file_path,
        original_path: source_path.to_string(),
        file_name,
        file_size,
        thumbnail_data: None,
        pdf_title: None,
        pdf_author: None,
        is_favorite: false,
        last_opened: None,
        imported_at: now,
    })
}

/// Import multiple PDF files from a directory
pub fn import_local_directory(
    app: &AppHandle,
    dir_path: &str,
) -> Result<ImportResult, PedaruError> {
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
        if path.is_file()
            && let Some(ext) = path.extension()
            && ext.to_str().map(|s| s.to_lowercase()) == Some("pdf".to_string())
        {
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

    Ok(ImportResult {
        imported_count,
        skipped_count,
        error_count,
    })
}

/// Delete a local item from bookshelf (removes from database and deletes the copied file)
pub fn delete_local_item(app: &AppHandle, item_id: i64) -> Result<(), PedaruError> {
    let conn = open_db(app)?;

    // Get the file path first
    let file_path: Option<String> = conn
        .query_row(
            "SELECT file_path FROM bookshelf_local WHERE id = ?1",
            [item_id],
            |row| row.get(0),
        )
        .ok();

    // Delete the file if it exists
    if let Some(path) = file_path {
        let path = std::path::Path::new(&path);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    // Delete from database
    conn.execute("DELETE FROM bookshelf_local WHERE id = ?1", [item_id])
        .db_err()?;

    Ok(())
}

// ============================================================================
// Combined Operations
// ============================================================================

/// Update last_opened timestamp when a PDF is opened
/// Checks both cloud and local tables
pub fn update_last_opened(app: &AppHandle, path: &str) -> Result<(), PedaruError> {
    // Try cloud first
    if update_cloud_last_opened(app, path).is_ok() {
        return Ok(());
    }
    // Then try local
    update_local_last_opened(app, path)
}

/// Verify all local files (both cloud downloads and local imports)
pub fn verify_all_local_files(app: &AppHandle) -> Result<i32, PedaruError> {
    let cloud_count = verify_cloud_files(app)?;
    let local_count = verify_local_files(app)?;
    Ok(cloud_count + local_count)
}

// ============================================================================
// PDF Metadata Extraction
// ============================================================================

/// Extract PDF metadata and save it to the bookshelf database (cloud item)
pub fn extract_and_save_cloud_metadata(
    app: &AppHandle,
    file_path: &str,
    drive_file_id: &str,
) -> Result<(), PedaruError> {
    if let Ok(pdf_info) = crate::get_pdf_info_impl(file_path) {
        let title = pdf_info
            .title
            .as_ref()
            .filter(|t| !t.trim().is_empty())
            .map(|s| s.as_str());
        let author = pdf_info
            .author
            .as_ref()
            .filter(|a| !a.trim().is_empty())
            .map(|s| s.as_str());

        if title.is_some() || author.is_some() {
            update_cloud_metadata(app, drive_file_id, title, author)?;
        }
    }
    Ok(())
}

/// Extract PDF metadata and save it to the bookshelf database (local item)
pub fn extract_and_save_local_metadata(
    app: &AppHandle,
    file_path: &str,
    item_id: i64,
) -> Result<(), PedaruError> {
    if let Ok(pdf_info) = crate::get_pdf_info_impl(file_path) {
        let title = pdf_info
            .title
            .as_ref()
            .filter(|t| !t.trim().is_empty())
            .map(|s| s.as_str());
        let author = pdf_info
            .author
            .as_ref()
            .filter(|a| !a.trim().is_empty())
            .map(|s| s.as_str());

        if title.is_some() || author.is_some() {
            update_local_metadata(app, item_id, title, author)?;
        }
    }
    Ok(())
}

// ============================================================================
// Legacy Compatibility (Deprecated)
// ============================================================================

// The following types and functions are kept for backward compatibility
// during the migration period. They will be removed in a future version.

/// Bookshelf item union type for backward compatibility
/// @deprecated Use CloudItem or LocalItem instead
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

impl From<CloudItem> for BookshelfItem {
    fn from(item: CloudItem) -> Self {
        BookshelfItem {
            id: item.id,
            drive_file_id: Some(item.drive_file_id),
            drive_folder_id: Some(item.drive_folder_id),
            file_name: item.file_name,
            file_size: item.file_size,
            thumbnail_data: item.thumbnail_data,
            local_path: item.local_path,
            download_status: item.download_status.to_string(),
            download_progress: item.download_progress,
            pdf_title: item.pdf_title,
            pdf_author: item.pdf_author,
            source_type: "google_drive".to_string(),
            original_path: None,
            created_at: item.created_at,
            is_favorite: item.is_favorite,
            last_opened: item.last_opened,
        }
    }
}

impl From<LocalItem> for BookshelfItem {
    fn from(item: LocalItem) -> Self {
        BookshelfItem {
            id: item.id,
            drive_file_id: None,
            drive_folder_id: None,
            file_name: item.file_name,
            file_size: item.file_size,
            thumbnail_data: item.thumbnail_data,
            local_path: Some(item.file_path),
            download_status: "completed".to_string(),
            download_progress: 100.0,
            pdf_title: item.pdf_title,
            pdf_author: item.pdf_author,
            source_type: "local".to_string(),
            original_path: Some(item.original_path),
            created_at: item.imported_at,
            is_favorite: item.is_favorite,
            last_opened: item.last_opened,
        }
    }
}

/// Get all bookshelf items (combines cloud and local)
/// @deprecated Use get_cloud_items() and get_local_items() instead
pub fn get_items(app: &AppHandle) -> Result<Vec<BookshelfItem>, PedaruError> {
    let cloud_items: Vec<BookshelfItem> = get_cloud_items(app)?
        .into_iter()
        .map(BookshelfItem::from)
        .collect();
    let local_items: Vec<BookshelfItem> = get_local_items(app)?
        .into_iter()
        .map(BookshelfItem::from)
        .collect();

    // Merge and sort by last_opened
    let mut all_items = cloud_items;
    all_items.extend(local_items);
    all_items.sort_by(|a, b| match (a.last_opened, b.last_opened) {
        (Some(a_time), Some(b_time)) => b_time.cmp(&a_time),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.file_name.cmp(&b.file_name),
    });

    Ok(all_items)
}

/// Toggle favorite status (determines table from source_type)
/// @deprecated Use toggle_cloud_favorite() or toggle_local_favorite() instead
pub fn toggle_favorite(app: &AppHandle, item_id: i64, is_cloud: bool) -> Result<bool, PedaruError> {
    if is_cloud {
        toggle_cloud_favorite(app, item_id)
    } else {
        toggle_local_favorite(app, item_id)
    }
}

/// Update thumbnail (for backward compatibility)
/// @deprecated Use update_cloud_thumbnail() instead
pub fn update_thumbnail(
    app: &AppHandle,
    drive_file_id: &str,
    thumbnail_data: &str,
) -> Result<(), PedaruError> {
    update_cloud_thumbnail(app, drive_file_id, thumbnail_data)
}

/// Update PDF metadata (for backward compatibility)
/// @deprecated Use update_cloud_metadata() instead
pub fn update_pdf_metadata(
    app: &AppHandle,
    drive_file_id: &str,
    pdf_title: Option<&str>,
    pdf_author: Option<&str>,
) -> Result<(), PedaruError> {
    update_cloud_metadata(app, drive_file_id, pdf_title, pdf_author)
}

/// Delete local copy (for backward compatibility)
/// @deprecated Use delete_cloud_local_copy() instead
pub fn delete_local_copy(app: &AppHandle, drive_file_id: &str) -> Result<(), PedaruError> {
    delete_cloud_local_copy(app, drive_file_id)
}

/// Reset download status (for backward compatibility)
/// @deprecated Use reset_cloud_download_status() instead
pub fn reset_download_status(app: &AppHandle, drive_file_id: &str) -> Result<(), PedaruError> {
    reset_cloud_download_status(app, drive_file_id)
}

/// Verify local files (for backward compatibility)
/// @deprecated Use verify_all_local_files() instead
pub fn verify_local_files_compat(app: &AppHandle) -> Result<i32, PedaruError> {
    verify_all_local_files(app)
}

/// Upsert item (for backward compatibility)
/// @deprecated Use upsert_cloud_item() instead
pub fn upsert_item(
    app: &AppHandle,
    drive_file_id: &str,
    folder_id: &str,
    file_name: &str,
    file_size: Option<i64>,
    _mime_type: &str,
    modified_time: Option<&str>,
) -> Result<(), PedaruError> {
    upsert_cloud_item(
        app,
        drive_file_id,
        folder_id,
        file_name,
        file_size,
        modified_time,
    )
}

/// Extract and save PDF metadata (for backward compatibility)
/// @deprecated Use extract_and_save_cloud_metadata() instead
pub fn extract_and_save_pdf_metadata(
    app: &AppHandle,
    file_path: &str,
    item_id: &str,
) -> Result<(), PedaruError> {
    extract_and_save_cloud_metadata(app, file_path, item_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cloud_item_to_bookshelf_item_preserves_created_at() {
        let cloud_item = CloudItem {
            id: 1,
            drive_file_id: "abc123".to_string(),
            drive_folder_id: "folder456".to_string(),
            file_name: "test.pdf".to_string(),
            file_size: Some(1024),
            thumbnail_data: None,
            local_path: Some("/path/to/test.pdf".to_string()),
            download_status: DownloadStatus::Completed,
            download_progress: 100.0,
            pdf_title: Some("Test PDF".to_string()),
            pdf_author: Some("Author".to_string()),
            is_favorite: false,
            last_opened: Some(1704067200),
            created_at: 1704067200, // 2024-01-01 00:00:00 UTC
        };

        let bookshelf_item: BookshelfItem = cloud_item.into();

        // Verify created_at is preserved, not set to 0 (which would show as 1970)
        assert_eq!(bookshelf_item.created_at, 1704067200);
        assert_ne!(bookshelf_item.created_at, 0);
        assert_eq!(bookshelf_item.source_type, "google_drive");
    }

    #[test]
    fn test_local_item_to_bookshelf_item_preserves_imported_at() {
        let local_item = LocalItem {
            id: 1,
            file_path: "/path/to/test.pdf".to_string(),
            original_path: "/original/path/test.pdf".to_string(),
            file_name: "test.pdf".to_string(),
            file_size: Some(2048),
            thumbnail_data: None,
            pdf_title: Some("Local PDF".to_string()),
            pdf_author: Some("Local Author".to_string()),
            is_favorite: true,
            last_opened: Some(1704153600),
            imported_at: 1704153600, // 2024-01-02 00:00:00 UTC
        };

        let bookshelf_item: BookshelfItem = local_item.into();

        // Verify created_at uses imported_at value, not 0 (which would show as 1970)
        assert_eq!(bookshelf_item.created_at, 1704153600);
        assert_ne!(bookshelf_item.created_at, 0);
        assert_eq!(bookshelf_item.source_type, "local");
    }

    #[test]
    fn test_cloud_item_created_at_not_1970() {
        // This test specifically checks for the bug where created_at was hardcoded to 0
        let cloud_item = CloudItem {
            id: 1,
            drive_file_id: "test".to_string(),
            drive_folder_id: "folder".to_string(),
            file_name: "file.pdf".to_string(),
            file_size: None,
            thumbnail_data: None,
            local_path: None,
            download_status: DownloadStatus::Pending,
            download_progress: 0.0,
            pdf_title: None,
            pdf_author: None,
            is_favorite: false,
            last_opened: None,
            created_at: 1735689600, // 2025-01-01 00:00:00 UTC
        };

        let bookshelf_item: BookshelfItem = cloud_item.into();

        // Unix timestamp 0 = 1970-01-01, which is the bug we're fixing
        // The created_at should match what was set in the CloudItem
        assert!(bookshelf_item.created_at > 0);
        assert_eq!(bookshelf_item.created_at, 1735689600);
    }

    #[test]
    fn test_local_item_imported_at_not_1970() {
        // This test specifically checks for the bug where created_at was hardcoded to 0
        let local_item = LocalItem {
            id: 1,
            file_path: "/test.pdf".to_string(),
            original_path: "/original.pdf".to_string(),
            file_name: "test.pdf".to_string(),
            file_size: None,
            thumbnail_data: None,
            pdf_title: None,
            pdf_author: None,
            is_favorite: false,
            last_opened: None,
            imported_at: 1735689600, // 2025-01-01 00:00:00 UTC
        };

        let bookshelf_item: BookshelfItem = local_item.into();

        // Unix timestamp 0 = 1970-01-01, which is the bug we're fixing
        // The created_at should match the imported_at from LocalItem
        assert!(bookshelf_item.created_at > 0);
        assert_eq!(bookshelf_item.created_at, 1735689600);
    }
}
