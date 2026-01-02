//! Application menu construction
//!
//! This module handles building the native application menu,
//! including the "Open Recent" submenu with dynamically loaded entries.

use crate::db::load_recent_files;
use crate::error::{MenuError, PedaruError};
use anyhow::Context;
use base64::{Engine as _, engine::general_purpose};
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};

/// Creates a shortcut string with the platform-specific modifier.
/// - macOS: Cmd
/// - Linux/Windows: Ctrl
fn shortcut(key: &str) -> String {
    format!("CmdOrCtrl+{}", key)
}

/// Internal implementation using anyhow for clean error chaining
fn build_app_menu_internal(app: &tauri::AppHandle) -> anyhow::Result<Menu<tauri::Wry>> {
    // Create app menu items
    let reset_item = MenuItem::with_id(
        app,
        "reset_all_data",
        "Initialize App...",
        true,
        None::<&str>,
    )?;

    let settings_item = MenuItem::with_id(app, "open_settings", "Settings...", true, None::<&str>)?;

    // File menu items
    let open_file_item =
        MenuItem::with_id(app, "open_file", "Open...", true, Some(&shortcut("O")))?;

    // Open Recent submenu - load from SQLite database
    let recent_files = load_recent_files(app, None);

    // Build menu items dynamically
    let mut recent_items: Vec<MenuItem<tauri::Wry>> = Vec::new();

    for file in recent_files.iter().take(10) {
        // Extract filename from path for fallback
        let filename = std::path::Path::new(&file.file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        // Format: "/path/to/file.pdf - Title" or "/path/to/file.pdf - filename.pdf"
        let display_name = if file.name.is_empty() {
            filename
        } else {
            file.name.clone()
        };
        let menu_text = format!("{} - {}", file.file_path, display_name);

        // Encode file path in base64 to use as menu item ID
        let encoded_path = encode_file_path(&file.file_path);

        let item = MenuItem::with_id(
            app,
            format!("open-recent-{}", encoded_path),
            &menu_text,
            true,
            None::<&str>,
        )?;
        recent_items.push(item);
    }

    // If no recent files, show "No Recent Files"
    if recent_items.is_empty() {
        let no_recent = MenuItem::with_id(
            app,
            "no-recent-files",
            "No Recent Files",
            false,
            None::<&str>,
        )?;
        recent_items.push(no_recent);
    }

    // Collect references as trait objects
    let recent_item_refs: Vec<&dyn IsMenuItem<_>> = recent_items
        .iter()
        .map(|item| item as &dyn IsMenuItem<_>)
        .collect();

    let open_recent_submenu = Submenu::with_items(app, "Open Recent", true, &recent_item_refs)?;

    let file_submenu =
        Submenu::with_items(app, "File", true, &[&open_file_item, &open_recent_submenu])?;

    let app_submenu = Submenu::with_items(
        app,
        "Pedaru",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Pedaru"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &reset_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    // View menu with Zoom and Two-Column options
    let zoom_in = MenuItem::with_id(app, "zoom_in", "Zoom In", true, Some(&shortcut("=")))?;
    let zoom_out = MenuItem::with_id(app, "zoom_out", "Zoom Out", true, Some(&shortcut("-")))?;
    let zoom_reset =
        MenuItem::with_id(app, "zoom_reset", "Reset Zoom", true, Some(&shortcut("0")))?;
    let toggle_two_column = MenuItem::with_id(
        app,
        "toggle_two_column",
        "Two-Column Mode",
        true,
        Some(&shortcut("\\")),
    )?;
    let toggle_header = MenuItem::with_id(
        app,
        "toggle_header",
        "Hide Header",
        true,
        Some(&shortcut("H")),
    )?;

    let view_submenu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &zoom_in,
            &zoom_out,
            &zoom_reset,
            &PredefinedMenuItem::separator(app)?,
            &toggle_two_column,
            &toggle_header,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let window_submenu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[
            &app_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
        ],
    )
    .context("Failed to create menu with items")?;

    Ok(menu)
}

/// Build the application menu with recent files
///
/// This creates the complete menu structure including:
/// - Pedaru menu (About, Settings, Initialize, Quit)
/// - File menu (Open, Open Recent)
/// - Edit menu (standard editing commands)
/// - View menu (zoom controls, view modes)
/// - Window menu (window management)
pub fn build_app_menu(app: &tauri::AppHandle) -> Result<Menu<tauri::Wry>, PedaruError> {
    build_app_menu_internal(app).map_err(|e| MenuError::BuildFailed(format!("{:#}", e)).into())
}

/// Encode a file path for use in menu item IDs
///
/// Uses base64 encoding to safely embed file paths in menu item IDs,
/// avoiding issues with special characters.
pub fn encode_file_path(path: &str) -> String {
    general_purpose::STANDARD.encode(path.as_bytes())
}

/// Decode a file path from a menu item ID
///
/// Extracts the file path from a base64-encoded menu item ID.
/// Returns None if the ID doesn't have the expected format or decoding fails.
pub fn decode_file_path_from_menu_id(menu_id: &str) -> Option<String> {
    menu_id
        .strip_prefix("open-recent-")
        .and_then(|encoded| general_purpose::STANDARD.decode(encoded).ok())
        .and_then(|bytes| String::from_utf8(bytes).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_file_path_simple() {
        let path = "/path/to/file.pdf";
        let encoded = encode_file_path(path);
        // Base64 encoding should produce a valid string
        assert!(!encoded.is_empty());
        assert!(!encoded.contains('/') || encoded.contains('/')); // Base64 can contain /
    }

    #[test]
    fn test_decode_file_path_from_menu_id() {
        let path = "/path/to/file.pdf";
        let encoded = encode_file_path(path);
        let menu_id = format!("open-recent-{}", encoded);

        let decoded = decode_file_path_from_menu_id(&menu_id);
        assert_eq!(decoded, Some(path.to_string()));
    }

    #[test]
    fn test_decode_file_path_invalid_prefix() {
        let decoded = decode_file_path_from_menu_id("invalid-prefix-abc");
        assert_eq!(decoded, None);
    }

    #[test]
    fn test_decode_file_path_invalid_base64() {
        let decoded = decode_file_path_from_menu_id("open-recent-not-valid-base64!!!");
        assert_eq!(decoded, None);
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let paths = [
            "/simple/path.pdf",
            "/path/with spaces/file.pdf",
            "/path/with'quote/file.pdf",
            "/日本語/パス/ファイル.pdf",
            "/path/with/unicode/émoji/📄.pdf",
        ];

        for path in &paths {
            let encoded = encode_file_path(path);
            let menu_id = format!("open-recent-{}", encoded);
            let decoded = decode_file_path_from_menu_id(&menu_id);
            assert_eq!(decoded, Some(path.to_string()), "Failed for path: {}", path);
        }
    }

    #[test]
    fn test_encode_empty_path() {
        let encoded = encode_file_path("");
        let menu_id = format!("open-recent-{}", encoded);
        let decoded = decode_file_path_from_menu_id(&menu_id);
        assert_eq!(decoded, Some("".to_string()));
    }

    #[test]
    fn test_encode_special_characters() {
        let path = r#"/path/with"quotes"and\backslashes"#;
        let encoded = encode_file_path(path);
        let menu_id = format!("open-recent-{}", encoded);
        let decoded = decode_file_path_from_menu_id(&menu_id);
        assert_eq!(decoded, Some(path.to_string()));
    }
}
