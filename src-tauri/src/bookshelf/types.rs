//! Shared bookshelf types, including the merged item shape consumed by the
//! frontend

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Convert Unix timestamp to ISO 8601 format string
fn timestamp_to_iso(timestamp: i64) -> String {
    DateTime::<Utc>::from_timestamp(timestamp, 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

// ============================================================================
// Types - Cloud Items (Google Drive)
// ============================================================================

/// Download status for cloud items
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    #[default]
    Pending,
    Downloading,
    Completed,
    Error,
}

impl std::fmt::Display for DownloadStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DownloadStatus::Pending => write!(f, "pending"),
            DownloadStatus::Downloading => write!(f, "downloading"),
            DownloadStatus::Completed => write!(f, "completed"),
            DownloadStatus::Error => write!(f, "error"),
        }
    }
}

impl std::str::FromStr for DownloadStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(DownloadStatus::Pending),
            "downloading" => Ok(DownloadStatus::Downloading),
            "completed" => Ok(DownloadStatus::Completed),
            "error" => Ok(DownloadStatus::Error),
            _ => Err(format!("Unknown download status: {}", s)),
        }
    }
}

/// Cloud bookshelf item (from Google Drive)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudItem {
    pub id: i64,
    pub drive_file_id: String,
    pub drive_folder_id: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub modified_time: Option<String>,
    pub thumbnail_data: Option<String>,
    pub local_path: Option<String>,
    pub download_status: DownloadStatus,
    pub download_progress: f64,
    pub pdf_title: Option<String>,
    pub pdf_author: Option<String>,
    pub is_favorite: bool,
    pub last_opened: Option<i64>,
    pub created_at: i64,
}

// ============================================================================
// Types - Local Items
// ============================================================================

/// Local bookshelf item (imported from filesystem)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalItem {
    pub id: i64,
    pub file_path: String,
    pub original_path: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub thumbnail_data: Option<String>,
    pub pdf_title: Option<String>,
    pub pdf_author: Option<String>,
    pub is_favorite: bool,
    pub last_opened: Option<i64>,
    pub imported_at: i64,
    pub updated_at: i64,
}

// ============================================================================
// Types - Common
// ============================================================================

/// Stored folder configuration (for Google Drive)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredFolder {
    pub folder_id: String,
    pub folder_name: String,
    pub is_active: bool,
    pub last_synced: Option<i64>,
}

/// Download progress event (for cloud items)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub drive_file_id: String,
    pub progress: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

/// Sync result (for cloud items)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub new_files: i32,
    pub updated_files: i32,
    pub removed_files: i32,
}

/// Result of importing local files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported_count: i32,
    pub skipped_count: i32,
    pub error_count: i32,
}

// ============================================================================
// Merged Bookshelf View
// ============================================================================

/// Unified bookshelf item merging cloud and local sources
///
/// This is the shape the frontend consumes via the `get_bookshelf_items`
/// command; its serde representation must stay stable.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookshelfItem {
    pub id: i64,
    pub drive_file_id: Option<String>,
    pub drive_folder_id: Option<String>,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub modified_time: Option<String>,
    pub thumbnail_data: Option<String>,
    pub local_path: Option<String>,
    pub download_status: String,
    pub download_progress: f64,
    pub pdf_title: Option<String>,
    pub pdf_author: Option<String>,
    pub source_type: String,
    pub original_path: Option<String>,
    pub created_at: i64,
    pub is_favorite: bool,
    pub last_opened: Option<i64>,
}

impl From<CloudItem> for BookshelfItem {
    fn from(item: CloudItem) -> Self {
        BookshelfItem {
            id: item.id,
            drive_file_id: Some(item.drive_file_id),
            drive_folder_id: Some(item.drive_folder_id),
            file_name: item.file_name,
            file_size: item.file_size,
            modified_time: item.modified_time,
            thumbnail_data: item.thumbnail_data,
            local_path: item.local_path,
            download_status: item.download_status.to_string(),
            download_progress: item.download_progress,
            pdf_title: item.pdf_title,
            pdf_author: item.pdf_author,
            source_type: "google_drive".to_string(),
            original_path: None,
            created_at: item.created_at,
            is_favorite: item.is_favorite,
            last_opened: item.last_opened,
        }
    }
}

impl From<LocalItem> for BookshelfItem {
    fn from(item: LocalItem) -> Self {
        BookshelfItem {
            id: item.id,
            drive_file_id: None,
            drive_folder_id: None,
            file_name: item.file_name,
            file_size: item.file_size,
            modified_time: Some(timestamp_to_iso(item.updated_at)),
            thumbnail_data: item.thumbnail_data,
            local_path: Some(item.file_path),
            download_status: "completed".to_string(),
            download_progress: 100.0,
            pdf_title: item.pdf_title,
            pdf_author: item.pdf_author,
            source_type: "local".to_string(),
            original_path: Some(item.original_path),
            created_at: item.imported_at,
            is_favorite: item.is_favorite,
            last_opened: item.last_opened,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cloud_item_to_bookshelf_item_preserves_created_at() {
        let cloud_item = CloudItem {
            id: 1,
            drive_file_id: "abc123".to_string(),
            drive_folder_id: "folder456".to_string(),
            file_name: "test.pdf".to_string(),
            file_size: Some(1024),
            modified_time: Some("2024-01-01T00:00:00Z".to_string()),
            thumbnail_data: None,
            local_path: Some("/path/to/test.pdf".to_string()),
            download_status: DownloadStatus::Completed,
            download_progress: 100.0,
            pdf_title: Some("Test PDF".to_string()),
            pdf_author: Some("Author".to_string()),
            is_favorite: false,
            last_opened: Some(1704067200),
            created_at: 1704067200, // 2024-01-01 00:00:00 UTC
        };

        let bookshelf_item: BookshelfItem = cloud_item.into();

        // Verify created_at is preserved, not set to 0 (which would show as 1970)
        assert_eq!(bookshelf_item.created_at, 1704067200);
        assert_ne!(bookshelf_item.created_at, 0);
        assert_eq!(bookshelf_item.source_type, "google_drive");
    }

    #[test]
    fn test_local_item_to_bookshelf_item_preserves_imported_at() {
        let local_item = LocalItem {
            id: 1,
            file_path: "/path/to/test.pdf".to_string(),
            original_path: "/original/path/test.pdf".to_string(),
            file_name: "test.pdf".to_string(),
            file_size: Some(2048),
            thumbnail_data: None,
            pdf_title: Some("Local PDF".to_string()),
            pdf_author: Some("Local Author".to_string()),
            is_favorite: true,
            last_opened: Some(1704153600),
            imported_at: 1704153600, // 2024-01-02 00:00:00 UTC
            updated_at: 1704153600,
        };

        let bookshelf_item: BookshelfItem = local_item.into();

        // Verify created_at uses imported_at value, not 0 (which would show as 1970)
        assert_eq!(bookshelf_item.created_at, 1704153600);
        assert_ne!(bookshelf_item.created_at, 0);
        assert_eq!(bookshelf_item.source_type, "local");
    }

    #[test]
    fn test_cloud_item_created_at_not_1970() {
        // This test specifically checks for the bug where created_at was hardcoded to 0
        let cloud_item = CloudItem {
            id: 1,
            drive_file_id: "test".to_string(),
            drive_folder_id: "folder".to_string(),
            file_name: "file.pdf".to_string(),
            file_size: None,
            modified_time: None,
            thumbnail_data: None,
            local_path: None,
            download_status: DownloadStatus::Pending,
            download_progress: 0.0,
            pdf_title: None,
            pdf_author: None,
            is_favorite: false,
            last_opened: None,
            created_at: 1735689600, // 2025-01-01 00:00:00 UTC
        };

        let bookshelf_item: BookshelfItem = cloud_item.into();

        // Unix timestamp 0 = 1970-01-01, which is the bug we're fixing
        // The created_at should match what was set in the CloudItem
        assert!(bookshelf_item.created_at > 0);
        assert_eq!(bookshelf_item.created_at, 1735689600);
    }

    #[test]
    fn test_local_item_imported_at_not_1970() {
        // This test specifically checks for the bug where created_at was hardcoded to 0
        let local_item = LocalItem {
            id: 1,
            file_path: "/test.pdf".to_string(),
            original_path: "/original.pdf".to_string(),
            file_name: "test.pdf".to_string(),
            file_size: None,
            thumbnail_data: None,
            pdf_title: None,
            pdf_author: None,
            is_favorite: false,
            last_opened: None,
            imported_at: 1735689600, // 2025-01-01 00:00:00 UTC
            updated_at: 1735689600,
        };

        let bookshelf_item: BookshelfItem = local_item.into();

        // Unix timestamp 0 = 1970-01-01, which is the bug we're fixing
        // The created_at should match the imported_at from LocalItem
        assert!(bookshelf_item.created_at > 0);
        assert_eq!(bookshelf_item.created_at, 1735689600);
    }
}
