use tauri_plugin_sql::{Migration, MigrationKind};

/// Returns the database migrations for the application
pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: "CREATE TABLE IF NOT EXISTS sessions (
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
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_file_path ON sessions(file_path);
                CREATE INDEX IF NOT EXISTS idx_sessions_path_hash ON sessions(path_hash);
                CREATE INDEX IF NOT EXISTS idx_sessions_last_opened ON sessions(last_opened DESC);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add name column to sessions",
            sql: "ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT '';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add google drive integration tables",
            sql: "-- OAuth credentials and tokens
                CREATE TABLE IF NOT EXISTS google_auth (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    client_id TEXT NOT NULL,
                    client_secret TEXT NOT NULL,
                    access_token TEXT,
                    refresh_token TEXT,
                    token_expiry INTEGER,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                -- Google Drive folder configuration
                CREATE TABLE IF NOT EXISTS drive_folders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    folder_id TEXT NOT NULL UNIQUE,
                    folder_name TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    last_synced INTEGER,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_drive_folders_folder_id ON drive_folders(folder_id);

                -- Bookshelf items (PDFs from Google Drive)
                CREATE TABLE IF NOT EXISTS bookshelf (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    drive_file_id TEXT NOT NULL UNIQUE,
                    drive_folder_id TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    file_size INTEGER,
                    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
                    drive_modified_time TEXT,
                    thumbnail_data TEXT,
                    local_path TEXT,
                    download_status TEXT NOT NULL DEFAULT 'pending',
                    download_progress REAL DEFAULT 0,
                    last_error TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_bookshelf_drive_file_id ON bookshelf(drive_file_id);
                CREATE INDEX IF NOT EXISTS idx_bookshelf_folder_id ON bookshelf(drive_folder_id);
                CREATE INDEX IF NOT EXISTS idx_bookshelf_download_status ON bookshelf(download_status);",
            kind: MigrationKind::Up,
        },
        // Migration V4: Add pdf_title column to bookshelf
        Migration {
            version: 4,
            description: "add_pdf_title_to_bookshelf",
            sql: "ALTER TABLE bookshelf ADD COLUMN pdf_title TEXT;",
            kind: MigrationKind::Up,
        },
        // Migration V5: Add settings table for app configuration
        Migration {
            version: 5,
            description: "add_settings_table",
            sql: "CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT NOT NULL UNIQUE,
                    value TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);",
            kind: MigrationKind::Up,
        },
        // Migration V6: Normalize schema - extract bookmarks to separate table
        // Note: We keep JSON columns for backward compatibility during transition
        Migration {
            version: 6,
            description: "normalize_bookmarks_table",
            sql: "-- Create normalized bookmarks table
                CREATE TABLE IF NOT EXISTS session_bookmarks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    page INTEGER NOT NULL,
                    label TEXT,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                    UNIQUE(session_id, page)
                );
                CREATE INDEX IF NOT EXISTS idx_session_bookmarks_session ON session_bookmarks(session_id);
                CREATE INDEX IF NOT EXISTS idx_session_bookmarks_page ON session_bookmarks(page);

                -- Create normalized tabs table
                CREATE TABLE IF NOT EXISTS session_tabs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    page INTEGER NOT NULL,
                    label TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_session_tabs_session ON session_tabs(session_id);

                -- Create normalized page_history table
                CREATE TABLE IF NOT EXISTS session_page_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    page INTEGER NOT NULL,
                    visited_at INTEGER NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_session_page_history_session ON session_page_history(session_id);

                -- Remove unused gemini_prompt_word setting
                DELETE FROM settings WHERE key = 'gemini_prompt_word';

                -- Drop unused path_hash index (column kept for compatibility)
                DROP INDEX IF EXISTS idx_sessions_path_hash;",
            kind: MigrationKind::Up,
        },
    ]
}
