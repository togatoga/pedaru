import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveSessionState } from "@/lib/database";
import { useSessionPersistence } from "./useSessionPersistence";

// Mock database module
vi.mock("@/lib/database", () => ({
  saveSessionState: vi.fn().mockResolvedValue(undefined),
}));

describe("useSessionPersistence", () => {
  const mockSaveSessionState = saveSessionState as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSaveSessionState.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    filePath: "/path/to/file.pdf",
    isStandaloneMode: false,
    currentPage: 5,
    zoom: 1.0,
    viewMode: "single" as const,
    tabs: [{ id: 1, page: 1, label: "Page 1" }],
    activeTabId: 1,
    openWindows: [],
    bookmarks: [{ page: 3, label: "Bookmark", createdAt: 1000 }],
    pageHistory: [{ page: 1, timestamp: "1000" }],
    historyIndex: 0,
    saveTimeoutRef: { current: null },
    isRestoringSessionRef: { current: false },
  };

  it("should not save when filePath is null", () => {
    renderHook(() =>
      useSessionPersistence(
        null,
        defaultProps.isStandaloneMode,
        defaultProps.currentPage,
        defaultProps.zoom,
        defaultProps.viewMode,
        defaultProps.tabs,
        defaultProps.activeTabId,
        defaultProps.openWindows,
        defaultProps.bookmarks,
        defaultProps.pageHistory,
        defaultProps.historyIndex,
        defaultProps.saveTimeoutRef,
        defaultProps.isRestoringSessionRef,
      ),
    );

    vi.advanceTimersByTime(500);
    expect(mockSaveSessionState).not.toHaveBeenCalled();
  });

  it("should not save in standalone mode", () => {
    renderHook(() =>
      useSessionPersistence(
        defaultProps.filePath,
        true, // standalone mode
        defaultProps.currentPage,
        defaultProps.zoom,
        defaultProps.viewMode,
        defaultProps.tabs,
        defaultProps.activeTabId,
        defaultProps.openWindows,
        defaultProps.bookmarks,
        defaultProps.pageHistory,
        defaultProps.historyIndex,
        defaultProps.saveTimeoutRef,
        defaultProps.isRestoringSessionRef,
      ),
    );

    vi.advanceTimersByTime(500);
    expect(mockSaveSessionState).not.toHaveBeenCalled();
  });

  it("should not save during session restoration", () => {
    const isRestoringRef = { current: true };

    renderHook(() =>
      useSessionPersistence(
        defaultProps.filePath,
        defaultProps.isStandaloneMode,
        defaultProps.currentPage,
        defaultProps.zoom,
        defaultProps.viewMode,
        defaultProps.tabs,
        defaultProps.activeTabId,
        defaultProps.openWindows,
        defaultProps.bookmarks,
        defaultProps.pageHistory,
        defaultProps.historyIndex,
        defaultProps.saveTimeoutRef,
        isRestoringRef,
      ),
    );

    vi.advanceTimersByTime(500);
    expect(mockSaveSessionState).not.toHaveBeenCalled();
  });

  it("should save session after 500ms debounce", () => {
    renderHook(() =>
      useSessionPersistence(
        defaultProps.filePath,
        defaultProps.isStandaloneMode,
        defaultProps.currentPage,
        defaultProps.zoom,
        defaultProps.viewMode,
        defaultProps.tabs,
        defaultProps.activeTabId,
        defaultProps.openWindows,
        defaultProps.bookmarks,
        defaultProps.pageHistory,
        defaultProps.historyIndex,
        defaultProps.saveTimeoutRef,
        defaultProps.isRestoringSessionRef,
      ),
    );

    // Should not save immediately
    expect(mockSaveSessionState).not.toHaveBeenCalled();

    // Should save after 500ms
    vi.advanceTimersByTime(500);
    expect(mockSaveSessionState).toHaveBeenCalledTimes(1);
    expect(mockSaveSessionState).toHaveBeenCalledWith(
      defaultProps.filePath,
      expect.objectContaining({
        page: defaultProps.currentPage,
        zoom: defaultProps.zoom,
        viewMode: defaultProps.viewMode,
      }),
    );
  });

  it("should debounce multiple saves", () => {
    const { rerender } = renderHook(
      ({ currentPage }) =>
        useSessionPersistence(
          defaultProps.filePath,
          defaultProps.isStandaloneMode,
          currentPage,
          defaultProps.zoom,
          defaultProps.viewMode,
          defaultProps.tabs,
          defaultProps.activeTabId,
          defaultProps.openWindows,
          defaultProps.bookmarks,
          defaultProps.pageHistory,
          defaultProps.historyIndex,
          defaultProps.saveTimeoutRef,
          defaultProps.isRestoringSessionRef,
        ),
      { initialProps: { currentPage: 1 } },
    );

    // Change page multiple times
    vi.advanceTimersByTime(100);
    rerender({ currentPage: 2 });
    vi.advanceTimersByTime(100);
    rerender({ currentPage: 3 });
    vi.advanceTimersByTime(100);
    rerender({ currentPage: 4 });

    // Should not have saved yet (debouncing)
    expect(mockSaveSessionState).not.toHaveBeenCalled();

    // Wait for debounce
    vi.advanceTimersByTime(500);

    // Should only save once with final value
    expect(mockSaveSessionState).toHaveBeenCalledTimes(1);
    expect(mockSaveSessionState).toHaveBeenCalledWith(
      defaultProps.filePath,
      expect.objectContaining({
        page: 4,
      }),
    );
  });

  it("should limit page history to 100 entries", () => {
    const longHistory = Array.from({ length: 150 }, (_, i) => ({
      page: i + 1,
      timestamp: String(i * 1000),
    }));

    renderHook(() =>
      useSessionPersistence(
        defaultProps.filePath,
        defaultProps.isStandaloneMode,
        defaultProps.currentPage,
        defaultProps.zoom,
        defaultProps.viewMode,
        defaultProps.tabs,
        defaultProps.activeTabId,
        defaultProps.openWindows,
        defaultProps.bookmarks,
        longHistory,
        149, // historyIndex at the end
        defaultProps.saveTimeoutRef,
        defaultProps.isRestoringSessionRef,
      ),
    );

    vi.advanceTimersByTime(500);

    expect(mockSaveSessionState).toHaveBeenCalledWith(
      defaultProps.filePath,
      expect.objectContaining({
        pageHistory: expect.any(Array),
      }),
    );

    const savedState = mockSaveSessionState.mock.calls[0][1];
    expect(savedState.pageHistory.length).toBe(100);
    // historyIndex should be adjusted for overflow
    expect(savedState.historyIndex).toBe(99);
  });

  it("should save correctly when there are no tabs", () => {
    renderHook(() =>
      useSessionPersistence(
        defaultProps.filePath,
        defaultProps.isStandaloneMode,
        defaultProps.currentPage,
        defaultProps.zoom,
        defaultProps.viewMode,
        [],
        null,
        defaultProps.openWindows,
        defaultProps.bookmarks,
        defaultProps.pageHistory,
        defaultProps.historyIndex,
        defaultProps.saveTimeoutRef,
        defaultProps.isRestoringSessionRef,
      ),
    );

    vi.advanceTimersByTime(500);

    expect(mockSaveSessionState).toHaveBeenCalledWith(
      defaultProps.filePath,
      expect.objectContaining({
        tabs: [],
        activeTabIndex: null,
      }),
    );
  });
});
