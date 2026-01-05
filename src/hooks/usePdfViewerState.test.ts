import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePdfViewerState } from "./usePdfViewerState";

describe("usePdfViewerState", () => {
  describe("initial state", () => {
    it("should initialize with correct default values for pdfFile state", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.pdfFile.fileData).toBeNull();
      expect(result.current.pdfFile.fileName).toBeNull();
      expect(result.current.pdfFile.filePath).toBeNull();
      expect(result.current.pdfFile.pdfInfo).toBeNull();
    });

    it("should initialize with correct default values for viewer state", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.viewer.currentPage).toBe(1);
      expect(result.current.viewer.totalPages).toBe(0);
      expect(result.current.viewer.zoom).toBe(1.0);
      expect(result.current.viewer.viewMode).toBe("single");
      expect(result.current.viewer.isLoading).toBe(false);
      expect(result.current.viewer.isStandaloneMode).toBe(false);
    });

    it("should initialize with correct default values for UI state", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.ui.isTocOpen).toBe(false);
      expect(result.current.ui.showHistory).toBe(false);
      expect(result.current.ui.showBookmarks).toBe(false);
      expect(result.current.ui.showWindows).toBe(false);
      expect(result.current.ui.showHeader).toBe(true);
      expect(result.current.ui.showSearchResults).toBe(false);
      expect(result.current.ui.showStandaloneSearch).toBe(false);
      expect(result.current.ui.sidebarWidth).toBe(320);
    });

    it("should initialize with correct default values for search state", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.search.query).toBe("");
      expect(result.current.search.results).toEqual([]);
      expect(result.current.search.currentIndex).toBe(0);
      expect(result.current.search.isSearching).toBe(false);
    });

    it("should initialize with correct default values for history state", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.history.pageHistory).toEqual([]);
      expect(result.current.history.historyIndex).toBe(-1);
    });

    it("should initialize with correct default values for tab/window state", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.tabWindow.tabs).toEqual([]);
      expect(result.current.tabWindow.activeTabId).toBeNull();
      expect(result.current.tabWindow.openWindows).toEqual([]);
    });

    it("should initialize bookmarks as empty array", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.bookmarks).toEqual([]);
    });
  });

  describe("setters", () => {
    it("should update pdfFile state through setters", () => {
      const { result } = renderHook(() => usePdfViewerState());

      act(() => {
        result.current.pdfFileSetters.setFileName("test.pdf");
        result.current.pdfFileSetters.setFilePath("/path/to/test.pdf");
      });

      expect(result.current.pdfFile.fileName).toBe("test.pdf");
      expect(result.current.pdfFile.filePath).toBe("/path/to/test.pdf");
    });

    it("should update viewer state through setters", () => {
      const { result } = renderHook(() => usePdfViewerState());

      act(() => {
        result.current.viewerSetters.setCurrentPage(5);
        result.current.viewerSetters.setTotalPages(100);
        result.current.viewerSetters.setZoom(1.5);
        result.current.viewerSetters.setViewMode("two-column");
      });

      expect(result.current.viewer.currentPage).toBe(5);
      expect(result.current.viewer.totalPages).toBe(100);
      expect(result.current.viewer.zoom).toBe(1.5);
      expect(result.current.viewer.viewMode).toBe("two-column");
    });

    it("should update UI state through setters", () => {
      const { result } = renderHook(() => usePdfViewerState());

      act(() => {
        result.current.uiSetters.setIsTocOpen(true);
        result.current.uiSetters.setShowBookmarks(true);
        result.current.uiSetters.setShowHeader(false);
      });

      expect(result.current.ui.isTocOpen).toBe(true);
      expect(result.current.ui.showBookmarks).toBe(true);
      expect(result.current.ui.showHeader).toBe(false);
    });

    it("should update search state through setters", () => {
      const { result } = renderHook(() => usePdfViewerState());

      act(() => {
        result.current.searchSetters.setSearchQuery("test query");
        result.current.searchSetters.setIsSearching(true);
      });

      expect(result.current.search.query).toBe("test query");
      expect(result.current.search.isSearching).toBe(true);
    });

    it("should update bookmarks through setter", () => {
      const { result } = renderHook(() => usePdfViewerState());

      const bookmark = { page: 10, label: "Test", createdAt: Date.now() };

      act(() => {
        result.current.setBookmarks([bookmark]);
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0].page).toBe(10);
    });
  });

  describe("resetAllState", () => {
    it("should reset all state to default values", () => {
      const { result } = renderHook(() => usePdfViewerState());

      // Set some state
      act(() => {
        result.current.pdfFileSetters.setFileName("test.pdf");
        result.current.viewerSetters.setCurrentPage(10);
        result.current.viewerSetters.setZoom(2.0);
        result.current.searchSetters.setSearchQuery("search");
        result.current.setBookmarks([
          { page: 5, label: "Test", createdAt: Date.now() },
        ]);
        result.current.uiSetters.setIsTocOpen(true);
      });

      // Reset
      act(() => {
        result.current.resetAllState();
      });

      // Verify reset
      expect(result.current.pdfFile.fileName).toBeNull();
      expect(result.current.viewer.currentPage).toBe(1);
      expect(result.current.viewer.zoom).toBe(1.0);
      expect(result.current.search.query).toBe("");
      expect(result.current.bookmarks).toEqual([]);
      expect(result.current.ui.isTocOpen).toBe(false);
    });

    it("should reset viewMode when resetViewMode option is true", () => {
      const { result } = renderHook(() => usePdfViewerState());

      act(() => {
        result.current.viewerSetters.setViewMode("two-column");
      });

      expect(result.current.viewer.viewMode).toBe("two-column");

      act(() => {
        result.current.resetAllState({ resetViewMode: true });
      });

      expect(result.current.viewer.viewMode).toBe("single");
    });

    it("should NOT reset viewMode when resetViewMode option is not set", () => {
      const { result } = renderHook(() => usePdfViewerState());

      act(() => {
        result.current.viewerSetters.setViewMode("two-column");
      });

      act(() => {
        result.current.resetAllState();
      });

      // viewMode should remain unchanged when resetViewMode is not true
      expect(result.current.viewer.viewMode).toBe("two-column");
    });
  });

  describe("refs", () => {
    it("should provide all required refs", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.refs.filePathRef).toBeDefined();
      expect(result.current.refs.tabIdRef).toBeDefined();
      expect(result.current.refs.headerWasHiddenBeforeSearchRef).toBeDefined();
      expect(result.current.refs.tempShowHeaderRef).toBeDefined();
      expect(result.current.refs.headerTimerRef).toBeDefined();
      expect(result.current.refs.standaloneSearchInputRef).toBeDefined();
      expect(result.current.refs.pdfDocRef).toBeDefined();
      expect(result.current.refs.saveTimeoutRef).toBeDefined();
      expect(result.current.refs.isRestoringSessionRef).toBeDefined();
    });

    it("should have correct initial ref values", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.refs.filePathRef.current).toBeNull();
      expect(result.current.refs.tabIdRef.current).toBe(1);
      expect(result.current.refs.headerWasHiddenBeforeSearchRef.current).toBe(
        false,
      );
      expect(result.current.refs.tempShowHeaderRef.current).toBe(false);
      expect(result.current.refs.isRestoringSessionRef.current).toBe(false);
    });

    it("should allow updating ref values", () => {
      const { result } = renderHook(() => usePdfViewerState());

      act(() => {
        result.current.refs.filePathRef.current = "/test/path.pdf";
        result.current.refs.tabIdRef.current = 5;
      });

      expect(result.current.refs.filePathRef.current).toBe("/test/path.pdf");
      expect(result.current.refs.tabIdRef.current).toBe(5);
    });
  });

  describe("pending restore state", () => {
    it("should initialize pending restore states as null", () => {
      const { result } = renderHook(() => usePdfViewerState());

      expect(result.current.pendingRestore.pendingTabsRestore).toBeNull();
      expect(result.current.pendingRestore.pendingActiveTabIndex).toBeNull();
      expect(result.current.pendingRestore.pendingWindowsRestore).toBeNull();
    });

    it("should update pending restore states through setters", () => {
      const { result } = renderHook(() => usePdfViewerState());

      const tabState = [{ page: 1, label: "Tab 1" }];

      act(() => {
        result.current.pendingRestoreSetters.setPendingTabsRestore(tabState);
        result.current.pendingRestoreSetters.setPendingActiveTabIndex(0);
      });

      expect(result.current.pendingRestore.pendingTabsRestore).toEqual(
        tabState,
      );
      expect(result.current.pendingRestore.pendingActiveTabIndex).toBe(0);
    });
  });
});
