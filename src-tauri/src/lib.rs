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
pub mod bookshelf;
pub mod db;
mod db_schema;
pub mod encoding;
pub mod error;
pub mod gemini;
pub mod google_drive;
pub mod menu;
pub mod oauth;
pub mod pdf;
pub mod secrets;
pub mod secure_string;
pub mod session;
pub mod settings;
pub mod types;

// Re-export public types
pub use types::{PdfInfo, RecentFile, TocEntry};

// Re-export functions for use in commands
use encoding::decode_pdf_string;
use error::{IntoTauriError, IoError, MenuError, PdfError};
use menu::{build_app_menu, decode_file_path_from_menu_id};
use pdf::extract_toc;

/// Internal implementation of get_pdf_info with typed errors
fn get_pdf_info_impl(path: &str) -> error::Result<PdfInfo> {
    eprintln!("[Pedaru] get_pdf_info called for: {}", path);

    // Load document from file
    let doc = Document::load(path).map_err(|source| PdfError::LoadFailed {
        path: path.to_string(),
        source,
    })?;
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

/// Extract PDF information including metadata and table of contents
#[tauri::command]
fn get_pdf_info(path: String) -> Result<PdfInfo, String> {
    get_pdf_info_impl(&path).map_err(|e| e.into_tauri_error())
}

/// Internal implementation of read_pdf_file with typed errors
fn read_pdf_file_impl(path: &str) -> error::Result<Vec<u8>> {
    std::fs::read(path)
        .map_err(|source| IoError::ReadFailed {
            path: path.to_string(),
            source,
        })
        .map_err(Into::into)
}

/// Read PDF file and return the bytes
///
/// Returns the original file bytes - decryption is handled by pdf.js on the frontend.
#[tauri::command]
fn read_pdf_file(path: String) -> Result<Vec<u8>, String> {
    read_pdf_file_impl(&path).map_err(|e| e.into_tauri_error())
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
    let mut guard = pending
        .lock()
        .expect("PENDING_FILE mutex poisoned - previous thread panicked");
    guard.take()
}

/// Check if the app was opened via a file open event (macOS)
#[tauri::command]
fn was_opened_via_event() -> bool {
    OPENED_VIA_EVENT.load(Ordering::SeqCst)
}

/// Internal implementation of refresh_recent_menu with typed errors
fn refresh_recent_menu_impl(app: &tauri::AppHandle) -> error::Result<()> {
    eprintln!("[Pedaru] Refreshing recent files menu");
    let menu = build_app_menu(app)?;
    app.set_menu(menu)
        .map_err(|e| MenuError::SetMenuFailed(e.to_string()))?;
    eprintln!("[Pedaru] Recent files menu refreshed successfully");
    Ok(())
}

/// Refresh the recent files menu
#[tauri::command]
fn refresh_recent_menu(app: tauri::AppHandle) -> Result<(), String> {
    refresh_recent_menu_impl(&app).map_err(|e| e.into_tauri_error())
}

// ============================================================================
// Google Drive / OAuth Commands
// ============================================================================

/// Save OAuth credentials
#[tauri::command(rename_all = "camelCase")]
fn save_oauth_credentials(
    app: tauri::AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    oauth::save_credentials(
        &app,
        &oauth::OAuthCredentials {
            client_id,
            client_secret: client_secret.into(), // Convert to SecureString
        },
    )
    .map_err(|e| e.into_tauri_error())
}

/// Get OAuth credentials
#[tauri::command]
fn get_oauth_credentials(app: tauri::AppHandle) -> Result<Option<oauth::OAuthCredentials>, String> {
    oauth::load_credentials(&app).map_err(|e| e.into_tauri_error())
}

/// Start Google OAuth flow
#[tauri::command]
fn start_google_auth(app: tauri::AppHandle) -> Result<String, String> {
    oauth::start_auth_flow(&app).map_err(|e| e.into_tauri_error())
}

/// Get Google authentication status
#[tauri::command]
fn get_google_auth_status(app: tauri::AppHandle) -> Result<oauth::AuthStatus, String> {
    oauth::get_auth_status(&app).map_err(|e| e.into_tauri_error())
}

/// Logout from Google
#[tauri::command]
fn logout_google(app: tauri::AppHandle) -> Result<(), String> {
    oauth::clear_tokens(&app).map_err(|e| e.into_tauri_error())
}

/// List folders in Google Drive
#[tauri::command(rename_all = "camelCase")]
async fn list_drive_folders(
    app: tauri::AppHandle,
    parent_id: Option<String>,
) -> Result<Vec<google_drive::DriveFolder>, String> {
    google_drive::list_folders(&app, parent_id.as_deref())
        .await
        .map_err(|e| e.into_tauri_error())
}

/// List both folders and files in Google Drive
#[tauri::command(rename_all = "camelCase")]
async fn list_drive_items(
    app: tauri::AppHandle,
    parent_id: Option<String>,
) -> Result<Vec<google_drive::DriveItem>, String> {
    google_drive::list_drive_items(&app, parent_id.as_deref())
        .await
        .map_err(|e| e.into_tauri_error())
}

/// Import specific files from Google Drive
#[tauri::command(rename_all = "camelCase")]
fn import_drive_files(
    app: tauri::AppHandle,
    files: Vec<google_drive::DriveItem>,
    parent_folder_id: Option<String>,
) -> Result<i32, String> {
    let folder_id = parent_folder_id.unwrap_or_else(|| "__imported__".to_string());
    let mut imported_count = 0;

    for file in files {
        if file.is_folder {
            continue; // Skip folders, only import files
        }
        let file_size: Option<i64> = file.size.as_ref().and_then(|s| s.parse().ok());
        bookshelf::upsert_item(
            &app,
            &file.id,
            &folder_id,
            &file.name,
            file_size,
            &file.mime_type,
            file.modified_time.as_deref(),
        )
        .map_err(|e| e.into_tauri_error())?;
        imported_count += 1;
    }

    Ok(imported_count)
}

/// Add a folder to sync list
#[tauri::command(rename_all = "camelCase")]
fn add_drive_folder(
    app: tauri::AppHandle,
    folder_id: String,
    folder_name: String,
) -> Result<(), String> {
    bookshelf::add_sync_folder(&app, &folder_id, &folder_name).map_err(|e| e.into_tauri_error())
}

/// Remove a folder from sync list
#[tauri::command(rename_all = "camelCase")]
fn remove_drive_folder(app: tauri::AppHandle, folder_id: String) -> Result<(), String> {
    bookshelf::remove_sync_folder(&app, &folder_id).map_err(|e| e.into_tauri_error())
}

/// Get all synced folders
#[tauri::command]
fn get_drive_folders(app: tauri::AppHandle) -> Result<Vec<bookshelf::StoredFolder>, String> {
    bookshelf::get_sync_folders(&app).map_err(|e| e.into_tauri_error())
}

/// Sync bookshelf with Google Drive
#[tauri::command]
async fn sync_bookshelf(app: tauri::AppHandle) -> Result<bookshelf::SyncResult, String> {
    let folders = bookshelf::get_sync_folders(&app).map_err(|e| e.into_tauri_error())?;

    let mut new_files = 0i32;
    let updated_files = 0i32;

    for folder in folders {
        let files = google_drive::list_pdf_files(&app, &folder.folder_id)
            .await
            .map_err(|e| e.into_tauri_error())?;

        for file in &files {
            let file_size: Option<i64> = file.size.as_ref().and_then(|s| s.parse().ok());
            bookshelf::upsert_item(
                &app,
                &file.id,
                &folder.folder_id,
                &file.name,
                file_size,
                &file.mime_type,
                file.modified_time.as_deref(),
            )
            .map_err(|e| e.into_tauri_error())?;
            new_files += 1;
        }

        bookshelf::update_folder_sync_time(&app, &folder.folder_id)
            .map_err(|e| e.into_tauri_error())?;
    }

    // Remove items from folders that are no longer synced (but keep downloaded files)
    let removed_files =
        bookshelf::remove_items_from_inactive_folders(&app).map_err(|e| e.into_tauri_error())?;

    Ok(bookshelf::SyncResult {
        new_files,
        updated_files,
        removed_files,
    })
}

/// Get all bookshelf items
#[tauri::command]
fn get_bookshelf_items(app: tauri::AppHandle) -> Result<Vec<bookshelf::BookshelfItem>, String> {
    // Verify local files exist before returning items
    // This resets status for items where files are missing
    let _ = bookshelf::verify_local_files(&app);

    bookshelf::get_items(&app).map_err(|e| e.into_tauri_error())
}

/// Download a bookshelf item
#[tauri::command(rename_all = "camelCase")]
async fn download_bookshelf_item(
    app: tauri::AppHandle,
    drive_file_id: String,
    file_name: String,
) -> Result<String, String> {
    // Register the download FIRST (before any async work)
    bookshelf::register_download(&drive_file_id);

    // Update status to downloading
    bookshelf::update_download_status(&app, &drive_file_id, "downloading", 0.0, None)
        .map_err(|e| e.into_tauri_error())?;

    // Get downloads directory
    let downloads_dir = bookshelf::get_downloads_dir(&app).map_err(|e| {
        bookshelf::unregister_download(&drive_file_id);
        e.into_tauri_error()
    })?;
    let dest_path = downloads_dir.join(&file_name);

    // Download file
    let result = google_drive::download_file(&app, &drive_file_id, &dest_path).await;

    // Unregister the download
    bookshelf::unregister_download(&drive_file_id);

    match result {
        Ok(()) => {
            let path_str = dest_path.to_string_lossy().to_string();
            bookshelf::update_download_status(
                &app,
                &drive_file_id,
                "completed",
                100.0,
                Some(&path_str),
            )
            .map_err(|e| e.into_tauri_error())?;

            // Extract and save PDF metadata (title and author)
            let _ = bookshelf::extract_and_save_pdf_metadata(&app, &path_str, &drive_file_id);

            Ok(path_str)
        }
        Err(e) => {
            // Check if it was cancelled
            let error_str = e.into_tauri_error();
            if error_str.contains("cancelled") {
                bookshelf::update_download_status(&app, &drive_file_id, "pending", 0.0, None)
                    .map_err(|e| e.into_tauri_error())?;
            } else {
                bookshelf::update_download_status(&app, &drive_file_id, "error", 0.0, None)
                    .map_err(|e| e.into_tauri_error())?;
            }
            Err(error_str)
        }
    }
}

/// Delete local copy of a bookshelf item
#[tauri::command(rename_all = "camelCase")]
fn delete_local_copy(app: tauri::AppHandle, drive_file_id: String) -> Result<(), String> {
    bookshelf::delete_local_copy(&app, &drive_file_id).map_err(|e| e.into_tauri_error())
}

/// Reset download status without deleting the file (for missing files)
#[tauri::command(rename_all = "camelCase")]
fn reset_download_status(app: tauri::AppHandle, drive_file_id: String) -> Result<(), String> {
    bookshelf::reset_download_status(&app, &drive_file_id).map_err(|e| e.into_tauri_error())
}

/// Update bookshelf item thumbnail (cloud items)
#[tauri::command(rename_all = "camelCase")]
fn update_bookshelf_thumbnail(
    app: tauri::AppHandle,
    drive_file_id: String,
    thumbnail_data: String,
) -> Result<(), String> {
    bookshelf::update_thumbnail(&app, &drive_file_id, &thumbnail_data)
        .map_err(|e| e.into_tauri_error())
}

/// Update bookshelf item thumbnail (local items)
#[tauri::command(rename_all = "camelCase")]
fn update_local_thumbnail(
    app: tauri::AppHandle,
    item_id: i64,
    thumbnail_data: String,
) -> Result<(), String> {
    bookshelf::update_local_thumbnail(&app, item_id, &thumbnail_data)
        .map_err(|e| e.into_tauri_error())
}

/// Cancel an in-progress download
#[tauri::command(rename_all = "camelCase")]
fn cancel_bookshelf_download(drive_file_id: String) -> Result<bool, String> {
    Ok(bookshelf::cancel_download(&drive_file_id))
}

/// Import local PDF files to bookshelf
#[tauri::command]
fn import_local_files(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<bookshelf::ImportResult, String> {
    let mut imported_count = 0;
    let mut skipped_count = 0;
    let mut error_count = 0;

    for path in paths {
        match bookshelf::import_local_file(&app, &path) {
            Ok(item) => {
                imported_count += 1;
                // Extract and save PDF metadata
                let _ = bookshelf::extract_and_save_local_metadata(&app, &item.file_path, item.id);
            }
            Err(e) => {
                let error_str = format!("{:?}", e);
                if error_str.contains("already imported") {
                    skipped_count += 1;
                } else {
                    eprintln!("[Pedaru] Failed to import {}: {:?}", path, e);
                    error_count += 1;
                }
            }
        }
    }

    Ok(bookshelf::ImportResult {
        imported_count,
        skipped_count,
        error_count,
    })
}

/// Import all PDFs from a local directory to bookshelf
#[tauri::command(rename_all = "camelCase")]
fn import_local_directory(
    app: tauri::AppHandle,
    dir_path: String,
) -> Result<bookshelf::ImportResult, String> {
    let result =
        bookshelf::import_local_directory(&app, &dir_path).map_err(|e| e.into_tauri_error())?;

    // Extract metadata for newly imported files
    if result.imported_count > 0 {
        // Get all local items and update their metadata
        if let Ok(items) = bookshelf::get_local_items(&app) {
            for item in items.iter().filter(|i| i.pdf_title.is_none()) {
                let _ = bookshelf::extract_and_save_local_metadata(&app, &item.file_path, item.id);
            }
        }
    }

    Ok(result)
}

/// Delete a local item from bookshelf (removes both database entry and copied file)
#[tauri::command(rename_all = "camelCase")]
fn delete_bookshelf_item(app: tauri::AppHandle, item_id: i64) -> Result<(), String> {
    bookshelf::delete_local_item(&app, item_id).map_err(|e| e.into_tauri_error())
}

/// Toggle favorite status for a bookshelf item
#[tauri::command(rename_all = "camelCase")]
fn toggle_bookshelf_favorite(
    app: tauri::AppHandle,
    item_id: i64,
    is_cloud: bool,
) -> Result<bool, String> {
    bookshelf::toggle_favorite(&app, item_id, is_cloud).map_err(|e| e.into_tauri_error())
}

/// Update last_opened timestamp when a PDF is opened from bookshelf
#[tauri::command(rename_all = "camelCase")]
fn update_bookshelf_last_opened(app: tauri::AppHandle, local_path: String) -> Result<(), String> {
    bookshelf::update_last_opened(&app, &local_path).map_err(|e| e.into_tauri_error())
}

// ============================================================================
// Gemini Translation Commands
// ============================================================================

/// Get Gemini settings
#[tauri::command]
fn get_gemini_settings(app: tauri::AppHandle) -> Result<settings::GeminiSettings, String> {
    settings::get_gemini_settings(&app).map_err(|e| e.into_tauri_error())
}

/// Save Gemini settings
#[tauri::command(rename_all = "camelCase")]
fn save_gemini_settings(
    app: tauri::AppHandle,
    settings_data: settings::GeminiSettings,
) -> Result<(), String> {
    settings::save_gemini_settings(&app, &settings_data).map_err(|e| e.into_tauri_error())
}

/// Translate text using Gemini API
#[tauri::command(rename_all = "camelCase")]
async fn translate_with_gemini(
    app: tauri::AppHandle,
    text: String,
    context_before: String,
    context_after: String,
    model_override: Option<String>,
) -> Result<gemini::TranslationResponse, String> {
    let gemini_settings = settings::get_gemini_settings(&app).map_err(|e| e.into_tauri_error())?;
    let model = model_override.as_deref().unwrap_or(&gemini_settings.model);

    gemini::translate_text(
        gemini_settings.api_key.expose(), // SecureString -> &str
        model,
        &text,
        &context_before,
        &context_after,
    )
    .await
    .map_err(|e| e.into_tauri_error())
}

/// Get explanation of text (returns summary + explanation points)
#[tauri::command(rename_all = "camelCase")]
async fn explain_directly(
    app: tauri::AppHandle,
    text: String,
    context_before: String,
    context_after: String,
    model_override: Option<String>,
) -> Result<gemini::ExplanationResponse, String> {
    let gemini_settings = settings::get_gemini_settings(&app).map_err(|e| e.into_tauri_error())?;
    let model = model_override
        .as_deref()
        .unwrap_or(&gemini_settings.explanation_model);

    gemini::explain_text(
        gemini_settings.api_key.expose(), // SecureString -> &str
        model,
        &text,
        &context_before,
        &context_after,
    )
    .await
    .map_err(|e| e.into_tauri_error())
}

// ============================================================================
// Session Commands
// ============================================================================

/// Save session state for a PDF file
#[tauri::command(rename_all = "camelCase")]
fn save_session(
    app: tauri::AppHandle,
    file_path: String,
    state: types::PdfSessionState,
) -> Result<(), String> {
    session::save_session(&app, &file_path, state).map_err(|e| e.into_tauri_error())
}

/// Load session state for a PDF file
#[tauri::command(rename_all = "camelCase")]
fn load_session(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<Option<types::PdfSessionState>, String> {
    session::load_session(&app, &file_path).map_err(|e| e.into_tauri_error())
}

/// Delete a session by file path
#[tauri::command(rename_all = "camelCase")]
fn delete_session(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    session::delete_session(&app, &file_path).map_err(|e| e.into_tauri_error())
}

/// Get recent files list
#[tauri::command(rename_all = "camelCase")]
fn get_recent_files(
    app: tauri::AppHandle,
    limit: Option<i32>,
) -> Result<Vec<types::RecentFileInfo>, String> {
    session::get_recent_files(&app, limit.unwrap_or(10)).map_err(|e| e.into_tauri_error())
}

// ============================================================================
// Event Handlers
// ============================================================================

/// Handle menu events from the application menu
fn handle_menu_event(app: &tauri::AppHandle, event_id: &str) {
    match event_id {
        // App menu
        "reset_all_data" => {
            app.emit("reset-all-data-requested", ()).ok();
        }
        "open_settings" => {
            app.emit("menu-open-settings", ()).ok();
        }
        // File menu
        "open_file" => {
            app.emit("menu-open-file-requested", ()).ok();
        }
        id if id.starts_with("open-recent-") => {
            if let Some(file_path) = decode_file_path_from_menu_id(id) {
                app.emit("menu-open-recent-selected", file_path).ok();
            }
        }
        // Go menu
        "go_first_page" => {
            app.emit("menu-go-first-page", ()).ok();
        }
        "go_last_page" => {
            app.emit("menu-go-last-page", ()).ok();
        }
        "go_prev_page" => {
            app.emit("menu-go-prev-page", ()).ok();
        }
        "go_next_page" => {
            app.emit("menu-go-next-page", ()).ok();
        }
        "go_back" => {
            app.emit("menu-go-back", ()).ok();
        }
        "go_forward" => {
            app.emit("menu-go-forward", ()).ok();
        }
        // View menu
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
        // Tabs menu
        "new_tab" => {
            app.emit("menu-new-tab", ()).ok();
        }
        "close_tab" => {
            app.emit("menu-close-tab", ()).ok();
        }
        "prev_tab" => {
            app.emit("menu-prev-tab", ()).ok();
        }
        "next_tab" => {
            app.emit("menu-next-tab", ()).ok();
        }
        // Window menu
        "new_window" => {
            app.emit("menu-new-window", ()).ok();
        }
        // Tools menu
        "search" => {
            app.emit("menu-search", ()).ok();
        }
        "toggle_bookmark" => {
            app.emit("menu-toggle-bookmark", ()).ok();
        }
        "translate" => {
            app.emit("menu-translate", ()).ok();
        }
        "translate_explain" => {
            app.emit("menu-translate-explain", ()).ok();
        }
        _ => {}
    }
}

/// Handle macOS file open events (when a PDF is opened while app is running)
#[cfg(target_os = "macos")]
fn handle_opened_event(app: &tauri::AppHandle, urls: &[tauri::Url]) {
    eprintln!("[Pedaru] Received Opened event with {} urls", urls.len());

    for url in urls {
        eprintln!("[Pedaru] URL: {:?}", url);
        if let Ok(path) = url.to_file_path() {
            let path_str: String = path.to_string_lossy().to_string();
            eprintln!("[Pedaru] File path: {}", path_str);
            if path_str.to_lowercase().ends_with(".pdf") {
                // Check if this is the initial startup (OPENED_VIA_EVENT is false)
                // If so, store in PENDING_FILE for main window to load
                // If app is already running, create a new window
                let was_already_opened = OPENED_VIA_EVENT.swap(true, Ordering::SeqCst);

                if !was_already_opened {
                    // First file open during startup - let main window handle it
                    eprintln!(
                        "[Pedaru] Initial startup, storing in PENDING_FILE: {}",
                        path_str
                    );
                    let pending = get_pending_file();
                    *pending
                        .lock()
                        .expect("PENDING_FILE mutex poisoned - previous thread panicked") =
                        Some(path_str);
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
                        .map(|n: &std::ffi::OsStr| n.to_string_lossy().to_string())
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

/// Handle window close events - close all child windows when main window is closed
fn handle_window_close(app: &tauri::AppHandle, label: &str) {
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

// ============================================================================
// Application Entry Point
// ============================================================================

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
            *pending
                .lock()
                .expect("PENDING_FILE mutex poisoned - previous thread panicked") =
                Some(file_path.clone());
        }
    }

    // Initialize SQLite database with migrations
    let migrations = db_schema::get_migrations();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:pedaru.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_pdf_info,
            read_pdf_file,
            get_opened_file,
            was_opened_via_event,
            refresh_recent_menu,
            // Google Drive / OAuth commands
            save_oauth_credentials,
            get_oauth_credentials,
            start_google_auth,
            get_google_auth_status,
            logout_google,
            list_drive_folders,
            list_drive_items,
            import_drive_files,
            add_drive_folder,
            remove_drive_folder,
            get_drive_folders,
            sync_bookshelf,
            get_bookshelf_items,
            download_bookshelf_item,
            delete_local_copy,
            reset_download_status,
            update_bookshelf_thumbnail,
            update_local_thumbnail,
            cancel_bookshelf_download,
            // Local import commands
            import_local_files,
            import_local_directory,
            delete_bookshelf_item,
            toggle_bookshelf_favorite,
            update_bookshelf_last_opened,
            // Gemini translation commands
            get_gemini_settings,
            save_gemini_settings,
            translate_with_gemini,
            explain_directly,
            // Session commands
            save_session,
            load_session,
            delete_session,
            get_recent_files
        ])
        .setup(|app| {
            // Build and set the initial menu
            let menu = build_app_menu(app.handle()).map_err(|e| e.into_tauri_error())?;
            app.set_menu(menu)?;

            // Reset any stale "downloading" statuses from previous sessions
            if let Err(e) = bookshelf::reset_stale_downloads(app.handle()) {
                eprintln!("[Pedaru] Failed to reset stale downloads: {}", e);
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().0.as_str());
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match &event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                handle_opened_event(app, urls);
            }
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { .. },
                ..
            } => {
                handle_window_close(app, label);
            }
            _ => {}
        });
}
