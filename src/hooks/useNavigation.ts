import { useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getChapterForPage as getChapter } from '@/lib/pdfUtils';
import { getTabLabel, getWindowTitle } from '@/lib/formatUtils';
import type { HistoryEntry, Tab, ViewMode, PdfInfo } from './types';

/**
 * Custom hook for page navigation and history management
 *
 * Handles page navigation, history tracking, and integration with tabs
 *
 * @param currentPage - Current page number
 * @param setCurrentPage - State setter for current page
 * @param totalPages - Total number of pages
 * @param viewMode - Current view mode (single/two-column)
 * @param pageHistory - Navigation history array
 * @param setPageHistory - State setter for page history
 * @param historyIndex - Current position in history
 * @param setHistoryIndex - State setter for history index
 * @param isStandaloneMode - Whether running in standalone window
 * @param tabs - Array of open tabs
 * @param setTabs - State setter for tabs
 * @param activeTabId - ID of active tab
 * @param pdfInfo - PDF metadata (for chapter lookup)
 * @returns Navigation functions and computed values
 */
export function useNavigation(
  currentPage: number,
  setCurrentPage: Dispatch<SetStateAction<number>>,
  totalPages: number,
  viewMode: ViewMode,
  pageHistory: HistoryEntry[],
  setPageHistory: Dispatch<SetStateAction<HistoryEntry[]>>,
  historyIndex: number,
  setHistoryIndex: Dispatch<SetStateAction<number>>,
  isStandaloneMode: boolean,
  tabs: Tab[],
  setTabs: Dispatch<SetStateAction<Tab[]>>,
  activeTabId: number | null,
  pdfInfo: PdfInfo | null
) {
  // Helper to get chapter for a page
  const getChapterForPage = useCallback(
    (page: number) => getChapter(pdfInfo, page),
    [pdfInfo]
  );

  /**
   * Helper to update the active tab's page and label
   */
  const updateActiveTabLabel = useCallback(
    (page: number) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id === activeTabId) {
            const chapter = getChapterForPage(page);
            const label = getTabLabel(page, chapter);
            return { ...tab, page, label };
          }
          return tab;
        })
      );
    },
    [activeTabId, getChapterForPage, setTabs]
  );

  /**
   * Navigate to a page without updating the active tab
   * Useful for tab switching to avoid circular updates
   */
  const navigateToPageWithoutTabUpdate = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);
        // Update window title in standalone mode
        if (isStandaloneMode) {
          const title = `Page ${page}`;
          document.title = title;
          getCurrentWebviewWindow().setTitle(title).catch(console.warn);
        }

        // Push into history when user-driven navigation occurs
        setPageHistory((prev) => {
          // Remove duplicate pages from history
          const filtered = prev.slice(0, historyIndex + 1).filter((entry) => entry.page !== page);
          filtered.push({ page, timestamp: Math.floor(Date.now() / 1000).toString() });
          if (filtered.length > 100) {
            const overflow = filtered.length - 100;
            return filtered.slice(overflow);
          }
          return filtered;
        });
        setHistoryIndex((prev) => {
          // Remove duplicate pages and add new one
          const filtered = pageHistory.slice(0, prev + 1).filter((entry) => entry.page !== page);
          return Math.min(filtered.length, 99);
        });
      }
    },
    [
      totalPages,
      historyIndex,
      isStandaloneMode,
      pageHistory,
      setCurrentPage,
      setPageHistory,
      setHistoryIndex,
    ]
  );

  /**
   * Navigate to a specific page without adding to history
   * Used for previewing search results
   */
  const goToPageWithoutHistory = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);

        // If in standalone mode, update window title and emit event to main window
        if (isStandaloneMode) {
          const win = getCurrentWebviewWindow();
          // Update native window title
          const chapter = getChapterForPage(page);
          const title = getWindowTitle(page, chapter);

          // Update both document.title and native window title
          document.title = title;
          win.setTitle(title).catch(console.warn);

          emit('window-page-changed', {
            label: win.label,
            page,
          }).catch(console.warn);
        }

        // Update active tab's page and label to match current page
        updateActiveTabLabel(page);
      }
    },
    [
      totalPages,
      isStandaloneMode,
      getChapterForPage,
      updateActiveTabLabel,
      setCurrentPage,
    ]
  );

  /**
   * Navigate to a specific page
   * Updates tabs, history, and emits events for standalone windows
   */
  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);

        // If in standalone mode, update window title and emit event to main window
        if (isStandaloneMode) {
          const win = getCurrentWebviewWindow();
          // Update native window title
          const chapter = getChapterForPage(page);
          const title = getWindowTitle(page, chapter);

          // Update both document.title and native window title
          document.title = title;
          win.setTitle(title).catch(console.warn);

          emit('window-page-changed', {
            label: win.label,
            page,
          }).catch(console.warn);
        }

        // Update active tab's page and label to match current page
        updateActiveTabLabel(page);

        // Push into history when user-driven navigation occurs
        setPageHistory((prev) => {
          // Remove duplicate pages from history
          const filtered = prev.slice(0, historyIndex + 1).filter((entry) => entry.page !== page);
          filtered.push({ page, timestamp: Math.floor(Date.now() / 1000).toString() });
          // Cap history to 100 entries
          if (filtered.length > 100) {
            const overflow = filtered.length - 100;
            return filtered.slice(overflow);
          }
          return filtered;
        });
        setHistoryIndex((prev) => {
          // Remove duplicate pages and add new one
          const filtered = pageHistory.slice(0, prev + 1).filter((entry) => entry.page !== page);
          return Math.min(filtered.length, 99);
        });
      }
    },
    [
      totalPages,
      historyIndex,
      isStandaloneMode,
      getChapterForPage,
      updateActiveTabLabel,
      pageHistory,
      setCurrentPage,
      setPageHistory,
      setHistoryIndex,
    ]
  );

  /**
   * Navigate to previous page
   * Respects view mode (2 pages in two-column mode)
   */
  const goToPrevPage = useCallback(() => {
    const step = viewMode === 'two-column' ? 2 : 1;
    goToPage(currentPage - step);
  }, [currentPage, viewMode, goToPage]);

  /**
   * Navigate to next page
   * Respects view mode (2 pages in two-column mode)
   */
  const goToNextPage = useCallback(() => {
    const step = viewMode === 'two-column' ? 2 : 1;
    goToPage(currentPage + step);
  }, [currentPage, viewMode, goToPage]);

  // History navigation helpers
  // Ensure historyIndex is within bounds of pageHistory
  const effectiveHistoryIndex = Math.min(historyIndex, pageHistory.length - 1);
  const canGoBack = effectiveHistoryIndex > 0 && pageHistory.length > 0;
  const canGoForward = effectiveHistoryIndex >= 0 && effectiveHistoryIndex < pageHistory.length - 1;

  /**
   * Navigate back in history
   */
  const goBack = useCallback(() => {
    // Ensure index is within bounds
    const currentIdx = Math.min(historyIndex, pageHistory.length - 1);
    if (currentIdx > 0 && pageHistory.length > 0) {
      const idx = currentIdx - 1;
      const entry = pageHistory[idx];
      if (!entry) return;
      setHistoryIndex(idx);
      const page = entry.page;
      setCurrentPage(page);
      // Update active tab's page and label
      updateActiveTabLabel(page);
      // Update window title in standalone mode
      if (isStandaloneMode) {
        const chapter = getChapterForPage(page);
        const title = getWindowTitle(page, chapter);
        document.title = title;
        getCurrentWebviewWindow().setTitle(title).catch(console.warn);
      }
    }
  }, [
    historyIndex,
    pageHistory,
    isStandaloneMode,
    getChapterForPage,
    updateActiveTabLabel,
    setHistoryIndex,
    setCurrentPage,
  ]);

  /**
   * Navigate forward in history
   */
  const goForward = useCallback(() => {
    // Ensure index is within bounds
    const currentIdx = Math.min(historyIndex, pageHistory.length - 1);
    if (currentIdx >= 0 && currentIdx < pageHistory.length - 1) {
      const idx = currentIdx + 1;
      const entry = pageHistory[idx];
      if (!entry) return;
      setHistoryIndex(idx);
      const page = entry.page;
      setCurrentPage(page);
      // Update active tab's page and label
      updateActiveTabLabel(page);
      // Update window title in standalone mode
      if (isStandaloneMode) {
        const chapter = getChapterForPage(page);
        const title = getWindowTitle(page, chapter);
        document.title = title;
        getCurrentWebviewWindow().setTitle(title).catch(console.warn);
      }
    }
  }, [
    historyIndex,
    pageHistory,
    isStandaloneMode,
    getChapterForPage,
    updateActiveTabLabel,
    setHistoryIndex,
    setCurrentPage,
  ]);

  return {
    navigateToPageWithoutTabUpdate,
    goToPage,
    goToPageWithoutHistory,
    goToPrevPage,
    goToNextPage,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    getChapterForPage,
  };
}
