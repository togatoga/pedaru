//! In-memory registry of active downloads and their cancellation flags

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

/// Global registry for tracking active downloads and their cancellation flags
static ACTIVE_DOWNLOADS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn get_active_downloads() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    ACTIVE_DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Register a download and return a cancellation flag
pub fn register_download(file_id: &str) -> Arc<AtomicBool> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let downloads = get_active_downloads();
    let mut guard = downloads.lock().expect("ACTIVE_DOWNLOADS mutex poisoned");
    guard.insert(file_id.to_string(), cancel_flag.clone());
    cancel_flag
}

/// Unregister a download
pub fn unregister_download(file_id: &str) {
    let downloads = get_active_downloads();
    let mut guard = downloads.lock().expect("ACTIVE_DOWNLOADS mutex poisoned");
    guard.remove(file_id);
}

/// Cancel a download by setting its cancellation flag
pub fn cancel_download(file_id: &str) -> bool {
    let downloads = get_active_downloads();
    let guard = downloads.lock().expect("ACTIVE_DOWNLOADS mutex poisoned");
    if let Some(cancel_flag) = guard.get(file_id) {
        cancel_flag.store(true, Ordering::SeqCst);
        true
    } else {
        false
    }
}

/// Get the cancellation flag for a download if it exists
pub fn get_cancel_flag(file_id: &str) -> Option<Arc<AtomicBool>> {
    let downloads = get_active_downloads();
    let guard = downloads.lock().expect("ACTIVE_DOWNLOADS mutex poisoned");
    guard.get(file_id).cloned()
}
