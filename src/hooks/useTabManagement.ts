import { useCallback, useEffect, useRef, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getTabLabel } from '@/lib/formatUtils';
import type { Tab, PdfInfo, TabState } from './types';

/**
 * Custom hook for tab management in the main window
 *
 * Handles tab creation, deletion, switching, and session restoration
 *
 * @param tabs - Array of open tabs
 * @param setTabs - State setter for tabs
 * @param activeTabId - ID of currently active tab
 * @param setActiveTabId - State setter for active tab ID
 * @param currentPage - Current page number
 * @param tabIdRef - Ref to track next tab ID
 * @param getChapterForPage - Function to get chapter name for a page
 * @param navigateToPageWithoutTabUpdate - Navigation function that doesn't update tab
 * @param goToPage - Main navigation function
 * @param pdfInfo - PDF metadata
 * @param isStandaloneMode - Whether running in standalone window
 * @param pendingTabsRestore - Tabs to restore from session
 * @param setPendingTabsRestore - State setter for pending tabs restore
 * @param pendingActiveTabIndex - Active tab index to restore
 * @param setPendingActiveTabIndex - State setter for pending active tab index
 * @returns Tab management functions
 */
export function useTabManagement(
  tabs: Tab[],
  setTabs: Dispatch<SetStateAction<Tab[]>>,
  activeTabId: number | null,
  setActiveTabId: Dispatch<SetStateAction<number | null>>,
  currentPage: number,
  tabIdRef: MutableRefObject<number>,
  getChapterForPage: (page: number) => string | undefined,
  navigateToPageWithoutTabUpdate: (page: number) => void,
  goToPage: (page: number) => void,
  pdfInfo: PdfInfo | null,
  isStandaloneMode: boolean,
  pendingTabsRestore: TabState[] | null,
  setPendingTabsRestore: Dispatch<SetStateAction<TabState[] | null>>,
  pendingActiveTabIndex: number | null,
  setPendingActiveTabIndex: Dispatch<SetStateAction<number | null>>,
  onClosePdf?: () => void
) {
  // Ref to track pending tab restoration (avoids circular dependencies)
  const pendingTabsRestoreRef = useRef<{ tabs: TabState[]; activeIndex: number | null } | null>(
    null
  );

  // Update ref when pending restore states change
  useEffect(() => {
    if (pendingTabsRestore) {
      pendingTabsRestoreRef.current = { tabs: pendingTabsRestore, activeIndex: pendingActiveTabIndex };
      setPendingTabsRestore(null);
      setPendingActiveTabIndex(null);
    }
  }, [pendingTabsRestore, pendingActiveTabIndex, setPendingTabsRestore, setPendingActiveTabIndex]);

  // Track if we've created an initial tab for this PDF to avoid duplicates
  const initialTabCreatedRef = useRef<boolean>(false);

  // Reset the flag when pdfInfo changes (new PDF loaded)
  useEffect(() => {
    initialTabCreatedRef.current = false;
  }, [pdfInfo]);

  // Restore tabs after PDF info is available and getChapterForPage is defined
  // Or create initial tab if no tabs to restore
  useEffect(() => {
    if (pdfInfo && !isStandaloneMode) {
      if (pendingTabsRestoreRef.current) {
        // Restore tabs from session - clear existing tabs first to avoid duplicates
        const { tabs: tabsToRestore, activeIndex } = pendingTabsRestoreRef.current;
        pendingTabsRestoreRef.current = null;
        initialTabCreatedRef.current = true; // Mark as handled

        // Build all tabs at once to avoid multiple state updates
        const restoredTabs: Tab[] = [];
        let activeId: number | null = null;

        tabsToRestore.forEach((tab, index) => {
          const newId = tabIdRef.current++;
          const chapter = getChapterForPage(tab.page);
          const label = getTabLabel(tab.page, chapter);
          restoredTabs.push({ id: newId, page: tab.page, label });

          // Set active tab based on saved index
          if (activeIndex !== null && index === activeIndex) {
            activeId = newId;
          }
        });

        // Set all tabs at once, replacing any existing tabs
        setTabs(restoredTabs);
        if (activeId !== null) {
          setActiveTabId(activeId);
        } else if (restoredTabs.length > 0) {
          setActiveTabId(restoredTabs[0].id);
        }
      } else if (tabs.length === 0 && !pendingTabsRestore && !initialTabCreatedRef.current) {
        // No tabs to restore and no existing tabs - create initial tab
        // Only create if there's no pending restore and we haven't created one yet
        initialTabCreatedRef.current = true;
        const newId = tabIdRef.current++;
        const chapter = getChapterForPage(currentPage);
        const label = getTabLabel(currentPage, chapter);
        setTabs([{ id: newId, page: currentPage, label }]);
        setActiveTabId(newId);
      }
    }
  }, [
    pdfInfo,
    isStandaloneMode,
    getChapterForPage,
    pendingTabsRestore,
    tabs.length,
    currentPage,
    setTabs,
    setActiveTabId,
    tabIdRef,
  ]);

  /**
   * Add a new tab for the current page
   */
  const addTabFromCurrent = useCallback(() => {
    setTabs((prev) => {
      const id = tabIdRef.current++;
      const chapter = getChapterForPage(currentPage);
      const label = getTabLabel(currentPage, chapter);
      return [...prev, { id, page: currentPage, label }];
    });
    setActiveTabId(tabIdRef.current - 1);
  }, [currentPage, getChapterForPage, setTabs, setActiveTabId, tabIdRef]);

  /**
   * Add a new tab for a specific page and switch to it
   */
  const addTabForPage = useCallback(
    (pageNumber: number) => {
      const newId = tabIdRef.current++;
      const chapter = getChapterForPage(pageNumber);
      const label = getTabLabel(pageNumber, chapter);
      setTabs((prev) => [...prev, { id: newId, page: pageNumber, label }]);
      setActiveTabId(newId);
      navigateToPageWithoutTabUpdate(pageNumber);
    },
    [
      navigateToPageWithoutTabUpdate,
      getChapterForPage,
      setTabs,
      setActiveTabId,
      tabIdRef,
    ]
  );

  /**
   * Switch to a specific tab by ID
   */
  const selectTab = useCallback(
    (id: number) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      setActiveTabId(id);
      // Use navigateToPageWithoutTabUpdate to avoid overwriting the tab we're switching from
      navigateToPageWithoutTabUpdate(tab.page);
    },
    [tabs, navigateToPageWithoutTabUpdate, setActiveTabId]
  );

  /**
   * Switch to the previous tab (wraps to last if at first)
   */
  const selectPrevTab = useCallback(() => {
    if (tabs.length <= 1) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (currentIndex > 0) {
      selectTab(tabs[currentIndex - 1].id);
    } else {
      // Wrap to last tab
      selectTab(tabs[tabs.length - 1].id);
    }
  }, [tabs, activeTabId, selectTab]);

  /**
   * Switch to the next tab (wraps to first if at last)
   */
  const selectNextTab = useCallback(() => {
    if (tabs.length <= 1) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (currentIndex < tabs.length - 1) {
      selectTab(tabs[currentIndex + 1].id);
    } else {
      // Wrap to first tab
      selectTab(tabs[0].id);
    }
  }, [tabs, activeTabId, selectTab]);

  /**
   * Close the currently active tab
   * If no tabs remain, closes the PDF (returns to empty state)
   */
  const closeCurrentTab = useCallback(() => {
    console.log('[closeCurrentTab] tabs.length:', tabs.length, 'activeTabId:', activeTabId, 'onClosePdf:', !!onClosePdf);

    if (tabs.length === 0) {
      // No tabs open, close the PDF
      console.log('[closeCurrentTab] No tabs, calling onClosePdf');
      if (onClosePdf) {
        onClosePdf();
      }
      return;
    }

    // Find and close the active tab
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
    console.log('[closeCurrentTab] activeIndex:', activeIndex);

    if (activeIndex === -1) {
      // No active tab, close the PDF
      console.log('[closeCurrentTab] No active tab, calling onClosePdf');
      if (onClosePdf) {
        onClosePdf();
      }
      return;
    }

    const newTabs = tabs.filter((t) => t.id !== activeTabId);
    console.log('[closeCurrentTab] newTabs.length:', newTabs.length);
    setTabs(newTabs);

    if (newTabs.length === 0) {
      // No more tabs, close the PDF
      console.log('[closeCurrentTab] Last tab closed, calling onClosePdf');
      setActiveTabId(null);
      if (onClosePdf) {
        onClosePdf();
      }
    } else {
      // Switch to adjacent tab
      const newIndex = Math.min(activeIndex, newTabs.length - 1);
      setActiveTabId(newTabs[newIndex].id);
      goToPage(newTabs[newIndex].page);
    }
  }, [tabs, activeTabId, goToPage, setTabs, setActiveTabId, onClosePdf]);

  return {
    addTabFromCurrent,
    addTabForPage,
    selectTab,
    selectPrevTab,
    selectNextTab,
    closeCurrentTab,
  };
}
