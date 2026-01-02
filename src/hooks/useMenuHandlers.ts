import { useCallback, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import {
  useTauriEventListener,
  useTauriEventListeners,
} from '@/lib/eventUtils';
import type { ViewMode } from './types';

interface MenuHandlersConfig {
  // State management
  resetAllState: (options?: { resetViewMode?: boolean }) => void;
  loadPdfFromPath: (path: string) => Promise<void>;
  filePathRef: MutableRefObject<string | null>;
  isStandaloneMode: boolean;
  // View controls
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleToggleHeader: () => void;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  handleOpenSettings: () => void;
  // Navigation
  goToPage: (page: number) => void;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  goBack: () => void;
  goForward: () => void;
  totalPages: number;
  currentPage: number;
  // Tabs
  addTabFromCurrent: () => void;
  closeCurrentTab: () => void;
  selectPrevTab: () => void;
  selectNextTab: () => void;
  // Window
  openStandaloneWindow: (page: number) => void;
  // Tools
  focusSearch: () => void;
  toggleBookmark: () => void;
  triggerTranslation: () => void;
  triggerExplanation: () => void;
}

/**
 * Custom hook for handling application menu events
 *
 * Manages menu-triggered actions including navigation, zoom controls,
 * tabs, windows, tools, and opening recent files
 */
export function useMenuHandlers({
  resetAllState,
  loadPdfFromPath,
  filePathRef,
  isStandaloneMode,
  handleZoomIn,
  handleZoomOut,
  handleZoomReset,
  handleToggleHeader,
  setViewMode,
  handleOpenSettings,
  goToPage,
  goToPrevPage,
  goToNextPage,
  goBack,
  goForward,
  totalPages,
  currentPage,
  addTabFromCurrent,
  closeCurrentTab,
  selectPrevTab,
  selectNextTab,
  openStandaloneWindow,
  focusSearch,
  toggleBookmark,
  triggerTranslation,
  triggerExplanation,
}: MenuHandlersConfig) {
  // Handle reset all data request from app menu
  const handleResetAllData = useCallback(async () => {
    // Show native confirmation dialog
    const confirmed = await confirm(
      'This will delete:\n\n' +
        '• All bookmarks\n' +
        '• All session history\n' +
        '• Last opened file info\n\n' +
        'This action cannot be undone.',
      {
        title: 'Initialize App?',
        kind: 'warning',
        okLabel: 'Initialize',
        cancelLabel: 'Cancel',
      }
    );

    if (confirmed) {
      // Clear all localStorage data for this app
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('pedaru_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      // Reset current state (including viewMode for full reset)
      resetAllState({ resetViewMode: true });
    }
  }, [resetAllState]);

  // Handle opening a recent file
  const handleOpenRecent = useCallback(
    async (selectedFilePath: string) => {
      try {
        if (selectedFilePath === filePathRef.current) {
          console.log('File already open, skipping reload');
          return;
        }
        await loadPdfFromPath(selectedFilePath);
      } catch (error) {
        console.error('Failed to open recent file:', error);
      }
    },
    [loadPdfFromPath, filePathRef]
  );

  // Toggle two-column mode
  const handleToggleTwoColumn = useCallback(() => {
    setViewMode((prev) => (prev === 'two-column' ? 'single' : 'two-column'));
  }, [setViewMode]);

  // Go to first page
  const handleGoFirstPage = useCallback(() => {
    goToPage(1);
  }, [goToPage]);

  // Go to last page
  const handleGoLastPage = useCallback(() => {
    goToPage(totalPages);
  }, [goToPage, totalPages]);

  // Open new standalone window with current page
  const handleNewWindow = useCallback(() => {
    openStandaloneWindow(currentPage);
  }, [openStandaloneWindow, currentPage]);

  // Listen for reset all data request from app menu (main window only)
  useTauriEventListener(
    'reset-all-data-requested',
    handleResetAllData,
    [isStandaloneMode, handleResetAllData]
  );

  // Listen for menu events from system menu bar (zoom, view mode, settings)
  useTauriEventListeners(
    [
      { event: 'menu-zoom-in', handler: handleZoomIn },
      { event: 'menu-zoom-out', handler: handleZoomOut },
      { event: 'menu-zoom-reset', handler: handleZoomReset },
      { event: 'menu-toggle-two-column', handler: handleToggleTwoColumn },
      { event: 'menu-toggle-header', handler: handleToggleHeader },
      { event: 'menu-open-settings', handler: handleOpenSettings },
    ],
    [
      handleZoomIn,
      handleZoomOut,
      handleZoomReset,
      handleToggleTwoColumn,
      handleToggleHeader,
      handleOpenSettings,
    ]
  );

  // Listen for Go menu events (navigation)
  useTauriEventListeners(
    [
      { event: 'menu-go-first-page', handler: handleGoFirstPage },
      { event: 'menu-go-last-page', handler: handleGoLastPage },
      { event: 'menu-go-prev-page', handler: goToPrevPage },
      { event: 'menu-go-next-page', handler: goToNextPage },
      { event: 'menu-go-back', handler: goBack },
      { event: 'menu-go-forward', handler: goForward },
    ],
    [handleGoFirstPage, handleGoLastPage, goToPrevPage, goToNextPage, goBack, goForward]
  );

  // Listen for Tabs menu events
  useTauriEventListeners(
    [
      { event: 'menu-new-tab', handler: addTabFromCurrent },
      { event: 'menu-close-tab', handler: closeCurrentTab },
      { event: 'menu-prev-tab', handler: selectPrevTab },
      { event: 'menu-next-tab', handler: selectNextTab },
    ],
    [addTabFromCurrent, closeCurrentTab, selectPrevTab, selectNextTab]
  );

  // Listen for Window menu events
  useTauriEventListener('menu-new-window', handleNewWindow, [handleNewWindow]);

  // Listen for Tools menu events
  useTauriEventListeners(
    [
      { event: 'menu-search', handler: focusSearch },
      { event: 'menu-toggle-bookmark', handler: toggleBookmark },
      { event: 'menu-translate', handler: triggerTranslation },
      { event: 'menu-translate-explain', handler: triggerExplanation },
    ],
    [focusSearch, toggleBookmark, triggerTranslation, triggerExplanation]
  );

  // Listen for open recent file selection (needs payload access)
  useTauriEventListener<string>(
    'menu-open-recent-selected',
    handleOpenRecent,
    [handleOpenRecent]
  );
}
