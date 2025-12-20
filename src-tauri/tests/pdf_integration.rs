//! Integration tests for PDF processing
//!
//! These tests use dynamically generated PDF files and fixture files to test
//! the full PDF processing pipeline.
//!
//! ## Test Fixtures
//!
//! PDF fixture files are located in `tests/fixtures/`:
//! - `encrypted_empty_password.pdf` - Simple encrypted PDF with empty user password
//! - `encrypted_japanese.pdf` - Encrypted PDF with Japanese metadata and TOC

use lopdf::{Document, Object, ObjectId, Stream, StringFormat};
use pedaru_lib::pdf::extract_toc;
use pedaru_lib::types::TocEntry;
use std::io::Write;
use std::path::PathBuf;
use tempfile::NamedTempFile;

/// Get the path to a test fixture file
fn fixture_path(filename: &str) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push(filename);
    path
}

/// Load an encrypted PDF fixture file
fn load_encrypted_pdf_fixture(filename: &str) -> Document {
    let path = fixture_path(filename);
    Document::load(&path).unwrap_or_else(|_| panic!("Failed to load fixture: {}", filename))
}

/// Create a simple PDF document with specified number of pages
fn create_simple_pdf(num_pages: u32) -> Document {
    let mut doc = Document::with_version("1.5");
    let mut pages_kids: Vec<Object> = Vec::new();
    let pages_id = doc.new_object_id();

    // Create page objects
    for i in 1..=num_pages {
        let content_id = doc.add_object(Stream::new(
            lopdf::Dictionary::new(),
            format!("BT /F1 12 Tf 100 700 Td (Page {}) Tj ET", i).into_bytes(),
        ));

        let mut page_dict = lopdf::Dictionary::new();
        page_dict.set("Type", Object::Name(b"Page".to_vec()));
        page_dict.set("Parent", Object::Reference(pages_id));
        page_dict.set(
            "MediaBox",
            Object::Array(vec![
                Object::Integer(0),
                Object::Integer(0),
                Object::Integer(612),
                Object::Integer(792),
            ]),
        );
        page_dict.set("Contents", Object::Reference(content_id));

        let page_id = doc.add_object(page_dict);
        pages_kids.push(Object::Reference(page_id));
    }

    // Create Pages dictionary
    let mut pages_dict = lopdf::Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set("Kids", Object::Array(pages_kids));
    pages_dict.set("Count", Object::Integer(num_pages as i64));
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    // Create Catalog
    let mut catalog = lopdf::Dictionary::new();
    catalog.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog.set("Pages", Object::Reference(pages_id));

    let catalog_id = doc.add_object(catalog);
    doc.trailer.set("Root", Object::Reference(catalog_id));

    doc
}

/// Create a PDF with TOC (outline) structure
fn create_pdf_with_toc() -> Document {
    let mut doc = create_simple_pdf(5);
    let pages = doc.get_pages();

    // Get catalog
    let catalog_id = match doc.trailer.get(b"Root") {
        Ok(Object::Reference(id)) => *id,
        _ => panic!("No catalog found"),
    };

    // Create outline items
    let page_ids: Vec<ObjectId> = pages.values().cloned().collect();

    // Create child outline item
    let child_outline_id = doc.new_object_id();
    let mut child_outline = lopdf::Dictionary::new();
    child_outline.set(
        "Title",
        Object::String(b"Section 1.1".to_vec(), StringFormat::Literal),
    );
    child_outline.set(
        "Dest",
        Object::Array(vec![
            Object::Reference(page_ids[1]), // Page 2
            Object::Name(b"Fit".to_vec()),
        ]),
    );

    // Create first outline item with child
    let first_outline_id = doc.new_object_id();
    let mut first_outline = lopdf::Dictionary::new();
    first_outline.set(
        "Title",
        Object::String(b"Chapter 1".to_vec(), StringFormat::Literal),
    );
    first_outline.set(
        "Dest",
        Object::Array(vec![
            Object::Reference(page_ids[0]), // Page 1
            Object::Name(b"Fit".to_vec()),
        ]),
    );
    first_outline.set("First", Object::Reference(child_outline_id));
    first_outline.set("Last", Object::Reference(child_outline_id));

    // Set parent for child
    child_outline.set("Parent", Object::Reference(first_outline_id));
    doc.objects
        .insert(child_outline_id, Object::Dictionary(child_outline));

    // Create second outline item
    let second_outline_id = doc.new_object_id();
    let mut second_outline = lopdf::Dictionary::new();
    second_outline.set(
        "Title",
        Object::String(b"Chapter 2".to_vec(), StringFormat::Literal),
    );
    second_outline.set(
        "Dest",
        Object::Array(vec![
            Object::Reference(page_ids[2]), // Page 3
            Object::Name(b"Fit".to_vec()),
        ]),
    );

    // Link outline items
    first_outline.set("Next", Object::Reference(second_outline_id));
    second_outline.set("Prev", Object::Reference(first_outline_id));

    // Create Outlines dictionary
    let outlines_id = doc.new_object_id();
    let mut outlines = lopdf::Dictionary::new();
    outlines.set("Type", Object::Name(b"Outlines".to_vec()));
    outlines.set("First", Object::Reference(first_outline_id));
    outlines.set("Last", Object::Reference(second_outline_id));
    outlines.set("Count", Object::Integer(3)); // 2 top-level + 1 child

    // Set parents for top-level items
    first_outline.set("Parent", Object::Reference(outlines_id));
    second_outline.set("Parent", Object::Reference(outlines_id));

    doc.objects
        .insert(first_outline_id, Object::Dictionary(first_outline));
    doc.objects
        .insert(second_outline_id, Object::Dictionary(second_outline));
    doc.objects
        .insert(outlines_id, Object::Dictionary(outlines));

    // Add Outlines to catalog
    if let Ok(Object::Dictionary(cat_dict)) = doc.get_object_mut(catalog_id) {
        cat_dict.set("Outlines", Object::Reference(outlines_id));
    }

    doc
}

/// Create a PDF with Japanese metadata
fn create_pdf_with_japanese_metadata() -> Document {
    let mut doc = create_simple_pdf(1);

    // Create Info dictionary with Japanese text (UTF-16BE)
    let mut info = lopdf::Dictionary::new();

    // UTF-16BE encoded "日本語タイトル" with BOM
    let title_bytes = create_utf16be_string("日本語タイトル");
    info.set("Title", Object::String(title_bytes, StringFormat::Literal));

    // UTF-16BE encoded "著者名" with BOM
    let author_bytes = create_utf16be_string("著者名");
    info.set(
        "Author",
        Object::String(author_bytes, StringFormat::Literal),
    );

    let info_id = doc.add_object(info);
    doc.trailer.set("Info", Object::Reference(info_id));

    doc
}

/// Create UTF-16BE encoded string with BOM
fn create_utf16be_string(s: &str) -> Vec<u8> {
    let mut bytes = vec![0xFE, 0xFF]; // BOM
    for c in s.chars() {
        let code = c as u32;
        if code <= 0xFFFF {
            bytes.push((code >> 8) as u8);
            bytes.push((code & 0xFF) as u8);
        }
    }
    bytes
}

/// Save document to a temporary file
fn save_to_temp_file(doc: &mut Document) -> NamedTempFile {
    let mut temp_file = NamedTempFile::with_suffix(".pdf").expect("Failed to create temp file");
    doc.save_to(temp_file.as_file_mut())
        .expect("Failed to save PDF");
    temp_file.as_file_mut().flush().expect("Failed to flush");
    temp_file
}

#[test]
fn test_extract_toc_empty_pdf() {
    let doc = create_simple_pdf(3);
    let toc = extract_toc(&doc);
    assert!(toc.is_empty(), "Simple PDF should have no TOC");
}

#[test]
fn test_extract_toc_with_chapters() {
    let doc = create_pdf_with_toc();
    let toc = extract_toc(&doc);

    // Should have 2 top-level entries
    assert_eq!(toc.len(), 2, "Should have 2 top-level TOC entries");

    // Check first chapter
    assert_eq!(toc[0].title, "Chapter 1");
    assert_eq!(toc[0].page, Some(1));

    // Check first chapter has a child
    assert_eq!(toc[0].children.len(), 1, "Chapter 1 should have 1 child");
    assert_eq!(toc[0].children[0].title, "Section 1.1");
    assert_eq!(toc[0].children[0].page, Some(2));

    // Check second chapter
    assert_eq!(toc[1].title, "Chapter 2");
    assert_eq!(toc[1].page, Some(3));
    assert!(
        toc[1].children.is_empty(),
        "Chapter 2 should have no children"
    );
}

#[test]
fn test_pdf_with_japanese_metadata() {
    use pedaru_lib::encoding::decode_pdf_string;

    let doc = create_pdf_with_japanese_metadata();

    // Get Info dictionary
    if let Ok(Object::Reference(info_ref)) = doc.trailer.get(b"Info") {
        if let Ok(info_dict) = doc.get_dictionary(*info_ref) {
            // Test title decoding
            let title = info_dict.get(b"Title").ok().and_then(decode_pdf_string);
            assert_eq!(title, Some("日本語タイトル".to_string()));

            // Test author decoding
            let author = info_dict.get(b"Author").ok().and_then(decode_pdf_string);
            assert_eq!(author, Some("著者名".to_string()));
        } else {
            panic!("Failed to get Info dictionary");
        }
    } else {
        panic!("No Info reference in trailer");
    }
}

#[test]
fn test_pdf_file_roundtrip() {
    // Test that we can save and reload a PDF
    let mut doc = create_pdf_with_toc();
    let temp_file = save_to_temp_file(&mut doc);

    // Reload the document
    let reloaded = Document::load(temp_file.path()).expect("Failed to reload PDF");
    let toc = extract_toc(&reloaded);

    assert_eq!(toc.len(), 2, "Reloaded PDF should have 2 TOC entries");
    assert_eq!(toc[0].title, "Chapter 1");
}

#[test]
fn test_toc_entry_serialization() {
    let entry = TocEntry {
        title: "Test Chapter".to_string(),
        page: Some(5),
        children: vec![TocEntry {
            title: "Test Section".to_string(),
            page: Some(6),
            children: vec![],
        }],
    };

    // Serialize to JSON
    let json = serde_json::to_string(&entry).expect("Failed to serialize");
    assert!(json.contains("Test Chapter"));
    assert!(json.contains("Test Section"));
    assert!(json.contains("5"));
    assert!(json.contains("6"));
}

#[test]
fn test_create_multiple_page_pdf() {
    let doc = create_simple_pdf(10);
    let pages = doc.get_pages();
    assert_eq!(pages.len(), 10, "Should have 10 pages");
}

// ============================================================================
// Encrypted PDF tests (using fixture files from tests/fixtures/)
// ============================================================================

#[test]
fn test_encrypted_pdf_with_empty_password_loads() {
    // Test that lopdf can load a PDF encrypted with empty user password
    let doc = load_encrypted_pdf_fixture("encrypted_empty_password.pdf");

    // The document should have pages
    let pages = doc.get_pages();
    assert_eq!(pages.len(), 1, "Encrypted PDF should have 1 page");
}

#[test]
fn test_encrypted_pdf_has_encrypt_dict() {
    // Test that the encrypted PDF has an Encrypt dictionary
    let doc = load_encrypted_pdf_fixture("encrypted_empty_password.pdf");

    // Check for Encrypt entry in trailer
    let has_encrypt = doc.trailer.get(b"Encrypt").is_ok();
    assert!(has_encrypt, "Encrypted PDF should have Encrypt dictionary");
}

#[test]
fn test_encrypted_pdf_toc_extraction() {
    // Test TOC extraction from encrypted PDF (should work with empty password)
    let doc = load_encrypted_pdf_fixture("encrypted_empty_password.pdf");

    // This simple encrypted PDF has no TOC, so it should return empty
    let toc = extract_toc(&doc);
    assert!(
        toc.is_empty(),
        "Simple encrypted PDF should have no TOC entries"
    );
}

#[test]
fn test_encrypted_pdf_is_recognized_as_encrypted() {
    // Verify the document is properly identified as encrypted
    let doc = load_encrypted_pdf_fixture("encrypted_empty_password.pdf");

    // Check if encryption_state is set (indicates successful decryption)
    // The document has an Encrypt dict, meaning it was encrypted
    let encrypt_ref = doc.trailer.get(b"Encrypt");
    assert!(
        encrypt_ref.is_ok(),
        "Document should have encryption dictionary"
    );
}

// ============================================================================
// Encrypted PDF with Japanese metadata and TOC tests
// Fixture: tests/fixtures/encrypted_japanese.pdf
// - Title: 暗号化テスト文書
// - Author: 山田太郎
// - TOC: 第1章 はじめに (page 1), セクション1.1 概要 (page 2), 第2章 本論 (page 3)
// ============================================================================

#[test]
fn test_encrypted_pdf_japanese_loads() {
    // Test that encrypted PDF with Japanese content can be loaded
    let doc = load_encrypted_pdf_fixture("encrypted_japanese.pdf");

    // The document should have 3 pages
    let pages = doc.get_pages();
    assert_eq!(
        pages.len(),
        3,
        "Encrypted PDF with Japanese content should have 3 pages"
    );

    // Should have Encrypt dictionary
    assert!(
        doc.trailer.get(b"Encrypt").is_ok(),
        "Should have Encrypt dictionary"
    );
}

#[test]
fn test_encrypted_pdf_japanese_title_not_garbled() {
    use pedaru_lib::encoding::decode_pdf_string;

    let doc = load_encrypted_pdf_fixture("encrypted_japanese.pdf");

    // Get Info dictionary
    if let Ok(Object::Reference(info_ref)) = doc.trailer.get(b"Info") {
        if let Ok(info_dict) = doc.get_dictionary(*info_ref) {
            // Test title decoding - should be "暗号化テスト文書"
            let title = info_dict.get(b"Title").ok().and_then(decode_pdf_string);
            assert!(title.is_some(), "Title should be decodable");

            let title_str = title.unwrap();
            // Verify it's not garbled (contains expected Japanese characters)
            assert!(
                title_str.contains("暗号化")
                    || title_str.contains("テスト")
                    || title_str.contains("文書"),
                "Title should contain Japanese text without garbling. Got: {}",
                title_str
            );
            // Exact match
            assert_eq!(
                title_str, "暗号化テスト文書",
                "Title should be exactly '暗号化テスト文書'"
            );
        } else {
            panic!("Failed to get Info dictionary");
        }
    } else {
        panic!("No Info reference in trailer");
    }
}

#[test]
fn test_encrypted_pdf_japanese_author_not_garbled() {
    use pedaru_lib::encoding::decode_pdf_string;

    let doc = load_encrypted_pdf_fixture("encrypted_japanese.pdf");

    // Get Info dictionary
    if let Ok(Object::Reference(info_ref)) = doc.trailer.get(b"Info") {
        if let Ok(info_dict) = doc.get_dictionary(*info_ref) {
            // Test author decoding - should be "山田太郎"
            let author = info_dict.get(b"Author").ok().and_then(decode_pdf_string);
            assert!(author.is_some(), "Author should be decodable");

            let author_str = author.unwrap();
            assert_eq!(
                author_str, "山田太郎",
                "Author should be exactly '山田太郎'. Got: {}",
                author_str
            );
        } else {
            panic!("Failed to get Info dictionary");
        }
    } else {
        panic!("No Info reference in trailer");
    }
}

#[test]
fn test_encrypted_pdf_japanese_toc_extraction() {
    // Test TOC extraction from encrypted PDF with Japanese TOC
    let doc = load_encrypted_pdf_fixture("encrypted_japanese.pdf");
    let toc = extract_toc(&doc);

    // Should have 2 top-level entries
    assert_eq!(
        toc.len(),
        2,
        "Should have 2 top-level TOC entries. Got: {:?}",
        toc
    );
}

#[test]
fn test_encrypted_pdf_japanese_toc_titles_not_garbled() {
    // Test that Japanese TOC titles are correctly decoded
    let doc = load_encrypted_pdf_fixture("encrypted_japanese.pdf");
    let toc = extract_toc(&doc);

    assert!(!toc.is_empty(), "TOC should not be empty");

    // First chapter: "第1章 はじめに"
    assert_eq!(
        toc[0].title, "第1章 はじめに",
        "First TOC entry should be '第1章 はじめに'. Got: {}",
        toc[0].title
    );
    assert_eq!(toc[0].page, Some(1), "First chapter should be on page 1");

    // First chapter has a child: "セクション1.1 概要"
    assert_eq!(
        toc[0].children.len(),
        1,
        "First chapter should have 1 child"
    );
    assert_eq!(
        toc[0].children[0].title, "セクション1.1 概要",
        "Child TOC entry should be 'セクション1.1 概要'. Got: {}",
        toc[0].children[0].title
    );
    assert_eq!(
        toc[0].children[0].page,
        Some(2),
        "Child section should be on page 2"
    );

    // Second chapter: "第2章 本論"
    assert_eq!(
        toc[1].title, "第2章 本論",
        "Second TOC entry should be '第2章 本論'. Got: {}",
        toc[1].title
    );
    assert_eq!(toc[1].page, Some(3), "Second chapter should be on page 3");
    assert!(
        toc[1].children.is_empty(),
        "Second chapter should have no children"
    );
}

#[test]
fn test_encrypted_pdf_japanese_toc_page_numbers() {
    // Test that page numbers are correctly extracted from encrypted PDF
    let doc = load_encrypted_pdf_fixture("encrypted_japanese.pdf");
    let toc = extract_toc(&doc);

    assert_eq!(toc.len(), 2, "Should have 2 top-level entries");

    // Verify page numbers
    assert_eq!(toc[0].page, Some(1), "Chapter 1 should be on page 1");
    assert_eq!(
        toc[0].children[0].page,
        Some(2),
        "Section 1.1 should be on page 2"
    );
    assert_eq!(toc[1].page, Some(3), "Chapter 2 should be on page 3");
}
