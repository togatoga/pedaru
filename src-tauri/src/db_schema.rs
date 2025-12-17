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
    ]
}
