//! Database operations for Pedaru
//!
//! This module handles SQLite database operations, including:
//! - Database path resolution
//! - Loading recent files for the menu

use crate::types::RecentFile;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Get the path to the SQLite database
///
/// Uses app_config_dir to match tauri-plugin-sql's database location:
/// - macOS: `~/Library/Application Support/com.togatoga.pedaru/pedaru.db`
/// - Linux: `~/.config/com.togatoga.pedaru/pedaru.db`
/// - Windows: `C:\Users\<username>\AppData\Roaming\com.togatoga.pedaru\pedaru.db`
pub fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Use app_config_dir to match tauri-plugin-sql's database location
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;

    // Create directory if it doesn't exist
    if !app_config_dir.exists() {
        fs::create_dir_all(&app_config_dir)
            .map_err(|e| format!("Failed to create app config dir: {}", e))?;
    }

    Ok(app_config_dir.join("pedaru.db"))
}

/// Load recent files from SQLite database
///
/// Returns up to 10 most recently opened files, optionally excluding
/// a specific file path (e.g., the currently open file).
///
/// Uses parameterized queries to prevent SQL injection.
pub fn load_recent_files(app: &tauri::AppHandle, exclude_path: Option<&str>) -> Vec<RecentFile> {
    match get_db_path(app) {
        Ok(db_path) => {
            if !db_path.exists() {
                eprintln!(
                    "[Pedaru] Database not found at {:?}, returning empty list",
                    db_path
                );
                return Vec::new();
            }

            match Connection::open(&db_path) {
                Ok(conn) => load_recent_files_from_connection(&conn, exclude_path),
                Err(e) => {
                    eprintln!("[Pedaru] Failed to open database: {}", e);
                    Vec::new()
                }
            }
        }
        Err(e) => {
            eprintln!("[Pedaru] Failed to get database path: {}", e);
            Vec::new()
        }
    }
}

/// Load recent files from an existing database connection
///
/// This is the core implementation that uses parameterized queries
/// to prevent SQL injection attacks.
pub fn load_recent_files_from_connection(
    conn: &Connection,
    exclude_path: Option<&str>,
) -> Vec<RecentFile> {
    // Use parameterized queries to prevent SQL injection
    // We use a single query that handles both cases using COALESCE
    let query = "SELECT file_path, name, last_opened FROM sessions
         WHERE (?1 IS NULL OR file_path != ?1)
         ORDER BY last_opened DESC LIMIT 10";

    match conn.prepare(query) {
        Ok(mut stmt) => {
            let files_result = stmt.query_map([exclude_path], |row| {
                Ok(RecentFile {
                    file_path: row.get(0)?,
                    name: row.get(1)?,
                    last_opened: row.get(2)?,
                })
            });

            match files_result {
                Ok(files) => files.filter_map(|f| f.ok()).collect(),
                Err(e) => {
                    eprintln!("[Pedaru] Failed to query recent files: {}", e);
                    Vec::new()
                }
            }
        }
        Err(e) => {
            eprintln!("[Pedaru] Failed to prepare query: {}", e);
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL UNIQUE,
                path_hash TEXT NOT NULL,
                current_page INTEGER NOT NULL,
                zoom REAL NOT NULL,
                view_mode TEXT NOT NULL,
                bookmarks TEXT,
                page_history TEXT,
                history_index INTEGER,
                tabs TEXT,
                active_tab_index INTEGER,
                windows TEXT,
                last_opened INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                name TEXT NOT NULL DEFAULT ''
            )",
            [],
        )
        .unwrap();
        conn
    }

    fn insert_test_session(conn: &Connection, file_path: &str, name: &str, last_opened: i64) {
        conn.execute(
            "INSERT INTO sessions (file_path, path_hash, current_page, zoom, view_mode, last_opened, created_at, updated_at, name)
             VALUES (?1, ?2, 1, 1.0, 'single', ?3, ?3, ?3, ?4)",
            rusqlite::params![file_path, "hash", last_opened, name],
        )
        .unwrap();
    }

    #[test]
    fn test_load_recent_files_empty_db() {
        let conn = create_test_db();
        let result = load_recent_files_from_connection(&conn, None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_recent_files_single_entry() {
        let conn = create_test_db();
        insert_test_session(&conn, "/path/to/file.pdf", "Test PDF", 1000);

        let result = load_recent_files_from_connection(&conn, None);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file_path, "/path/to/file.pdf");
        assert_eq!(result[0].name, "Test PDF");
        assert_eq!(result[0].last_opened, 1000);
    }

    #[test]
    fn test_load_recent_files_multiple_entries() {
        let conn = create_test_db();
        insert_test_session(&conn, "/path/to/file1.pdf", "PDF 1", 1000);
        insert_test_session(&conn, "/path/to/file2.pdf", "PDF 2", 2000);
        insert_test_session(&conn, "/path/to/file3.pdf", "PDF 3", 3000);

        let result = load_recent_files_from_connection(&conn, None);
        assert_eq!(result.len(), 3);
        // Should be ordered by last_opened DESC
        assert_eq!(result[0].file_path, "/path/to/file3.pdf");
        assert_eq!(result[1].file_path, "/path/to/file2.pdf");
        assert_eq!(result[2].file_path, "/path/to/file1.pdf");
    }

    #[test]
    fn test_load_recent_files_with_exclusion() {
        let conn = create_test_db();
        insert_test_session(&conn, "/path/to/file1.pdf", "PDF 1", 1000);
        insert_test_session(&conn, "/path/to/file2.pdf", "PDF 2", 2000);
        insert_test_session(&conn, "/path/to/file3.pdf", "PDF 3", 3000);

        let result = load_recent_files_from_connection(&conn, Some("/path/to/file2.pdf"));
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].file_path, "/path/to/file3.pdf");
        assert_eq!(result[1].file_path, "/path/to/file1.pdf");
    }

    #[test]
    fn test_load_recent_files_limit_10() {
        let conn = create_test_db();
        // Insert 15 entries
        for i in 0..15 {
            insert_test_session(
                &conn,
                &format!("/path/to/file{}.pdf", i),
                &format!("PDF {}", i),
                i as i64,
            );
        }

        let result = load_recent_files_from_connection(&conn, None);
        assert_eq!(result.len(), 10);
        // Most recent should be first
        assert_eq!(result[0].file_path, "/path/to/file14.pdf");
    }

    #[test]
    fn test_load_recent_files_sql_injection_prevention() {
        let conn = create_test_db();
        insert_test_session(&conn, "/path/to/file.pdf", "Test PDF", 1000);

        // Attempt SQL injection via exclude_path
        let malicious_path = "'; DROP TABLE sessions; --";
        let result = load_recent_files_from_connection(&conn, Some(malicious_path));

        // Table should still exist
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);

        // Result should be empty (no matching rows) but query should succeed
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn test_load_recent_files_with_special_characters() {
        let conn = create_test_db();
        // File paths with special characters
        insert_test_session(&conn, "/path/to/file's.pdf", "O'Reilly PDF", 1000);
        insert_test_session(&conn, "/path/to/日本語.pdf", "Japanese PDF", 2000);

        let result = load_recent_files_from_connection(&conn, None);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].file_path, "/path/to/日本語.pdf");
        assert_eq!(result[1].file_path, "/path/to/file's.pdf");
    }

    #[test]
    fn test_load_recent_files_exclude_special_characters() {
        let conn = create_test_db();
        insert_test_session(&conn, "/path/to/file's.pdf", "O'Reilly PDF", 1000);
        insert_test_session(&conn, "/path/to/other.pdf", "Other PDF", 2000);

        let result = load_recent_files_from_connection(&conn, Some("/path/to/file's.pdf"));
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file_path, "/path/to/other.pdf");
    }
}
