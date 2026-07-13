//! Google Drive folder operations and cloud item CRUD

use tauri::AppHandle;

use crate::db::{ToDbError, now_timestamp, open_db};
use crate::error::PedaruError;

use super::types::{CloudItem, StoredFolder};
use super::{
    extract_and_save_metadata, for_each_missing_file, query_optional_string, remove_file_if_exists,
    row_bool, toggle_favorite,
};

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
                is_active: row_bool(row, 2)?,
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
                    drive_modified_time, thumbnail_data, local_path, download_status,
                    download_progress, pdf_title, pdf_author, is_favorite, last_opened, created_at
             FROM bookshelf_cloud
             ORDER BY last_opened IS NULL, last_opened DESC, file_name ASC",
        )
        .db_err()?;

    let items = stmt
        .query_map([], |row| {
            let status_str: String = row.get(8)?;
            let download_status = status_str.parse().unwrap_or_default();
            Ok(CloudItem {
                id: row.get(0)?,
                drive_file_id: row.get(1)?,
                drive_folder_id: row.get(2)?,
                file_name: row.get(3)?,
                file_size: row.get(4)?,
                modified_time: row.get(5)?,
                thumbnail_data: row.get(6)?,
                local_path: row.get(7)?,
                download_status,
                download_progress: row.get(9)?,
                pdf_title: row.get(10)?,
                pdf_author: row.get(11)?,
                is_favorite: row_bool(row, 12)?,
                last_opened: row.get(13)?,
                created_at: row.get(14)?,
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

    if let Some(path) = query_optional_string(
        &conn,
        "SELECT local_path FROM bookshelf_cloud WHERE drive_file_id = ?1",
        drive_file_id,
    ) {
        remove_file_if_exists(&path)?;
    }

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

    let reset_count = for_each_missing_file(
        &conn,
        "SELECT drive_file_id, local_path FROM bookshelf_cloud
         WHERE download_status = 'completed' AND local_path IS NOT NULL",
        |drive_file_id: String, local_path| {
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
            Ok(())
        },
    )?;

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
    toggle_favorite(app, "bookshelf_cloud", item_id)
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

/// Extract PDF metadata and save it to the bookshelf database (cloud item)
pub fn extract_and_save_cloud_metadata(
    app: &AppHandle,
    file_path: &str,
    drive_file_id: &str,
) -> Result<(), PedaruError> {
    extract_and_save_metadata(file_path, |title, author| {
        update_cloud_metadata(app, drive_file_id, title, author)
    })
}
