//! Local item CRUD for PDFs imported from the filesystem

use tauri::AppHandle;

use crate::db::{ToDbError, now_timestamp, open_db};
use crate::error::{IoError, PedaruError};

use super::types::{ImportResult, LocalItem};
use super::{
    extract_and_save_metadata, for_each_missing_file, get_downloads_dir, query_optional_string,
    remove_file_if_exists, row_bool, toggle_favorite,
};

/// Get all local items
/// Sorted by last_opened (most recent first), then by file_name for items never opened
pub fn get_local_items(app: &AppHandle) -> Result<Vec<LocalItem>, PedaruError> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, original_path, file_name, file_size,
                    thumbnail_data, pdf_title, pdf_author, is_favorite, last_opened, imported_at, updated_at
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
                is_favorite: row_bool(row, 8)?,
                last_opened: row.get(9)?,
                imported_at: row.get(10)?,
                updated_at: row.get(11)?,
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

    let deleted_count = for_each_missing_file(
        &conn,
        "SELECT id, file_path FROM bookshelf_local",
        |id: i64, file_path| {
            eprintln!("[Pedaru] Local file missing, deleting entry: {}", file_path);
            conn.execute("DELETE FROM bookshelf_local WHERE id = ?1", [id])
                .db_err()?;
            Ok(())
        },
    )?;

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
    toggle_favorite(app, "bookshelf_local", item_id)
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
        return Err(PedaruError::AlreadyImported(source_path.to_string()));
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
        updated_at: now,
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
                Err(PedaruError::AlreadyImported(_)) => skipped_count += 1,
                Err(e) => {
                    eprintln!("[Pedaru] Failed to import {:?}: {:?}", path, e);
                    error_count += 1;
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

    if let Some(path) = query_optional_string(
        &conn,
        "SELECT file_path FROM bookshelf_local WHERE id = ?1",
        item_id,
    ) {
        let _ = remove_file_if_exists(&path);
    }

    conn.execute("DELETE FROM bookshelf_local WHERE id = ?1", [item_id])
        .db_err()?;

    Ok(())
}

/// Extract PDF metadata and save it to the bookshelf database (local item)
pub fn extract_and_save_local_metadata(
    app: &AppHandle,
    file_path: &str,
    item_id: i64,
) -> Result<(), PedaruError> {
    extract_and_save_metadata(file_path, |title, author| {
        update_local_metadata(app, item_id, title, author)
    })
}
