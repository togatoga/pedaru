//! Bookshelf management module
//!
//! This module handles bookshelf database operations and download management
//! for PDFs from both Google Drive (cloud) and local file imports.
//!
//! The bookshelf is split into two tables:
//! - `bookshelf_cloud`: PDFs synced from Google Drive
//! - `bookshelf_local`: PDFs imported from local filesystem

mod cloud;
mod download_manager;
mod local;
mod types;

pub use cloud::{
    add_sync_folder, delete_cloud_local_copy, extract_and_save_cloud_metadata, get_cloud_items,
    get_sync_folders, remove_items_from_inactive_folders, remove_sync_folder,
    reset_cloud_download_status, reset_stale_downloads, toggle_cloud_favorite,
    update_cloud_last_opened, update_cloud_metadata, update_cloud_thumbnail,
    update_download_status, update_folder_sync_time, upsert_cloud_item, verify_cloud_files,
};
pub use download_manager::{
    cancel_download, get_cancel_flag, register_download, unregister_download,
};
pub use local::{
    delete_local_item, extract_and_save_local_metadata, get_local_items, import_local_directory,
    import_local_file, toggle_local_favorite, update_local_last_opened, update_local_metadata,
    update_local_thumbnail, verify_local_files,
};
pub use types::{
    BookshelfItem, CloudItem, DownloadProgress, DownloadStatus, ImportResult, LocalItem,
    StoredFolder, SyncResult,
};

use tauri::{AppHandle, Manager};

use crate::db::{ToDbError, now_timestamp, open_db};
use crate::error::{IoError, PedaruError};

// ============================================================================
// Shared Helpers
// ============================================================================

/// Query a single string column, returning None when the row is missing or
/// the value is NULL
fn query_optional_string(
    conn: &rusqlite::Connection,
    sql: &str,
    param: impl rusqlite::ToSql,
) -> Option<String> {
    conn.query_row(sql, [param], |row| row.get(0))
        .ok()
        .flatten()
}

/// Read a boolean flag stored as an integer column
fn row_bool(row: &rusqlite::Row, idx: usize) -> rusqlite::Result<bool> {
    Ok(row.get::<_, i64>(idx)? != 0)
}

/// Remove a file if it exists
fn remove_file_if_exists(path: &str) -> Result<(), PedaruError> {
    let path = std::path::Path::new(path);
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| {
            PedaruError::Io(IoError::ReadFailed {
                path: path.display().to_string(),
                source: e,
            })
        })?;
    }
    Ok(())
}

/// Run `select_sql` (selecting an id and a file path), invoke `on_missing`
/// for each row whose file no longer exists on disk, and return how many
/// rows were handled
fn for_each_missing_file<T: rusqlite::types::FromSql>(
    conn: &rusqlite::Connection,
    select_sql: &str,
    mut on_missing: impl FnMut(T, &str) -> Result<(), PedaruError>,
) -> Result<i32, PedaruError> {
    let mut stmt = conn.prepare(select_sql).db_err()?;
    let items: Vec<(T, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    let mut missing_count = 0;
    for (id, path) in items {
        if !std::path::Path::new(&path).exists() {
            on_missing(id, &path)?;
            missing_count += 1;
        }
    }

    Ok(missing_count)
}

/// Toggle the is_favorite flag for a row in the given bookshelf table
fn toggle_favorite(app: &AppHandle, table: &str, item_id: i64) -> Result<bool, PedaruError> {
    let conn = open_db(app)?;

    let current: i64 = conn
        .query_row(
            &format!("SELECT is_favorite FROM {} WHERE id = ?1", table),
            [item_id],
            |row| row.get(0),
        )
        .db_err()?;

    let new_status = if current == 0 { 1 } else { 0 };

    conn.execute(
        &format!(
            "UPDATE {} SET is_favorite = ?1, updated_at = ?2 WHERE id = ?3",
            table
        ),
        rusqlite::params![new_status, now_timestamp(), item_id],
    )
    .db_err()?;

    Ok(new_status == 1)
}

/// Extract non-empty title/author from a PDF and pass them to `save`
fn extract_and_save_metadata(
    file_path: &str,
    save: impl FnOnce(Option<&str>, Option<&str>) -> Result<(), PedaruError>,
) -> Result<(), PedaruError> {
    if let Ok(pdf_info) = crate::get_pdf_info_impl(file_path) {
        let title = pdf_info.title.as_deref().filter(|t| !t.trim().is_empty());
        let author = pdf_info.author.as_deref().filter(|a| !a.trim().is_empty());

        if title.is_some() || author.is_some() {
            save(title, author)?;
        }
    }
    Ok(())
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

/// Get all bookshelf items (combines cloud and local)
/// Sorted by last_opened (most recent first), then by file_name for items never opened
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
