//! PDF processing utilities
//!
//! This module handles PDF document parsing, including:
//! - Table of Contents (TOC) extraction
//! - Named destination resolution
//! - Page number resolution from PDF destinations

use crate::encoding::{decode_name_string, decode_pdf_string};
use crate::types::TocEntry;
use lopdf::Document;
use std::collections::HashMap;

/// Build a map of named destinations to page numbers
///
/// PDF documents can have named destinations that reference specific pages.
/// This function parses both the new-style Names dictionary and the old-style
/// Dests dictionary to build a complete map.
pub fn build_named_destinations(doc: &Document) -> HashMap<String, u32> {
    let mut named_dests = HashMap::new();
    let pages = doc.get_pages();

    let catalog = match doc.catalog() {
        Ok(c) => c,
        Err(_) => return named_dests,
    };

    // Try to get Names dictionary -> Dests
    if let Ok(lopdf::Object::Reference(names_ref)) = catalog.get(b"Names")
        && let Ok(names_dict) = doc.get_dictionary(*names_ref)
        && let Ok(lopdf::Object::Reference(dests_ref)) = names_dict.get(b"Dests")
    {
        parse_name_tree(doc, *dests_ref, &pages, &mut named_dests);
    }

    // Also try Dests dictionary directly (older PDF format)
    if let Ok(lopdf::Object::Reference(dests_ref)) = catalog.get(b"Dests")
        && let Ok(dests_dict) = doc.get_dictionary(*dests_ref)
    {
        for (name, value) in dests_dict.iter() {
            let name_str = String::from_utf8_lossy(name).to_string();
            if let Some(page) = resolve_dest_to_page(doc, value, &pages) {
                named_dests.insert(name_str, page);
            }
        }
    }

    named_dests
}

/// Parse a PDF name tree recursively
///
/// Name trees are used in PDF for structured lookup of named objects.
/// This handles both leaf nodes (with Names array) and intermediate nodes
/// (with Kids array).
pub fn parse_name_tree(
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

            if let Some(name_str) = name
                && let Some(page) = resolve_dest_to_page(doc, dest, pages)
            {
                named_dests.insert(name_str, page);
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

/// Resolve a destination object to a page number
///
/// PDF destinations can be in several formats:
/// - Array with page reference as first element
/// - Reference to another object
/// - Dictionary with "D" key containing the actual destination
pub fn resolve_dest_to_page(
    doc: &Document,
    dest: &lopdf::Object,
    pages: &std::collections::BTreeMap<u32, lopdf::ObjectId>,
) -> Option<u32> {
    match dest {
        lopdf::Object::Array(arr) if !arr.is_empty() => {
            if let lopdf::Object::Reference(page_ref) = &arr[0] {
                pages
                    .iter()
                    .find(|&(_, &obj_id)| obj_id == *page_ref)
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

/// Get page number from a destination object, with named destination support
///
/// This is a higher-level function that handles both explicit destinations
/// (page references) and named destinations (string lookups).
pub fn get_page_number_from_dest(
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
                    .find(|&(_, &obj_id)| obj_id == *page_ref)
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

/// Parse a single outline item from the PDF document
///
/// Outline items contain the title, destination, and optional children.
/// This function recursively parses the outline tree structure.
pub fn parse_outline_item(
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

/// Extract the table of contents from a PDF document
///
/// This function parses the PDF outline structure and returns a vector
/// of top-level TOC entries, each potentially containing nested children.
pub fn extract_toc(doc: &Document) -> Vec<TocEntry> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn test_resolve_dest_to_page_with_empty_array() {
        // Empty array should return None
        let arr = lopdf::Object::Array(vec![]);
        let pages: BTreeMap<u32, lopdf::ObjectId> = BTreeMap::new();
        let doc = Document::new();
        let result = resolve_dest_to_page(&doc, &arr, &pages);
        assert_eq!(result, None);
    }

    #[test]
    fn test_resolve_dest_to_page_with_non_reference() {
        // Array with non-reference first element should return None
        let arr = lopdf::Object::Array(vec![lopdf::Object::Integer(1)]);
        let pages: BTreeMap<u32, lopdf::ObjectId> = BTreeMap::new();
        let doc = Document::new();
        let result = resolve_dest_to_page(&doc, &arr, &pages);
        assert_eq!(result, None);
    }

    #[test]
    fn test_resolve_dest_to_page_with_unknown_type() {
        // Other object types should return None
        let obj = lopdf::Object::Boolean(true);
        let pages: BTreeMap<u32, lopdf::ObjectId> = BTreeMap::new();
        let doc = Document::new();
        let result = resolve_dest_to_page(&doc, &obj, &pages);
        assert_eq!(result, None);
    }

    #[test]
    fn test_get_page_number_from_dest_empty_named_dests() {
        let named_dests: HashMap<String, u32> = HashMap::new();
        let doc = Document::new();

        // Named destination that doesn't exist
        let bytes = b"NonexistentDest".to_vec();
        let obj = lopdf::Object::Name(bytes);
        let result = get_page_number_from_dest(&doc, &obj, &named_dests);
        assert_eq!(result, None);
    }

    #[test]
    fn test_get_page_number_from_dest_with_named_dest() {
        let mut named_dests: HashMap<String, u32> = HashMap::new();
        named_dests.insert("Chapter1".to_string(), 5);
        let doc = Document::new();

        let bytes = b"Chapter1".to_vec();
        let obj = lopdf::Object::Name(bytes);
        let result = get_page_number_from_dest(&doc, &obj, &named_dests);
        assert_eq!(result, Some(5));
    }

    #[test]
    fn test_get_page_number_from_dest_utf16_name() {
        let mut named_dests: HashMap<String, u32> = HashMap::new();
        named_dests.insert("Test".to_string(), 10);
        let doc = Document::new();

        // UTF-16BE encoded "Test"
        let mut bytes = vec![0xFE, 0xFF]; // BOM
        bytes.extend_from_slice(&[0x00, 0x54]); // T
        bytes.extend_from_slice(&[0x00, 0x65]); // e
        bytes.extend_from_slice(&[0x00, 0x73]); // s
        bytes.extend_from_slice(&[0x00, 0x74]); // t

        let obj = lopdf::Object::String(bytes, lopdf::StringFormat::Literal);
        let result = get_page_number_from_dest(&doc, &obj, &named_dests);
        assert_eq!(result, Some(10));
    }

    #[test]
    fn test_build_named_destinations_empty_doc() {
        let doc = Document::new();
        let result = build_named_destinations(&doc);
        assert!(result.is_empty());
    }

    #[test]
    fn test_extract_toc_empty_doc() {
        let doc = Document::new();
        let result = extract_toc(&doc);
        assert!(result.is_empty());
    }
}
