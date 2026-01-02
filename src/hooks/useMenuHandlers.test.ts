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
      renderHook(() =>
        useMenuHandlers(
          mockResetAllState,
          mockLoadPdfFromPath,
          mockFilePathRef,
          false,
          mockHandleZoomIn,
          mockHandleZoomOut,
          mockHandleZoomReset,
          mockHandleToggleHeader,
          mockSetViewMode,
          mockHandleOpenSettings
        )
      );
    }).not.toThrow();
  });

  it('should register event listeners on mount', () => {
    const mockedListener = useTauriEventListener as ReturnType<typeof vi.fn>;
    const mockedListeners = useTauriEventListeners as ReturnType<typeof vi.fn>;

    renderHook(() =>
      useMenuHandlers(
        mockResetAllState,
        mockLoadPdfFromPath,
        mockFilePathRef,
        false,
        mockHandleZoomIn,
        mockHandleZoomOut,
        mockHandleZoomReset,
        mockHandleToggleHeader,
        mockSetViewMode,
        mockHandleOpenSettings
      )
    );

    // Verify event listeners were registered
    expect(mockedListener).toHaveBeenCalled();
    expect(mockedListeners).toHaveBeenCalled();
  });

  it('should handle setViewMode toggle correctly', () => {
    const mockedListeners = useTauriEventListeners as ReturnType<typeof vi.fn>;

    renderHook(() =>
      useMenuHandlers(
        mockResetAllState,
        mockLoadPdfFromPath,
        mockFilePathRef,
        false,
        mockHandleZoomIn,
        mockHandleZoomOut,
        mockHandleZoomReset,
        mockHandleToggleHeader,
        mockSetViewMode,
        mockHandleOpenSettings
      )
    );

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

    renderHook(() =>
      useMenuHandlers(
        mockResetAllState,
        mockLoadPdfFromPath,
        mockFilePathRef,
        false,
        mockHandleZoomIn,
        mockHandleZoomOut,
        mockHandleZoomReset,
        mockHandleToggleHeader,
        mockSetViewMode,
        mockHandleOpenSettings
      )
    );

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

    renderHook(() =>
      useMenuHandlers(
        mockResetAllState,
        mockLoadPdfFromPath,
        mockFilePathRef,
        false,
        mockHandleZoomIn,
        mockHandleZoomOut,
        mockHandleZoomReset,
        mockHandleToggleHeader,
        mockSetViewMode,
        mockHandleOpenSettings
      )
    );

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
});
