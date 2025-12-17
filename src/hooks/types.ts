/**
 * Shared types for custom hooks
 * This file contains type definitions used across multiple hooks
 */

import type { ViewMode as VMType } from '@/components/Settings';

// Re-export commonly used types from other modules for convenience
export type { Bookmark } from '@/components/BookmarkSidebar';
export type { SearchResult } from '@/components/SearchResultsSidebar';
export type { ViewMode } from '@/components/Settings';
export type { PdfInfo, TocEntry } from '@/types/pdf';
export type {
  TabState,
  WindowState,
  PdfSessionState,
} from '@/lib/database';

// Use ViewMode locally via imported alias
type ViewMode = VMType;

/**
 * Represents a tab in the main window
 */
export interface Tab {
  id: number;
  page: number;
  label: string;
}

/**
 * Represents an entry in the page navigation history
 */
export interface HistoryEntry {
  page: number;
  timestamp: string;
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
