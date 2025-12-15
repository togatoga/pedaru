import { ViewMode } from '@/components/Settings';

// Types
export interface TabState {
  page: number;
  label: string;
}

export interface WindowState {
  page: number;
  zoom: number;
  viewMode: ViewMode;
}

export interface BookmarkState {
  page: number;
  label: string;
  createdAt: number;
}

export interface HistoryEntry {
  page: number;
  timestamp: string;
}

export interface PdfSessionState {
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

// Constants
const STORAGE_PREFIX = 'dorper_pdf_session_';
const LAST_OPENED_KEY = 'dorper_last_opened_path';
const OLD_STORAGE_KEY = 'dorper_last_pdf';
const MAX_STORED_PDFS = 50;

// Simple hash function for file paths
function hashPath(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Get storage key for a PDF
export function getStorageKey(filePath: string): string {
  return `${STORAGE_PREFIX}${hashPath(filePath)}`;
}

// Save session state for a PDF
export function saveSessionState(filePath: string, state: PdfSessionState): void {
  const key = getStorageKey(filePath);
  state.lastOpened = Date.now();
  localStorage.setItem(key, JSON.stringify(state));
  localStorage.setItem(LAST_OPENED_KEY, filePath);
  cleanupOldSessions();
}

// Load session state for a PDF
export function loadSessionState(filePath: string): PdfSessionState | null {
  const key = getStorageKey(filePath);
  const data = localStorage.getItem(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as PdfSessionState;
  } catch {
    return null;
  }
}

// Get last opened PDF path
export function getLastOpenedPath(): string | null {
  return localStorage.getItem(LAST_OPENED_KEY);
}

// Cleanup old sessions (LRU)
function cleanupOldSessions(): void {
  const sessions: { key: string; lastOpened: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '');
        sessions.push({ key, lastOpened: data.lastOpened || 0 });
      } catch {
        // Invalid data, mark for removal
        sessions.push({ key, lastOpened: 0 });
      }
    }
  }

  if (sessions.length > MAX_STORED_PDFS) {
    sessions.sort((a, b) => b.lastOpened - a.lastOpened);
    const toRemove = sessions.slice(MAX_STORED_PDFS);
    toRemove.forEach(s => localStorage.removeItem(s.key));
  }
}

// Create default session state
export function createDefaultState(): PdfSessionState {
  return {
    lastOpened: Date.now(),
    page: 1,
    zoom: 1.0,
    viewMode: 'single',
    activeTabIndex: null,
    tabs: [],
    windows: [],
    bookmarks: [],
  };
}

// Migrate from old storage format
export function migrateOldStorage(): void {
  const oldData = localStorage.getItem(OLD_STORAGE_KEY);

  if (oldData) {
    try {
      const { path, page, zoom, viewMode } = JSON.parse(oldData);
      if (path) {
        const newState: PdfSessionState = {
          lastOpened: Date.now(),
          page: page || 1,
          zoom: zoom || 1.0,
          viewMode: viewMode || 'single',
          activeTabIndex: null,
          tabs: [],
          windows: [],
          bookmarks: [],
        };
        saveSessionState(path, newState);
      }
    } catch {
      // Ignore invalid old data
    }
    localStorage.removeItem(OLD_STORAGE_KEY);
  }
}
