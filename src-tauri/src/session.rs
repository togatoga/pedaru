//! Session management for PDF viewer
//!
//! This module handles saving and loading PDF session state,
//! including page position, zoom, bookmarks, tabs, and history.

use crate::db::{ToDbError, now_timestamp, open_db};
use crate::error::{DatabaseError, PedaruError};
use crate::types::{BookmarkState, HistoryEntry, PdfSessionState, RecentFileInfo, TabState};
use rusqlite::{Connection, params};

const MAX_STORED_SESSIONS: i64 = 50;

// ============================================================================
// Public API
// ============================================================================

/// Save session state for a PDF file
pub fn save_session(
    app: &tauri::AppHandle,
    file_path: &str,
    state: PdfSessionState,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    // Get name - use provided name or extract filename from path
    let name = state.name.clone().unwrap_or_else(|| {
        file_path
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or("Unknown")
            .to_string()
    });

    // Serialize complex fields to JSON (for backward compatibility)
    let bookmarks_json = serde_json::to_string(&state.bookmarks)
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
    let tabs_json = serde_json::to_string(&state.tabs)
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
    let windows_json = serde_json::to_string(&state.windows)
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;
    let history_json = state
        .page_history
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

    // Upsert session
    conn.execute(
        "INSERT INTO sessions (
            file_path, path_hash, name, current_page, zoom, view_mode,
            bookmarks, page_history, history_index, tabs, active_tab_index,
            windows, last_opened, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        ON CONFLICT(file_path) DO UPDATE SET
            name = ?3, current_page = ?4, zoom = ?5, view_mode = ?6,
            bookmarks = ?7, page_history = ?8, history_index = ?9,
            tabs = ?10, active_tab_index = ?11, windows = ?12,
            last_opened = ?13, updated_at = ?15",
        params![
            file_path,
            "", // path_hash deprecated
            name,
            state.page,
            state.zoom,
            state.view_mode,
            bookmarks_json,
            history_json,
            state.history_index,
            tabs_json,
            state.active_tab_index,
            windows_json,
            now,
            now,
            now,
        ],
    )
    .db_err()?;

    // Get session ID for normalized tables
    let session_id: i64 = conn
        .query_row(
            "SELECT id FROM sessions WHERE file_path = ?1",
            [file_path],
            |row| row.get(0),
        )
        .db_err()?;

    // Save to normalized tables
    save_normalized_bookmarks(&conn, session_id, &state.bookmarks)?;
    save_normalized_tabs(&conn, session_id, &state.tabs, state.active_tab_index)?;
    if let Some(ref history) = state.page_history {
        save_normalized_history(&conn, session_id, history)?;
    }

    // Cleanup old sessions
    cleanup_old_sessions(&conn)?;

    Ok(())
}

/// Load session state for a PDF file
pub fn load_session(
    app: &tauri::AppHandle,
    file_path: &str,
) -> Result<Option<PdfSessionState>, PedaruError> {
    let conn = open_db(app)?;

    // Query main session data
    let result: Result<SessionRow, rusqlite::Error> = conn.query_row(
        "SELECT id, name, current_page, zoom, view_mode, bookmarks, page_history,
                history_index, tabs, active_tab_index, windows, last_opened
         FROM sessions WHERE file_path = ?1",
        [file_path],
        |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                name: row.get(1)?,
                current_page: row.get(2)?,
                zoom: row.get(3)?,
                view_mode: row.get(4)?,
                bookmarks_json: row.get(5)?,
                history_json: row.get(6)?,
                history_index: row.get(7)?,
                tabs_json: row.get(8)?,
                active_tab_index: row.get(9)?,
                windows_json: row.get(10)?,
                last_opened: row.get(11)?,
            })
        },
    );

    match result {
        Ok(row) => {
            // Try normalized tables first, fall back to JSON
            let bookmarks = load_normalized_bookmarks(&conn, row.id)
                .ok()
                .filter(|b| !b.is_empty())
                .or_else(|| {
                    row.bookmarks_json
                        .and_then(|j| serde_json::from_str(&j).ok())
                })
                .unwrap_or_default();

            let (tabs, active_idx) = load_normalized_tabs(&conn, row.id)
                .ok()
                .filter(|(t, _)| !t.is_empty())
                .unwrap_or_else(|| {
                    let tabs = row
                        .tabs_json
                        .and_then(|j| serde_json::from_str(&j).ok())
                        .unwrap_or_default();
                    (tabs, row.active_tab_index)
                });

            let page_history = load_normalized_history(&conn, row.id)
                .ok()
                .filter(|h| !h.is_empty())
                .or_else(|| row.history_json.and_then(|j| serde_json::from_str(&j).ok()));

            let windows = row
                .windows_json
                .and_then(|j| serde_json::from_str(&j).ok())
                .unwrap_or_default();

            Ok(Some(PdfSessionState {
                name: Some(row.name),
                last_opened: row.last_opened,
                page: row.current_page,
                zoom: row.zoom,
                view_mode: row.view_mode,
                active_tab_index: active_idx,
                tabs,
                windows,
                bookmarks,
                page_history,
                history_index: row.history_index,
            }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(PedaruError::Database(DatabaseError::QueryFailed(
            e.to_string(),
        ))),
    }
}

/// Delete a session by file path
pub fn delete_session(app: &tauri::AppHandle, file_path: &str) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute("DELETE FROM sessions WHERE file_path = ?1", [file_path])
        .db_err()?;
    Ok(())
}

/// Get recent files list
pub fn get_recent_files(
    app: &tauri::AppHandle,
    limit: i32,
) -> Result<Vec<RecentFileInfo>, PedaruError> {
    let conn = open_db(app)?;
    let mut stmt = conn
        .prepare("SELECT file_path, last_opened FROM sessions ORDER BY last_opened DESC LIMIT ?1")
        .db_err()?;

    let files = stmt
        .query_map([limit], |row| {
            Ok(RecentFileInfo {
                file_path: row.get(0)?,
                last_opened: row.get(1)?,
            })
        })
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    Ok(files)
}

// ============================================================================
// Internal Helpers
// ============================================================================

/// Internal struct for reading session row data
struct SessionRow {
    id: i64,
    name: String,
    current_page: u32,
    zoom: f64,
    view_mode: String,
    bookmarks_json: Option<String>,
    history_json: Option<String>,
    history_index: Option<i32>,
    tabs_json: Option<String>,
    active_tab_index: Option<i32>,
    windows_json: Option<String>,
    last_opened: i64,
}

/// Save bookmarks to the normalized session_bookmarks table
fn save_normalized_bookmarks(
    conn: &Connection,
    session_id: i64,
    bookmarks: &[BookmarkState],
) -> Result<(), PedaruError> {
    // Delete existing bookmarks for this session
    conn.execute(
        "DELETE FROM session_bookmarks WHERE session_id = ?1",
        [session_id],
    )
    .db_err()?;

    // Insert new bookmarks
    for bookmark in bookmarks {
        conn.execute(
            "INSERT INTO session_bookmarks (session_id, page, label, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                session_id,
                bookmark.page,
                bookmark.label,
                bookmark.created_at
            ],
        )
        .db_err()?;
    }

    Ok(())
}

/// Save tabs to the normalized session_tabs table
fn save_normalized_tabs(
    conn: &Connection,
    session_id: i64,
    tabs: &[TabState],
    active_tab_index: Option<i32>,
) -> Result<(), PedaruError> {
    // Delete existing tabs for this session
    conn.execute(
        "DELETE FROM session_tabs WHERE session_id = ?1",
        [session_id],
    )
    .db_err()?;

    // Insert new tabs
    for (i, tab) in tabs.iter().enumerate() {
        let is_active = active_tab_index == Some(i as i32);
        conn.execute(
            "INSERT INTO session_tabs (session_id, page, label, sort_order, is_active)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![session_id, tab.page, tab.label, i as i32, is_active],
        )
        .db_err()?;
    }

    Ok(())
}

/// Save page history to the normalized session_page_history table
fn save_normalized_history(
    conn: &Connection,
    session_id: i64,
    history: &[HistoryEntry],
) -> Result<(), PedaruError> {
    // Delete existing history for this session
    conn.execute(
        "DELETE FROM session_page_history WHERE session_id = ?1",
        [session_id],
    )
    .db_err()?;

    // Insert new history entries
    for entry in history {
        let visited_at: i64 = entry.timestamp.parse().unwrap_or_else(|_| now_timestamp());
        conn.execute(
            "INSERT INTO session_page_history (session_id, page, visited_at)
             VALUES (?1, ?2, ?3)",
            params![session_id, entry.page, visited_at],
        )
        .db_err()?;
    }

    Ok(())
}

/// Load bookmarks from the normalized session_bookmarks table
fn load_normalized_bookmarks(
    conn: &Connection,
    session_id: i64,
) -> Result<Vec<BookmarkState>, PedaruError> {
    let mut stmt = conn
        .prepare(
            "SELECT page, label, created_at FROM session_bookmarks
             WHERE session_id = ?1 ORDER BY created_at",
        )
        .db_err()?;

    let bookmarks = stmt
        .query_map([session_id], |row| {
            Ok(BookmarkState {
                page: row.get(0)?,
                label: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                created_at: row.get(2)?,
            })
        })
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    Ok(bookmarks)
}

/// Load tabs from the normalized session_tabs table
fn load_normalized_tabs(
    conn: &Connection,
    session_id: i64,
) -> Result<(Vec<TabState>, Option<i32>), PedaruError> {
    let mut stmt = conn
        .prepare(
            "SELECT page, label, sort_order, is_active FROM session_tabs
             WHERE session_id = ?1 ORDER BY sort_order",
        )
        .db_err()?;

    let mut active_tab_index: Option<i32> = None;
    let tabs: Vec<TabState> = stmt
        .query_map([session_id], |row| {
            let sort_order: i32 = row.get(2)?;
            let is_active: bool = row.get(3)?;
            Ok((
                TabState {
                    page: row.get(0)?,
                    label: row.get(1)?,
                },
                sort_order,
                is_active,
            ))
        })
        .db_err()?
        .filter_map(|r| r.ok())
        .map(|(tab, sort_order, is_active)| {
            if is_active {
                active_tab_index = Some(sort_order);
            }
            tab
        })
        .collect();

    Ok((tabs, active_tab_index))
}

/// Load page history from the normalized session_page_history table
fn load_normalized_history(
    conn: &Connection,
    session_id: i64,
) -> Result<Vec<HistoryEntry>, PedaruError> {
    let mut stmt = conn
        .prepare(
            "SELECT page, visited_at FROM session_page_history
             WHERE session_id = ?1 ORDER BY id",
        )
        .db_err()?;

    let history = stmt
        .query_map([session_id], |row| {
            let visited_at: i64 = row.get(1)?;
            Ok(HistoryEntry {
                page: row.get(0)?,
                timestamp: visited_at.to_string(),
            })
        })
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    Ok(history)
}

/// Cleanup old sessions, keeping only the most recent ones
fn cleanup_old_sessions(conn: &Connection) -> Result<(), PedaruError> {
    conn.execute(
        "DELETE FROM sessions
         WHERE id NOT IN (
             SELECT id FROM sessions
             ORDER BY last_opened DESC
             LIMIT ?1
         )",
        [MAX_STORED_SESSIONS],
    )
    .db_err()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::WindowState;

    fn create_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // Create sessions table
        conn.execute(
            "CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL UNIQUE,
                path_hash TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
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
                updated_at INTEGER NOT NULL
            )",
            [],
        )
        .unwrap();

        // Create normalized tables
        conn.execute(
            "CREATE TABLE session_bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                page INTEGER NOT NULL,
                label TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE session_tabs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                page INTEGER NOT NULL,
                label TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE session_page_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                page INTEGER NOT NULL,
                visited_at INTEGER NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_save_and_load_normalized_bookmarks() {
        let conn = create_test_db();

        // Insert a session first
        conn.execute(
            "INSERT INTO sessions (file_path, path_hash, name, current_page, zoom, view_mode, last_opened, created_at, updated_at)
             VALUES ('/test.pdf', '', 'Test', 1, 1.0, 'single', 1000, 1000, 1000)",
            [],
        )
        .unwrap();

        let bookmarks = vec![
            BookmarkState {
                page: 1,
                label: "First".to_string(),
                created_at: 1000,
            },
            BookmarkState {
                page: 10,
                label: "Second".to_string(),
                created_at: 2000,
            },
        ];

        save_normalized_bookmarks(&conn, 1, &bookmarks).unwrap();
        let loaded = load_normalized_bookmarks(&conn, 1).unwrap();

        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].page, 1);
        assert_eq!(loaded[0].label, "First");
        assert_eq!(loaded[1].page, 10);
        assert_eq!(loaded[1].label, "Second");
    }

    #[test]
    fn test_save_and_load_normalized_tabs() {
        let conn = create_test_db();

        // Insert a session first
        conn.execute(
            "INSERT INTO sessions (file_path, path_hash, name, current_page, zoom, view_mode, last_opened, created_at, updated_at)
             VALUES ('/test.pdf', '', 'Test', 1, 1.0, 'single', 1000, 1000, 1000)",
            [],
        )
        .unwrap();

        let tabs = vec![
            TabState {
                page: 1,
                label: "Tab 1".to_string(),
            },
            TabState {
                page: 5,
                label: "Tab 2".to_string(),
            },
        ];

        save_normalized_tabs(&conn, 1, &tabs, Some(1)).unwrap();
        let (loaded_tabs, active_idx) = load_normalized_tabs(&conn, 1).unwrap();

        assert_eq!(loaded_tabs.len(), 2);
        assert_eq!(loaded_tabs[0].page, 1);
        assert_eq!(loaded_tabs[1].page, 5);
        assert_eq!(active_idx, Some(1));
    }

    #[test]
    fn test_save_and_load_normalized_history() {
        let conn = create_test_db();

        // Insert a session first
        conn.execute(
            "INSERT INTO sessions (file_path, path_hash, name, current_page, zoom, view_mode, last_opened, created_at, updated_at)
             VALUES ('/test.pdf', '', 'Test', 1, 1.0, 'single', 1000, 1000, 1000)",
            [],
        )
        .unwrap();

        let history = vec![
            HistoryEntry {
                page: 1,
                timestamp: "1000".to_string(),
            },
            HistoryEntry {
                page: 5,
                timestamp: "2000".to_string(),
            },
        ];

        save_normalized_history(&conn, 1, &history).unwrap();
        let loaded = load_normalized_history(&conn, 1).unwrap();

        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].page, 1);
        assert_eq!(loaded[0].timestamp, "1000");
        assert_eq!(loaded[1].page, 5);
        assert_eq!(loaded[1].timestamp, "2000");
    }

    #[test]
    fn test_cleanup_old_sessions() {
        let conn = create_test_db();

        // Insert many sessions
        for i in 0..60 {
            conn.execute(
                "INSERT INTO sessions (file_path, path_hash, name, current_page, zoom, view_mode, last_opened, created_at, updated_at)
                 VALUES (?1, '', 'Test', 1, 1.0, 'single', ?2, ?2, ?2)",
                params![format!("/test{}.pdf", i), i as i64],
            )
            .unwrap();
        }

        cleanup_old_sessions(&conn).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .unwrap();

        assert_eq!(count, MAX_STORED_SESSIONS);
    }

    #[test]
    fn test_session_state_serialization() {
        let state = PdfSessionState {
            name: Some("Test PDF".to_string()),
            last_opened: 1000,
            page: 5,
            zoom: 1.5,
            view_mode: "two-column".to_string(),
            active_tab_index: Some(1),
            tabs: vec![TabState {
                page: 1,
                label: "Tab".to_string(),
            }],
            windows: vec![WindowState {
                page: 3,
                zoom: 1.0,
                view_mode: "single".to_string(),
            }],
            bookmarks: vec![BookmarkState {
                page: 10,
                label: "Bookmark".to_string(),
                created_at: 1000,
            }],
            page_history: Some(vec![HistoryEntry {
                page: 1,
                timestamp: "1000".to_string(),
            }]),
            history_index: Some(0),
        };

        // Test JSON serialization
        let json = serde_json::to_string(&state).unwrap();
        let deserialized: PdfSessionState = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.name, Some("Test PDF".to_string()));
        assert_eq!(deserialized.page, 5);
        assert_eq!(deserialized.zoom, 1.5);
        assert_eq!(deserialized.view_mode, "two-column");
    }
}
