/**
 * Centralized type definitions for Pedaru
 * All shared types should be imported from this file
 */

// Re-export PDF-related types
export type { PdfInfo, TocEntry } from './pdf';

// ============================================
// View Mode
// ============================================

/**
 * PDF display mode
 */
export type ViewMode = 'single' | 'two-column';

// ============================================
// Bookmark Types
// ============================================

/**
 * Represents a bookmark in the PDF viewer
 */
export interface Bookmark {
  page: number;
  label: string;
  createdAt: number;
}

/**
 * Bookmark state for database storage (alias for Bookmark)
 */
export type BookmarkState = Bookmark;

// ============================================
// Search Types
// ============================================

/**
 * Represents a search result with context
 */
export interface SearchResult {
  page: number;
  matchIndex: number;
  contextBefore: string;
  matchText: string;
  contextAfter: string;
}

// ============================================
// Tab Types
// ============================================

/**
 * Tab state for database storage
 */
export interface TabState {
  page: number;
  label: string;
}

/**
 * Represents an active tab in the main window
 */
export interface Tab {
  id: number;
  page: number;
  label: string;
}

// ============================================
// Window Types
// ============================================

/**
 * Window state for database storage
 */
export interface WindowState {
  page: number;
  zoom: number;
  viewMode: ViewMode;
}

/**
 * Represents an open standalone window with its current state
 */
export interface OpenWindow {
  page: number;
  label: string;
  chapter?: string;
  zoom: number;
  viewMode: ViewMode;
}

// ============================================
// History Types
// ============================================

/**
 * Represents an entry in the page navigation history
 */
export interface HistoryEntry {
  page: number;
  timestamp: string;
}

// ============================================
// Session Types
// ============================================

/**
 * Complete session state for a PDF document
 */
export interface PdfSessionState {
  filePath?: string;
  name?: string;
  lastOpened: number;
  page: number;
  zoom: number;
  viewMode: ViewMode;
  activeTabIndex: number | null;
  tabs: TabState[];
  windows: WindowState[];
  bookmarks: BookmarkState[];
  pageHistory?: HistoryEntry[];
  historyIndex?: number;
}

// ============================================
// Google Drive / OAuth Types
// ============================================

/**
 * OAuth authentication status
 */
export interface AuthStatus {
  authenticated: boolean;
  configured: boolean;
}

/**
 * A folder from Google Drive
 */
export interface DriveFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

/**
 * A combined item from Google Drive (can be folder or file)
 */
export interface DriveItem {
  id: string;
  name: string;
  size?: string;
  mimeType: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  isFolder: boolean;
}

/**
 * A stored folder configuration
 */
export interface StoredFolder {
  folderId: string;
  folderName: string;
  isActive: boolean;
  lastSynced?: number;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  newFiles: number;
  updatedFiles: number;
  removedFiles: number;
}

// ============================================
// Bookshelf Types
// ============================================

/**
 * Download status of a bookshelf item
 */
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'error';

/**
 * Source type for bookshelf items
 * @deprecated Use CloudItem or LocalItem instead
 */
export type SourceType = 'google_drive' | 'local';

/**
 * Cloud bookshelf item (from Google Drive)
 */
export interface CloudItem {
  id: number;
  driveFileId: string;
  driveFolderId: string;
  fileName: string;
  fileSize?: number;
  thumbnailData?: string;
  localPath?: string;
  downloadStatus: DownloadStatus;
  downloadProgress: number;
  pdfTitle?: string;
  pdfAuthor?: string;
  isFavorite: boolean;
  lastOpened?: number;
}

/**
 * Local bookshelf item (imported from filesystem)
 */
export interface LocalItem {
  id: number;
  filePath: string;
  originalPath: string;
  fileName: string;
  fileSize?: number;
  thumbnailData?: string;
  pdfTitle?: string;
  pdfAuthor?: string;
  isFavorite: boolean;
  lastOpened?: number;
}

/**
 * A bookshelf item (PDF from Google Drive or local file)
 * @deprecated Use CloudItem or LocalItem instead
 */
export interface BookshelfItem {
  id: number;
  driveFileId?: string;
  driveFolderId?: string;
  fileName: string;
  fileSize?: number;
  thumbnailData?: string;
  localPath?: string;
  downloadStatus: DownloadStatus;
  downloadProgress: number;
  pdfTitle?: string;
  pdfAuthor?: string;
  sourceType: SourceType;
  originalPath?: string;
  createdAt: number;
  isFavorite: boolean;
  lastOpened?: number;
}

/**
 * Result of importing local files
 */
export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  errorCount: number;
}

/**
 * Download progress event
 */
export interface DownloadProgress {
  driveFileId: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
}

// ============================================
// Gemini Translation Types
// ============================================

/**
 * Available Gemini models
 */
export type GeminiModel =
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-pro'
  | 'gemini-3-flash-preview'
  | 'gemini-3-pro-preview';

/**
 * Gemini model option for UI
 */
export interface GeminiModelOption {
  id: GeminiModel;
  name: string;
  description: string;
}

/**
 * Gemini translation settings
 */
export interface GeminiSettings {
  apiKey: string;
  model: string;
  explanationModel: string;
}

/**
 * Structured translation response from Gemini
 */
export interface TranslationResponse {
  translation: string;
  points: string[];
}

/**
 * Structured explanation response from Gemini
 */
export interface ExplanationResponse {
  summary: string;
  points: string[];
}

/**
 * Text selection data for translation
 */
export interface TextSelection {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  isWord: boolean;
  position: { x: number; y: number };
  contextLoading?: boolean;
  pageNumber?: number; // Page number where the selection was made
}
