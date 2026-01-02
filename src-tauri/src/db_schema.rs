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
        // Migration V7: Remove plaintext sensitive data
        // All secrets are now stored in Stronghold (encrypted vault)
        // Users will need to re-enter API keys and re-authenticate with Google
        Migration {
            version: 7,
            description: "remove_plaintext_secrets",
            sql: "-- Remove Gemini API key from settings (now stored in Stronghold)
                DELETE FROM settings WHERE key = 'gemini_api_key';

                -- Clear OAuth credentials and tokens from google_auth
                -- These are now stored in Stronghold
                UPDATE google_auth SET
                    client_id = '',
                    client_secret = '',
                    access_token = NULL,
                    refresh_token = NULL,
                    token_expiry = NULL;",
            kind: MigrationKind::Up,
        },
        // Migration V8: Add pdf_author column to bookshelf
        Migration {
            version: 8,
            description: "add_pdf_author_to_bookshelf",
            sql: "ALTER TABLE bookshelf ADD COLUMN pdf_author TEXT;",
            kind: MigrationKind::Up,
        },
        // Migration V9: Add local file support to bookshelf
        // source_type: 'google_drive' or 'local'
        // original_path: for local files, the original path before copying to downloads
        Migration {
            version: 9,
            description: "add_local_file_support_to_bookshelf",
            sql: "ALTER TABLE bookshelf ADD COLUMN source_type TEXT NOT NULL DEFAULT 'google_drive';
                  ALTER TABLE bookshelf ADD COLUMN original_path TEXT;
                  CREATE INDEX IF NOT EXISTS idx_bookshelf_source_type ON bookshelf(source_type);",
            kind: MigrationKind::Up,
        },
        // Migration V10: Add favorites support to bookshelf and cleanup zombie local files
        // Local files with 'pending' or 'error' status are invalid and should be deleted
        Migration {
            version: 10,
            description: "add_favorite_to_bookshelf",
            sql: "-- Add favorites column
                  ALTER TABLE bookshelf ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
                  CREATE INDEX IF NOT EXISTS idx_bookshelf_favorite ON bookshelf(is_favorite);
                  -- Cleanup zombie local files (local files should never be in pending/error status)
                  DELETE FROM bookshelf WHERE source_type = 'local' AND download_status != 'completed';",
            kind: MigrationKind::Up,
        },
        // Migration V11: Add last_opened column for sorting by recently opened
        // Also cleanup any remaining zombie local files
        Migration {
            version: 11,
            description: "add_last_opened_to_bookshelf",
            sql: "-- Add last_opened column for sorting by recently opened
                  ALTER TABLE bookshelf ADD COLUMN last_opened INTEGER;
                  CREATE INDEX IF NOT EXISTS idx_bookshelf_last_opened ON bookshelf(last_opened DESC);
                  -- Additional cleanup for zombie local files
                  DELETE FROM bookshelf WHERE source_type = 'local' AND download_status != 'completed';
                  -- Also cleanup local files where local_path is NULL or empty
                  DELETE FROM bookshelf WHERE source_type = 'local' AND (local_path IS NULL OR local_path = '');",
            kind: MigrationKind::Up,
        },
        // Migration V12: Split bookshelf table into cloud and local tables
        // This provides proper separation of concerns and removes unused columns
        Migration {
            version: 12,
            description: "split_bookshelf_into_cloud_and_local",
            sql: "-- Create bookshelf_cloud table for Google Drive files
                  CREATE TABLE bookshelf_cloud (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      drive_file_id TEXT NOT NULL UNIQUE,
                      drive_folder_id TEXT NOT NULL,
                      file_name TEXT NOT NULL,
                      file_size INTEGER,
                      drive_modified_time TEXT,
                      thumbnail_data TEXT,
                      local_path TEXT,
                      download_status TEXT NOT NULL DEFAULT 'pending',
                      download_progress REAL DEFAULT 0,
                      pdf_title TEXT,
                      pdf_author TEXT,
                      is_favorite INTEGER NOT NULL DEFAULT 0,
                      last_opened INTEGER,
                      created_at INTEGER NOT NULL,
                      updated_at INTEGER NOT NULL
                  );

                  -- Create bookshelf_local table for locally imported files
                  CREATE TABLE bookshelf_local (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      file_path TEXT NOT NULL UNIQUE,
                      original_path TEXT NOT NULL,
                      file_name TEXT NOT NULL,
                      file_size INTEGER,
                      thumbnail_data TEXT,
                      pdf_title TEXT,
                      pdf_author TEXT,
                      is_favorite INTEGER NOT NULL DEFAULT 0,
                      last_opened INTEGER,
                      imported_at INTEGER NOT NULL,
                      updated_at INTEGER NOT NULL
                  );

                  -- Migrate Google Drive files
                  INSERT INTO bookshelf_cloud (
                      id, drive_file_id, drive_folder_id, file_name, file_size,
                      drive_modified_time, thumbnail_data, local_path, download_status,
                      download_progress, pdf_title, pdf_author, is_favorite, last_opened,
                      created_at, updated_at
                  )
                  SELECT id, drive_file_id, drive_folder_id, file_name, file_size,
                         drive_modified_time, thumbnail_data, local_path, download_status,
                         download_progress, pdf_title, pdf_author, is_favorite, last_opened,
                         created_at, updated_at
                  FROM bookshelf WHERE source_type = 'google_drive' OR source_type IS NULL;

                  -- Migrate local files
                  INSERT INTO bookshelf_local (
                      id, file_path, original_path, file_name, file_size,
                      thumbnail_data, pdf_title, pdf_author, is_favorite, last_opened,
                      imported_at, updated_at
                  )
                  SELECT id, local_path, COALESCE(original_path, local_path), file_name, file_size,
                         thumbnail_data, pdf_title, pdf_author, is_favorite, last_opened,
                         created_at, updated_at
                  FROM bookshelf WHERE source_type = 'local';

                  -- Drop the old table
                  DROP TABLE bookshelf;

                  -- Create indexes for cloud table
                  CREATE INDEX idx_cloud_drive_file_id ON bookshelf_cloud(drive_file_id);
                  CREATE INDEX idx_cloud_folder_id ON bookshelf_cloud(drive_folder_id);
                  CREATE INDEX idx_cloud_download_status ON bookshelf_cloud(download_status);
                  CREATE INDEX idx_cloud_last_opened ON bookshelf_cloud(last_opened DESC);
                  CREATE INDEX idx_cloud_favorite ON bookshelf_cloud(is_favorite);

                  -- Create indexes for local table
                  CREATE INDEX idx_local_file_path ON bookshelf_local(file_path);
                  CREATE INDEX idx_local_original_path ON bookshelf_local(original_path);
                  CREATE INDEX idx_local_last_opened ON bookshelf_local(last_opened DESC);
                  CREATE INDEX idx_local_favorite ON bookshelf_local(is_favorite);",
            kind: MigrationKind::Up,
        },
        // Migration V13: Drop unused google_auth table
        // OAuth credentials and tokens are now stored in Stronghold (encrypted vault)
        Migration {
            version: 13,
            description: "drop_unused_google_auth_table",
            sql: "DROP TABLE IF EXISTS google_auth;",
            kind: MigrationKind::Up,
        },
    ]
}
