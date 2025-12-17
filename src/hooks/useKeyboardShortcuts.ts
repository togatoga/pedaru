import { useEffect, Dispatch, SetStateAction } from 'react';
import type { Tab, SearchResult } from './types';

/**
 * Custom hook for managing keyboard shortcuts
 *
 * Handles all keyboard shortcuts for the PDF viewer including:
 * - Navigation (arrows, page up/down, home/end)
 * - Zoom (Cmd/Ctrl + +/-/0)
 * - Tabs (Cmd/Ctrl + T/W, Cmd/Ctrl + Shift + [/])
 * - Windows (Cmd/Ctrl + N)
 * - Bookmarks (Cmd/Ctrl + B)
 * - Search (Cmd/Ctrl + F, arrows, enter, escape)
 * - History (Ctrl + ,/.)
 */
export function useKeyboardShortcuts({
  // Navigation
  currentPage,
  totalPages,
  goToPage,
  goToPrevPage,
  goToNextPage,
  goBack,
  goForward,

  // Zoom
  handleZoomIn,
  handleZoomOut,
  handleZoomReset,

  // Mode
  isStandaloneMode,

  // Search
  searchQuery,
  searchResults,
  handleSearchNextPreview,
  handleSearchPrevPreview,
  handleSearchConfirm,
  showSearchResults,
  setSearchQuery,
  setSearchResults,
  setShowSearchResults,
  setShowStandaloneSearch,
  standaloneSearchInputRef,

  // Tabs
  tabs,
  activeTabId,
  addTabFromCurrent,
  closeCurrentTab,
  selectTab,

  // Bookmarks
  toggleBookmark,

  // Windows
  openStandaloneWindow,
}: {
  // Navigation
  currentPage: number;
  totalPages: number;
  goToPage: (page: number) => void;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  goBack: () => void;
  goForward: () => void;

  // Zoom
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;

  // Mode
  isStandaloneMode: boolean;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  handleSearchNextPreview: () => void;
  handleSearchPrevPreview: () => void;
  handleSearchConfirm: () => void;
  showSearchResults: boolean;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSearchResults: Dispatch<SetStateAction<SearchResult[]>>;
  setShowSearchResults: Dispatch<SetStateAction<boolean>>;
  setShowStandaloneSearch: Dispatch<SetStateAction<boolean>>;
  standaloneSearchInputRef: React.RefObject<HTMLInputElement | null>;

  // Tabs
  tabs: Tab[];
  activeTabId: number | null;
  addTabFromCurrent: () => void;
  closeCurrentTab: () => void;
  selectTab: (tabId: number) => void;

  // Bookmarks
  toggleBookmark: () => void;

  // Windows
  openStandaloneWindow: (page: number) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!totalPages) return;

      switch (e.key) {
        case 'ArrowUp':
          // If search results are active, preview previous result
          if (searchQuery && searchResults.length > 0) {
            e.preventDefault();
            handleSearchPrevPreview();
          }
          break;
        case 'ArrowDown':
          // If search results are active, preview next result
          if (searchQuery && searchResults.length > 0) {
            e.preventDefault();
            handleSearchNextPreview();
          }
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          goToPrevPage();
          break;
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          goToNextPage();
          break;
        case 'Home':
          if (!isStandaloneMode) {
            e.preventDefault();
            goToPage(1);
          }
          break;
        case 'End':
          if (!isStandaloneMode) {
            e.preventDefault();
            goToPage(totalPages);
          }
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomOut();
          }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomReset();
          }
          break;
        case 't':
        case 'T':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            addTabFromCurrent();
          }
          break;
        case 'n':
        case 'N':
          if ((e.metaKey || e.ctrlKey) && !isStandaloneMode) {
            e.preventDefault();
            openStandaloneWindow(currentPage);
          }
          break;
        case 'b':
        case 'B':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            toggleBookmark();
          }
          break;
        case 'f':
        case 'F':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (isStandaloneMode) {
              // Toggle standalone search
              setShowStandaloneSearch(true);
              setTimeout(() => standaloneSearchInputRef.current?.focus(), 0);
            } else {
              // Focus search input in main window
              const searchInput = document.querySelector('input[placeholder="Search..."]') as HTMLInputElement;
              if (searchInput) {
                searchInput.focus();
                searchInput.select();
              }
              // If there's a search query, show the results panel
              if (searchQuery && searchResults.length > 0) {
                setShowSearchResults(true);
              }
            }
          }
          break;
        case 'w':
        case 'W':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            closeCurrentTab();
          }
          break;
        case 'Enter':
          // Confirm search result when search is active
          if (searchQuery && searchResults.length > 0) {
            e.preventDefault();
            handleSearchConfirm();
          }
          break;
        case 'Escape':
          // Clear search and close sidebar
          if (searchQuery || showSearchResults) {
            e.preventDefault();
            setSearchQuery('');
            setSearchResults([]);
            setShowSearchResults(false);
          }
          break;
        case ',':
          // Ctrl+, - go back in history (without updating history)
          if (e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            goBack();
          }
          break;
        case '.':
          // Ctrl+. - go forward in history (without updating history)
          if (e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            goForward();
          }
          break;
        case '[':
          // Cmd+Shift+[ - go to previous tab (like Chrome)
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && tabs.length > 1) {
            e.preventDefault();
            const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
            if (currentIndex > 0) {
              selectTab(tabs[currentIndex - 1].id);
            } else {
              // Wrap to last tab
              selectTab(tabs[tabs.length - 1].id);
            }
          }
          break;
        case ']':
          // Cmd+Shift+] - go to next tab (like Chrome)
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && tabs.length > 1) {
            e.preventDefault();
            const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
            if (currentIndex < tabs.length - 1) {
              selectTab(tabs[currentIndex + 1].id);
            } else {
              // Wrap to first tab
              selectTab(tabs[0].id);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentPage,
    totalPages,
    goToPage,
    goToPrevPage,
    goToNextPage,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    isStandaloneMode,
    searchQuery,
    searchResults,
    handleSearchNextPreview,
    handleSearchPrevPreview,
    handleSearchConfirm,
    showSearchResults,
    setSearchQuery,
    setSearchResults,
    setShowSearchResults,
    setShowStandaloneSearch,
    standaloneSearchInputRef,
    closeCurrentTab,
    addTabFromCurrent,
    toggleBookmark,
    tabs,
    activeTabId,
    selectTab,
    openStandaloneWindow,
    goBack,
    goForward,
  ]);
}
