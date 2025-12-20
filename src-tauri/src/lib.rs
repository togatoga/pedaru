//! Pedaru - A cross-platform PDF viewer built with Tauri
//!
//! This is the main library crate that exposes Tauri commands and handles
//! application lifecycle management.

use lopdf::Document;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_sql::Builder as SqlBuilder;

// Module declarations
pub mod db;
mod db_schema;
pub mod encoding;
pub mod menu;
pub mod pdf;
pub mod types;

// Re-export public types
pub use types::{PdfInfo, RecentFile, TocEntry};

// Re-export functions for use in commands
use encoding::decode_pdf_string;
use menu::{build_app_menu, decode_file_path_from_menu_id};
use pdf::extract_toc;

/// Extract PDF information including metadata and table of contents
#[tauri::command]
fn get_pdf_info(path: String) -> Result<PdfInfo, String> {
    eprintln!("[Pedaru] get_pdf_info called for: {}", path);

    // Load document from file
    let doc = Document::load(&path).map_err(|e| format!("Failed to load PDF: {}", e))?;
    eprintln!("[Pedaru] PDF loaded successfully");

    let mut title = None;
    let mut author = None;
    let mut subject = None;

    if let Ok(lopdf::Object::Reference(ref_id)) = doc.trailer.get(b"Info")
        && let Ok(info_dict) = doc.get_dictionary(*ref_id)
    {
        title = info_dict.get(b"Title").ok().and_then(decode_pdf_string);
        author = info_dict.get(b"Author").ok().and_then(decode_pdf_string);
        subject = info_dict.get(b"Subject").ok().and_then(decode_pdf_string);
    }

    let toc = extract_toc(&doc);

    Ok(PdfInfo {
        title,
        author,
        subject,
        toc,
    })
}

/// Simple greeting command for testing
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Read PDF file and return the bytes
///
/// Returns the original file bytes - decryption is handled by pdf.js on the frontend.
#[tauri::command]
fn read_pdf_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read PDF file: {}", e))
}

// Store pending file path to open (set before frontend is ready)
static PENDING_FILE: std::sync::OnceLock<Arc<Mutex<Option<String>>>> = std::sync::OnceLock::new();

// Track if a file was opened via the Opened event (macOS file association)
static OPENED_VIA_EVENT: AtomicBool = AtomicBool::new(false);

fn get_pending_file() -> &'static Arc<Mutex<Option<String>>> {
    PENDING_FILE.get_or_init(|| Arc::new(Mutex::new(None)))
}

/// Get the file path that was opened via CLI or file association
#[tauri::command]
fn get_opened_file() -> Option<String> {
    let pending = get_pending_file();
    let mut guard = pending.lock().unwrap();
    guard.take()
}

/// Check if the app was opened via a file open event (macOS)
#[tauri::command]
fn was_opened_via_event() -> bool {
    OPENED_VIA_EVENT.load(Ordering::SeqCst)
}

/// Refresh the recent files menu
#[tauri::command]
fn refresh_recent_menu(app: tauri::AppHandle) -> Result<(), String> {
    eprintln!("[Pedaru] Refreshing recent files menu");
    let menu = build_app_menu(&app).map_err(|e| format!("Failed to build menu: {}", e))?;
    app.set_menu(menu)
        .map_err(|e| format!("Failed to set menu: {}", e))?;
    eprintln!("[Pedaru] Recent files menu refreshed successfully");
    Ok(())
}

/// Main application entry point
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Check for CLI arguments first (before building the app)
    // Use args_os() to handle non-UTF-8 paths correctly on macOS
    let args: Vec<String> = std::env::args_os()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();
    eprintln!("[Pedaru] CLI args: {:?}", args);

    if args.len() > 1 {
        let file_path = &args[1];
        eprintln!("[Pedaru] Checking file path: {}", file_path);
        if file_path.to_lowercase().ends_with(".pdf") {
            eprintln!("[Pedaru] Setting pending file: {}", file_path);
            let pending = get_pending_file();
            *pending.lock().unwrap() = Some(file_path.clone());
        }
    }

    // Initialize SQLite database with migrations
    let migrations = db_schema::get_migrations();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:pedaru.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            get_pdf_info,
            read_pdf_file,
            get_opened_file,
            was_opened_via_event,
            refresh_recent_menu
        ])
        .setup(|app| {
            // Build and set the initial menu
            let menu = build_app_menu(app.handle()).map_err(|e| e.to_string())?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            match id {
                "reset_all_data" => {
                    // Emit event to frontend to show confirmation dialog
                    app.emit("reset-all-data-requested", ()).ok();
                }
                "export_session_data" => {
                    // Emit event to frontend to handle export
                    app.emit("export-session-data-requested", ()).ok();
                }
                "import_session_data" => {
                    // Emit event to frontend to handle import
                    app.emit("import-session-data-requested", ()).ok();
                }
                "open_file" => {
                    // Emit event to frontend to open file dialog
                    app.emit("menu-open-file-requested", ()).ok();
                }
                id if id.starts_with("open-recent-") => {
                    // Extract file path from base64-encoded menu ID
                    if let Some(file_path) = decode_file_path_from_menu_id(id) {
                        app.emit("menu-open-recent-selected", file_path).ok();
                    }
                }
                "zoom_in" => {
                    app.emit("menu-zoom-in", ()).ok();
                }
                "zoom_out" => {
                    app.emit("menu-zoom-out", ()).ok();
                }
                "zoom_reset" => {
                    app.emit("menu-zoom-reset", ()).ok();
                }
                "toggle_two_column" => {
                    app.emit("menu-toggle-two-column", ()).ok();
                }
                "toggle_header" => {
                    app.emit("menu-toggle-header", ()).ok();
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match &event {
                // Handle macOS file open events (when file is opened while app is already running)
                // Each PDF opens in its own independent window (like Preview app)
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Opened { urls } => {
                    eprintln!("[Pedaru] Received Opened event with {} urls", urls.len());

                    for url in urls {
                        eprintln!("[Pedaru] URL: {:?}", url);
                        if let Ok(path) = url.to_file_path() {
                            let path_str = path.to_string_lossy().to_string();
                            eprintln!("[Pedaru] File path: {}", path_str);
                            if path_str.to_lowercase().ends_with(".pdf") {
                                // Check if this is the initial startup (OPENED_VIA_EVENT is false)
                                // If so, store in PENDING_FILE for main window to load
                                // If app is already running, create a new window
                                let was_already_opened =
                                    OPENED_VIA_EVENT.swap(true, Ordering::SeqCst);

                                if !was_already_opened {
                                    // First file open during startup - let main window handle it
                                    eprintln!(
                                        "[Pedaru] Initial startup, storing in PENDING_FILE: {}",
                                        path_str
                                    );
                                    let pending = get_pending_file();
                                    *pending.lock().unwrap() = Some(path_str);
                                } else {
                                    // App is already running - create a new independent window
                                    let encoded_path = urlencoding::encode(&path_str).into_owned();
                                    let window_url = format!("/?openFile={}", encoded_path);
                                    let window_label = format!(
                                        "pdf-{}",
                                        std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_millis()
                                    );

                                    eprintln!(
                                        "[Pedaru] Creating new window: {} with URL: {}",
                                        window_label, window_url
                                    );

                                    let file_name = path
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                        .unwrap_or_else(|| "PDF".to_string());

                                    if let Err(e) = tauri::WebviewWindowBuilder::new(
                                        app,
                                        &window_label,
                                        tauri::WebviewUrl::App(window_url.into()),
                                    )
                                    .title(&file_name)
                                    .inner_size(1200.0, 800.0)
                                    .min_inner_size(800.0, 600.0)
                                    .build()
                                    {
                                        eprintln!("[Pedaru] Failed to create window: {:?}", e);
                                    }
                                }
                            }
                        }
                    }
                }
                // Close all child windows when main window is closed
                tauri::RunEvent::WindowEvent {
                    label,
                    event: tauri::WindowEvent::CloseRequested { .. },
                    ..
                } => {
                    eprintln!("[Pedaru] CloseRequested event for window: {}", label);
                    if label == "main" {
                        eprintln!("[Pedaru] Main window closing, closing all child windows");
                        for (win_label, window) in app.webview_windows() {
                            eprintln!("[Pedaru] Found window: {}", win_label);
                            if win_label != "main" {
                                eprintln!("[Pedaru] Closing window: {}", win_label);
                                let _ = window.close();
                            }
                        }
                    }
                }
                _ => {}
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet() {
        let result = greet("World");
        assert_eq!(result, "Hello, World! You've been greeted from Rust!");
    }

    #[test]
    fn test_greet_empty_name() {
        let result = greet("");
        assert_eq!(result, "Hello, ! You've been greeted from Rust!");
    }
}
