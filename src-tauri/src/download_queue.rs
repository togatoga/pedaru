//! Download queue management module
//!
//! This module provides a persistent download queue backed by SQLite,
//! enabling sequential downloads that survive page navigation and app restarts.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

use crate::db::{ToDbError, now_timestamp, open_db};
use crate::error::PedaruError;

// ============================================================================
// Types
// ============================================================================

/// Queued download item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedDownload {
    pub id: i64,
    pub drive_file_id: String,
    pub file_name: String,
    pub priority: i32,
    pub status: String,
    pub error_message: Option<String>,
    pub download_progress: f64,
    pub queued_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

/// Download queue state for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueState {
    pub is_running: bool,
    pub current_item: Option<QueuedDownload>,
    pub pending_count: i32,
}

// ============================================================================
// Worker Stop Flag
// ============================================================================

/// Global flag for requesting worker to stop
static STOP_WORKER_FLAG: OnceLock<AtomicBool> = OnceLock::new();

fn get_stop_flag() -> &'static AtomicBool {
    STOP_WORKER_FLAG.get_or_init(|| AtomicBool::new(false))
}

/// Request the worker to stop
pub fn request_stop_worker() {
    get_stop_flag().store(true, Ordering::SeqCst);
}

/// Check if stop was requested
pub fn should_stop_worker() -> bool {
    get_stop_flag().load(Ordering::SeqCst)
}

/// Clear the stop flag (call before starting worker)
pub fn clear_stop_flag() {
    get_stop_flag().store(false, Ordering::SeqCst);
}

// ============================================================================
// Queue Operations
// ============================================================================

/// Add an item to the download queue
pub fn add_to_queue(
    app: &AppHandle,
    drive_file_id: &str,
    file_name: &str,
    priority: i32,
) -> Result<i64, PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    conn.execute(
        "INSERT INTO download_queue (drive_file_id, file_name, priority, status, queued_at)
         VALUES (?1, ?2, ?3, 'queued', ?4)
         ON CONFLICT(drive_file_id) DO UPDATE SET
           priority = MAX(excluded.priority, download_queue.priority),
           status = CASE WHEN download_queue.status IN ('completed', 'cancelled', 'error') THEN 'queued' ELSE download_queue.status END,
           queued_at = CASE WHEN download_queue.status IN ('completed', 'cancelled', 'error') THEN excluded.queued_at ELSE download_queue.queued_at END",
        rusqlite::params![drive_file_id, file_name, priority, now],
    )
    .db_err()?;

    let id = conn.last_insert_rowid();
    Ok(id)
}

/// Add all pending (not downloaded) cloud items to the queue
pub fn add_all_pending_to_queue(app: &AppHandle) -> Result<i32, PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    // Get all cloud items that are not downloaded (local_path IS NULL)
    // Exclude items already queued or processing
    let mut stmt = conn
        .prepare(
            "SELECT drive_file_id, file_name FROM bookshelf_cloud
             WHERE local_path IS NULL
             AND drive_file_id NOT IN (
                SELECT drive_file_id FROM download_queue WHERE status IN ('queued', 'processing')
             )",
        )
        .db_err()?;

    let items: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .db_err()?
        .filter_map(|r| r.ok())
        .collect();

    let count = items.len() as i32;

    for (drive_file_id, file_name) in items {
        // Use same logic as add_to_queue: re-queue cancelled/error/completed items
        conn.execute(
            "INSERT INTO download_queue (drive_file_id, file_name, priority, status, queued_at)
             VALUES (?1, ?2, 0, 'queued', ?3)
             ON CONFLICT(drive_file_id) DO UPDATE SET
               status = CASE WHEN download_queue.status IN ('completed', 'cancelled', 'error') THEN 'queued' ELSE download_queue.status END,
               queued_at = CASE WHEN download_queue.status IN ('completed', 'cancelled', 'error') THEN excluded.queued_at ELSE download_queue.queued_at END,
               download_progress = CASE WHEN download_queue.status IN ('completed', 'cancelled', 'error') THEN 0 ELSE download_queue.download_progress END",
            rusqlite::params![drive_file_id, file_name, now],
        )
        .db_err()?;
    }

    Ok(count)
}

/// Get the next queued item to process (highest priority, oldest first)
pub fn get_next_queued_item(app: &AppHandle) -> Result<Option<QueuedDownload>, PedaruError> {
    let conn = open_db(app)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, drive_file_id, file_name, priority, status, error_message, download_progress, queued_at, started_at, completed_at
             FROM download_queue
             WHERE status = 'queued'
             ORDER BY priority DESC, queued_at ASC
             LIMIT 1",
        )
        .db_err()?;

    let item = stmt
        .query_row([], |row| {
            Ok(QueuedDownload {
                id: row.get(0)?,
                drive_file_id: row.get(1)?,
                file_name: row.get(2)?,
                priority: row.get(3)?,
                status: row.get(4)?,
                error_message: row.get(5)?,
                download_progress: row.get(6)?,
                queued_at: row.get(7)?,
                started_at: row.get(8)?,
                completed_at: row.get(9)?,
            })
        })
        .ok();

    Ok(item)
}

/// Get the currently processing item
pub fn get_processing_item(app: &AppHandle) -> Result<Option<QueuedDownload>, PedaruError> {
    let conn = open_db(app)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, drive_file_id, file_name, priority, status, error_message, download_progress, queued_at, started_at, completed_at
             FROM download_queue
             WHERE status = 'processing'
             LIMIT 1",
        )
        .db_err()?;

    let item = stmt
        .query_row([], |row| {
            Ok(QueuedDownload {
                id: row.get(0)?,
                drive_file_id: row.get(1)?,
                file_name: row.get(2)?,
                priority: row.get(3)?,
                status: row.get(4)?,
                error_message: row.get(5)?,
                download_progress: row.get(6)?,
                queued_at: row.get(7)?,
                started_at: row.get(8)?,
                completed_at: row.get(9)?,
            })
        })
        .ok();

    Ok(item)
}

/// Update queue item status
pub fn update_queue_status(
    app: &AppHandle,
    drive_file_id: &str,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    let now = now_timestamp();

    match status {
        "processing" => {
            conn.execute(
                "UPDATE download_queue SET status = ?1, started_at = ?2 WHERE drive_file_id = ?3",
                rusqlite::params![status, now, drive_file_id],
            )
            .db_err()?;
        }
        "completed" | "error" | "cancelled" => {
            conn.execute(
                "UPDATE download_queue SET status = ?1, error_message = ?2, completed_at = ?3 WHERE drive_file_id = ?4",
                rusqlite::params![status, error_message, now, drive_file_id],
            )
            .db_err()?;
        }
        _ => {
            conn.execute(
                "UPDATE download_queue SET status = ?1, error_message = ?2 WHERE drive_file_id = ?3",
                rusqlite::params![status, error_message, drive_file_id],
            )
            .db_err()?;
        }
    }

    Ok(())
}

/// Update download progress for a queue item
pub fn update_download_progress(
    app: &AppHandle,
    drive_file_id: &str,
    progress: f64,
) -> Result<(), PedaruError> {
    let conn = open_db(app)?;
    conn.execute(
        "UPDATE download_queue SET download_progress = ?1 WHERE drive_file_id = ?2",
        rusqlite::params![progress, drive_file_id],
    )
    .db_err()?;
    Ok(())
}

/// Remove an item from the queue
pub fn remove_from_queue(app: &AppHandle, drive_file_id: &str) -> Result<bool, PedaruError> {
    let conn = open_db(app)?;
    let rows = conn
        .execute(
            "DELETE FROM download_queue WHERE drive_file_id = ?1",
            [drive_file_id],
        )
        .db_err()?;
    Ok(rows > 0)
}

/// Clear all queued items (does not affect processing items)
pub fn clear_queue(app: &AppHandle) -> Result<i32, PedaruError> {
    let conn = open_db(app)?;
    let rows = conn
        .execute("DELETE FROM download_queue WHERE status = 'queued'", [])
        .db_err()?;
    Ok(rows as i32)
}

/// Get the count of pending items in queue
pub fn get_pending_count(app: &AppHandle) -> Result<i32, PedaruError> {
    let conn = open_db(app)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM download_queue WHERE status IN ('queued', 'processing')",
            [],
            |row| row.get(0),
        )
        .db_err()?;
    Ok(count as i32)
}

/// Reset any items stuck in 'processing' status back to 'queued'
/// Called on app startup to recover from crashes
pub fn reset_processing_items(app: &AppHandle) -> Result<i32, PedaruError> {
    let conn = open_db(app)?;
    let rows = conn
        .execute(
            "UPDATE download_queue SET status = 'queued', started_at = NULL WHERE status = 'processing'",
            [],
        )
        .db_err()?;
    Ok(rows as i32)
}

// ============================================================================
// Worker State (Mutex-based for in-process exclusion)
// ============================================================================

/// Global worker running state
static WORKER_RUNNING: OnceLock<Mutex<bool>> = OnceLock::new();

fn get_worker_running() -> &'static Mutex<bool> {
    WORKER_RUNNING.get_or_init(|| Mutex::new(false))
}

/// Check if worker is running (in-memory state)
pub fn is_worker_running() -> bool {
    let guard = get_worker_running()
        .lock()
        .expect("WORKER_RUNNING mutex poisoned");
    *guard
}

/// Try to acquire worker lock - returns true if acquired, false if already running
pub fn try_acquire_worker_lock() -> bool {
    let mut guard = get_worker_running()
        .lock()
        .expect("WORKER_RUNNING mutex poisoned");
    if *guard {
        // Already running
        false
    } else {
        *guard = true;
        true
    }
}

/// Release worker lock
pub fn release_worker_lock() {
    let mut guard = get_worker_running()
        .lock()
        .expect("WORKER_RUNNING mutex poisoned");
    *guard = false;
}

// ============================================================================
// Queue State
// ============================================================================

/// Get the current queue state
pub fn get_queue_state(app: &AppHandle) -> Result<QueueState, PedaruError> {
    let is_running = is_worker_running();
    let current_item = get_processing_item(app)?;
    let pending_count = get_pending_count(app)?;

    Ok(QueueState {
        is_running,
        current_item,
        pending_count,
    })
}
