import { emit } from "@tauri-apps/api/event";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useEffect,
} from "react";
import { useTauriEventListener } from "@/lib/eventUtils";
import { getTabLabel, getWindowTitle } from "@/lib/formatUtils";
import type { Bookmark, OpenWindow, Tab, ViewMode } from "./types";

/**
 * Custom hook for handling multi-window synchronization
 *
 * Manages event listeners and handlers for coordinating state between
 * main window and standalone windows (page changes, zoom, bookmarks, etc.)
 *
 * @param isStandaloneMode - Whether running in standalone window mode
 * @param zoom - Current zoom level
 * @param viewMode - Current view mode
 * @param getChapterForPage - Function to get chapter name for a page
 * @param setOpenWindows - Setter for open windows list
 * @param setBookmarks - Setter for bookmarks
 * @param setTabs - Setter for tabs
 * @param setActiveTabId - Setter for active tab ID
 * @param setCurrentPage - Setter for current page
 * @param tabIdRef - Ref for generating unique tab IDs
 */
export function useWindowSync(
  isStandaloneMode: boolean,
  zoom: number,
  viewMode: ViewMode,
  getChapterForPage: (page: number) => string | undefined,
  setOpenWindows: Dispatch<SetStateAction<OpenWindow[]>>,
  setBookmarks: Dispatch<SetStateAction<Bookmark[]>>,
  setTabs: Dispatch<SetStateAction<Tab[]>>,
  setActiveTabId: Dispatch<SetStateAction<number | null>>,
  setCurrentPage: Dispatch<SetStateAction<number>>,
  tabIdRef: MutableRefObject<number>,
) {
  // Handle page change events from standalone windows
  const handleWindowPageChanged = useCallback(
    (payload: { label: string; page: number }) => {
      if (isStandaloneMode) return;
      const { label, page } = payload;
      const chapter = getChapterForPage(page);
      setOpenWindows((prev) =>
        prev.map((w) => (w.label === label ? { ...w, page, chapter } : w)),
      );
      WebviewWindow.getByLabel(label).then((win) => {
        if (win) {
          win.setTitle(getWindowTitle(page, chapter)).catch(console.warn);
        }
      });
    },
    [isStandaloneMode, getChapterForPage, setOpenWindows],
  );

  // Handle state change events from standalone windows
  const handleWindowStateChanged = useCallback(
    (payload: { label: string; zoom: number; viewMode: ViewMode }) => {
      if (isStandaloneMode) return;
      const { label, zoom: winZoom, viewMode: winViewMode } = payload;
      setOpenWindows((prev) =>
        prev.map((w) =>
          w.label === label
            ? { ...w, zoom: winZoom, viewMode: winViewMode }
            : w,
        ),
      );
    },
    [isStandaloneMode, setOpenWindows],
  );

  // Handle window-to-tab conversion requests
  const handleMoveWindowToTab = useCallback(
    (payload: { label: string; page: number }) => {
      if (isStandaloneMode) return;
      const { label, page } = payload;
      setOpenWindows((prev) => prev.filter((w) => w.label !== label));
      const newId = tabIdRef.current++;
      const chapter = getChapterForPage(page);
      const tabLabel = getTabLabel(page, chapter);
      setTabs((prev) => [...prev, { id: newId, page, label: tabLabel }]);
      setActiveTabId(newId);
      setCurrentPage(page);
    },
    [
      isStandaloneMode,
      getChapterForPage,
      setOpenWindows,
      setTabs,
      setActiveTabId,
      setCurrentPage,
      tabIdRef,
    ],
  );

  // Handle bookmark sync from other windows
  const handleBookmarkSync = useCallback(
    (payload: { bookmarks: Bookmark[]; sourceLabel: string }) => {
      const myLabel = isStandaloneMode
        ? getCurrentWebviewWindow().label
        : "main";
      const { bookmarks: newBookmarks, sourceLabel } = payload;
      if (sourceLabel === myLabel) return;
      setBookmarks(newBookmarks);
    },
    [isStandaloneMode, setBookmarks],
  );

  // Listen for window events using the utility hooks
  useTauriEventListener<{ label: string; page: number }>(
    "window-page-changed",
    handleWindowPageChanged,
    [handleWindowPageChanged],
  );

  useTauriEventListener<{ label: string; zoom: number; viewMode: ViewMode }>(
    "window-state-changed",
    handleWindowStateChanged,
    [handleWindowStateChanged],
  );

  useTauriEventListener<{ label: string; page: number }>(
    "move-window-to-tab",
    handleMoveWindowToTab,
    [handleMoveWindowToTab],
  );

  useTauriEventListener<{ bookmarks: Bookmark[]; sourceLabel: string }>(
    "bookmark-sync",
    handleBookmarkSync,
    [handleBookmarkSync],
  );

  // Emit state changes from standalone windows to main window
  useEffect(() => {
    if (!isStandaloneMode) return;

    const win = getCurrentWebviewWindow();
    emit("window-state-changed", {
      label: win.label,
      zoom,
      viewMode,
    }).catch(console.warn);
  }, [isStandaloneMode, zoom, viewMode]);
}
