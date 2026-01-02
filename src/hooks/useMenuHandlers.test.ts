import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMenuHandlers } from './useMenuHandlers';
import {
  useTauriEventListener,
  useTauriEventListeners,
} from '@/lib/eventUtils';

// Mock Tauri dialog APIs
vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: vi.fn().mockResolvedValue(true),
}));

// Mock event utilities - skip event listeners in tests
vi.mock('@/lib/eventUtils', () => ({
  useTauriEventListener: vi.fn(),
  useTauriEventListeners: vi.fn(),
}));

describe('useMenuHandlers', () => {
  const mockResetAllState = vi.fn();
  const mockLoadPdfFromPath = vi.fn().mockResolvedValue(undefined);
  const mockFilePathRef = { current: null as string | null };
  const mockHandleZoomIn = vi.fn();
  const mockHandleZoomOut = vi.fn();
  const mockHandleZoomReset = vi.fn();
  const mockHandleToggleHeader = vi.fn();
  const mockSetViewMode = vi.fn();
  const mockHandleOpenSettings = vi.fn();
  const mockGoToPage = vi.fn();
  const mockGoToPrevPage = vi.fn();
  const mockGoToNextPage = vi.fn();
  const mockGoBack = vi.fn();
  const mockGoForward = vi.fn();
  const mockAddTabFromCurrent = vi.fn();
  const mockCloseCurrentTab = vi.fn();
  const mockSelectPrevTab = vi.fn();
  const mockSelectNextTab = vi.fn();
  const mockOpenStandaloneWindow = vi.fn();
  const mockFocusSearch = vi.fn();
  const mockToggleBookmark = vi.fn();
  const mockTriggerTranslation = vi.fn();
  const mockTriggerExplanation = vi.fn();

  const getDefaultConfig = () => ({
    resetAllState: mockResetAllState,
    loadPdfFromPath: mockLoadPdfFromPath,
    filePathRef: mockFilePathRef,
    isStandaloneMode: false,
    handleZoomIn: mockHandleZoomIn,
    handleZoomOut: mockHandleZoomOut,
    handleZoomReset: mockHandleZoomReset,
    handleToggleHeader: mockHandleToggleHeader,
    setViewMode: mockSetViewMode,
    handleOpenSettings: mockHandleOpenSettings,
    goToPage: mockGoToPage,
    goToPrevPage: mockGoToPrevPage,
    goToNextPage: mockGoToNextPage,
    goBack: mockGoBack,
    goForward: mockGoForward,
    totalPages: 100,
    currentPage: 1,
    addTabFromCurrent: mockAddTabFromCurrent,
    closeCurrentTab: mockCloseCurrentTab,
    selectPrevTab: mockSelectPrevTab,
    selectNextTab: mockSelectNextTab,
    openStandaloneWindow: mockOpenStandaloneWindow,
    focusSearch: mockFocusSearch,
    toggleBookmark: mockToggleBookmark,
    triggerTranslation: mockTriggerTranslation,
    triggerExplanation: mockTriggerExplanation,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFilePathRef.current = null;
    // Clear localStorage mock
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  it('should initialize without errors', () => {
    expect(() => {
      renderHook(() => useMenuHandlers(getDefaultConfig()));
    }).not.toThrow();
  });

  it('should register event listeners on mount', () => {
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;
    const mockedListeners = useTauriEventListeners as ReturnType<typeof vi.fn>;

    renderHook(() => useMenuHandlers(getDefaultConfig()));

    // Verify event listeners were registered
    expect(mockedListener).toHaveBeenCalled();
    expect(mockedListeners).toHaveBeenCalled();
  });

  it('should handle setViewMode toggle correctly', () => {
    const mockedListeners = useTauriEventListeners as ReturnType<typeof vi.fn>;

    renderHook(() => useMenuHandlers(getDefaultConfig()));

    // Get the registered handler from useTauriEventListeners mock
    const handlers = mockedListeners.mock.calls[0][0];
    const toggleHandler = handlers.find(
      (h: { event: string }) => h.event === 'menu-toggle-two-column'
    );

    act(() => {
      toggleHandler.handler();
    });

    expect(mockSetViewMode).toHaveBeenCalled();
    // Verify the callback function behavior
    const callback = mockSetViewMode.mock.calls[0][0];
    expect(callback('single')).toBe('two-column');
    expect(callback('two-column')).toBe('single');
  });

  it('should not load PDF if already open', async () => {
    mockFilePathRef.current = '/test.pdf';
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;

    renderHook(() => useMenuHandlers(getDefaultConfig()));

    // Get the registered handler from useTauriEventListener mock
    // Find the open-recent handler (last call)
    const calls = mockedListener.mock.calls;
    const openRecentCall = calls.find(
      (call: unknown[]) => call[0] === 'menu-open-recent-selected'
    );
    if (!openRecentCall) throw new Error('Handler not found');
    const openRecentHandler = openRecentCall[1] as (path: string) => Promise<void>;

    await act(async () => {
      await openRecentHandler('/test.pdf');
    });

    expect(mockLoadPdfFromPath).not.toHaveBeenCalled();
  });

  it('should load PDF if different from current', async () => {
    mockFilePathRef.current = '/current.pdf';
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;

    renderHook(() => useMenuHandlers(getDefaultConfig()));

    const calls = mockedListener.mock.calls;
    const openRecentCall = calls.find(
      (call: unknown[]) => call[0] === 'menu-open-recent-selected'
    );
    if (!openRecentCall) throw new Error('Handler not found');
    const openRecentHandler = openRecentCall[1] as (path: string) => Promise<void>;

    await act(async () => {
      await openRecentHandler('/different.pdf');
    });

    expect(mockLoadPdfFromPath).toHaveBeenCalledWith('/different.pdf');
  });

  it('should register Go menu event listeners', () => {
    const mockedListeners = useTauriEventListeners as ReturnType<typeof vi.fn>;

    renderHook(() => useMenuHandlers(getDefaultConfig()));

    // Find the Go menu event listeners
    const goMenuCall = mockedListeners.mock.calls.find(
      (call: unknown[]) => {
        const handlers = call[0] as { event: string }[];
        return handlers.some(h => h.event === 'menu-go-first-page');
      }
    );
    expect(goMenuCall).toBeDefined();

    const handlers = goMenuCall![0] as { event: string; handler: () => void }[];
    const prevPageHandler = handlers.find(h => h.event === 'menu-go-prev-page');
    const nextPageHandler = handlers.find(h => h.event === 'menu-go-next-page');

    act(() => {
      prevPageHandler!.handler();
      nextPageHandler!.handler();
    });

    expect(mockGoToPrevPage).toHaveBeenCalled();
    expect(mockGoToNextPage).toHaveBeenCalled();
  });

  it('should register Tabs menu event listeners', () => {
    const mockedListeners = useTauriEventListeners as ReturnType<typeof vi.fn>;

    renderHook(() => useMenuHandlers(getDefaultConfig()));

    // Find the Tabs menu event listeners
    const tabsMenuCall = mockedListeners.mock.calls.find(
      (call: unknown[]) => {
        const handlers = call[0] as { event: string }[];
        return handlers.some(h => h.event === 'menu-new-tab');
      }
    );
    expect(tabsMenuCall).toBeDefined();

    const handlers = tabsMenuCall![0] as { event: string; handler: () => void }[];
    const newTabHandler = handlers.find(h => h.event === 'menu-new-tab');
    const closeTabHandler = handlers.find(h => h.event === 'menu-close-tab');

    act(() => {
      newTabHandler!.handler();
      closeTabHandler!.handler();
    });

    expect(mockAddTabFromCurrent).toHaveBeenCalled();
    expect(mockCloseCurrentTab).toHaveBeenCalled();
  });

  it('should register Tools menu event listeners', () => {
    const mockedListeners = useTauriEventListeners as ReturnType<typeof vi.fn>;

    renderHook(() => useMenuHandlers(getDefaultConfig()));

    // Find the Tools menu event listeners
    const toolsMenuCall = mockedListeners.mock.calls.find(
      (call: unknown[]) => {
        const handlers = call[0] as { event: string }[];
        return handlers.some(h => h.event === 'menu-search');
      }
    );
    expect(toolsMenuCall).toBeDefined();

    const handlers = toolsMenuCall![0] as { event: string; handler: () => void }[];
    const searchHandler = handlers.find(h => h.event === 'menu-search');
    const bookmarkHandler = handlers.find(h => h.event === 'menu-toggle-bookmark');
    const translateHandler = handlers.find(h => h.event === 'menu-translate');

    act(() => {
      searchHandler!.handler();
      bookmarkHandler!.handler();
      translateHandler!.handler();
    });

    expect(mockFocusSearch).toHaveBeenCalled();
    expect(mockToggleBookmark).toHaveBeenCalled();
    expect(mockTriggerTranslation).toHaveBeenCalled();
  });
});
