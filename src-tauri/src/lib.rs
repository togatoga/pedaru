use encoding_rs::SHIFT_JIS;
use lopdf::Document;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_sql::Builder as SqlBuilder;

mod db_schema;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RecentFile {
    name: String,
    file_path: String,
    last_opened: i64,
}

#[derive(Debug, Serialize)]
pub struct TocEntry {
    pub title: String,
    pub page: Option<u32>,
    pub children: Vec<TocEntry>,
}

#[derive(Debug, Serialize)]
pub struct PdfInfo {
    pub title: Option<String>,
    pub author: Option<String>,
    pub subject: Option<String>,
    pub toc: Vec<TocEntry>,
}

fn decode_pdf_string(obj: &lopdf::Object) -> Option<String> {
    match obj {
        lopdf::Object::String(bytes, _) => {
            eprintln!(
                "[Pedaru] decode_pdf_string: bytes len={}, first bytes={:?}",
                bytes.len(),
                &bytes[..std::cmp::min(20, bytes.len())]
            );

            // Try UTF-16BE first (starts with BOM 0xFE 0xFF)
            if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                eprintln!("[Pedaru] Detected UTF-16BE");
                let utf16: Vec<u16> = bytes[2..]
                    .chunks(2)
                    .filter_map(|chunk| {
                        if chunk.len() == 2 {
                            Some(u16::from_be_bytes([chunk[0], chunk[1]]))
                        } else {
                            None
                        }
                    })
                    .collect();
                let result = String::from_utf16(&utf16).ok();
                eprintln!("[Pedaru] UTF-16BE result: {:?}", result);
                result
            } else if let Ok(s) = String::from_utf8(bytes.clone()) {
                // Try UTF-8
                eprintln!("[Pedaru] Detected UTF-8: {:?}", s);
                Some(s)
            } else {
                // Try multiple Japanese encodings and pick the best result
                let encodings: &[(&encoding_rs::Encoding, &str)] = &[
                    (SHIFT_JIS, "Shift-JIS"),
                    (encoding_rs::EUC_JP, "EUC-JP"),
                    (encoding_rs::ISO_2022_JP, "ISO-2022-JP"),
                ];

                let mut best_result: Option<String> = None;
                let mut best_score = 0i32;

                for (encoding, name) in encodings {
                    let (decoded, _, had_errors) = encoding.decode(bytes);
                    let decoded_str = decoded.into_owned();

                    // Score the result: penalize replacement characters and control characters
                    let replacement_count =
                        decoded_str.chars().filter(|&c| c == '\u{FFFD}').count();
                    let control_count = decoded_str
                        .chars()
                        .filter(|&c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
                        .count();
                    let valid_japanese = decoded_str
                        .chars()
                        .filter(|&c| {
                            // Count valid Japanese characters (hiragana, katakana, kanji)
                            ('\u{3040}'..='\u{309F}').contains(&c) ||  // Hiragana
                        ('\u{30A0}'..='\u{30FF}').contains(&c) ||  // Katakana
                        ('\u{4E00}'..='\u{9FFF}').contains(&c) ||  // CJK Unified Ideographs
                        ('\u{3400}'..='\u{4DBF}').contains(&c) // CJK Extension A
                        })
                        .count() as i32;

                    let score = valid_japanese * 10
                        - (replacement_count as i32 * 100)
                        - (control_count as i32 * 50);

                    eprintln!(
                        "[Pedaru] Trying {}: had_errors={}, replacement={}, control={}, japanese={}, score={}, result={:?}",
                        name, had_errors, replacement_count, control_count, valid_japanese, score, decoded_str
                    );

                    if !had_errors
                        && replacement_count == 0
                        && (best_result.is_none() || score > best_score)
                    {
                        best_result = Some(decoded_str);
                        best_score = score;
                    }
                }

                if let Some(result) = best_result {
                    eprintln!("[Pedaru] Best encoding result: {:?}", result);
                    Some(result)
                } else {
                    // Fall back to Latin-1/PDFDocEncoding
                    let result: String = bytes.iter().map(|&b| b as char).collect();
                    eprintln!("[Pedaru] Fallback to Latin-1: {:?}", result);
                    Some(result)
                }
            }
        }
        _ => None,
    }
}

fn decode_name_string(obj: &lopdf::Object) -> Option<String> {
    match obj {
        lopdf::Object::String(bytes, _) => {
            if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                let utf16: Vec<u16> = bytes[2..]
                    .chunks(2)
                    .filter_map(|chunk| {
                        if chunk.len() == 2 {
                            Some(u16::from_be_bytes([chunk[0], chunk[1]]))
                        } else {
                            None
                        }
                    })
                    .collect();
                String::from_utf16(&utf16).ok()
            } else if let Ok(s) = String::from_utf8(bytes.clone()) {
                Some(s)
            } else {
                // Try multiple Japanese encodings
                let encodings: &[(&encoding_rs::Encoding, &str)] = &[
                    (SHIFT_JIS, "Shift-JIS"),
                    (encoding_rs::EUC_JP, "EUC-JP"),
                    (encoding_rs::ISO_2022_JP, "ISO-2022-JP"),
                ];

                for (encoding, _name) in encodings {
                    let (decoded, _, had_errors) = encoding.decode(bytes);
                    let decoded_str = decoded.into_owned();
                    let replacement_count =
                        decoded_str.chars().filter(|&c| c == '\u{FFFD}').count();
                    if !had_errors && replacement_count == 0 {
                        return Some(decoded_str);
                    }
                }
                // Fallback to Latin-1
                Some(bytes.iter().map(|&b| b as char).collect())
            }
        }
        lopdf::Object::Name(bytes) => Some(String::from_utf8_lossy(bytes).to_string()),
        _ => None,
    }
}

fn build_named_destinations(doc: &Document) -> HashMap<String, u32> {
    let mut named_dests = HashMap::new();
    let pages = doc.get_pages();

    let catalog = match doc.catalog() {
        Ok(c) => c,
        Err(_) => return named_dests,
    };

    // Try to get Names dictionary -> Dests
    if let Ok(lopdf::Object::Reference(names_ref)) = catalog.get(b"Names") {
        if let Ok(names_dict) = doc.get_dictionary(*names_ref) {
            if let Ok(lopdf::Object::Reference(dests_ref)) = names_dict.get(b"Dests") {
                parse_name_tree(doc, *dests_ref, &pages, &mut named_dests);
            }
        }
    }

    // Also try Dests dictionary directly (older PDF format)
    if let Ok(lopdf::Object::Reference(dests_ref)) = catalog.get(b"Dests") {
        if let Ok(dests_dict) = doc.get_dictionary(*dests_ref) {
            for (name, value) in dests_dict.iter() {
                let name_str = String::from_utf8_lossy(name).to_string();
                if let Some(page) = resolve_dest_to_page(doc, value, &pages) {
                    named_dests.insert(name_str, page);
                }
            }
        }
    }

    named_dests
}

fn parse_name_tree(
    doc: &Document,
    node_ref: lopdf::ObjectId,
    pages: &std::collections::BTreeMap<u32, lopdf::ObjectId>,
    named_dests: &mut HashMap<String, u32>,
) {
    let node = match doc.get_dictionary(node_ref) {
        Ok(n) => n,
        Err(_) => return,
    };

    // Process Names array (leaf node)
    if let Ok(lopdf::Object::Array(names)) = node.get(b"Names") {
        let mut i = 0;
        while i + 1 < names.len() {
            let name = decode_name_string(&names[i]);
            let dest = &names[i + 1];

            if let Some(name_str) = name {
                if let Some(page) = resolve_dest_to_page(doc, dest, pages) {
                    named_dests.insert(name_str, page);
                }
            }
            i += 2;
        }
    }

    // Process Kids array (intermediate node)
    if let Ok(lopdf::Object::Array(kids)) = node.get(b"Kids") {
        for kid in kids {
            if let lopdf::Object::Reference(kid_ref) = kid {
                parse_name_tree(doc, *kid_ref, pages, named_dests);
            }
        }
    }
}

fn resolve_dest_to_page(
    doc: &Document,
    dest: &lopdf::Object,
    pages: &std::collections::BTreeMap<u32, lopdf::ObjectId>,
) -> Option<u32> {
    match dest {
        lopdf::Object::Array(arr) if !arr.is_empty() => {
            if let lopdf::Object::Reference(page_ref) = &arr[0] {
                pages
                    .iter()
                    .find(|(_, &obj_id)| obj_id == *page_ref)
                    .map(|(&page_num, _)| page_num)
            } else {
                None
            }
        }
        lopdf::Object::Reference(ref_id) => {
            if let Ok(resolved) = doc.get_object(*ref_id) {
                resolve_dest_to_page(doc, resolved, pages)
            } else {
                None
            }
        }
        lopdf::Object::Dictionary(dict) => {
            if let Ok(d) = dict.get(b"D") {
                resolve_dest_to_page(doc, d, pages)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn get_page_number_from_dest(
    doc: &Document,
    dest: &lopdf::Object,
    named_dests: &HashMap<String, u32>,
) -> Option<u32> {
    let pages = doc.get_pages();

    match dest {
        lopdf::Object::Array(arr) if !arr.is_empty() => {
            if let lopdf::Object::Reference(page_ref) = &arr[0] {
                pages
                    .iter()
                    .find(|(_, &obj_id)| obj_id == *page_ref)
                    .map(|(&page_num, _)| page_num)
            } else {
                None
            }
        }
        lopdf::Object::Reference(ref_id) => {
            if let Ok(resolved) = doc.get_object(*ref_id) {
                get_page_number_from_dest(doc, resolved, named_dests)
            } else {
                None
            }
        }
        lopdf::Object::String(bytes, _) | lopdf::Object::Name(bytes) => {
            // Named destination
            let name = if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
                let utf16: Vec<u16> = bytes[2..]
                    .chunks(2)
                    .filter_map(|chunk| {
                        if chunk.len() == 2 {
                            Some(u16::from_be_bytes([chunk[0], chunk[1]]))
                        } else {
                            None
                        }
                    })
                    .collect();
                String::from_utf16(&utf16).ok()
            } else {
                Some(String::from_utf8_lossy(bytes).to_string())
            };
            name.and_then(|n| named_dests.get(&n).copied())
        }
        _ => None,
    }
}

fn parse_outline_item(
    doc: &Document,
    obj_id: lopdf::ObjectId,
    named_dests: &HashMap<String, u32>,
) -> Option<TocEntry> {
    let dict = doc.get_dictionary(obj_id).ok()?;

    let title = dict.get(b"Title").ok().and_then(decode_pdf_string)?;

    let page = dict
        .get(b"Dest")
        .ok()
        .and_then(|dest| get_page_number_from_dest(doc, dest, named_dests))
        .or_else(|| {
            dict.get(b"A").ok().and_then(|action| {
                if let lopdf::Object::Reference(action_ref) = action {
                    doc.get_dictionary(*action_ref)
                        .ok()
                        .and_then(|action_dict| {
                            action_dict
                                .get(b"D")
                                .ok()
                                .and_then(|d| get_page_number_from_dest(doc, d, named_dests))
                        })
                } else if let lopdf::Object::Dictionary(action_dict) = action {
                    action_dict
                        .get(b"D")
                        .ok()
                        .and_then(|d| get_page_number_from_dest(doc, d, named_dests))
                } else {
                    None
                }
            })
        });

    let mut children = Vec::new();
    if let Ok(lopdf::Object::Reference(first_ref)) = dict.get(b"First") {
        let mut current = Some(*first_ref);
        while let Some(child_id) = current {
            if let Some(child_entry) = parse_outline_item(doc, child_id, named_dests) {
                children.push(child_entry);
            }
            current = doc
                .get_dictionary(child_id)
                .ok()
                .and_then(|d| d.get(b"Next").ok())
                .and_then(|next| {
                    if let lopdf::Object::Reference(next_ref) = next {
                        Some(*next_ref)
                    } else {
                        None
                    }
                });
        }
    }

    Some(TocEntry {
        title,
        page,
        children,
    })
}

fn extract_toc(doc: &Document) -> Vec<TocEntry> {
    eprintln!("[Pedaru] extract_toc called");
    let mut toc = Vec::new();

    let named_dests = build_named_destinations(doc);
    eprintln!("[Pedaru] Named destinations count: {}", named_dests.len());

    let catalog = match doc.catalog() {
        Ok(c) => {
            eprintln!("[Pedaru] Got catalog successfully");
            c
        }
        Err(e) => {
            eprintln!("[Pedaru] Failed to get catalog: {:?}", e);
            return toc;
        }
    };

    let outlines_ref = match catalog.get(b"Outlines") {
        Ok(lopdf::Object::Reference(r)) => {
            eprintln!("[Pedaru] Got Outlines reference: {:?}", r);
            *r
        }
        Ok(other) => {
            eprintln!("[Pedaru] Outlines is not a reference: {:?}", other);
            return toc;
        }
        Err(e) => {
            eprintln!("[Pedaru] No Outlines in catalog: {:?}", e);
            return toc;
        }
    };

    let outlines = match doc.get_dictionary(outlines_ref) {
        Ok(o) => {
            eprintln!("[Pedaru] Got Outlines dictionary");
            o
        }
        Err(e) => {
            eprintln!("[Pedaru] Failed to get Outlines dictionary: {:?}", e);
            return toc;
        }
    };

    let first_ref = match outlines.get(b"First") {
        Ok(lopdf::Object::Reference(r)) => {
            eprintln!("[Pedaru] Got First reference: {:?}", r);
            *r
        }
        Ok(other) => {
            eprintln!("[Pedaru] First is not a reference: {:?}", other);
            return toc;
        }
        Err(e) => {
            eprintln!("[Pedaru] No First in Outlines: {:?}", e);
            return toc;
        }
    };

    let mut current = Some(first_ref);
    while let Some(item_id) = current {
        if let Some(entry) = parse_outline_item(doc, item_id, &named_dests) {
            toc.push(entry);
        }
        current = doc
            .get_dictionary(item_id)
            .ok()
            .and_then(|d| d.get(b"Next").ok())
            .and_then(|next| {
                if let lopdf::Object::Reference(next_ref) = next {
                    Some(*next_ref)
                } else {
                    None
                }
            });
    }

    eprintln!(
        "[Pedaru] extract_toc finished, found {} top-level entries",
        toc.len()
    );
    toc
}

#[tauri::command]
fn get_pdf_info(path: String) -> Result<PdfInfo, String> {
    eprintln!("[Pedaru] get_pdf_info called for: {}", path);

    // Load document from file
    let doc = Document::load(&path).map_err(|e| format!("Failed to load PDF: {}", e))?;
    eprintln!("[Pedaru] PDF loaded successfully");

    let mut title = None;
    let mut author = None;
    let mut subject = None;

    if let Ok(lopdf::Object::Reference(ref_id)) = doc.trailer.get(b"Info") {
        if let Ok(info_dict) = doc.get_dictionary(*ref_id) {
            title = info_dict.get(b"Title").ok().and_then(decode_pdf_string);
            author = info_dict.get(b"Author").ok().and_then(decode_pdf_string);
            subject = info_dict.get(b"Subject").ok().and_then(decode_pdf_string);
        }
    }

    let toc = extract_toc(&doc);

    Ok(PdfInfo {
        title,
        author,
        subject,
        toc,
    })
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Read PDF file and return the bytes.
/// Returns the original file bytes - decryption is handled by pdf.js on the frontend.
#[tauri::command]
fn read_pdf_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read PDF file: {}", e))
}

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

// Store pending file path to open (set before frontend is ready)
static PENDING_FILE: std::sync::OnceLock<Arc<Mutex<Option<String>>>> = std::sync::OnceLock::new();

// Track if a file was opened via the Opened event (macOS file association)
static OPENED_VIA_EVENT: AtomicBool = AtomicBool::new(false);

fn get_pending_file() -> &'static Arc<Mutex<Option<String>>> {
    PENDING_FILE.get_or_init(|| Arc::new(Mutex::new(None)))
}

#[tauri::command]
fn get_opened_file() -> Option<String> {
    let pending = get_pending_file();
    let mut guard = pending.lock().unwrap();
    guard.take()
}

#[tauri::command]
fn was_opened_via_event() -> bool {
    OPENED_VIA_EVENT.load(Ordering::SeqCst)
}

fn get_recent_files_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Create directory if it doesn't exist
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }

    Ok(app_data_dir.join("recent_files.json"))
}

fn load_recent_files(app: &tauri::AppHandle) -> Vec<RecentFile> {
    match get_recent_files_path(app) {
        Ok(path) => {
            if path.exists() {
                match fs::read_to_string(&path) {
                    Ok(content) => match serde_json::from_str::<Vec<RecentFile>>(&content) {
                        Ok(files) => files,
                        Err(e) => {
                            eprintln!("[Pedaru] Failed to parse recent_files.json: {}", e);
                            Vec::new()
                        }
                    },
                    Err(e) => {
                        eprintln!("[Pedaru] Failed to read recent_files.json: {}", e);
                        Vec::new()
                    }
                }
            } else {
                Vec::new()
            }
        }
        Err(e) => {
            eprintln!("[Pedaru] Failed to get recent files path: {}", e);
            Vec::new()
        }
    }
}

fn save_recent_files(app: &tauri::AppHandle, files: &[RecentFile]) -> Result<(), String> {
    let path = get_recent_files_path(app)?;
    let content = serde_json::to_string_pretty(files)
        .map_err(|e| format!("Failed to serialize recent files: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write recent_files.json: {}", e))?;
    Ok(())
}

#[tauri::command]
fn update_recent_file(
    app: tauri::AppHandle,
    file_path: String,
    name: String,
) -> Result<(), String> {
    eprintln!(
        "[Pedaru] update_recent_file called: {} - {}",
        name, file_path
    );

    let mut recent_files = load_recent_files(&app);

    // Remove existing entry for this file if present
    recent_files.retain(|f| f.file_path != file_path);

    // Add to front
    recent_files.insert(
        0,
        RecentFile {
            name: name.clone(),
            file_path: file_path.clone(),
            last_opened: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
        },
    );

    // Keep only 10 most recent
    recent_files.truncate(10);

    // Save to file
    save_recent_files(&app, &recent_files)?;

    eprintln!(
        "[Pedaru] Updated recent files, now have {} entries",
        recent_files.len()
    );
    Ok(())
}

#[tauri::command]
fn get_recent_files_list(app: tauri::AppHandle) -> Result<Vec<RecentFile>, String> {
    Ok(load_recent_files(&app))
}

// Note: Database operations are handled directly from the frontend using tauri-plugin-sql
// The plugin provides SQL query functionality via JavaScript/TypeScript

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
            update_recent_file,
            get_recent_files_list
        ])
        .setup(|app| {
            // Create app menu
            let reset_item = MenuItem::with_id(
                app,
                "reset_all_data",
                "Initialize App...",
                true,
                None::<&str>,
            )?;

            let export_item = MenuItem::with_id(
                app,
                "export_session_data",
                "Export Session Data...",
                true,
                None::<&str>,
            )?;

            let import_item = MenuItem::with_id(
                app,
                "import_session_data",
                "Import Session Data...",
                true,
                None::<&str>,
            )?;

            // File menu items
            let open_file_item =
                MenuItem::with_id(app, "open_file", "Open...", true, Some("CmdOrCtrl+O"))?;

            // Open Recent submenu - load from recent_files.json
            let recent_files = load_recent_files(app.handle());

            // Build menu items dynamically
            let mut recent_items = Vec::new();

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
                use base64::{Engine as _, engine::general_purpose};
                let encoded_path = general_purpose::STANDARD.encode(file.file_path.as_bytes());

                let item = MenuItem::with_id(
                    app,
                    &format!("open-recent-{}", encoded_path),
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

            let open_recent_submenu =
                Submenu::with_items(app, "Open Recent", true, &recent_item_refs)?;

            let file_submenu =
                Submenu::with_items(app, "File", true, &[&open_file_item, &open_recent_submenu])?;

            let app_submenu = Submenu::with_items(
                app,
                "Pedaru",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Pedaru"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &reset_item,
                    &import_item,
                    &export_item,
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
            let zoom_in = MenuItem::with_id(app, "zoom_in", "Zoom In", true, Some("CmdOrCtrl+="))?;
            let zoom_out =
                MenuItem::with_id(app, "zoom_out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
            let zoom_reset =
                MenuItem::with_id(app, "zoom_reset", "Reset Zoom", true, Some("CmdOrCtrl+0"))?;
            let toggle_two_column = MenuItem::with_id(
                app,
                "toggle_two_column",
                "Two-Column Mode",
                true,
                Some("CmdOrCtrl+Shift+2"),
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
            )?;
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
                    // Extract base64-encoded path from "open-recent-{base64}"
                    if let Some(encoded_path) = id.strip_prefix("open-recent-") {
                        use base64::{Engine as _, engine::general_purpose};
                        if let Ok(decoded_bytes) = general_purpose::STANDARD.decode(encoded_path) {
                            if let Ok(file_path) = String::from_utf8(decoded_bytes) {
                                app.emit("menu-open-recent-selected", file_path).ok();
                            }
                        }
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
    fn test_decode_utf8_string() {
        // Test UTF-8 encoded string
        let utf8_bytes = "Hello World".as_bytes().to_vec();
        let obj = lopdf::Object::String(utf8_bytes, lopdf::StringFormat::Literal);
        let result = decode_pdf_string(&obj);
        assert_eq!(result, Some("Hello World".to_string()));
    }

    #[test]
    fn test_decode_utf16be_string() {
        // Test UTF-16BE with BOM (0xFE 0xFF)
        // "Hello" in UTF-16BE: FE FF 00 48 00 65 00 6C 00 6C 00 6F
        let mut utf16_bytes = vec![0xFE, 0xFF];
        utf16_bytes.extend_from_slice(&[0x00, 0x48]); // H
        utf16_bytes.extend_from_slice(&[0x00, 0x65]); // e
        utf16_bytes.extend_from_slice(&[0x00, 0x6C]); // l
        utf16_bytes.extend_from_slice(&[0x00, 0x6C]); // l
        utf16_bytes.extend_from_slice(&[0x00, 0x6F]); // o

        let obj = lopdf::Object::String(utf16_bytes, lopdf::StringFormat::Literal);
        let result = decode_pdf_string(&obj);
        assert_eq!(result, Some("Hello".to_string()));
    }

    #[test]
    fn test_decode_japanese_utf16be() {
        // Test Japanese text "こんにちは" in UTF-16BE
        // こ: U+3053 (0x30, 0x53)
        // ん: U+3093 (0x30, 0x93)
        // に: U+306B (0x30, 0x6B)
        // ち: U+3061 (0x30, 0x61)
        // は: U+306F (0x30, 0x6F)
        let mut utf16_bytes = vec![0xFE, 0xFF]; // BOM
        utf16_bytes.extend_from_slice(&[0x30, 0x53]); // こ
        utf16_bytes.extend_from_slice(&[0x30, 0x93]); // ん
        utf16_bytes.extend_from_slice(&[0x30, 0x6B]); // に
        utf16_bytes.extend_from_slice(&[0x30, 0x61]); // ち
        utf16_bytes.extend_from_slice(&[0x30, 0x6F]); // は

        let obj = lopdf::Object::String(utf16_bytes, lopdf::StringFormat::Literal);
        let result = decode_pdf_string(&obj);
        assert_eq!(result, Some("こんにちは".to_string()));
    }

    #[test]
    fn test_decode_shift_jis_string() {
        // Test Shift-JIS encoded string "日本語"
        // 日: 0x93, 0xFA
        // 本: 0x96, 0x7B
        // 語: 0x8C, 0xEA
        let shift_jis_bytes = vec![0x93, 0xFA, 0x96, 0x7B, 0x8C, 0xEA];
        let obj = lopdf::Object::String(shift_jis_bytes, lopdf::StringFormat::Literal);
        let result = decode_pdf_string(&obj);
        assert_eq!(result, Some("日本語".to_string()));
    }

    #[test]
    fn test_decode_name_string_utf8() {
        // Test name string with UTF-8
        let utf8_bytes = "TestName".as_bytes().to_vec();
        let obj = lopdf::Object::String(utf8_bytes, lopdf::StringFormat::Literal);
        let result = decode_name_string(&obj);
        assert_eq!(result, Some("TestName".to_string()));
    }

    #[test]
    fn test_decode_name_string_from_name_object() {
        // Test decoding from lopdf::Object::Name
        let name_bytes = b"SomeName".to_vec();
        let obj = lopdf::Object::Name(name_bytes);
        let result = decode_name_string(&obj);
        assert_eq!(result, Some("SomeName".to_string()));
    }

    #[test]
    fn test_decode_empty_string() {
        // Test empty string
        let empty_bytes = vec![];
        let obj = lopdf::Object::String(empty_bytes, lopdf::StringFormat::Literal);
        let result = decode_pdf_string(&obj);
        // Empty string should return Some("")
        assert!(result.is_some());
    }

    #[test]
    fn test_decode_latin1_fallback() {
        // Test Latin-1/PDFDocEncoding fallback
        // Characters that are not valid UTF-8 but valid Latin-1
        let latin1_bytes = vec![0xE9, 0xE8, 0xE0]; // é è à in Latin-1
        let obj = lopdf::Object::String(latin1_bytes, lopdf::StringFormat::Literal);
        let result = decode_pdf_string(&obj);
        assert!(result.is_some());
        // Latin-1 characters should be decoded
        let decoded = result.unwrap();
        assert!(!decoded.is_empty());
    }

    #[test]
    fn test_decode_non_string_object() {
        // Test that non-string objects return None
        let obj = lopdf::Object::Integer(42);
        let result = decode_pdf_string(&obj);
        assert_eq!(result, None);
    }

    #[test]
    fn test_build_toc_entry() {
        // Test TocEntry structure
        let entry = TocEntry {
            title: "Chapter 1".to_string(),
            page: Some(1),
            children: vec![],
        };
        assert_eq!(entry.title, "Chapter 1");
        assert_eq!(entry.page, Some(1));
        assert!(entry.children.is_empty());
    }

    #[test]
    fn test_toc_entry_with_children() {
        // Test nested TocEntry
        let child = TocEntry {
            title: "Section 1.1".to_string(),
            page: Some(2),
            children: vec![],
        };
        let parent = TocEntry {
            title: "Chapter 1".to_string(),
            page: Some(1),
            children: vec![child],
        };
        assert_eq!(parent.children.len(), 1);
        assert_eq!(parent.children[0].title, "Section 1.1");
    }

    #[test]
    fn test_pdf_info_structure() {
        // Test PdfInfo structure
        let info = PdfInfo {
            title: Some("Test PDF".to_string()),
            author: Some("Test Author".to_string()),
            subject: Some("Test Subject".to_string()),
            toc: vec![],
        };
        assert_eq!(info.title, Some("Test PDF".to_string()));
        assert_eq!(info.author, Some("Test Author".to_string()));
        assert_eq!(info.subject, Some("Test Subject".to_string()));
        assert!(info.toc.is_empty());
    }
}
