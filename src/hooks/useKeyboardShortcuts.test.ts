import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult, Tab } from "./types";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  // Mock handlers
  let mockHandlers: {
    goToPage: (page: number) => void;
    goToPrevPage: () => void;
    goToNextPage: () => void;
    goBack: () => void;
    goForward: () => void;
    handleZoomIn: () => void;
    handleZoomOut: () => void;
    handleZoomReset: () => void;
    handleSearchNextPreview: () => void;
    handleSearchPrevPreview: () => void;
    handleSearchConfirm: () => void;
    setSearchQuery: (value: string | ((prev: string) => string)) => void;
    setSearchResults: (
      value: SearchResult[] | ((prev: SearchResult[]) => SearchResult[]),
    ) => void;
    setShowSearchResults: (
      value: boolean | ((prev: boolean) => boolean),
    ) => void;
    setShowStandaloneSearch: (
      value: boolean | ((prev: boolean) => boolean),
    ) => void;
    addTabFromCurrent: () => void;
    closeCurrentTab: () => void;
    selectTab: (tabId: number) => void;
    toggleBookmark: () => void;
    openStandaloneWindow: (page: number) => void;
    toggleTwoColumn: () => void;
    toggleHeader: () => void;
    setShowHeader: (value: boolean | ((prev: boolean) => boolean)) => void;
    showHeaderTemporarily: () => void;
    triggerTranslation: () => void;
    triggerExplanation: () => void;
  };

  let mockTabs: Tab[];
  let mockSearchResults: SearchResult[];
  let mockStandaloneSearchInputRef: { current: HTMLInputElement | null };
  let mockHeaderWasHiddenBeforeSearchRef: { current: boolean };
  let mockShowHeader: boolean;

  beforeEach(() => {
    mockHandlers = {
      goToPage: vi.fn(),
      goToPrevPage: vi.fn(),
      goToNextPage: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      handleZoomIn: vi.fn(),
      handleZoomOut: vi.fn(),
      handleZoomReset: vi.fn(),
      handleSearchNextPreview: vi.fn(),
      handleSearchPrevPreview: vi.fn(),
      handleSearchConfirm: vi.fn(),
      setSearchQuery: vi.fn(),
      setSearchResults: vi.fn(),
      setShowSearchResults: vi.fn(),
      setShowStandaloneSearch: vi.fn(),
      addTabFromCurrent: vi.fn(),
      closeCurrentTab: vi.fn(),
      selectTab: vi.fn(),
      toggleBookmark: vi.fn(),
      openStandaloneWindow: vi.fn(),
      toggleTwoColumn: vi.fn(),
      toggleHeader: vi.fn(),
      setShowHeader: vi.fn(),
      showHeaderTemporarily: vi.fn(),
      triggerTranslation: vi.fn(),
      triggerExplanation: vi.fn(),
    };

    mockTabs = [
      { id: 1, page: 1, label: "Page 1" },
      { id: 2, page: 5, label: "Page 5" },
    ];

    mockSearchResults = [
      {
        page: 3,
        matchIndex: 0,
        contextBefore: "before ",
        matchText: "test",
        contextAfter: " after",
      },
    ];

    mockStandaloneSearchInputRef = { current: null };
    mockHeaderWasHiddenBeforeSearchRef = { current: false };
    mockShowHeader = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Navigation shortcuts", () => {
    it("should handle ArrowLeft/PageUp to go to previous page", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      // Simulate ArrowLeft key press
      const event = new KeyboardEvent("keydown", { key: "ArrowLeft" });
      window.dispatchEvent(event);

      expect(mockHandlers.goToPrevPage).toHaveBeenCalledTimes(1);
    });

    it("should handle ArrowRight/PageDown to go to next page", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      window.dispatchEvent(event);

      expect(mockHandlers.goToNextPage).toHaveBeenCalledTimes(1);
    });

    it("should handle Home key to go to first page (main window only)", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "Home" });
      window.dispatchEvent(event);

      expect(mockHandlers.goToPage).toHaveBeenCalledWith(1);
    });

    it("should NOT handle Home key in standalone mode", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: true,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "Home" });
      window.dispatchEvent(event);

      expect(mockHandlers.goToPage).not.toHaveBeenCalled();
    });

    it("should handle End key to go to last page", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "End" });
      window.dispatchEvent(event);

      expect(mockHandlers.goToPage).toHaveBeenCalledWith(10);
    });
  });

  describe("Zoom shortcuts", () => {
    it("should handle Cmd/Ctrl + = for zoom in", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "=", metaKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.handleZoomIn).toHaveBeenCalledTimes(1);
    });

    it("should handle Cmd/Ctrl + - for zoom out", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "-", ctrlKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.handleZoomOut).toHaveBeenCalledTimes(1);
    });

    it("should handle Cmd/Ctrl + 0 for zoom reset", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "0", metaKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.handleZoomReset).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tab shortcuts", () => {
    it("should handle Cmd/Ctrl + T to create new tab", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "t", metaKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.addTabFromCurrent).toHaveBeenCalledTimes(1);
    });

    it("should handle Cmd/Ctrl + W to close current tab", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "w", ctrlKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.closeCurrentTab).toHaveBeenCalledTimes(1);
    });

    it("should handle Cmd/Ctrl + ] to go to next tab", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", {
        key: "]",
        metaKey: true,
      });
      window.dispatchEvent(event);

      expect(mockHandlers.selectTab).toHaveBeenCalledWith(2);
    });

    it("should wrap around when going to next tab from last tab", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 2, // Last tab
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", {
        key: "]",
        metaKey: true,
      });
      window.dispatchEvent(event);

      expect(mockHandlers.selectTab).toHaveBeenCalledWith(1); // Wrap to first
    });
  });

  describe("Search shortcuts", () => {
    it("should handle arrow up to preview previous search result", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "test",
          searchResults: mockSearchResults,
          showSearchResults: true,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "ArrowUp" });
      window.dispatchEvent(event);

      expect(mockHandlers.handleSearchPrevPreview).toHaveBeenCalledTimes(1);
    });

    it("should handle Enter to confirm search result", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "test",
          searchResults: mockSearchResults,
          showSearchResults: true,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "Enter" });
      window.dispatchEvent(event);

      expect(mockHandlers.handleSearchConfirm).toHaveBeenCalledTimes(1);
    });

    it("should handle Escape to clear search", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "test",
          searchResults: mockSearchResults,
          showSearchResults: true,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      window.dispatchEvent(event);

      expect(mockHandlers.setSearchQuery).toHaveBeenCalledWith("");
      expect(mockHandlers.setSearchResults).toHaveBeenCalledWith([]);
      expect(mockHandlers.setShowSearchResults).toHaveBeenCalledWith(false);
    });
  });

  describe("Bookmark shortcuts", () => {
    it("should handle Cmd/Ctrl + B to toggle bookmark", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "b", metaKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.toggleBookmark).toHaveBeenCalledTimes(1);
    });
  });

  describe("History shortcuts", () => {
    it("should handle Ctrl + , to go back in history", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: ",", ctrlKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.goBack).toHaveBeenCalledTimes(1);
    });

    it("should handle Ctrl + . to go forward in history", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: ".", ctrlKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.goForward).toHaveBeenCalledTimes(1);
    });
  });

  describe("Window shortcuts", () => {
    it("should handle Cmd/Ctrl + N to open standalone window", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "n", metaKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.openStandaloneWindow).toHaveBeenCalledWith(5);
    });

    it("should NOT open standalone window in standalone mode", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 5,
          totalPages: 10,
          ...mockHandlers,
          isStandaloneMode: true,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "n", ctrlKey: true });
      window.dispatchEvent(event);

      expect(mockHandlers.openStandaloneWindow).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should not handle shortcuts when totalPages is 0", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          currentPage: 0,
          totalPages: 0,
          ...mockHandlers,
          isStandaloneMode: false,
          searchQuery: "",
          searchResults: [],
          showSearchResults: false,
          standaloneSearchInputRef: mockStandaloneSearchInputRef,
          tabs: mockTabs,
          activeTabId: 1,
          showHeader: mockShowHeader,
          headerWasHiddenBeforeSearchRef: mockHeaderWasHiddenBeforeSearchRef,
        }),
      );

      const event = new KeyboardEvent("keydown", { key: "ArrowRight" });
      window.dispatchEvent(event);

      expect(mockHandlers.goToNextPage).not.toHaveBeenCalled();
    });
  });
});
