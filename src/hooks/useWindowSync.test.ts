import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWindowSync } from "./useWindowSync";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/webviewWindow", () => {
  const mockSetTitle = vi.fn().mockResolvedValue(undefined);
  return {
    getCurrentWebviewWindow: vi.fn(() => ({
      label: "test-window",
    })),
    WebviewWindow: {
      getByLabel: vi.fn().mockResolvedValue({
        setTitle: mockSetTitle,
      }),
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));

// Mock event utilities
vi.mock("@/lib/eventUtils", () => ({
  useTauriEventListener: vi.fn(),
}));

// Mock formatUtils
vi.mock("@/lib/formatUtils", () => ({
  getTabLabel: vi.fn((page: number, chapter?: string) =>
    chapter ? `P${page}: ${chapter}` : `Page ${page}`,
  ),
  getWindowTitle: vi.fn((page: number, chapter?: string) =>
    chapter ? `${chapter} (Page ${page})` : `Page ${page}`,
  ),
}));

describe("useWindowSync", () => {
  const mockSetOpenWindows = vi.fn();
  const mockSetBookmarks = vi.fn();
  const mockSetTabs = vi.fn();
  const mockSetActiveTabId = vi.fn();
  const mockSetCurrentPage = vi.fn();
  const mockTabIdRef = { current: 100 };
  const mockGetChapterForPage = vi.fn((page: number) =>
    page === 5 ? "Chapter 1" : undefined,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockTabIdRef.current = 100;
  });

  it("should initialize without errors", () => {
    expect(() => {
      renderHook(() =>
        useWindowSync(
          false,
          1.0,
          "single",
          mockGetChapterForPage,
          mockSetOpenWindows,
          mockSetBookmarks,
          mockSetTabs,
          mockSetActiveTabId,
          mockSetCurrentPage,
          mockTabIdRef,
        ),
      );
    }).not.toThrow();
  });

  it("should register event listeners on mount", async () => {
    const { useTauriEventListener } = await import("@/lib/eventUtils");

    renderHook(() =>
      useWindowSync(
        false,
        1.0,
        "single",
        mockGetChapterForPage,
        mockSetOpenWindows,
        mockSetBookmarks,
        mockSetTabs,
        mockSetActiveTabId,
        mockSetCurrentPage,
        mockTabIdRef,
      ),
    );

    // Should register 4 event listeners
    expect(useTauriEventListener).toHaveBeenCalledTimes(4);
    expect(useTauriEventListener).toHaveBeenCalledWith(
      "window-page-changed",
      expect.any(Function),
      expect.any(Array),
    );
    expect(useTauriEventListener).toHaveBeenCalledWith(
      "window-state-changed",
      expect.any(Function),
      expect.any(Array),
    );
    expect(useTauriEventListener).toHaveBeenCalledWith(
      "move-window-to-tab",
      expect.any(Function),
      expect.any(Array),
    );
    expect(useTauriEventListener).toHaveBeenCalledWith(
      "bookmark-sync",
      expect.any(Function),
      expect.any(Array),
    );
  });

  it("should handle window page change in main window mode", async () => {
    const { useTauriEventListener } = await import("@/lib/eventUtils");
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;

    renderHook(() =>
      useWindowSync(
        false, // main window mode
        1.0,
        "single",
        mockGetChapterForPage,
        mockSetOpenWindows,
        mockSetBookmarks,
        mockSetTabs,
        mockSetActiveTabId,
        mockSetCurrentPage,
        mockTabIdRef,
      ),
    );

    // Find the page-changed handler
    const pageChangedCall = mockedListener.mock.calls.find(
      (call: unknown[]) => call[0] === "window-page-changed",
    );
    if (!pageChangedCall) throw new Error("Handler not found");
    const handler = pageChangedCall[1];

    await act(async () => {
      await handler({ label: "window-1", page: 5 });
    });

    expect(mockSetOpenWindows).toHaveBeenCalled();
  });

  it("should ignore window events in standalone mode", async () => {
    const { useTauriEventListener } = await import("@/lib/eventUtils");
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;

    renderHook(() =>
      useWindowSync(
        true, // standalone mode
        1.0,
        "single",
        mockGetChapterForPage,
        mockSetOpenWindows,
        mockSetBookmarks,
        mockSetTabs,
        mockSetActiveTabId,
        mockSetCurrentPage,
        mockTabIdRef,
      ),
    );

    // Find the page-changed handler
    const pageChangedCall = mockedListener.mock.calls.find(
      (call: unknown[]) => call[0] === "window-page-changed",
    );
    if (!pageChangedCall) throw new Error("Handler not found");
    const handler = pageChangedCall[1];

    await act(async () => {
      await handler({ label: "window-1", page: 5 });
    });

    // Should not update state in standalone mode
    expect(mockSetOpenWindows).not.toHaveBeenCalled();
  });

  it("should handle move window to tab correctly", async () => {
    const { useTauriEventListener } = await import("@/lib/eventUtils");
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;

    renderHook(() =>
      useWindowSync(
        false,
        1.0,
        "single",
        mockGetChapterForPage,
        mockSetOpenWindows,
        mockSetBookmarks,
        mockSetTabs,
        mockSetActiveTabId,
        mockSetCurrentPage,
        mockTabIdRef,
      ),
    );

    // Find the move-window-to-tab handler
    const moveCall = mockedListener.mock.calls.find(
      (call: unknown[]) => call[0] === "move-window-to-tab",
    );
    if (!moveCall) throw new Error("Handler not found");
    const handler = moveCall[1];

    await act(async () => {
      await handler({ label: "window-1", page: 5 });
    });

    // Should remove window and add tab
    expect(mockSetOpenWindows).toHaveBeenCalled();
    expect(mockSetTabs).toHaveBeenCalled();
    expect(mockSetActiveTabId).toHaveBeenCalledWith(100);
    expect(mockSetCurrentPage).toHaveBeenCalledWith(5);
    expect(mockTabIdRef.current).toBe(101); // Should increment
  });

  it("should ignore bookmark sync from self", async () => {
    const { useTauriEventListener } = await import("@/lib/eventUtils");
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;

    renderHook(() =>
      useWindowSync(
        false, // main window mode - label is 'main'
        1.0,
        "single",
        mockGetChapterForPage,
        mockSetOpenWindows,
        mockSetBookmarks,
        mockSetTabs,
        mockSetActiveTabId,
        mockSetCurrentPage,
        mockTabIdRef,
      ),
    );

    // Find the bookmark-sync handler
    const bookmarkCall = mockedListener.mock.calls.find(
      (call: unknown[]) => call[0] === "bookmark-sync",
    );
    if (!bookmarkCall) throw new Error("Handler not found");
    const handler = bookmarkCall[1];

    await act(async () => {
      await handler({
        bookmarks: [{ page: 1, label: "Test", createdAt: 1000 }],
        sourceLabel: "main", // Same as current window
      });
    });

    // Should not update bookmarks when source is self
    expect(mockSetBookmarks).not.toHaveBeenCalled();
  });

  it("should accept bookmark sync from other windows", async () => {
    const { useTauriEventListener } = await import("@/lib/eventUtils");
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;

    renderHook(() =>
      useWindowSync(
        false,
        1.0,
        "single",
        mockGetChapterForPage,
        mockSetOpenWindows,
        mockSetBookmarks,
        mockSetTabs,
        mockSetActiveTabId,
        mockSetCurrentPage,
        mockTabIdRef,
      ),
    );

    // Find the bookmark-sync handler
    const bookmarkCall = mockedListener.mock.calls.find(
      (call: unknown[]) => call[0] === "bookmark-sync",
    );
    if (!bookmarkCall) throw new Error("Handler not found");
    const handler = bookmarkCall[1];

    const newBookmarks = [{ page: 1, label: "Test", createdAt: 1000 }];
    await act(async () => {
      await handler({
        bookmarks: newBookmarks,
        sourceLabel: "window-1", // Different from current window
      });
    });

    expect(mockSetBookmarks).toHaveBeenCalledWith(newBookmarks);
  });

  it("should emit state changes in standalone mode", async () => {
    const { emit } = await import("@tauri-apps/api/event");

    renderHook(() =>
      useWindowSync(
        true, // standalone mode
        1.5,
        "two-column",
        mockGetChapterForPage,
        mockSetOpenWindows,
        mockSetBookmarks,
        mockSetTabs,
        mockSetActiveTabId,
        mockSetCurrentPage,
        mockTabIdRef,
      ),
    );

    expect(emit).toHaveBeenCalledWith("window-state-changed", {
      label: "test-window",
      zoom: 1.5,
      viewMode: "two-column",
    });
  });

  it("should not emit state changes in main window mode", async () => {
    const { emit } = await import("@tauri-apps/api/event");

    renderHook(() =>
      useWindowSync(
        false, // main window mode
        1.5,
        "two-column",
        mockGetChapterForPage,
        mockSetOpenWindows,
        mockSetBookmarks,
        mockSetTabs,
        mockSetActiveTabId,
        mockSetCurrentPage,
        mockTabIdRef,
      ),
    );

    expect(emit).not.toHaveBeenCalled();
  });
});
