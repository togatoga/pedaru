import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePdfLoader } from './usePdfLoader';
import type { PdfInfo, ViewMode, Bookmark, HistoryEntry, OpenWindow, Tab } from './types';

// Mock Tauri APIs
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

const mockGetByLabel = vi.fn();
const mockClose = vi.fn();
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: {
    getByLabel: (...args: any[]) => mockGetByLabel(...args),
  },
}));

// Mock database
const mockLoadSessionState = vi.fn();
vi.mock('@/lib/database', () => ({
  loadSessionState: (...args: any[]) => mockLoadSessionState(...args),
  saveSessionState: vi.fn(),
  getLastOpenedPath: vi.fn(),
  createDefaultState: vi.fn(),
  deleteSession: vi.fn(),
}));

describe('usePdfLoader', () => {
  let mockSetters: {
    setFileData: Mock;
    setFileName: Mock;
    setFilePath: Mock;
    setPdfInfo: Mock;
    setCurrentPage: Mock;
    setZoom: Mock;
    setViewMode: Mock;
    setBookmarks: Mock;
    setPageHistory: Mock;
    setHistoryIndex: Mock;
    setSearchQuery: Mock;
    setSearchResults: Mock;
    setShowSearchResults: Mock;
    setIsLoading: Mock;
    setOpenWindows: Mock;
    setTabs: Mock;
    setActiveTabId: Mock;
    setPendingTabsRestore: Mock;
    setPendingActiveTabIndex: Mock;
    setPendingWindowsRestore: Mock;
  };

  let mockOpenWindows: OpenWindow[];
  const mockIsRestoringSessionRef = { current: false };

  const mockPdfInfo: PdfInfo = {
    title: 'Test PDF',
    author: 'Test Author',
    subject: 'Test Subject',
    toc: [],
  };

  const mockPdfData = [1, 2, 3, 4, 5]; // Mock PDF bytes

  beforeEach(() => {
    mockSetters = {
      setFileData: vi.fn(),
      setFileName: vi.fn(),
      setFilePath: vi.fn(),
      setPdfInfo: vi.fn(),
      setCurrentPage: vi.fn(),
      setZoom: vi.fn(),
      setViewMode: vi.fn(),
      setBookmarks: vi.fn(),
      setPageHistory: vi.fn(),
      setHistoryIndex: vi.fn(),
      setSearchQuery: vi.fn(),
      setSearchResults: vi.fn(),
      setShowSearchResults: vi.fn(),
      setIsLoading: vi.fn(),
      setOpenWindows: vi.fn(),
      setTabs: vi.fn(),
      setActiveTabId: vi.fn(),
      setPendingTabsRestore: vi.fn(),
      setPendingActiveTabIndex: vi.fn(),
      setPendingWindowsRestore: vi.fn(),
    };

    mockOpenWindows = [];

    // Setup default mock implementations
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_pdf_info') return Promise.resolve(mockPdfInfo);
      if (cmd === 'read_pdf_file') return Promise.resolve(mockPdfData);
      return Promise.resolve(null);
    });

    mockLoadSessionState.mockResolvedValue(null);
    mockGetByLabel.mockResolvedValue({ close: mockClose });
    mockClose.mockResolvedValue(undefined);

    // Mock localStorage
    vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(Storage.prototype, 'getItem');

    // Suppress console output in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('loadPdfInternal', () => {
    it('should load PDF file and set all states', async () => {
      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfInternal('/test/file.pdf', false);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_pdf_info', {
          path: '/test/file.pdf',
        });
        expect(mockInvoke).toHaveBeenCalledWith('read_pdf_file', {
          path: '/test/file.pdf',
        });
        expect(mockSetters.setPdfInfo).toHaveBeenCalledWith(mockPdfInfo);
        expect(mockSetters.setFileData).toHaveBeenCalledWith(
          expect.any(Uint8Array)
        );
        expect(mockSetters.setFilePath).toHaveBeenCalledWith('/test/file.pdf');
        expect(mockSetters.setFileName).toHaveBeenCalledWith('file.pdf');
        expect(mockSetters.setIsLoading).toHaveBeenCalledWith(false);
      });
    });

    it('should handle loading errors gracefully', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Failed to load PDF'));

      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      const success = await result.current.loadPdfInternal(
        '/test/file.pdf',
        false
      );

      expect(success).toBe(false);
      expect(mockSetters.setIsLoading).toHaveBeenCalledWith(false);
    });

    it('should extract filename correctly from different paths', async () => {
      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfInternal('/path/to/document.pdf', false);

      await waitFor(() => {
        expect(mockSetters.setFileName).toHaveBeenCalledWith('document.pdf');
      });
    });
  });

  describe('loadPdfFromPath', () => {
    it('should reset all state before loading new PDF', async () => {
      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfFromPath('/test/file.pdf');

      await waitFor(() => {
        expect(mockSetters.setPdfInfo).toHaveBeenCalledWith(null);
        expect(mockSetters.setCurrentPage).toHaveBeenCalledWith(1);
        expect(mockSetters.setZoom).toHaveBeenCalledWith(1.0);
        expect(mockSetters.setViewMode).toHaveBeenCalledWith('single');
        expect(mockSetters.setBookmarks).toHaveBeenCalledWith([]);
        expect(mockSetters.setPageHistory).toHaveBeenCalledWith([]);
        expect(mockSetters.setHistoryIndex).toHaveBeenCalledWith(-1);
        expect(mockSetters.setSearchQuery).toHaveBeenCalledWith('');
        expect(mockSetters.setSearchResults).toHaveBeenCalledWith([]);
        expect(mockSetters.setShowSearchResults).toHaveBeenCalledWith(false);
      });
    });

    it('should close all open windows before loading new PDF', async () => {
      const mockOpenWindowsWithData: OpenWindow[] = [
        { label: 'window-1', page: 1, zoom: 1.0, viewMode: 'single' },
        { label: 'window-2', page: 5, zoom: 1.5, viewMode: 'two-column' },
      ];

      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindowsWithData,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfFromPath('/test/file.pdf');

      await waitFor(() => {
        expect(mockGetByLabel).toHaveBeenCalledWith('window-1');
        expect(mockGetByLabel).toHaveBeenCalledWith('window-2');
        expect(mockClose).toHaveBeenCalledTimes(2);
        expect(mockSetters.setOpenWindows).toHaveBeenCalledWith([]);
        expect(mockSetters.setTabs).toHaveBeenCalledWith([]);
        expect(mockSetters.setActiveTabId).toHaveBeenCalledWith(null);
      });
    });

    it('should restore session state when available', async () => {
      const mockSession = {
        page: 5,
        zoom: 1.5,
        viewMode: 'two-column' as ViewMode,
        bookmarks: [
          { page: 3, label: 'Page 3', createdAt: 1000 },
        ],
        pageHistory: [
          { page: 1, timestamp: '2024-01-01T00:00:00Z' },
          { page: 5, timestamp: '2024-01-01T00:01:00Z' },
        ],
        historyIndex: 1,
        tabs: [
          { page: 1, label: 'Page 1' },
          { page: 5, label: 'Page 5' },
        ],
        activeTabIndex: 1,
        windows: [
          { page: 3, zoom: 1.0, viewMode: 'single' as ViewMode },
        ],
        lastOpened: Date.now(),
      };

      mockLoadSessionState.mockResolvedValueOnce(mockSession);

      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfFromPath('/test/file.pdf');

      await waitFor(() => {
        // Check session restoration
        expect(mockSetters.setCurrentPage).toHaveBeenCalledWith(5);
        expect(mockSetters.setZoom).toHaveBeenCalledWith(1.5);
        expect(mockSetters.setViewMode).toHaveBeenCalledWith('two-column');
        expect(mockSetters.setBookmarks).toHaveBeenCalledWith(
          mockSession.bookmarks
        );
        expect(mockSetters.setPageHistory).toHaveBeenCalledWith(
          mockSession.pageHistory
        );
        expect(mockSetters.setHistoryIndex).toHaveBeenCalledWith(1);
        expect(mockSetters.setPendingTabsRestore).toHaveBeenCalledWith(
          mockSession.tabs
        );
        expect(mockSetters.setPendingActiveTabIndex).toHaveBeenCalledWith(1);
        expect(mockSetters.setPendingWindowsRestore).toHaveBeenCalledWith(
          mockSession.windows
        );
      });
    });

    it('should use defaults when no session is available', async () => {
      mockLoadSessionState.mockResolvedValueOnce(null);

      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfFromPath('/test/file.pdf');

      await waitFor(() => {
        // Defaults are set during reset phase
        expect(mockSetters.setCurrentPage).toHaveBeenCalledWith(1);
        expect(mockSetters.setZoom).toHaveBeenCalledWith(1.0);
        expect(mockSetters.setViewMode).toHaveBeenCalledWith('single');
      });
    });

    it('should handle partial session data', async () => {
      const partialSession = {
        page: 3,
        zoom: 1.2,
        // Missing viewMode, bookmarks, etc.
        lastOpened: Date.now(),
      };

      mockLoadSessionState.mockResolvedValueOnce(partialSession);

      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfFromPath('/test/file.pdf');

      await waitFor(() => {
        expect(mockSetters.setCurrentPage).toHaveBeenCalledWith(3);
        expect(mockSetters.setZoom).toHaveBeenCalledWith(1.2);
        expect(mockSetters.setViewMode).toHaveBeenCalledWith('single'); // default
      });
    });
  });

  describe('Error handling', () => {
    it('should continue even if window close fails', async () => {
      const mockOpenWindowsWithData: OpenWindow[] = [
        { label: 'window-1', page: 1, zoom: 1.0, viewMode: 'single' },
      ];

      mockGetByLabel.mockRejectedValueOnce(new Error('Window not found'));

      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindowsWithData,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      // Should not throw
      await expect(
        result.current.loadPdfFromPath('/test/file.pdf')
      ).resolves.not.toThrow();

      await waitFor(() => {
        expect(mockSetters.setOpenWindows).toHaveBeenCalledWith([]);
      });
    });

    it('should return false when PDF loading fails', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      const success = await result.current.loadPdfInternal(
        '/test/file.pdf',
        false
      );

      expect(success).toBe(false);
    });
  });

  describe('Loading states', () => {
    it('should set isLoading to true when starting to load', async () => {
      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      const loadPromise = result.current.loadPdfInternal(
        '/test/file.pdf',
        false
      );

      // Check that loading was set to true
      expect(mockSetters.setIsLoading).toHaveBeenCalledWith(true);

      await loadPromise;
    });

    it('should set isLoading to false after successful load', async () => {
      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfInternal('/test/file.pdf', false);

      await waitFor(() => {
        expect(mockSetters.setIsLoading).toHaveBeenCalledWith(false);
      });
    });

    it('should set isLoading to false after failed load', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Load failed'));

      const { result } = renderHook(() =>
        usePdfLoader({
          ...mockSetters,
          openWindows: mockOpenWindows,
          isRestoringSessionRef: mockIsRestoringSessionRef,
        })
      );

      await result.current.loadPdfInternal('/test/file.pdf', false);

      expect(mockSetters.setIsLoading).toHaveBeenCalledWith(false);
    });
  });
});
