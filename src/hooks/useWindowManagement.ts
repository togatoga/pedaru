import {
  getAllWebviewWindows,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { getTabLabel, getWindowTitle } from "@/lib/formatUtils";
import { isMacOS } from "@/lib/platform";
import type { OpenWindow, PdfInfo, Tab, ViewMode, WindowState } from "./types";

/**
 * Custom hook for managing standalone windows
 *
 * Handles window creation, closing, focusing, and session restoration
 *
 * @param filePath - Path to current PDF file
 * @param openWindows - Array of open standalone windows
 * @param setOpenWindows - State setter for open windows
 * @param zoom - Current zoom level (used as default for new windows)
 * @param isStandaloneMode - Whether running in standalone window mode
 * @param pdfInfo - PDF metadata
 * @param getChapterForPage - Function to get chapter name for a page
 * @param tabs - Array of open tabs
 * @param setTabs - State setter for tabs
 * @param activeTabId - ID of active tab
 * @param setActiveTabId - State setter for active tab ID
 * @param tabIdRef - Ref to track next tab ID
 * @param pendingWindowsRestore - Windows to restore from session
 * @param setPendingWindowsRestore - State setter for pending windows restore
 * @returns Window management functions
 */
export function useWindowManagement(
  filePath: string | null,
  openWindows: OpenWindow[],
  setOpenWindows: Dispatch<SetStateAction<OpenWindow[]>>,
  zoom: number,
  isStandaloneMode: boolean,
  pdfInfo: PdfInfo | null,
  getChapterForPage: (page: number) => string | undefined,
  _tabs: Tab[],
  setTabs: Dispatch<SetStateAction<Tab[]>>,
  _activeTabId: number | null,
  setActiveTabId: Dispatch<SetStateAction<number | null>>,
  tabIdRef: MutableRefObject<number>,
  pendingWindowsRestore: WindowState[] | null,
  setPendingWindowsRestore: Dispatch<SetStateAction<WindowState[] | null>>,
) {
  // Ref to track pending window restoration (avoids circular dependencies)
  const pendingWindowsRestoreRef = useRef<WindowState[] | null>(null);

  // Update ref when pending restore state changes
  useEffect(() => {
    if (pendingWindowsRestore) {
      pendingWindowsRestoreRef.current = pendingWindowsRestore;
      setPendingWindowsRestore(null);
    }
  }, [pendingWindowsRestore, setPendingWindowsRestore]);

  /**
   * Focus a standalone window by label
   * Unminimizes, shows, and focuses the window
   */
  const focusWindow = useCallback(async (label: string) => {
    try {
      // Get all windows and find the one with matching label
      const allWindows = await getAllWebviewWindows();
      const win = allWindows.find((w) => w.label === label);

      if (!win) {
        console.warn("No window found for label", label);
        return;
      }

      // Unminimize if minimized, then show and focus
      await win.unminimize();
      await win.show();
      await win.setFocus();
    } catch (e) {
      console.error("Failed to focus window", label, e);
    }
  }, []);

  /**
   * Open a standalone window with custom settings
   */
  const openStandaloneWindowWithState = useCallback(
    async (
      pageNumber: number,
      windowZoom: number = 1.0,
      windowViewMode: ViewMode = "single",
      label?: string,
    ) => {
      if (!filePath) {
        console.warn("Cannot open standalone window without file path");
        return;
      }
      const origin = window.location.origin;
      const url = `${origin}/?page=${pageNumber}&file=${encodeURIComponent(
        filePath,
      )}&standalone=true&zoom=${windowZoom}&viewMode=${windowViewMode}`;
      const windowLabel = label || `page-${Date.now()}-${pageNumber}`;
      const chapter = getChapterForPage(pageNumber);
      try {
        const webview = new WebviewWindow(windowLabel, {
          url,
          title: getWindowTitle(pageNumber, chapter),
          width: 900,
          height: 1100,
          resizable: true,
          center: true,
          ...(isMacOS() && {
            titleBarStyle: "overlay",
            hiddenTitle: true,
          }),
        });

        // Wait for window to be created before adding to openWindows
        webview.once("tauri://created", () => {
          setOpenWindows((prev) => {
            if (prev.some((w) => w.label === windowLabel)) return prev;
            return [
              ...prev,
              {
                page: pageNumber,
                label: windowLabel,
                chapter,
                zoom: windowZoom,
                viewMode: windowViewMode,
              },
            ];
          });
        });

        // Listen for window destroyed (after close)
        webview.once("tauri://destroyed", () => {
          setOpenWindows((prev) => prev.filter((w) => w.label !== windowLabel));
        });

        webview.once("tauri://error", (e) => {
          console.error("Failed to create window:", e);
        });
      } catch (e) {
        console.error("Failed to open standalone window:", e);
      }
    },
    [filePath, getChapterForPage, setOpenWindows],
  );

  /**
   * Convenience function to open a standalone window
   * Always opens in single page mode with current zoom level
   */
  const openStandaloneWindow = useCallback(
    async (pageNumber: number, label?: string) => {
      await openStandaloneWindowWithState(pageNumber, zoom, "single", label);
    },
    [openStandaloneWindowWithState, zoom],
  );

  /**
   * Restore windows from session after PDF info is available
   */
  useEffect(() => {
    if (
      pendingWindowsRestoreRef.current &&
      pdfInfo &&
      filePath &&
      !isStandaloneMode
    ) {
      const windowsToRestore = pendingWindowsRestoreRef.current;
      pendingWindowsRestoreRef.current = null;
      setPendingWindowsRestore(null);
      windowsToRestore.forEach((win) => {
        openStandaloneWindowWithState(win.page, win.zoom, win.viewMode);
      });
    }
  }, [
    pdfInfo,
    filePath,
    isStandaloneMode,
    openStandaloneWindowWithState,
    setPendingWindowsRestore,
  ]);

  /**
   * Close a specific standalone window by label
   */
  const closeWindow = useCallback(async (label: string) => {
    try {
      const win = await WebviewWindow.getByLabel(label);
      if (win) {
        await win.close();
      }
    } catch (e) {
      console.warn("Failed to close window", label, e);
    }
  }, []);

  /**
   * Close all standalone windows
   */
  const closeAllWindows = useCallback(async () => {
    for (const w of openWindows) {
      try {
        const win = await WebviewWindow.getByLabel(w.label);
        if (win) {
          await win.close();
        }
      } catch (e) {
        console.warn("Failed to close window", w.label, e);
      }
    }
    setOpenWindows([]);
  }, [openWindows, setOpenWindows]);

  /**
   * Move a standalone window to a tab in the main window
   * Creates a new tab and closes the standalone window
   */
  const moveWindowToTab = useCallback(
    (label: string, page: number) => {
      // Add tab and close window
      setTabs((prev) => {
        const id = tabIdRef.current++;
        const chapter = getChapterForPage(page);
        const tabLabel = getTabLabel(page, chapter);
        const next = [...prev, { id, page, label: tabLabel }];
        setActiveTabId(id);
        return next;
      });
      closeWindow(label);
      setOpenWindows((prev) => prev.filter((w) => w.label !== label));
    },
    [
      closeWindow,
      getChapterForPage,
      setTabs,
      setActiveTabId,
      setOpenWindows,
      tabIdRef,
    ],
  );

  return {
    focusWindow,
    openStandaloneWindowWithState,
    openStandaloneWindow,
    closeWindow,
    closeAllWindows,
    moveWindowToTab,
  };
}
