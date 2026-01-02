//! Google Drive API client
//!
//! This module provides functionality to interact with Google Drive API
//! for listing folders, files, and downloading PDFs.

use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use crate::bookshelf::{DownloadProgress, get_cancel_flag};
use crate::error::{GoogleDriveError, IoError, PedaruError};
use crate::oauth::get_valid_access_token;

/// Google Drive API base URL
const DRIVE_API_BASE: &str = "https://www.googleapis.com/drive/v3";

// ============================================================================
// Types
// ============================================================================

/// A folder from Google Drive
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFolder {
    pub id: String,
    pub name: String,
    pub modified_time: Option<String>,
}

/// A file from Google Drive
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub size: Option<String>,
    pub mime_type: String,
    pub modified_time: Option<String>,
    pub thumbnail_link: Option<String>,
}

/// Combined item that can be either a folder or file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveItem {
    pub id: String,
    pub name: String,
    pub size: Option<String>,
    pub mime_type: String,
    pub modified_time: Option<String>,
    pub thumbnail_link: Option<String>,
    pub is_folder: bool,
}

/// Response from Drive files.list API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilesListResponse {
    files: Vec<DriveFile>,
    next_page_token: Option<String>,
}

// ============================================================================
// API Functions
// ============================================================================

/// List folders in Google Drive root or a specific folder
pub async fn list_folders(
    app: &AppHandle,
    parent_id: Option<&str>,
) -> Result<Vec<DriveFolder>, PedaruError> {
    let access_token = get_valid_access_token(app)?;
    let client = Client::new();

    let parent = parent_id.unwrap_or("root");
    let query = format!(
        "'{}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false",
        parent
    );

    let response = client
        .get(format!("{}/files", DRIVE_API_BASE))
        .bearer_auth(&access_token)
        .query(&[
            ("q", query.as_str()),
            ("fields", "files(id,name,modifiedTime)"),
            ("orderBy", "name"),
            ("pageSize", "100"),
        ])
        .send()
        .await
        .map_err(|e| PedaruError::GoogleDrive(GoogleDriveError::ApiRequestFailed(e.to_string())))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(PedaruError::GoogleDrive(GoogleDriveError::ListFilesFailed(
            error_text,
        )));
    }

    #[derive(Deserialize)]
    struct FolderListResponse {
        files: Vec<DriveFolder>,
    }

    let folder_list: FolderListResponse = response
        .json()
        .await
        .map_err(|e| PedaruError::GoogleDrive(GoogleDriveError::ApiRequestFailed(e.to_string())))?;

    Ok(folder_list.files)
}

/// List both folders and PDF files in a parent folder (handles pagination)
pub async fn list_drive_items(
    app: &AppHandle,
    parent_id: Option<&str>,
) -> Result<Vec<DriveItem>, PedaruError> {
    let access_token = get_valid_access_token(app)?;
    let client = Client::new();

    let parent = parent_id.unwrap_or("root");
    // Get folders OR PDF files
    let query = format!(
        "'{}' in parents and (mimeType='application/vnd.google-apps.folder' or mimeType='application/pdf') and trashed=false",
        parent
    );

    // Parse raw response
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawItem {
        id: String,
        name: String,
        size: Option<String>,
        mime_type: String,
        modified_time: Option<String>,
        thumbnail_link: Option<String>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawListResponse {
        files: Vec<RawItem>,
        next_page_token: Option<String>,
    }

    let mut all_items = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let mut request = client
            .get(format!("{}/files", DRIVE_API_BASE))
            .bearer_auth(&access_token)
            .query(&[
                ("q", query.as_str()),
                (
                    "fields",
                    "files(id,name,size,mimeType,modifiedTime,thumbnailLink),nextPageToken",
                ),
                ("orderBy", "folder,name"),
                ("pageSize", "100"),
            ]);

        if let Some(token) = &page_token {
            request = request.query(&[("pageToken", token.as_str())]);
        }

        let response = request.send().await.map_err(|e| {
            PedaruError::GoogleDrive(GoogleDriveError::ApiRequestFailed(e.to_string()))
        })?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(PedaruError::GoogleDrive(GoogleDriveError::ListFilesFailed(
                error_text,
            )));
        }

        let raw_response: RawListResponse = response.json().await.map_err(|e| {
            PedaruError::GoogleDrive(GoogleDriveError::ApiRequestFailed(e.to_string()))
        })?;

        // Convert to DriveItem with is_folder flag
        let items: Vec<DriveItem> = raw_response
            .files
            .into_iter()
            .map(|item| DriveItem {
                id: item.id,
                name: item.name,
                size: item.size,
                is_folder: item.mime_type == "application/vnd.google-apps.folder",
                mime_type: item.mime_type,
                modified_time: item.modified_time,
                thumbnail_link: item.thumbnail_link,
            })
            .collect();

        all_items.extend(items);

        match raw_response.next_page_token {
            Some(token) => page_token = Some(token),
            None => break,
        }
    }

    Ok(all_items)
}

/// List PDF files in a folder (handles pagination)
pub async fn list_pdf_files(
    app: &AppHandle,
    folder_id: &str,
) -> Result<Vec<DriveFile>, PedaruError> {
    let access_token = get_valid_access_token(app)?;
    let client = Client::new();

    let mut all_files = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let query = format!(
            "'{}' in parents and mimeType='application/pdf' and trashed=false",
            folder_id
        );

        let mut request = client
            .get(format!("{}/files", DRIVE_API_BASE))
            .bearer_auth(&access_token)
            .query(&[
                ("q", query.as_str()),
                (
                    "fields",
                    "files(id,name,size,mimeType,modifiedTime,thumbnailLink),nextPageToken",
                ),
                ("orderBy", "name"),
                ("pageSize", "100"),
            ]);

        if let Some(token) = &page_token {
            request = request.query(&[("pageToken", token.as_str())]);
        }

        let response = request.send().await.map_err(|e| {
            PedaruError::GoogleDrive(GoogleDriveError::ApiRequestFailed(e.to_string()))
        })?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(PedaruError::GoogleDrive(GoogleDriveError::ListFilesFailed(
                error_text,
            )));
        }

        let list_response: FilesListResponse = response.json().await.map_err(|e| {
            PedaruError::GoogleDrive(GoogleDriveError::ApiRequestFailed(e.to_string()))
        })?;

        all_files.extend(list_response.files);

        match list_response.next_page_token {
            Some(token) => page_token = Some(token),
            None => break,
        }
    }

    Ok(all_files)
}

/// Download a file from Google Drive with cancellation support
pub async fn download_file(
    app: &AppHandle,
    file_id: &str,
    dest_path: &Path,
) -> Result<(), PedaruError> {
    let cancel_flag = get_cancel_flag(file_id).unwrap_or_else(|| Arc::new(AtomicBool::new(false)));

    let result = download_file_inner(app, file_id, dest_path, &cancel_flag).await;

    // If cancelled, clean up partial file
    if cancel_flag.load(Ordering::SeqCst) {
        if dest_path.exists() {
            let _ = std::fs::remove_file(dest_path);
        }
        return Err(PedaruError::GoogleDrive(
            GoogleDriveError::DownloadCancelled(file_id.to_string()),
        ));
    }

    result
}

/// Inner download function that does the actual work
async fn download_file_inner(
    app: &AppHandle,
    file_id: &str,
    dest_path: &Path,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), PedaruError> {
    let access_token = get_valid_access_token(app)?;
    let client = Client::new();

    // Check for cancellation before starting
    if cancel_flag.load(Ordering::SeqCst) {
        return Ok(());
    }

    // Get file metadata first to know total size
    let total_bytes = get_file_size(&client, &access_token, file_id).await?;

    // Check for cancellation before downloading
    if cancel_flag.load(Ordering::SeqCst) {
        return Ok(());
    }

    // Download the file content
    let response = client
        .get(format!("{}/files/{}", DRIVE_API_BASE, file_id))
        .bearer_auth(&access_token)
        .query(&[("alt", "media")])
        .send()
        .await
        .map_err(|e| PedaruError::GoogleDrive(GoogleDriveError::DownloadFailed(e.to_string())))?;

    if !response.status().is_success() {
        let status = response.status();
        if status.as_u16() == 404 {
            return Err(PedaruError::GoogleDrive(GoogleDriveError::FileNotFound(
                file_id.to_string(),
            )));
        }
        let error_text = response.text().await.unwrap_or_default();
        return Err(PedaruError::GoogleDrive(GoogleDriveError::DownloadFailed(
            error_text,
        )));
    }

    // Create parent directories if needed
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            PedaruError::Io(IoError::CreateDirFailed {
                path: parent.display().to_string(),
                source: e,
            })
        })?;
    }

    // Stream response to file with progress updates
    stream_to_file(app, file_id, dest_path, response, total_bytes, cancel_flag).await
}

/// Get file size from Google Drive API
async fn get_file_size(
    client: &Client,
    access_token: &str,
    file_id: &str,
) -> Result<u64, PedaruError> {
    let response = client
        .get(format!("{}/files/{}", DRIVE_API_BASE, file_id))
        .bearer_auth(access_token)
        .query(&[("fields", "size")])
        .send()
        .await
        .map_err(|e| PedaruError::GoogleDrive(GoogleDriveError::ApiRequestFailed(e.to_string())))?;

    #[derive(Deserialize)]
    struct FileMetadata {
        size: Option<String>,
    }

    let metadata: FileMetadata = response
        .json()
        .await
        .map_err(|e| PedaruError::GoogleDrive(GoogleDriveError::ApiRequestFailed(e.to_string())))?;

    Ok(metadata.size.and_then(|s| s.parse().ok()).unwrap_or(0))
}

/// Stream response body to file with progress updates
async fn stream_to_file(
    app: &AppHandle,
    file_id: &str,
    dest_path: &Path,
    response: reqwest::Response,
    total_bytes: u64,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), PedaruError> {
    let mut file = File::create(dest_path).map_err(|e| {
        PedaruError::Io(IoError::ReadFailed {
            path: dest_path.display().to_string(),
            source: e,
        })
    })?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_progress_update = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        // Check for cancellation during download
        if cancel_flag.load(Ordering::SeqCst) {
            return Ok(());
        }

        let chunk = chunk.map_err(|e| {
            PedaruError::GoogleDrive(GoogleDriveError::DownloadFailed(e.to_string()))
        })?;

        file.write_all(&chunk).map_err(|e| {
            PedaruError::Io(IoError::ReadFailed {
                path: dest_path.display().to_string(),
                source: e,
            })
        })?;

        downloaded += chunk.len() as u64;

        // Emit progress events every 100ms
        if last_progress_update.elapsed() >= std::time::Duration::from_millis(100) {
            emit_progress(app, file_id, downloaded, total_bytes);
            last_progress_update = std::time::Instant::now();
        }
    }

    // Final progress update
    emit_progress(app, file_id, downloaded, total_bytes);

    Ok(())
}

/// Emit download progress event
fn emit_progress(app: &AppHandle, file_id: &str, downloaded: u64, total_bytes: u64) {
    let progress = if total_bytes > 0 {
        (downloaded as f64 / total_bytes as f64) * 100.0
    } else {
        0.0
    };

    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            drive_file_id: file_id.to_string(),
            progress,
            downloaded_bytes: downloaded,
            total_bytes,
        },
    );
}
