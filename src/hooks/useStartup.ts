"use client";

import { invoke } from "@tauri-apps/api/core";
import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";
import { getLastOpenedPath, loadSessionState } from "@/lib/database";
import type {
  Bookmark,
  HistoryEntry,
  PdfInfo,
  TabState,
  ViewMode,
  WindowState,
} from "@/types";

/**
 * URL parameters for startup
 */
interface UrlParams {
  page: string | null;
  file: string | null;
  isStandalone: boolean;
  openFile: string | null;
  zoom: string | null;
  viewMode: ViewMode | null;
}

/**
 * URL parameters for standalone mode (file and page are guaranteed)
 */
interface StandaloneUrlParams extends UrlParams {
  file: string;
  page: string;
}

/**
 * Parse URL parameters from window.location.search
 */
function parseUrlParams(): UrlParams {
  const params = new URLSearchParams(window.location.search);
  return {
    page: params.get("page"),
    file: params.get("file"),
    isStandalone: params.get("standalone") === "true",
    openFile: params.get("openFile"),
    zoom: params.get("zoom"),
    viewMode: params.get("viewMode") as ViewMode | null,
  };
}

/**
 * Configuration for useStartup hook
 */
export interface UseStartupConfig {
  // State setters
  setIsStandaloneMode: Dispatch<SetStateAction<boolean>>;
  setIsTocOpen: Dispatch<SetStateAction<boolean>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setPdfInfo: Dispatch<SetStateAction<PdfInfo | null>>;
  setBookmarks: Dispatch<SetStateAction<Bookmark[]>>;
  setPageHistory: Dispatch<SetStateAction<HistoryEntry[]>>;
  setHistoryIndex: Dispatch<SetStateAction<number>>;
  setPendingTabsRestore: Dispatch<SetStateAction<TabState[] | null>>;
  setPendingActiveTabIndex: Dispatch<SetStateAction<number | null>>;
  setPendingWindowsRestore: Dispatch<SetStateAction<WindowState[] | null>>;

  // Functions
  loadPdfFromPathInternal: (
    path: string,
    skipRestore: boolean,
  ) => Promise<boolean>;
  loadPdfFromPath: (path: string) => Promise<void>;
  updateNativeWindowTitle: (
    page: number,
    forceStandalone?: boolean,
  ) => Promise<void>;
}

/**
 * Hook that handles application startup logic
 * - Standalone mode initialization from URL params
 * - New window initialization from URL params
 * - CLI / "Open With" file opening
 * - Last opened file session restoration
 */
export function useStartup(config: UseStartupConfig): void {
  const {
    setIsStandaloneMode,
    setIsTocOpen,
    setCurrentPage,
    setZoom,
    setViewMode,
    setPdfInfo,
    setBookmarks,
    setPageHistory,
    setHistoryIndex,
    setPendingTabsRestore,
    setPendingActiveTabIndex,
    setPendingWindowsRestore,
    loadPdfFromPathInternal,
    loadPdfFromPath,
    updateNativeWindowTitle,
  } = config;

  // Track if startup has already run
  const hasRunRef = useRef(false);

  useEffect(() => {
    // Prevent running twice (React StrictMode)
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    console.log("=== Startup useEffect running ===");

    const loadOnStartup = async () => {
      console.log("=== loadOnStartup called ===");

      const urlParams = parseUrlParams();
      console.log("URL params:", urlParams);

      // 1. Handle standalone mode (page viewer window)
      if (urlParams.isStandalone && urlParams.file && urlParams.page) {
        await handleStandaloneInit(urlParams as StandaloneUrlParams);
        return;
      }

      // 2. Handle new independent window
      if (urlParams.openFile) {
        await handleNewWindowInit(urlParams.openFile);
        return;
      }

      // 3. Check for file opened via CLI or "Open With"
      const cliFile = await checkCliOpenedFile();
      if (cliFile) {
        await loadPdfFromPath(cliFile);
        return;
      }

      // 4. Try to restore last opened file session
      await handleSessionRestore();
    };

    /**
     * Initialize standalone page viewer window
     */
    async function handleStandaloneInit(urlParams: StandaloneUrlParams) {
      console.log(
        "Standalone mode detected, loading PDF from:",
        urlParams.file,
      );
      setIsStandaloneMode(true);
      setIsTocOpen(false);

      try {
        const decodedPath = decodeURIComponent(urlParams.file);
        console.log("Decoded file path:", decodedPath);

        const success = await loadPdfFromPathInternal(decodedPath, true);
        if (success) {
          const pageNum = parseInt(urlParams.page, 10);
          console.log("Setting page to:", pageNum);
          setCurrentPage(pageNum);
          updateNativeWindowTitle(pageNum, true);

          // Apply URL-provided settings
          if (urlParams.zoom) setZoom(parseFloat(urlParams.zoom));
          if (urlParams.viewMode) setViewMode(urlParams.viewMode);
        } else {
          alert("Failed to load PDF file");
        }
      } catch (err) {
        console.error("Error in standalone mode initialization:", err);
        alert(`Failed to load PDF: ${err}`);
      }
    }

    /**
     * Initialize new independent main window
     */
    async function handleNewWindowInit(openFile: string) {
      console.log("Opening PDF in new independent window:", openFile);
      try {
        const decodedPath = decodeURIComponent(openFile);
        console.log("Decoded file path:", decodedPath);

        const success = await loadPdfFromPathInternal(decodedPath, false);
        if (success) {
          setCurrentPage(1);
          setZoom(1.0);
          setViewMode("single");
          localStorage.setItem("pedaru_last_opened_path", decodedPath);
        } else {
          alert("Failed to load PDF file");
        }
      } catch (err) {
        console.error("Error loading PDF:", err);
        alert(`Failed to load PDF: ${err}`);
      }
    }

    /**
     * Check for file opened via CLI or "Open With"
     */
    async function checkCliOpenedFile(): Promise<string | null> {
      try {
        console.log("Checking for opened file from Rust...");
        const openedFilePath = await invoke<string | null>("get_opened_file");
        console.log("get_opened_file result:", openedFilePath);

        if (openedFilePath?.toLowerCase().endsWith(".pdf")) {
          return openedFilePath;
        }
      } catch (e) {
        console.error("Error checking opened file:", e);
      }
      return null;
    }

    /**
     * Restore session from last opened file
     */
    async function handleSessionRestore() {
      const lastPath = getLastOpenedPath();
      if (!lastPath) return;

      console.log("Loading last opened PDF:", lastPath);
      const session = await loadSessionState(lastPath);

      // Reset pdfInfo before loading new PDF
      setPdfInfo(null);

      if (session) {
        setZoom(session.zoom || 1.0);
        setViewMode(session.viewMode || "single");
        const success = await loadPdfFromPathInternal(lastPath, false);
        if (success) {
          setCurrentPage(session.page || 1);
          updateNativeWindowTitle(session.page || 1);

          // Restore bookmarks
          if (session.bookmarks && session.bookmarks.length > 0) {
            setBookmarks(session.bookmarks);
          }

          // Restore page history
          if (session.pageHistory && session.pageHistory.length > 0) {
            setPageHistory(session.pageHistory);
            setHistoryIndex(
              session.historyIndex ?? session.pageHistory.length - 1,
            );
          }

          // Set pending states for tabs and windows restoration
          if (session.tabs && session.tabs.length > 0) {
            setPendingTabsRestore(session.tabs);
            setPendingActiveTabIndex(session.activeTabIndex);
          }
          if (session.windows && session.windows.length > 0) {
            setPendingWindowsRestore(session.windows);
          }
        }
      } else {
        // No session data - load PDF with defaults
        const success = await loadPdfFromPathInternal(lastPath, false);
        if (success) {
          setCurrentPage(1);
          setZoom(1.0);
          setViewMode("single");
        }
      }
    }

    loadOnStartup();
  }, [
    loadPdfFromPath,
    loadPdfFromPathInternal,
    setBookmarks,
    setCurrentPage,
    setHistoryIndex,
    setIsStandaloneMode,
    setIsTocOpen,
    setPageHistory, // Reset pdfInfo before loading new PDF
    setPdfInfo,
    setPendingActiveTabIndex,
    setPendingTabsRestore,
    setPendingWindowsRestore,
    setViewMode,
    setZoom,
    updateNativeWindowTitle,
  ]); // Run only once on mount
}
