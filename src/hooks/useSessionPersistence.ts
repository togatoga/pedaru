import { type MutableRefObject, useCallback, useEffect } from "react";
import { saveSessionState } from "@/lib/database";
import type {
  Bookmark,
  HistoryEntry,
  OpenWindow,
  PdfSessionState,
  Tab,
  ViewMode,
} from "./types";

/**
 * Custom hook for managing session persistence with debouncing
 *
 * Automatically saves session state to database when state changes,
 * with debouncing to prevent excessive writes
 *
 * @param filePath - Current PDF file path
 * @param isStandaloneMode - Whether running in standalone window mode
 * @param currentPage - Current page number
 * @param zoom - Current zoom level
 * @param viewMode - Current view mode (single/two-column)
 * @param tabs - Current tabs
 * @param activeTabId - Currently active tab ID
 * @param openWindows - Currently open standalone windows
 * @param bookmarks - Current bookmarks
 * @param pageHistory - Navigation history
 * @param historyIndex - Current position in history
 * @param saveTimeoutRef - Ref to store debounce timeout
 * @param isRestoringSessionRef - Ref to track if session is being restored
 */
export function useSessionPersistence(
  filePath: string | null,
  isStandaloneMode: boolean,
  currentPage: number,
  zoom: number,
  viewMode: ViewMode,
  tabs: Tab[],
  activeTabId: number | null,
  openWindows: OpenWindow[],
  bookmarks: Bookmark[],
  pageHistory: HistoryEntry[],
  historyIndex: number,
  saveTimeoutRef: MutableRefObject<NodeJS.Timeout | null>,
  isRestoringSessionRef: MutableRefObject<boolean>,
) {
  // Save current session state (debounced)
  const saveCurrentSession = useCallback(() => {
    if (!filePath || isStandaloneMode) return;
    // Don't save during session restoration to prevent overwriting restored data
    if (isRestoringSessionRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
      const savedHistory = pageHistory.slice(-100); // Keep last 100 history entries
      // Adjust historyIndex to match the sliced history
      const overflow = pageHistory.length - 100;
      const adjustedHistoryIndex =
        overflow > 0 ? Math.max(0, historyIndex - overflow) : historyIndex;
      const state: PdfSessionState = {
        lastOpened: Date.now(),
        page: currentPage,
        zoom,
        viewMode,
        activeTabIndex: activeIndex >= 0 ? activeIndex : null,
        tabs: tabs.map((t) => ({ page: t.page, label: t.label })),
        windows: openWindows.map((w) => ({
          page: w.page,
          zoom: w.zoom,
          viewMode: w.viewMode,
        })),
        bookmarks: bookmarks.map((b) => ({
          page: b.page,
          label: b.label,
          createdAt: b.createdAt,
        })),
        pageHistory: savedHistory,
        historyIndex: Math.min(adjustedHistoryIndex, savedHistory.length - 1),
      };
      // Save to database (async, fire and forget)
      saveSessionState(filePath, state).catch((error) => {
        console.error("Failed to save session state:", error);
      });
    }, 500);
  }, [
    filePath,
    isStandaloneMode,
    currentPage,
    zoom,
    viewMode,
    tabs,
    activeTabId,
    openWindows,
    bookmarks,
    pageHistory,
    historyIndex,
    saveTimeoutRef,
    isRestoringSessionRef,
  ]);

  // Auto-save session on state changes (main window only)
  useEffect(() => {
    if (!isStandaloneMode && filePath) {
      saveCurrentSession();
    }
  }, [filePath, isStandaloneMode, saveCurrentSession]);
}
