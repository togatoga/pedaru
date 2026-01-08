import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
} from "react";
import { getTabLabel } from "@/lib/formatUtils";
import type { Bookmark } from "./types";

/**
 * Custom hook for managing bookmarks
 *
 * Handles bookmark CRUD operations and synchronization across windows
 *
 * @param bookmarks - Current bookmarks array
 * @param setBookmarks - State setter for bookmarks
 * @param currentPage - Current page number
 * @param getChapterForPage - Function to get chapter name for a page
 * @param isStandaloneMode - Whether running in standalone window mode
 * @returns Bookmark management functions and computed values
 */
export function useBookmarks(
  bookmarks: Bookmark[],
  setBookmarks: Dispatch<SetStateAction<Bookmark[]>>,
  currentPage: number,
  getChapterForPage: (page: number) => string | undefined,
  isStandaloneMode: boolean,
) {
  // Emit bookmark sync event to other windows
  const emitBookmarkSync = useCallback(
    (newBookmarks: Bookmark[]) => {
      emit("bookmark-sync", {
        bookmarks: newBookmarks,
        sourceLabel: isStandaloneMode
          ? getCurrentWebviewWindow().label
          : "main",
      }).catch(console.warn);
    },
    [isStandaloneMode],
  );

  // Toggle bookmark for current page
  const toggleBookmark = useCallback(() => {
    const existingIndex = bookmarks.findIndex((b) => b.page === currentPage);
    let newBookmarks: Bookmark[];
    if (existingIndex >= 0) {
      // Remove bookmark
      newBookmarks = bookmarks.filter((b) => b.page !== currentPage);
    } else {
      // Add bookmark
      const chapter = getChapterForPage(currentPage);
      const label = getTabLabel(currentPage, chapter);
      newBookmarks = [
        ...bookmarks,
        { page: currentPage, label, createdAt: Date.now() },
      ];
    }
    setBookmarks(newBookmarks);
    emitBookmarkSync(newBookmarks);
  }, [
    currentPage,
    bookmarks,
    getChapterForPage,
    emitBookmarkSync,
    setBookmarks,
  ]);

  // Remove a specific bookmark
  const removeBookmark = useCallback(
    (page: number) => {
      const newBookmarks = bookmarks.filter((b) => b.page !== page);
      setBookmarks(newBookmarks);
      emitBookmarkSync(newBookmarks);
    },
    [bookmarks, emitBookmarkSync, setBookmarks],
  );

  // Clear all bookmarks
  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
    emitBookmarkSync([]);
  }, [emitBookmarkSync, setBookmarks]);

  // Check if current page is bookmarked
  const isCurrentPageBookmarked = useMemo(
    () => bookmarks.some((b) => b.page === currentPage),
    [bookmarks, currentPage],
  );

  return {
    toggleBookmark,
    removeBookmark,
    clearBookmarks,
    isCurrentPageBookmarked,
  };
}
