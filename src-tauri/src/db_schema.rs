use tauri_plugin_sql::{Migration, MigrationKind};

/// Returns the database migrations for the application
pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "download_queue",
            sql: include_str!("migrations/002_download_queue.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "simplify_bookshelf",
            sql: include_str!("migrations/003_simplify_bookshelf.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
