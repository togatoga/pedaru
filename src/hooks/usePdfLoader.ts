import { useCallback, Dispatch, SetStateAction } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { loadSessionState } from '@/lib/database';
import type {
  PdfInfo,
  OpenWindow,
  Tab,
  Bookmark,
  HistoryEntry,
  ViewMode,
  TabState,
  WindowState,
} from './types';

/**
 * Custom hook for loading PDF files and managing their state
 *
 * Handles:
 * - Loading PDF files from filesystem
 * - Extracting PDF metadata
 * - Session restoration
 * - State reset when loading new files
 */
export function usePdfLoader({
  // State setters
  setFileData,
  setFileName,
  setFilePath,
  setPdfInfo,
  setCurrentPage,
  setZoom,
  setViewMode,
  setBookmarks,
  setPageHistory,
  setHistoryIndex,
  setSearchQuery,
  setSearchResults,
  setShowSearchResults,
  setIsLoading,
  setOpenWindows,
  setTabs,
  setActiveTabId,
  setPendingTabsRestore,
  setPendingActiveTabIndex,
  setPendingWindowsRestore,

  // Current state (for cleanup)
  openWindows,
}: {
  // State setters
  setFileData: Dispatch<SetStateAction<Uint8Array | null>>;
  setFileName: Dispatch<SetStateAction<string | null>>;
  setFilePath: Dispatch<SetStateAction<string | null>>;
  setPdfInfo: Dispatch<SetStateAction<PdfInfo | null>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setBookmarks: Dispatch<SetStateAction<Bookmark[]>>;
  setPageHistory: Dispatch<SetStateAction<HistoryEntry[]>>;
  setHistoryIndex: Dispatch<SetStateAction<number>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSearchResults: Dispatch<SetStateAction<any[]>>;
  setShowSearchResults: Dispatch<SetStateAction<boolean>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setOpenWindows: Dispatch<SetStateAction<OpenWindow[]>>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveTabId: Dispatch<SetStateAction<number | null>>;
  setPendingTabsRestore: Dispatch<SetStateAction<TabState[] | null>>;
  setPendingActiveTabIndex: Dispatch<SetStateAction<number | null>>;
  setPendingWindowsRestore: Dispatch<SetStateAction<WindowState[] | null>>;

  // Current state
  openWindows: OpenWindow[];
}) {
  /**
   * Internal function to load PDF without session restoration
   * Used for both standalone and main window modes
   */
  const loadPdfInternal = useCallback(
    async (path: string, isStandalone: boolean = false) => {
      try {
        console.log('=== loadPdfInternal called ===');
        console.log('Path:', path);
        console.log('isStandalone:', isStandalone);
        setIsLoading(true);

        // Get PDF info from Rust backend first
        const info = await invoke<PdfInfo>('get_pdf_info', { path });
        console.log('PDF info received:', info);
        setPdfInfo(info);

        // Read PDF file (automatically decrypted if encrypted)
        const data = await invoke<number[]>('read_pdf_file', { path });
        console.log('File read successfully, size:', data.length);
        setFileData(new Uint8Array(data));
        setFilePath(path); // Keep original path for display

        // Get file name from original path
        const name = path.split('/').pop() || path;
        setFileName(name);

        setIsLoading(false);
        console.log('PDF loaded successfully');
        return true;
      } catch (error) {
        console.error('Error loading PDF:', error);
        setIsLoading(false);
        return false;
      }
    },
    [setIsLoading, setPdfInfo, setFileData, setFilePath, setFileName]
  );

  /**
   * Load PDF from path with session restoration
   * Wrapper for external use - loads PDF and restores session if available
   */
  const loadPdfFromPath = useCallback(
    async (path: string) => {
      console.log('=== loadPdfFromPath called ===');
      console.log('Path argument:', path);

      // Reset all state immediately when opening a new PDF
      setPdfInfo(null); // Clear old PDF info (including ToC)
      setCurrentPage(1);
      setZoom(1.0);
      setViewMode('single');
      setBookmarks([]);
      setPageHistory([]);
      setHistoryIndex(-1);
      setSearchQuery('');
      setSearchResults([]);
      setShowSearchResults(false);

      // Close all existing windows and clear tabs before loading new PDF
      for (const w of openWindows) {
        try {
          const win = await WebviewWindow.getByLabel(w.label);
          if (win) await win.close();
        } catch (e) {
          console.warn('Failed to close window', w.label, e);
        }
      }
      setOpenWindows([]);
      setTabs([]);
      setActiveTabId(null);

      const success = await loadPdfInternal(path, false);
      if (success) {
        // Check if there's a saved session for this PDF
        // Note: Recent files list is automatically updated via saveSessionState in database.ts
        const session = await loadSessionState(path);
        if (session) {
          // Restore session state
          setCurrentPage(session.page || 1);
          setZoom(session.zoom || 1.0);
          setViewMode(session.viewMode || 'single');

          // Restore bookmarks
          if (session.bookmarks && session.bookmarks.length > 0) {
            setBookmarks(session.bookmarks);
          } else {
            setBookmarks([]);
          }

          // Restore page history
          if (session.pageHistory && session.pageHistory.length > 0) {
            setPageHistory(session.pageHistory);
            setHistoryIndex(session.historyIndex ?? session.pageHistory.length - 1);
          }

          // Set pending states for tabs and windows restoration
          if (session.tabs && session.tabs.length > 0) {
            setPendingTabsRestore(session.tabs);
            setPendingActiveTabIndex(session.activeTabIndex);
          }
          if (session.windows && session.windows.length > 0) {
            setPendingWindowsRestore(session.windows);
          }
        } else {
          // No saved session - defaults already set at start of loadPdfFromPath
        }

        // Refresh the Open Recents menu after loading a new PDF
        try {
          await invoke('refresh_recent_menu');
        } catch (error) {
          console.error('Failed to refresh recent menu:', error);
        }
      }
    },
    [
      setPdfInfo,
      setCurrentPage,
      setZoom,
      setViewMode,
      setBookmarks,
      setPageHistory,
      setHistoryIndex,
      setSearchQuery,
      setSearchResults,
      setShowSearchResults,
      openWindows,
      setOpenWindows,
      setTabs,
      setActiveTabId,
      loadPdfInternal,
      setPendingTabsRestore,
      setPendingActiveTabIndex,
      setPendingWindowsRestore,
    ]
  );

  return {
    loadPdfFromPath,
    loadPdfInternal,
  };
}
