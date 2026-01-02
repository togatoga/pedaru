import { useEffect, Dispatch, SetStateAction } from 'react';
import type { Tab, SearchResult } from './types';

/**
 * Custom hook for managing keyboard shortcuts
 *
 * Handles all keyboard shortcuts for the PDF viewer including:
 * - Navigation (arrows, page up/down, home/end)
 * - Zoom (Cmd/Ctrl + +/-/0)
 * - Tabs (Cmd/Ctrl + T/W, Ctrl + [/])
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

  // View mode
  toggleTwoColumn,

  // Header toggle
  toggleHeader,
  showHeader,
  setShowHeader,
  headerWasHiddenBeforeSearchRef,
  showHeaderTemporarily,

  // Translation
  triggerTranslation,
  triggerExplanation,
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

  // View mode
  toggleTwoColumn: () => void;

  // Header toggle
  toggleHeader: () => void;
  showHeader: boolean;
  setShowHeader: Dispatch<SetStateAction<boolean>>;
  headerWasHiddenBeforeSearchRef: React.RefObject<boolean>;
  showHeaderTemporarily: () => void;

  // Translation
  triggerTranslation: () => void;
  triggerExplanation: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!totalPages) return;

      // Check if focus is on an input or textarea element
      const isInputFocused =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;

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
          // Skip page navigation if input is focused (allow text cursor movement)
          if (isInputFocused) break;
          e.preventDefault();
          goToPrevPage();
          break;
        case 'ArrowRight':
          // Skip page navigation if input is focused (allow text cursor movement)
          if (isInputFocused) break;
          e.preventDefault();
          goToNextPage();
          break;
        case 'PageUp':
          e.preventDefault();
          goToPrevPage();
          break;
        case 'PageDown':
          e.preventDefault();
          goToNextPage();
          break;
        case 'Home':
          // Skip page navigation if input is focused (allow cursor to move to start)
          if (!isStandaloneMode && !isInputFocused) {
            e.preventDefault();
            goToPage(1);
          }
          break;
        case 'End':
          // Skip page navigation if input is focused (allow cursor to move to end)
          if (!isStandaloneMode && !isInputFocused) {
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
            showHeaderTemporarily();
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
        case 'h':
        case 'H':
          // Cmd/Ctrl+Shift+H - toggle header visibility (main window only)
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && !isStandaloneMode) {
            e.preventDefault();
            toggleHeader();
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
              // Cmd/Ctrl+F - search
              // If header is hidden, show it and remember the state
              if (!showHeader) {
                headerWasHiddenBeforeSearchRef.current = true;
                setShowHeader(true);
              }
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
            showHeaderTemporarily();
          }
          break;
        case 'F4':
          if (e.ctrlKey) {
            e.preventDefault();
            closeCurrentTab();
            showHeaderTemporarily();
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
            // If header was hidden before search, restore that state
            if (headerWasHiddenBeforeSearchRef.current) {
              setShowHeader(false);
              headerWasHiddenBeforeSearchRef.current = false;
            }
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
          // Cmd/Ctrl+[ - go to previous tab
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey && tabs.length > 1) {
            e.preventDefault();
            const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
            if (currentIndex > 0) {
              selectTab(tabs[currentIndex - 1].id);
            } else {
              // Wrap to last tab
              selectTab(tabs[tabs.length - 1].id);
            }
            showHeaderTemporarily();
          }
          break;
        case ']':
          // Cmd/Ctrl+] - go to next tab
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey && tabs.length > 1) {
            e.preventDefault();
            const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
            if (currentIndex < tabs.length - 1) {
              selectTab(tabs[currentIndex + 1].id);
            } else {
              // Wrap to first tab
              selectTab(tabs[0].id);
            }
            showHeaderTemporarily();
          }
          break;
        case '\\':
          // Cmd/Ctrl+\ - toggle two-column view mode (main window only)
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !isStandaloneMode) {
            e.preventDefault();
            toggleTwoColumn();
          }
          break;
        case 'a':
        case 'A':
          // Cmd/Ctrl+A - select all text in PDF viewer only (skip if input is focused)
          if ((e.metaKey || e.ctrlKey) && !isInputFocused) {
            e.preventDefault();
            const pdfContainer = document.getElementById('pdf-viewer-container');
            if (pdfContainer) {
              const selection = window.getSelection();
              if (selection) {
                selection.removeAllRanges();
                const range = document.createRange();
                range.selectNodeContents(pdfContainer);
                selection.addRange(range);
              }
            }
          }
          break;
        case 'j':
        case 'J':
          // Cmd/Ctrl+J - translate selected text
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            triggerTranslation();
          }
          break;
        case 'e':
        case 'E':
          // Cmd/Ctrl+E - translate and explain selected text (skip if input is focused)
          if ((e.metaKey || e.ctrlKey) && !isInputFocused) {
            e.preventDefault();
            triggerExplanation();
          }
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          // Cmd/Ctrl+1-9 - switch to tab by number (main window only)
          if ((e.metaKey || e.ctrlKey) && !isStandaloneMode && tabs.length > 0) {
            e.preventDefault();
            const tabIndex = parseInt(e.key) - 1;
            // Cmd/Ctrl+9 goes to last tab if there are more than 9 tabs
            if (e.key === '9' && tabs.length > 9) {
              selectTab(tabs[tabs.length - 1].id);
              showHeaderTemporarily();
            } else if (tabIndex < tabs.length) {
              selectTab(tabs[tabIndex].id);
              showHeaderTemporarily();
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
    toggleTwoColumn,
    goBack,
    goForward,
    toggleHeader,
    showHeader,
    setShowHeader,
    showHeaderTemporarily,
    triggerTranslation,
    triggerExplanation,
  ]);
}
