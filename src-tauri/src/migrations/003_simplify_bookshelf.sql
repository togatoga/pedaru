-- Simplify bookshelf_cloud: remove download_status and download_progress
-- Download state is now derived from:
--   - local_path IS NOT NULL → completed
--   - download_queue status → downloading/queued/error
--   - Otherwise → pending

-- Add download_progress to download_queue
ALTER TABLE download_queue ADD COLUMN download_progress REAL DEFAULT 0;

-- Remove download_status index (column will be removed)
DROP INDEX IF EXISTS idx_cloud_download_status;

-- SQLite doesn't support DROP COLUMN directly in older versions,
-- but Tauri's SQLite should support it (SQLite 3.35.0+)
ALTER TABLE bookshelf_cloud DROP COLUMN download_status;
ALTER TABLE bookshelf_cloud DROP COLUMN download_progress;
