//! Type definitions for the Pedaru PDF viewer
//!
//! This module contains shared data structures used across the application.

use serde::{Deserialize, Serialize};

/// Represents a recently opened PDF file
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecentFile {
    /// Display name of the file (PDF title or filename)
    pub name: String,
    /// Absolute path to the PDF file
    pub file_path: String,
    /// Unix timestamp of when the file was last opened
    pub last_opened: i64,
}

/// Represents an entry in the PDF table of contents
#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct TocEntry {
    /// Title of the TOC entry
    pub title: String,
    /// Page number (1-indexed), None if the destination couldn't be resolved
    pub page: Option<u32>,
    /// Child entries (for nested TOC structures)
    pub children: Vec<TocEntry>,
}

/// Information extracted from a PDF document
#[derive(Debug, Serialize, Clone)]
pub struct PdfInfo {
    /// PDF document title from metadata
    pub title: Option<String>,
    /// PDF document author from metadata
    pub author: Option<String>,
    /// PDF document subject from metadata
    pub subject: Option<String>,
    /// Table of contents extracted from PDF outline
    pub toc: Vec<TocEntry>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recent_file_creation() {
        let file = RecentFile {
            name: "Test PDF".to_string(),
            file_path: "/path/to/test.pdf".to_string(),
            last_opened: 1234567890,
        };
        assert_eq!(file.name, "Test PDF");
        assert_eq!(file.file_path, "/path/to/test.pdf");
        assert_eq!(file.last_opened, 1234567890);
    }

    #[test]
    fn test_build_toc_entry() {
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

    #[test]
    fn test_toc_entry_equality() {
        let entry1 = TocEntry {
            title: "Chapter 1".to_string(),
            page: Some(1),
            children: vec![],
        };
        let entry2 = TocEntry {
            title: "Chapter 1".to_string(),
            page: Some(1),
            children: vec![],
        };
        assert_eq!(entry1, entry2);
    }

    #[test]
    fn test_recent_file_clone() {
        let file = RecentFile {
            name: "Test".to_string(),
            file_path: "/test.pdf".to_string(),
            last_opened: 123,
        };
        let cloned = file.clone();
        assert_eq!(file.name, cloned.name);
        assert_eq!(file.file_path, cloned.file_path);
        assert_eq!(file.last_opened, cloned.last_opened);
    }
}
