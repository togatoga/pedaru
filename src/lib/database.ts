import { invoke } from "@tauri-apps/api/core";
import type {
  BookmarkState,
  HistoryEntry,
  PdfSessionState,
  TabState,
  WindowState,
} from "@/types";

// Re-export types for backward compatibility
export type {
  TabState,
  WindowState,
  BookmarkState,
  HistoryEntry,
  PdfSessionState,
};

// Constants
const LAST_OPENED_KEY = "pedaru_last_opened_path";

// Save session state for a PDF
export async function saveSessionState(
  filePath: string,
  state: PdfSessionState,
): Promise<void> {
  await invoke("save_session", { filePath, state });

  // Update last opened path in localStorage (for quick access on startup)
  localStorage.setItem(LAST_OPENED_KEY, filePath);
}

// Load session state for a PDF
export async function loadSessionState(
  filePath: string,
): Promise<PdfSessionState | null> {
  return await invoke<PdfSessionState | null>("load_session", { filePath });
}

// Get last opened PDF path (from localStorage for fast startup)
export function getLastOpenedPath(): string | null {
  return localStorage.getItem(LAST_OPENED_KEY);
}

// Delete session for a PDF
export async function deleteSession(filePath: string): Promise<void> {
  await invoke("delete_session", { filePath });
}

// Get recent files for menu
export async function getRecentFiles(limit: number = 10): Promise<
  Array<{
    filePath: string;
    lastOpened: number;
  }>
> {
  return await invoke<Array<{ filePath: string; lastOpened: number }>>(
    "get_recent_files",
    { limit },
  );
}

// Create default session state
export function createDefaultState(): PdfSessionState {
  return {
    lastOpened: Date.now(),
    page: 1,
    zoom: 1.0,
    viewMode: "single",
    activeTabIndex: null,
    tabs: [],
    windows: [],
    bookmarks: [],
  };
}
