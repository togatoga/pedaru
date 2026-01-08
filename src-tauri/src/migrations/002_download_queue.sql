-- Download queue for persistent, sequential downloads
CREATE TABLE IF NOT EXISTS download_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drive_file_id TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',  -- queued, processing, completed, error, cancelled
    error_message TEXT,
    download_progress REAL DEFAULT 0,
    queued_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON download_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON download_queue(priority DESC, queued_at ASC);

-- Simplify bookshelf_cloud: remove download_status and download_progress
-- Download state is now derived from:
--   - local_path IS NOT NULL → completed
--   - download_queue status → downloading/queued/error
--   - Otherwise → pending

-- Remove download_status index (column will be removed)
DROP INDEX IF EXISTS idx_cloud_download_status;

-- SQLite doesn't support DROP COLUMN directly in older versions,
-- but Tauri's SQLite should support it (SQLite 3.35.0+)
ALTER TABLE bookshelf_cloud DROP COLUMN download_status;
ALTER TABLE bookshelf_cloud DROP COLUMN download_progress;
