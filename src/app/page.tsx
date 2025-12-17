'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { open, confirm, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import Header from '@/components/Header';
import { Columns, History, PanelTop, Bookmark as BookmarkIcon, Search, X, List, Loader2 } from 'lucide-react';
import { getCurrentWebviewWindow, WebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import TocSidebar from '@/components/TocSidebar';
import HistorySidebar from '@/components/HistorySidebar';
import WindowSidebar from '@/components/WindowSidebar';
import BookmarkSidebar, { Bookmark } from '@/components/BookmarkSidebar';
import SearchResultsSidebar, { SearchResult } from '@/components/SearchResultsSidebar';
import { ViewMode } from '@/components/Settings';

// Dynamic import for PdfViewer to avoid SSR issues with pdfjs-dist
const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-bg-primary">
      <Loader2 className="w-10 h-10 animate-spin text-accent" />
    </div>
  ),
});
import { PdfInfo } from '@/types/pdf';
import {
  saveSessionState,
  loadSessionState,
  getLastOpenedPath,
  getAllSessions,
  importSessions,
  getRecentFiles,
  TabState,
  WindowState,
  PdfSessionState,
} from '@/lib/database';
import { getChapterForPage as getChapter } from '@/lib/pdfUtils';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useNavigation } from '@/hooks/useNavigation';
import { useSearch } from '@/hooks/useSearch';
import { useTabManagement } from '@/hooks/useTabManagement';
import { useWindowManagement } from '@/hooks/useWindowManagement';
import { usePdfLoader } from '@/hooks/usePdfLoader';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { OpenWindow, Tab, HistoryEntry } from '@/hooks/types';

export default function Home() {
  // Debug: Log immediately on component mount
  console.log('=== Home component mounting ===');
  console.log('window.location.href:', typeof window !== 'undefined' ? window.location.href : 'SSR');
  console.log('window.location.search:', typeof window !== 'undefined' ? window.location.search : 'SSR');
  
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const filePathRef = useRef<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [isStandaloneMode, setIsStandaloneMode] = useState(false);
  // Track open windows with their settings
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  // Navigation history with timestamps; newest should display first
  const [pageHistory, setPageHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showHistory, setShowHistory] = useState(false);
  const [showWindows, setShowWindows] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const tabIdRef = useRef<number>(1);

  // Keep filePathRef in sync with filePath state
  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showStandaloneSearch, setShowStandaloneSearch] = useState(false);
  const standaloneSearchInputRef = useRef<HTMLInputElement>(null);
  const pdfDocRef = useRef<any>(null);

  // Pending restore states for session recovery
  const [pendingTabsRestore, setPendingTabsRestore] = useState<TabState[] | null>(null);
  const [pendingWindowsRestore, setPendingWindowsRestore] = useState<WindowState[] | null>(null);
  const [pendingActiveTabIndex, setPendingActiveTabIndex] = useState<number | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateNativeWindowTitle = useCallback(async (page: number, forceStandalone?: boolean) => {
    // Check if we're in standalone mode - use forceStandalone for initial load
    // since isStandaloneMode state might not be set yet
    const isStandalone = forceStandalone ?? isStandaloneMode;
    if (!isStandalone) return;
    try {
      const win = getCurrentWebviewWindow();
      await win.setTitle(`Page ${page}`);
    } catch (e) {
      console.warn('Failed to update window title:', e);
    }
  }, [isStandaloneMode]);

  // Debug: Log component state changes
  useEffect(() => {
    console.log('Component state:', {
      hasFileData: !!fileData,
      fileName,
      filePath,
      currentPage,
      totalPages,
      isStandaloneMode,
      isLoading
    });
  }, [fileData, fileName, filePath, currentPage, totalPages, isStandaloneMode, isLoading]);

  // Helper function for getting chapter names
  const getChapterForPage = useCallback(
    (page: number) => getChapter(pdfInfo, page),
    [pdfInfo]
  );

  // Initialize custom hooks
  const {
    navigateToPageWithoutTabUpdate,
    goToPage,
    goToPageWithoutHistory,
    goToPrevPage,
    goToNextPage,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  } = useNavigation(
    currentPage,
    setCurrentPage,
    totalPages,
    viewMode,
    pageHistory,
    setPageHistory,
    historyIndex,
    setHistoryIndex,
    isStandaloneMode,
    tabs,
    setTabs,
    activeTabId,
    pdfInfo
  );

  const {
    toggleBookmark,
    removeBookmark,
    clearBookmarks,
    isCurrentPageBookmarked,
  } = useBookmarks(
    bookmarks,
    setBookmarks,
    currentPage,
    getChapterForPage,
    isStandaloneMode
  );

  const {
    performSearch,
    handleSearchChange,
    handleSearchNext,
    handleSearchPrev,
    handleSearchNextPreview,
    handleSearchPrevPreview,
    handleSearchConfirm,
    handlePdfDocumentLoad,
  } = useSearch(
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    currentSearchIndex,
    setCurrentSearchIndex,
    isSearching,
    setIsSearching,
    showSearchResults,
    setShowSearchResults,
    totalPages,
    goToPage,
    goToPageWithoutHistory,
    isStandaloneMode,
    setViewMode
  );

  const {
    addTabFromCurrent,
    addTabForPage,
    selectTab,
    closeCurrentTab,
  } = useTabManagement(
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    currentPage,
    tabIdRef,
    getChapterForPage,
    navigateToPageWithoutTabUpdate,
    goToPage,
    pdfInfo,
    isStandaloneMode,
    pendingTabsRestore,
    setPendingTabsRestore,
    pendingActiveTabIndex,
    setPendingActiveTabIndex
  );

  const {
    focusWindow,
    openStandaloneWindowWithState,
    openStandaloneWindow,
    closeWindow,
    closeAllWindows,
    moveWindowToTab,
  } = useWindowManagement(
    filePath,
    openWindows,
    setOpenWindows,
    zoom,
    isStandaloneMode,
    pdfInfo,
    getChapterForPage,
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    tabIdRef,
    pendingWindowsRestore,
    setPendingWindowsRestore
  );

  const { loadPdfFromPath, loadPdfInternal: loadPdfFromPathInternal } = usePdfLoader({
    setFileData,
    setFileName,
    setFilePath,
    setPdfInfo,
    setCurrentPage,
    setZoom,
    setViewMode,
    setBookmarks,
    setPageHistory,
    setHistoryIndex,
    setSearchQuery,
    setSearchResults,
    setShowSearchResults,
    setIsLoading,
    setOpenWindows,
    setTabs,
    setActiveTabId,
    setPendingTabsRestore,
    setPendingActiveTabIndex,
    setPendingWindowsRestore,
    openWindows,
  });

  // Zoom handlers (needed by keyboard shortcuts)
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1.0);
  }, []);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    currentPage,
    totalPages,
    goToPage,
    goToPrevPage,
    goToNextPage,
    goBack,
    goForward,
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
    tabs,
    activeTabId,
    addTabFromCurrent,
    closeCurrentTab,
    selectTab,
    toggleBookmark,
    openStandaloneWindow,
  });

  // Note: loadPdfFromPathInternal and loadPdfFromPath now provided by usePdfLoader hook
  // Note: New PDFs are opened in new windows via the Opened event in Rust (like Preview app).

  // Listen for reset all data request from app menu (main window only)
  useEffect(() => {
    if (isStandaloneMode) return; // Only main window should handle this

    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    listen('reset-all-data-requested', async () => {
      if (!mounted) return;

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
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Reset current state
        setFileData(null);
        setFileName(null);
        setFilePath(null);
        setPdfInfo(null);
        setCurrentPage(1);
        setTotalPages(0);
        setZoom(1.0);
        setViewMode('single');
        setBookmarks([]);
        setTabs([]);
        setActiveTabId(null);
        setPageHistory([]);
        setHistoryIndex(-1);
        setSearchQuery('');
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }).then(fn => {
      if (mounted) {
        unlistenFn = fn;
      } else {
        setTimeout(() => { try { fn(); } catch {} }, 0);
      }
    }).catch(() => {});

    return () => {
      mounted = false;
      try { unlistenFn?.(); } catch {}
    };
  }, [isStandaloneMode]);

  // Listen for menu events from system menu bar
  useEffect(() => {
    let mounted = true;
    const unlisteners: (() => void)[] = [];

    listen('menu-zoom-in', () => {
      if (!mounted) return;
      setZoom((prev) => Math.min(prev + 0.1, 3.0));
    }).then(fn => { if (mounted) unlisteners.push(fn); }).catch(() => {});

    listen('menu-zoom-out', () => {
      if (!mounted) return;
      setZoom((prev) => Math.max(prev - 0.1, 0.5));
    }).then(fn => { if (mounted) unlisteners.push(fn); }).catch(() => {});

    listen('menu-zoom-reset', () => {
      if (!mounted) return;
      setZoom(1.0);
    }).then(fn => { if (mounted) unlisteners.push(fn); }).catch(() => {});

    listen('menu-toggle-two-column', () => {
      if (!mounted) return;
      setViewMode((prev) => (prev === 'two-column' ? 'single' : 'two-column'));
    }).then(fn => { if (mounted) unlisteners.push(fn); }).catch(() => {});

    listen('export-session-data-requested', async () => {
      if (!mounted) return;

      try {
        // Get all sessions from database
        const sessions = await getAllSessions();

        // Prepare export data
        const exportData = {
          exportDate: new Date().toISOString(),
          version: '1.0',
          sessions: sessions,
        };

        // Show save dialog
        const filePath = await save({
          title: 'Export Session Data',
          defaultPath: `pedaru-sessions-${new Date().toISOString().split('T')[0]}.json`,
          filters: [{
            name: 'JSON',
            extensions: ['json']
          }]
        });

        if (filePath) {
          // Write the data to file
          const jsonString = JSON.stringify(exportData, null, 2);
          await writeTextFile(filePath, jsonString);

          console.log('Session data exported successfully to:', filePath);
        }
      } catch (error) {
        console.error('Failed to export session data:', error);
      }
    }).then(fn => { if (mounted) unlisteners.push(fn); }).catch(() => {});

    listen('import-session-data-requested', async () => {
      if (!mounted) return;

      try {
        // Show file open dialog
        const filePath = await open({
          title: 'Import Session Data',
          multiple: false,
          filters: [{
            name: 'JSON',
            extensions: ['json']
          }]
        });

        if (!filePath) {
          // User cancelled
          return;
        }

        // Read the file
        const jsonString = await readTextFile(filePath as string);

        // Parse and validate JSON
        const importData = JSON.parse(jsonString);

        if (!importData.version || !Array.isArray(importData.sessions)) {
          throw new Error('Invalid session data format');
        }

        // Import sessions
        const importCount = await importSessions(importData.sessions);

        // Show success dialog
        await confirm(
          `Successfully imported ${importCount} session(s).`,
          { title: 'Import Complete', kind: 'info' }
        );

        console.log('Session data imported successfully:', importCount);
      } catch (error) {
        console.error('Failed to import session data:', error);

        // Show error dialog
        await confirm(
          `Failed to import session data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { title: 'Import Failed', kind: 'error' }
        );
      }
    }).then(fn => { if (mounted) unlisteners.push(fn); }).catch(() => {});

    listen('menu-open-file-requested', async () => {
      if (!mounted) return;
      await handleOpenFile();
    }).then(fn => { if (mounted) unlisteners.push(fn); }).catch(() => {});

    listen('menu-open-recent-selected', async (event: any) => {
      if (!mounted) return;

      try {
        // Event payload now contains the file path directly (not an index)
        const selectedFilePath = event.payload as string;

        // Don't reload if it's the same file that's already open
        if (selectedFilePath === filePathRef.current) {
          console.log('File already open, skipping reload');
          return;
        }

        await loadPdfFromPath(selectedFilePath);
      } catch (error) {
        console.error('Failed to open recent file:', error);
      }
    }).then(fn => { if (mounted) unlisteners.push(fn); }).catch(() => {});

    return () => {
      mounted = false;
      unlisteners.forEach(fn => { try { fn(); } catch {} });
    };
  }, []);

  // Load PDF on startup - either from CLI/"Open With", URL params, or last opened
  useEffect(() => {
    console.log('=== Startup useEffect running ===');
    console.log('isStandaloneMode at startup:', isStandaloneMode);

    const loadOnStartup = async () => {
      console.log('=== loadOnStartup called ===');

      // Check for URL parameters (for standalone mode)
      const params = new URLSearchParams(window.location.search);
      const urlPage = params.get('page');
      const urlFile = params.get('file');
      const isStandalone = params.get('standalone') === 'true';

      console.log('URL params:', { urlPage, urlFile, isStandalone });

      if (isStandalone && urlFile && urlPage) {
        console.log('Standalone mode detected, loading PDF from:', urlFile);
        setIsStandaloneMode(true);
        setIsTocOpen(false);

        // Get zoom/viewMode from URL if provided
        const urlZoom = params.get('zoom');
        const urlViewMode = params.get('viewMode') as ViewMode | null;

        try {
          const decodedPath = decodeURIComponent(urlFile);
          console.log('Decoded file path:', decodedPath);

          // Use internal function directly to avoid dependency issues
          const success = await loadPdfFromPathInternal(decodedPath, true);

          if (success) {
            const pageNum = parseInt(urlPage, 10);
            console.log('Setting page to:', pageNum);
            setCurrentPage(pageNum);
            updateNativeWindowTitle(pageNum, true); // forceStandalone since state isn't set yet

            // Apply URL-provided settings
            if (urlZoom) setZoom(parseFloat(urlZoom));
            if (urlViewMode) setViewMode(urlViewMode);
          } else {
            alert('Failed to load PDF file');
          }
        } catch (err) {
          console.error('Error in standalone mode initialization:', err);
          alert(`Failed to load PDF: ${err}`);
        }
        return;
      }

      // Check for openFile parameter (new independent window for a PDF)
      const openFile = params.get('openFile');
      if (openFile) {
        console.log('Opening PDF in new independent window:', openFile);
        try {
          const decodedPath = decodeURIComponent(openFile);
          console.log('Decoded file path:', decodedPath);

          const success = await loadPdfFromPathInternal(decodedPath, false);
          if (success) {
            setCurrentPage(1);
            setZoom(1.0);
            setViewMode('single');
            // Update last opened path
            localStorage.setItem('dorper_last_opened_path', decodedPath);
          } else {
            alert('Failed to load PDF file');
          }
        } catch (err) {
          console.error('Error loading PDF:', err);
          alert(`Failed to load PDF: ${err}`);
        }
        return;
      }

      // Check for file opened via CLI or "Open With"
      try {
        console.log('Checking for opened file from Rust...');
        const openedFilePath = await invoke<string | null>('get_opened_file');
        console.log('get_opened_file result:', openedFilePath);

        if (openedFilePath && openedFilePath.toLowerCase().endsWith('.pdf')) {
          console.log('Loading PDF from opened file:', openedFilePath);
          await loadPdfFromPath(openedFilePath);
          return; // Don't load last opened file if we opened one via CLI
        }
      } catch (e) {
        console.error('Error checking opened file:', e);
      }

      // Try to load last opened PDF using database
      const lastPath = getLastOpenedPath();
      if (lastPath) {
        console.log('Loading last opened PDF:', lastPath);
        const session = await loadSessionState(lastPath);

        // Reset pdfInfo before loading new PDF
        setPdfInfo(null);

        if (session) {
          setZoom(session.zoom || 1.0);
          setViewMode(session.viewMode || 'single');
          const success = await loadPdfFromPathInternal(lastPath, false);
          if (success) {
            setCurrentPage(session.page || 1);
            updateNativeWindowTitle(session.page || 1);

            // Restore bookmarks
            if (session.bookmarks && session.bookmarks.length > 0) {
              setBookmarks(session.bookmarks);
            }

            // Restore page history
            if (session.pageHistory && session.pageHistory.length > 0) {
              setPageHistory(session.pageHistory);
              setHistoryIndex(session.historyIndex ?? session.pageHistory.length - 1);
            }

            // Set pending states for tabs and windows restoration
            if (session.tabs && session.tabs.length > 0) {
              setPendingTabsRestore(session.tabs);
              setPendingActiveTabIndex(session.activeTabIndex);
            }
            if (session.windows && session.windows.length > 0) {
              setPendingWindowsRestore(session.windows);
            }
          }
        } else {
          // No session data - load PDF with defaults (page 1)
          const success = await loadPdfFromPathInternal(lastPath, false);
          if (success) {
            setCurrentPage(1);
            setZoom(1.0);
            setViewMode('single');
          }
        }
      }
    };

    loadOnStartup();
  }, []); // Run only once on mount

  // Note: Tab and window restoration are handled via refs to avoid circular dependencies
  const pendingTabsRestoreRef = useRef<{ tabs: TabState[]; activeIndex: number | null } | null>(null);
  const pendingWindowsRestoreRef = useRef<WindowState[] | null>(null);

  // Update refs when pending restore states change
  useEffect(() => {
    if (pendingTabsRestore) {
      pendingTabsRestoreRef.current = { tabs: pendingTabsRestore, activeIndex: pendingActiveTabIndex };
      setPendingTabsRestore(null);
      setPendingActiveTabIndex(null);
    }
  }, [pendingTabsRestore, pendingActiveTabIndex]);

  useEffect(() => {
    if (pendingWindowsRestore) {
      pendingWindowsRestoreRef.current = pendingWindowsRestore;
      setPendingWindowsRestore(null);
    }
  }, [pendingWindowsRestore]);

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (selected && typeof selected === 'string') {
        await loadPdfFromPath(selected);
      }
    } catch (error) {
      console.error('Error opening file:', error);
      setIsLoading(false);
    }
  }, [loadPdfFromPath]);

  const handleLoadSuccess = useCallback((numPages: number) => {
    setTotalPages(numPages);
  }, []);

  // Note: Navigation, bookmarks, search, tabs, and window management functions
  // are now provided by custom hooks above

  // Save current session state (debounced)
  const saveCurrentSession = useCallback(() => {
    if (!filePath || isStandaloneMode) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
      const savedHistory = pageHistory.slice(-100); // Keep last 100 history entries
      // Adjust historyIndex to match the sliced history
      const overflow = pageHistory.length - 100;
      const adjustedHistoryIndex = overflow > 0 ? Math.max(0, historyIndex - overflow) : historyIndex;
      const state: PdfSessionState = {
        lastOpened: Date.now(),
        page: currentPage,
        zoom,
        viewMode,
        activeTabIndex: activeIndex >= 0 ? activeIndex : null,
        tabs: tabs.map((t) => ({ page: t.page, label: t.label })),
        windows: openWindows.map((w) => ({
          page: w.page,
          zoom: w.zoom,
          viewMode: w.viewMode,
        })),
        bookmarks: bookmarks.map((b) => ({
          page: b.page,
          label: b.label,
          createdAt: b.createdAt,
        })),
        pageHistory: savedHistory,
        historyIndex: Math.min(adjustedHistoryIndex, savedHistory.length - 1),
      };
      // Save to database (async, fire and forget)
      saveSessionState(filePath, state).catch((error) => {
        console.error('Failed to save session state:', error);
      });
    }, 500);
  }, [filePath, isStandaloneMode, currentPage, zoom, viewMode, tabs, activeTabId, openWindows, bookmarks, pageHistory, historyIndex]);

  // Auto-save session on state changes (main window only)
  useEffect(() => {
    if (!isStandaloneMode && filePath) {
      saveCurrentSession();
    }
  }, [currentPage, zoom, viewMode, tabs, activeTabId, openWindows, bookmarks, pageHistory, historyIndex, filePath, isStandaloneMode, saveCurrentSession]);

  // Note: Zoom handlers and keyboard shortcuts are now provided by custom hooks

  // Update document title
  useEffect(() => {
    if (pdfInfo?.title) {
      document.title = `${pdfInfo.title} - Pedaru`;
    } else if (fileName) {
      document.title = `${fileName} - Pedaru`;
    } else {
      document.title = 'Pedaru - PDF Viewer';
    }
  }, [pdfInfo, fileName]);

  // Update standalone window title when page changes
  useEffect(() => {
    if (!isStandaloneMode) return;

    const updateTitle = async () => {
      try {
        const chapter = pdfInfo ? getChapterForPage(currentPage) : undefined;
        const title = chapter ? `${chapter} (Page ${currentPage})` : `Page ${currentPage}`;
        document.title = title;
        const win = getCurrentWebviewWindow();
        await win.setTitle(title);
      } catch (e) {
        console.error('Failed to update window title:', e);
      }
    };

    updateTitle();
  }, [isStandaloneMode, currentPage, pdfInfo, getChapterForPage]);

  // Listen for page changes from standalone windows
  useEffect(() => {
    if (isStandaloneMode) return; // Only main window should listen

    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    listen<{ label: string; page: number }>('window-page-changed', (event) => {
      if (!mounted) return;
      const { label, page } = event.payload;
      const chapter = getChapterForPage(page);
      setOpenWindows(prev => prev.map(w =>
        w.label === label
          ? { ...w, page, chapter }
          : w
      ));

      // Also update the window title
      WebviewWindow.getByLabel(label).then(win => {
        if (win) {
          win.setTitle(chapter ? `${chapter} (Page ${page})` : `Page ${page}`).catch(console.warn);
        }
      });
    }).then(fn => {
      if (mounted) {
        unlistenFn = fn;
      } else {
        setTimeout(() => { try { fn(); } catch {} }, 0);
      }
    }).catch(() => {});

    return () => {
      mounted = false;
      try { unlistenFn?.(); } catch {}
    };
  }, [isStandaloneMode, getChapterForPage]);

  // Listen for state changes (zoom, viewMode) from standalone windows
  useEffect(() => {
    if (isStandaloneMode) return; // Only main window should listen

    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    listen<{
      label: string;
      zoom: number;
      viewMode: ViewMode;
    }>('window-state-changed', (event) => {
      if (!mounted) return;
      const { label, zoom: winZoom, viewMode: winViewMode } = event.payload;
      setOpenWindows(prev => prev.map(w =>
        w.label === label
          ? { ...w, zoom: winZoom, viewMode: winViewMode }
          : w
      ));
    }).then(fn => {
      if (mounted) {
        unlistenFn = fn;
      } else {
        setTimeout(() => { try { fn(); } catch {} }, 0);
      }
    }).catch(() => {});

    return () => {
      mounted = false;
      try { unlistenFn?.(); } catch {}
    };
  }, [isStandaloneMode]);

  // Listen for move-window-to-tab events from standalone windows
  useEffect(() => {
    if (isStandaloneMode) return; // Only main window should listen

    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    listen<{ label: string; page: number }>('move-window-to-tab', (event) => {
      if (!mounted) return;
      const { label, page } = event.payload;
      // Remove from openWindows
      setOpenWindows(prev => prev.filter(w => w.label !== label));
      // Add as a new tab
      const newId = tabIdRef.current++;
      const chapter = getChapterForPage(page);
      const tabLabel = chapter ? `P${page}: ${chapter}` : `Page ${page}`;
      setTabs(prev => [...prev, { id: newId, page, label: tabLabel }]);
      setActiveTabId(newId);
      setCurrentPage(page);
    }).then(fn => {
      if (mounted) {
        unlistenFn = fn;
      } else {
        // Component unmounted during registration - schedule cleanup
        setTimeout(() => { try { fn(); } catch {} }, 0);
      }
    }).catch(() => {});

    return () => {
      mounted = false;
      try { unlistenFn?.(); } catch {}
    };
  }, [isStandaloneMode, getChapterForPage]);

  // Listen for bookmark sync events from other windows
  useEffect(() => {
    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    const myLabel = isStandaloneMode ? getCurrentWebviewWindow().label : 'main';

    listen<{ bookmarks: Bookmark[]; sourceLabel: string }>('bookmark-sync', (event) => {
      if (!mounted) return;
      const { bookmarks: newBookmarks, sourceLabel } = event.payload;
      // Ignore events from self
      if (sourceLabel === myLabel) return;
      setBookmarks(newBookmarks);
    }).then(fn => {
      if (mounted) {
        unlistenFn = fn;
      } else {
        setTimeout(() => { try { fn(); } catch {} }, 0);
      }
    }).catch(() => {});

    return () => {
      mounted = false;
      try { unlistenFn?.(); } catch {}
    };
  }, [isStandaloneMode]);

  // Emit state changes from standalone windows to main window
  useEffect(() => {
    if (!isStandaloneMode) return;

    const win = getCurrentWebviewWindow();
    emit('window-state-changed', {
      label: win.label,
      zoom,
      viewMode,
    }).catch(console.warn);
  }, [isStandaloneMode, zoom, viewMode]);


  // Show sidebar in main window for all sidebar types, or in standalone for ToC/History/Bookmarks
  const showSidebar = isStandaloneMode
    ? (isTocOpen || showHistory || showBookmarks)
    : (isTocOpen || showHistory || showBookmarks || showWindows);

  return (
    <main className="flex flex-col h-screen bg-bg-primary relative group">
      {!isStandaloneMode && (
        <Header
          fileName={fileName}
          pdfTitle={pdfInfo?.title || null}
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          viewMode={viewMode}
          isLoading={isLoading}
          showHistory={showHistory}
          showBookmarks={showBookmarks}
          searchQuery={searchQuery}
          searchResultCount={searchResults.length}
          currentSearchIndex={currentSearchIndex}
          onOpenFile={handleOpenFile}
          onPrevPage={goToPrevPage}
          onNextPage={goToNextPage}
          onPageChange={goToPage}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onToggleToc={() => setIsTocOpen(!isTocOpen)}
          onViewModeChange={setViewMode}
          onToggleHistory={() => setShowHistory((prev) => !prev)}
          onToggleWindows={() => setShowWindows((prev) => !prev)}
          onToggleBookmarks={() => setShowBookmarks((prev) => !prev)}
          onSearchChange={handleSearchChange}
          onSearchPrev={handleSearchPrev}
          onSearchNext={handleSearchNext}
          windowCount={openWindows.length}
          tabCount={tabs.length}
          bookmarkCount={bookmarks.length}
          onCloseAllWindows={closeAllWindows}
          showWindows={showWindows}
        />
      )}

      {/* Tabs bar - shows when tabs exist OR when windows exist (for drop target) */}
      {!isStandaloneMode && (tabs.length > 0 || openWindows.length > 0) && (
        <div
          className="flex items-center gap-2 px-4 py-2 bg-bg-secondary border-b border-bg-tertiary min-h-[44px] overflow-x-auto scrollbar-thin scrollbar-thumb-bg-tertiary scrollbar-track-transparent"
          onDragOver={(e) => {
            // Accept window drops
            if (e.dataTransfer.types.includes('application/x-pedaru-window')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={(e) => {
            const windowData = e.dataTransfer.getData('application/x-pedaru-window');
            if (windowData) {
              e.preventDefault();
              try {
                const { label, page } = JSON.parse(windowData);
                moveWindowToTab(label, page);
              } catch (err) {
                console.warn('Failed to parse window data', err);
              }
            }
          }}
        >
          {tabs.length === 0 && openWindows.length > 0 && (
            <span
              className="text-text-secondary text-sm flex-1 py-2"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-pedaru-window')) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(e) => {
                const windowData = e.dataTransfer.getData('application/x-pedaru-window');
                if (windowData) {
                  e.preventDefault();
                  try {
                    const { label, page } = JSON.parse(windowData);
                    moveWindowToTab(label, page);
                  } catch (err) {
                    console.warn('Failed to parse window data', err);
                  }
                }
              }}
            >
              Drag windows here to create tabs
            </span>
          )}
          {tabs.map((tab) => (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-pedaru-tab', JSON.stringify({ id: tab.id, page: tab.page }));
              }}
              onDragOver={(e) => {
                // Accept window drops on tabs
                if (e.dataTransfer.types.includes('application/x-pedaru-window')) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(e) => {
                // Handle window drops on tabs
                const windowData = e.dataTransfer.getData('application/x-pedaru-window');
                if (windowData) {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const { label, page } = JSON.parse(windowData);
                    moveWindowToTab(label, page);
                  } catch (err) {
                    console.warn('Failed to parse window data', err);
                  }
                }
              }}
              onDragEnd={(e) => {
                // Check if dropped outside the tabs bar (open as window)
                const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                if (rect && (e.clientY < rect.top - 50 || e.clientY > rect.bottom + 50 || e.clientX < rect.left - 50 || e.clientX > rect.right + 50)) {
                  // Dropped outside - open as standalone window and remove tab
                  openStandaloneWindow(tab.page);
                  setTabs(prev => prev.filter(t => t.id !== tab.id));
                  if (activeTabId === tab.id) {
                    const remaining = tabs.filter(t => t.id !== tab.id);
                    if (remaining.length > 0) {
                      setActiveTabId(remaining[0].id);
                      goToPage(remaining[0].page);
                    } else {
                      setActiveTabId(null);
                    }
                  }
                }
              }}
              onClick={() => selectTab(tab.id)}
              className={`group/tab flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-lg text-sm transition-colors cursor-grab active:cursor-grabbing max-w-[220px] shrink-0 ${
                activeTabId === tab.id ? 'bg-accent text-white' : 'bg-bg-tertiary hover:bg-bg-hover text-text-primary'
              }`}
              title={`${tab.label} - Drag outside to open in new window`}
            >
              <span className="truncate">{tab.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const tabIndex = tabs.findIndex((t) => t.id === tab.id);
                  const newTabs = tabs.filter((t) => t.id !== tab.id);
                  setTabs(newTabs);
                  if (activeTabId === tab.id && newTabs.length > 0) {
                    const newIndex = Math.min(tabIndex, newTabs.length - 1);
                    setActiveTabId(newTabs[newIndex].id);
                    navigateToPageWithoutTabUpdate(newTabs[newIndex].page);
                  } else if (newTabs.length === 0) {
                    setActiveTabId(null);
                  }
                }}
                className={`p-0.5 rounded opacity-0 group-hover/tab:opacity-100 transition-opacity ${
                  activeTabId === tab.id ? 'hover:bg-white/20' : 'hover:bg-bg-tertiary'
                }`}
                title="Close tab"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Standalone mode: Floating navigation */}
      {isStandaloneMode && totalPages > 0 && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-bg-secondary/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-bg-tertiary transition-opacity duration-150 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
          {/* History back/forward */}
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goForward}
            disabled={!canGoForward}
            className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Forward"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Previous Page (←)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <span className="text-text-primary text-sm font-medium min-w-[80px] text-center">
            {currentPage} / {totalPages}
          </span>
          
          <button
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Next Page (→)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* ToC toggle for standalone window */}
          <button
            onClick={() => setIsTocOpen((prev) => !prev)}
            className={`ml-2 p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors ${isTocOpen ? 'text-accent' : ''}`}
            title={isTocOpen ? 'Hide Table of Contents' : 'Show Table of Contents'}
            aria-label={isTocOpen ? 'Hide Table of Contents' : 'Show Table of Contents'}
          >
            <List className="w-5 h-5" />
          </button>

          {/* View mode toggle for standalone window */}
          <button
            onClick={() => setViewMode(prev => (prev === 'two-column' ? 'single' : 'two-column'))}
            className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors"
            title={viewMode === 'two-column' ? 'Switch to Single Page' : 'Switch to Two-Column'}
          >
            <Columns className={`w-5 h-5 ${viewMode === 'two-column' ? 'text-accent' : ''}`} />
          </button>

          {/* History toggle next to view mode */}
          <button
            onClick={() => setShowHistory((prev) => !prev)}
            className={`p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors ${showHistory ? 'text-accent' : ''}`}
            title={showHistory ? 'Hide History' : 'Show History'}
            aria-label={showHistory ? 'Hide History' : 'Show History'}
          >
            <History className="w-5 h-5" />
          </button>

          {/* Bookmark toggle for standalone window */}
          <button
            onClick={toggleBookmark}
            className={`relative p-1.5 rounded hover:bg-bg-tertiary transition-colors ${isCurrentPageBookmarked ? 'text-yellow-500' : 'text-text-primary'}`}
            title={isCurrentPageBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
            aria-label={isCurrentPageBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
          >
            <BookmarkIcon className={`w-5 h-5 ${isCurrentPageBookmarked ? 'fill-yellow-500' : ''}`} />
            {bookmarks.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center bg-yellow-500 text-white text-[10px] font-bold rounded-full px-0.5">
                {bookmarks.length > 99 ? '99+' : bookmarks.length}
              </span>
            )}
          </button>

          {/* Zoom controls for standalone window */}
          <div className="ml-2 flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors"
              title="Zoom Out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5" />
              </svg>
            </button>
            <span className="text-text-primary text-sm min-w-[50px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors"
              title="Zoom In"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M19 12H5" />
              </svg>
            </button>
          </div>

          {/* Text search for standalone window */}
          <div className="ml-2 flex items-center gap-1">
            {showStandaloneSearch ? (
              <div className="flex items-center gap-1 bg-bg-primary rounded-md px-2 py-1">
                <Search className="w-4 h-4 text-text-secondary" />
                <input
                  ref={standaloneSearchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowStandaloneSearch(false);
                      setSearchQuery('');
                    }
                  }}
                  placeholder="Search in page..."
                  className="w-32 bg-transparent text-sm text-text-primary placeholder-text-secondary outline-none"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setShowStandaloneSearch(false);
                    setSearchQuery('');
                  }}
                  className="p-0.5 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
                  title="Close search"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowStandaloneSearch(true);
                  setTimeout(() => standaloneSearchInputRef.current?.focus(), 0);
                }}
                className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors"
                title="Search in page (Cmd/Ctrl+F)"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Move to Tab button */}
          <button
            onClick={async () => {
              const win = getCurrentWebviewWindow();
              // Emit event to main window to create a tab
              await emit('move-window-to-tab', {
                label: win.label,
                page: currentPage,
              });
              // Close this window
              await win.close();
            }}
            className="ml-2 p-1.5 rounded bg-accent hover:bg-accent/80 text-white transition-colors"
            title="Move to Tab"
          >
            <PanelTop className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Side column for TOC (top) and History (bottom) in main mode, shown only when needed */}
        {showSidebar && (
          <div
            className="flex flex-col overflow-hidden shrink-0 border-r border-bg-tertiary bg-bg-secondary relative"
            style={{ width: sidebarWidth, minWidth: 220, maxWidth: 600 }}
          >
            {/* Resize handle */}
            <div
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/50 active:bg-accent z-10"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = sidebarWidth;
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const newWidth = startWidth + (moveEvent.clientX - startX);
                  setSidebarWidth(Math.max(220, Math.min(600, newWidth)));
                };
                const handleMouseUp = () => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
            {isTocOpen && (
              <div className="flex-[2] min-h-[200px] max-h-[60vh] overflow-auto border-b border-bg-tertiary resize-y">
                <TocSidebar
                  toc={pdfInfo?.toc || []}
                  currentPage={currentPage}
                  isOpen={isTocOpen}
                  onPageSelect={goToPage}
                />
              </div>
            )}
            {showWindows && (
              <div className="flex-1 min-h-[100px] max-h-[40vh] overflow-auto border-b border-bg-tertiary resize-y">
                <WindowSidebar
                  windows={openWindows}
                  currentPage={currentPage}
                  onFocus={focusWindow}
                  onClose={(label) => {
                    closeWindow(label);
                    setOpenWindows((prev) => prev.filter((w) => w.label !== label));
                  }}
                  onMoveToTab={(label, page) => moveWindowToTab(label, page)}
                />
              </div>
            )}
            {showHistory && (
              <div className="flex-1 min-h-[100px] max-h-[40vh] overflow-auto border-b border-bg-tertiary resize-y">
                <HistorySidebar
                  history={pageHistory}
                  index={historyIndex}
                  currentPage={currentPage}
                  onSelect={(p) => goToPage(p)}
                  onClear={() => {
                    setPageHistory([]);
                    setHistoryIndex(-1);
                  }}
                />
              </div>
            )}
            {showBookmarks && (
              <div className="flex-1 min-h-[100px] max-h-[40vh] overflow-auto border-b border-bg-tertiary resize-y">
                <BookmarkSidebar
                  bookmarks={bookmarks}
                  currentPage={currentPage}
                  onSelect={(p) => goToPage(p)}
                  onRemove={removeBookmark}
                  onClear={clearBookmarks}
                />
              </div>
            )}
          </div>
        )}

        {/* Main viewer */}
        <div className="flex-1 min-w-0 relative flex flex-col">
          <PdfViewer
            fileData={fileData}
            currentPage={currentPage}
            totalPages={totalPages}
            zoom={zoom}
            viewMode={viewMode}
            filePath={filePath}
            searchQuery={searchQuery}
            bookmarkedPages={bookmarks.map(b => b.page)}
            onToggleBookmark={(page) => {
              const existingIndex = bookmarks.findIndex((b) => b.page === page);
              if (existingIndex >= 0) {
                setBookmarks((prev) => prev.filter((b) => b.page !== page));
              } else {
                const chapter = getChapterForPage(page);
                const label = chapter ? `P${page}: ${chapter}` : `Page ${page}`;
                setBookmarks((prev) => [...prev, { page, label, createdAt: Date.now() }]);
              }
            }}
            onLoadSuccess={handleLoadSuccess}
            onDocumentLoad={handlePdfDocumentLoad}
            onNavigatePage={(page) => {
              goToPage(page);
            }}
          />
        </div>

        {/* Search results sidebar on the right */}
        {showSearchResults && (
          <SearchResultsSidebar
            query={searchQuery}
            results={searchResults}
            currentIndex={currentSearchIndex}
            isSearching={isSearching}
            onSelect={(index) => {
              setCurrentSearchIndex(index);
              // Switch to single page mode only in standalone window
              if (isStandaloneMode) {
                setViewMode('single');
              }
              goToPage(searchResults[index].page);
            }}
            onOpenInWindow={(page) => openStandaloneWindow(page)}
            onClose={() => {
              setShowSearchResults(false);
              setSearchQuery('');
              setSearchResults([]);
            }}
          />
        )}
      </div>
    </main>
  );
}
