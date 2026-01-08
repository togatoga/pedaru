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
#[serde(rename_all = "camelCase")]
pub struct PdfInfo {
    /// PDF document title from metadata
    pub title: Option<String>,
    /// PDF document author from metadata
    pub author: Option<String>,
    /// Document creation date (ISO 8601 format)
    pub creation_date: Option<String>,
    /// Document modification date (ISO 8601 format)
    pub mod_date: Option<String>,
    /// File size in bytes
    pub file_size: Option<u64>,
    /// Total number of pages
    pub page_count: Option<u32>,
    /// Table of contents extracted from PDF outline
    pub toc: Vec<TocEntry>,
}

// ============================================
// Session-related types
// ============================================

/// Tab state for database storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabState {
    /// Page number of the tab
    pub page: u32,
    /// Display label for the tab
    pub label: String,
}

/// Window state for standalone windows
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    /// Page number displayed in the window
    pub page: u32,
    /// Zoom level
    pub zoom: f64,
    /// View mode ("single" or "two-column")
    pub view_mode: String,
}

/// Bookmark state for database storage
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkState {
    /// Page number of the bookmark
    pub page: u32,
    /// User-defined label for the bookmark
    pub label: String,
    /// Unix timestamp when bookmark was created
    pub created_at: i64,
}

/// History entry for page navigation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    /// Page number visited
    pub page: u32,
    /// Timestamp as string (for compatibility with frontend)
    pub timestamp: String,
}

/// Complete PDF session state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSessionState {
    /// PDF filename or title
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Unix timestamp of last access
    pub last_opened: i64,
    /// Current page number
    pub page: u32,
    /// Zoom level (1.0 = 100%)
    pub zoom: f64,
    /// View mode ("single" or "two-column")
    pub view_mode: String,
    /// Index of active tab, if any
    pub active_tab_index: Option<i32>,
    /// List of open tabs
    pub tabs: Vec<TabState>,
    /// List of standalone windows
    pub windows: Vec<WindowState>,
    /// List of bookmarks
    pub bookmarks: Vec<BookmarkState>,
    /// Page navigation history
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_history: Option<Vec<HistoryEntry>>,
    /// Current position in history for back/forward navigation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_index: Option<i32>,
}

/// Recent file info for get_recent_files command
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFileInfo {
    /// Absolute path to the PDF file
    pub file_path: String,
    /// Unix timestamp of last access
    pub last_opened: i64,
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
            creator: Some("Test Creator".to_string()),
            producer: Some("Test Producer".to_string()),
            creation_date: Some("2024-01-01".to_string()),
            mod_date: Some("2024-06-01".to_string()),
            keywords: Some("test, pdf".to_string()),
            file_size: Some(1024),
            page_count: Some(10),
            toc: vec![],
        };
        assert_eq!(info.title, Some("Test PDF".to_string()));
        assert_eq!(info.author, Some("Test Author".to_string()));
        assert_eq!(info.subject, Some("Test Subject".to_string()));
        assert_eq!(info.file_size, Some(1024));
        assert_eq!(info.page_count, Some(10));
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
