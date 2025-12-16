'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { open, confirm } from '@tauri-apps/plugin-dialog';
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
  migrateOldStorage,
  TabState,
  WindowState,
  PdfSessionState,
} from '@/lib/sessionStorage';

// Extended window type with zoom and view settings
interface OpenWindow {
  page: number;
  label: string;
  chapter?: string;
  zoom: number;
  viewMode: ViewMode;
}

export default function Home() {
  // Debug: Log immediately on component mount
  console.log('=== Home component mounting ===');
  console.log('window.location.href:', typeof window !== 'undefined' ? window.location.href : 'SSR');
  console.log('window.location.search:', typeof window !== 'undefined' ? window.location.search : 'SSR');
  
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
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
  const [pageHistory, setPageHistory] = useState<{ page: number; timestamp: string }[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showHistory, setShowHistory] = useState(false);
  const [showWindows, setShowWindows] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [tabs, setTabs] = useState<{ id: number; page: number; label: string }[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const tabIdRef = useRef<number>(1);

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

  // Load PDF from path (standalone function to avoid useEffect dependency issues)
  const loadPdfFromPathInternal = async (path: string, isStandalone: boolean = false) => {
    try {
      console.log('=== loadPdfFromPathInternal called ===');
      console.log('Path:', path);
      console.log('isStandalone:', isStandalone);
      setIsLoading(true);

      // Get PDF info from Rust backend first
      const info = await invoke<PdfInfo>('get_pdf_info', { path });
      console.log('PDF info received:', info);
      setPdfInfo(info);

      // Read PDF file (automatically decrypted if encrypted)
      const data = await invoke<number[]>('read_pdf_file', { path });
      console.log('File read successfully, size:', data.length);
      setFileData(new Uint8Array(data));
      setFilePath(path); // Keep original path for display

      // Get file name from original path
      const name = path.split('/').pop() || path;
      setFileName(name);

      setIsLoading(false);
      console.log('PDF loaded successfully');
      return true;
    } catch (error) {
      console.error('Error loading PDF:', error);
      setIsLoading(false);
      return false;
    }
  };

  // Wrapper for external use - loads PDF and restores session if available
  const loadPdfFromPath = useCallback(async (path: string) => {
    console.log('=== loadPdfFromPath called ===');
    console.log('Path argument:', path);

    // Immediately update last opened path so it's not confused with old files
    localStorage.setItem('pedaru_last_opened_path', path);
    console.log('Updated last_opened_path in localStorage');

    // Reset all state immediately when opening a new PDF
    setPdfInfo(null); // Clear old PDF info (including ToC)
    setCurrentPage(1);
    setZoom(1.0);
    setViewMode('single');
    setBookmarks([]);
    setPageHistory([]);
    setHistoryIndex(-1);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);

    // Close all existing windows and clear tabs before loading new PDF
    for (const w of openWindows) {
      try {
        const win = await WebviewWindow.getByLabel(w.label);
        if (win) await win.close();
      } catch (e) {
        console.warn('Failed to close window', w.label, e);
      }
    }
    setOpenWindows([]);
    setTabs([]);
    setActiveTabId(null);

    const success = await loadPdfFromPathInternal(path, false);
    if (success) {
      // Check if there's a saved session for this PDF
      const session = loadSessionState(path);
      if (session) {
        // Restore session state
        setCurrentPage(session.page || 1);
        setZoom(session.zoom || 1.0);
        setViewMode(session.viewMode || 'single');

        // Restore bookmarks
        if (session.bookmarks && session.bookmarks.length > 0) {
          setBookmarks(session.bookmarks);
        } else {
          setBookmarks([]);
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
      } else {
        // No saved session - defaults already set at start of loadPdfFromPath
      }
    }
  }, [openWindows]);

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

      // Migrate old storage format if present
      migrateOldStorage();

      // Try to load last opened PDF using new session storage
      const lastPath = getLastOpenedPath();
      if (lastPath) {
        console.log('Loading last opened PDF:', lastPath);
        const session = loadSessionState(lastPath);

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

  // Navigate to a page without updating the active tab (used when switching tabs)
  const navigateToPageWithoutTabUpdate = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      // Update window title in standalone mode
      if (isStandaloneMode) {
        const title = `Page ${page}`;
        document.title = title;
        getCurrentWebviewWindow().setTitle(title).catch(console.warn);
      }

      // Push into history when user-driven navigation occurs
      setPageHistory(prev => {
        // Remove duplicate pages from history
        const filtered = prev.slice(0, historyIndex + 1).filter(entry => entry.page !== page);
        filtered.push({ page, timestamp: new Date().toISOString() });
        if (filtered.length > 100) {
          const overflow = filtered.length - 100;
          return filtered.slice(overflow);
        }
        return filtered;
      });
      setHistoryIndex(prev => {
        // Remove duplicate pages and add new one
        const filtered = pageHistory.slice(0, prev + 1).filter(entry => entry.page !== page);
        return Math.min(filtered.length, 99);
      });
    }
  }, [totalPages, historyIndex, isStandaloneMode, pageHistory]);

  // Helper to find chapter for a given page from TOC
  const getChapterForPage = useCallback((pageNum: number): string | undefined => {
    if (!pdfInfo?.toc || pdfInfo.toc.length === 0) return undefined;

    let currentChapter: string | undefined;

    const findChapter = (entries: typeof pdfInfo.toc): void => {
      for (const entry of entries) {
        if (entry.page !== null && entry.page <= pageNum) {
          currentChapter = entry.title;
        }
        if (entry.children && entry.children.length > 0) {
          findChapter(entry.children);
        }
      }
    };

    findChapter(pdfInfo.toc);
    return currentChapter;
  }, [pdfInfo]);

  // Restore tabs after PDF info is available and getChapterForPage is defined
  // Or create initial tab if no tabs to restore
  useEffect(() => {
    if (pdfInfo && !isStandaloneMode) {
      if (pendingTabsRestoreRef.current) {
        // Restore tabs from session
        const { tabs: tabsToRestore, activeIndex } = pendingTabsRestoreRef.current;
        pendingTabsRestoreRef.current = null;
        tabsToRestore.forEach((tab, index) => {
          const newId = tabIdRef.current++;
          const chapter = getChapterForPage(tab.page);
          const label = chapter ? `P${tab.page}: ${chapter}` : `Page ${tab.page}`;
          setTabs((prev) => [...prev, { id: newId, page: tab.page, label }]);

          // Set active tab based on saved index
          if (activeIndex !== null && index === activeIndex) {
            setActiveTabId(newId);
          }
        });
      } else if (tabs.length === 0 && !pendingTabsRestore) {
        // No tabs to restore and no existing tabs - create initial tab
        // Only create if there's no pending restore (to avoid race condition)
        const newId = tabIdRef.current++;
        const chapter = getChapterForPage(currentPage);
        const label = chapter ? `P${currentPage}: ${chapter}` : `Page ${currentPage}`;
        setTabs([{ id: newId, page: currentPage, label }]);
        setActiveTabId(newId);
      }
    }
  }, [pdfInfo, isStandaloneMode, getChapterForPage, pendingTabsRestore]);

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
      saveSessionState(filePath, state);
    }, 500);
  }, [filePath, isStandaloneMode, currentPage, zoom, viewMode, tabs, activeTabId, openWindows, bookmarks, pageHistory, historyIndex]);

  // Auto-save session on state changes (main window only)
  useEffect(() => {
    if (!isStandaloneMode && filePath) {
      saveCurrentSession();
    }
  }, [currentPage, zoom, viewMode, tabs, activeTabId, openWindows, bookmarks, pageHistory, historyIndex, filePath, isStandaloneMode, saveCurrentSession]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);

      // If in standalone mode, update window title and emit event to main window
      if (isStandaloneMode) {
        const win = getCurrentWebviewWindow();
        // Update native window title
        const chapter = getChapterForPage(page);
        const title = chapter ? `${chapter} (Page ${page})` : `Page ${page}`;

        // Update both document.title and native window title
        document.title = title;
        win.setTitle(title).catch(console.warn);

        emit('window-page-changed', {
          label: win.label,
          page
        }).catch(console.warn);
      }

      // Update active tab's page and label to match current page
      setTabs(prev => prev.map(tab => {
        if (tab.id === activeTabId) {
          const chapter = getChapterForPage(page);
          const label = chapter ? `P${page}: ${chapter}` : `Page ${page}`;
          return { ...tab, page, label };
        }
        return tab;
      }));

      // Push into history when user-driven navigation occurs
      setPageHistory(prev => {
        // Remove duplicate pages from history
        const filtered = prev.slice(0, historyIndex + 1).filter(entry => entry.page !== page);
        filtered.push({ page, timestamp: new Date().toISOString() });
        // Cap history to 100 entries
        if (filtered.length > 100) {
          const overflow = filtered.length - 100;
          return filtered.slice(overflow);
        }
        return filtered;
      });
      setHistoryIndex(prev => {
        // Remove duplicate pages and add new one
        const filtered = pageHistory.slice(0, prev + 1).filter(entry => entry.page !== page);
        return Math.min(filtered.length, 99);
      });
    }
  }, [totalPages, historyIndex, activeTabId, isStandaloneMode, getChapterForPage, pageHistory]);

  const goToPrevPage = useCallback(() => {
    const step = viewMode === 'two-column' ? 2 : 1;
    goToPage(currentPage - step);
  }, [currentPage, viewMode, goToPage]);

  const goToNextPage = useCallback(() => {
    const step = viewMode === 'two-column' ? 2 : 1;
    goToPage(currentPage + step);
  }, [currentPage, viewMode, goToPage]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1.0);
  }, []);

  // Search functions - uses requestIdleCallback/setTimeout to avoid blocking UI
  const searchIdRef = useRef<number>(0);
  
  const performSearch = useCallback(async (query: string) => {
    // Increment search ID to cancel any previous search
    const currentSearchId = ++searchIdRef.current;
    
    if (!query.trim() || !pdfDocRef.current) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      setShowSearchResults(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);
    setSearchResults([]); // Clear previous results
    
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    const doc = pdfDocRef.current;
    const contextLength = 40;

    try {
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        // Check if search was cancelled
        if (searchIdRef.current !== currentSearchId) {
          return;
        }

        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const fullText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        const lowerText = fullText.toLowerCase();

        let startIndex = 0;
        let foundIndex = lowerText.indexOf(lowerQuery, startIndex);
        let matchIndex = 0;

        while (foundIndex !== -1) {
          const contextStart = Math.max(0, foundIndex - contextLength);
          const contextEnd = Math.min(fullText.length, foundIndex + query.length + contextLength);
          
          const contextBefore = fullText.slice(contextStart, foundIndex);
          const matchText = fullText.slice(foundIndex, foundIndex + query.length);
          const contextAfter = fullText.slice(foundIndex + query.length, contextEnd);

          results.push({
            page: pageNum,
            matchIndex,
            contextBefore,
            matchText,
            contextAfter,
          });
          
          matchIndex++;
          startIndex = foundIndex + 1;
          foundIndex = lowerText.indexOf(lowerQuery, startIndex);
        }

        // Yield to UI thread every few pages to keep it responsive
        if (pageNum % 5 === 0) {
          // Update results incrementally
          if (searchIdRef.current === currentSearchId) {
            setSearchResults([...results]);
          }
          // Allow UI to update
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (e) {
      console.error('Search error:', e);
    }

    // Final update if search wasn't cancelled
    if (searchIdRef.current === currentSearchId) {
      setSearchResults(results);
      setCurrentSearchIndex(0);
      setIsSearching(false);
    }
  }, [totalPages]);

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    // Debounce search
    const timeoutId = setTimeout(() => {
      performSearch(query);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [performSearch]);

  const handleSearchNext = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    // Switch to single page mode only in standalone window
    if (isStandaloneMode) {
      setViewMode('single');
    }
    goToPage(searchResults[nextIndex].page);
  }, [searchResults, currentSearchIndex, goToPage, isStandaloneMode]);

  const handleSearchPrev = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    // Switch to single page mode only in standalone window
    if (isStandaloneMode) {
      setViewMode('single');
    }
    goToPage(searchResults[prevIndex].page);
  }, [searchResults, currentSearchIndex, goToPage, isStandaloneMode]);

  // Store PDF document reference for search
  const handlePdfDocumentLoad = useCallback((pdf: any) => {
    pdfDocRef.current = pdf;
  }, []);

  // History navigation helpers
  // Ensure historyIndex is within bounds of pageHistory
  const effectiveHistoryIndex = Math.min(historyIndex, pageHistory.length - 1);
  const canGoBack = effectiveHistoryIndex > 0 && pageHistory.length > 0;
  const canGoForward = effectiveHistoryIndex >= 0 && effectiveHistoryIndex < pageHistory.length - 1;
  const goBack = useCallback(() => {
    // Ensure index is within bounds
    const currentIdx = Math.min(historyIndex, pageHistory.length - 1);
    if (currentIdx > 0 && pageHistory.length > 0) {
      const idx = currentIdx - 1;
      const entry = pageHistory[idx];
      if (!entry) return;
      setHistoryIndex(idx);
      const page = entry.page;
      setCurrentPage(page);
      // Update active tab's page and label
      setTabs(prev => prev.map(tab => {
        if (tab.id === activeTabId) {
          const chapter = getChapterForPage(page);
          const label = chapter ? `P${page}: ${chapter}` : `Page ${page}`;
          return { ...tab, page, label };
        }
        return tab;
      }));
      // Update window title in standalone mode
      if (isStandaloneMode) {
        const chapter = getChapterForPage(page);
        const title = chapter ? `${chapter} (Page ${page})` : `Page ${page}`;
        document.title = title;
        getCurrentWebviewWindow().setTitle(title).catch(console.warn);
      }
    }
  }, [historyIndex, pageHistory, isStandaloneMode, getChapterForPage, activeTabId]);
  const goForward = useCallback(() => {
    // Ensure index is within bounds
    const currentIdx = Math.min(historyIndex, pageHistory.length - 1);
    if (currentIdx >= 0 && currentIdx < pageHistory.length - 1) {
      const idx = currentIdx + 1;
      const entry = pageHistory[idx];
      if (!entry) return;
      setHistoryIndex(idx);
      const page = entry.page;
      setCurrentPage(page);
      // Update active tab's page and label
      setTabs(prev => prev.map(tab => {
        if (tab.id === activeTabId) {
          const chapter = getChapterForPage(page);
          const label = chapter ? `P${page}: ${chapter}` : `Page ${page}`;
          return { ...tab, page, label };
        }
        return tab;
      }));
      // Update window title in standalone mode
      if (isStandaloneMode) {
        const chapter = getChapterForPage(page);
        const title = chapter ? `${chapter} (Page ${page})` : `Page ${page}`;
        document.title = title;
        getCurrentWebviewWindow().setTitle(title).catch(console.warn);
      }
    }
  }, [historyIndex, pageHistory, isStandaloneMode, getChapterForPage, activeTabId]);

  const addTabFromCurrent = useCallback(() => {
    setTabs((prev) => {
      const id = tabIdRef.current++;
      const chapter = getChapterForPage(currentPage);
      const label = chapter ? `P${currentPage}: ${chapter}` : `Page ${currentPage}`;
      return [...prev, { id, page: currentPage, label }];
    });
    setActiveTabId(tabIdRef.current - 1);
  }, [currentPage, getChapterForPage]);

  // Add a new tab for a specific page and switch to it
  const addTabForPage = useCallback((pageNumber: number) => {
    const newId = tabIdRef.current++;
    const chapter = getChapterForPage(pageNumber);
    const label = chapter ? `P${pageNumber}: ${chapter}` : `Page ${pageNumber}`;
    setTabs((prev) => [...prev, { id: newId, page: pageNumber, label }]);
    setActiveTabId(newId);
    navigateToPageWithoutTabUpdate(pageNumber);
  }, [navigateToPageWithoutTabUpdate, getChapterForPage]);

  // Emit bookmark sync event to other windows
  const emitBookmarkSync = useCallback((newBookmarks: Bookmark[]) => {
    emit('bookmark-sync', {
      bookmarks: newBookmarks,
      sourceLabel: isStandaloneMode ? getCurrentWebviewWindow().label : 'main',
    }).catch(console.warn);
  }, [isStandaloneMode]);

  // Toggle bookmark for current page
  const toggleBookmark = useCallback(() => {
    const existingIndex = bookmarks.findIndex((b) => b.page === currentPage);
    let newBookmarks: Bookmark[];
    if (existingIndex >= 0) {
      // Remove bookmark
      newBookmarks = bookmarks.filter((b) => b.page !== currentPage);
    } else {
      // Add bookmark
      const chapter = getChapterForPage(currentPage);
      const label = chapter ? `P${currentPage}: ${chapter}` : `Page ${currentPage}`;
      newBookmarks = [...bookmarks, { page: currentPage, label, createdAt: Date.now() }];
    }
    setBookmarks(newBookmarks);
    emitBookmarkSync(newBookmarks);
  }, [currentPage, bookmarks, getChapterForPage, emitBookmarkSync]);

  // Remove a specific bookmark
  const removeBookmark = useCallback((page: number) => {
    const newBookmarks = bookmarks.filter((b) => b.page !== page);
    setBookmarks(newBookmarks);
    emitBookmarkSync(newBookmarks);
  }, [bookmarks, emitBookmarkSync]);

  // Clear all bookmarks
  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
    emitBookmarkSync([]);
  }, [emitBookmarkSync]);

  // Check if current page is bookmarked
  const isCurrentPageBookmarked = bookmarks.some((b) => b.page === currentPage);

  const selectTab = useCallback((id: number) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    setActiveTabId(id);
    // Use navigateToPageWithoutTabUpdate to avoid overwriting the tab we're switching from
    navigateToPageWithoutTabUpdate(tab.page);
  }, [tabs, navigateToPageWithoutTabUpdate]);

  const focusWindow = useCallback(async (label: string) => {
    try {
      // Get all windows and find the one with matching label
      const allWindows = await getAllWebviewWindows();
      const win = allWindows.find(w => w.label === label);

      if (!win) {
        console.warn('No window found for label', label);
        return;
      }

      // Unminimize if minimized, then show and focus
      await win.unminimize();
      await win.show();
      await win.setFocus();
    } catch (e) {
      console.error('Failed to focus window', label, e);
    }
  }, []);

  // Open a standalone window with optional custom settings
  const openStandaloneWindowWithState = useCallback(async (
    pageNumber: number,
    windowZoom: number = 1.0,
    windowViewMode: ViewMode = 'single',
    label?: string
  ) => {
    if (!filePath) {
      console.warn('Cannot open standalone window without file path');
      return;
    }
    const origin = window.location.origin;
    const url = `${origin}/?page=${pageNumber}&file=${encodeURIComponent(filePath)}&standalone=true&zoom=${windowZoom}&viewMode=${windowViewMode}`;
    const windowLabel = label || `page-${Date.now()}-${pageNumber}`;
    const chapter = getChapterForPage(pageNumber);
    try {
      const webview = new WebviewWindow(windowLabel, {
        url,
        title: chapter ? `${chapter} (Page ${pageNumber})` : `Page ${pageNumber}`,
        width: 900,
        height: 1100,
        resizable: true,
        center: true,
      });

      // Wait for window to be created before adding to openWindows
      webview.once('tauri://created', () => {
        setOpenWindows((prev) => {
          if (prev.some((w) => w.label === windowLabel)) return prev;
          return [...prev, {
            page: pageNumber,
            label: windowLabel,
            chapter,
            zoom: windowZoom,
            viewMode: windowViewMode,
          }];
        });
      });

      // Listen for window destroyed (after close)
      webview.once('tauri://destroyed', () => {
        setOpenWindows((prev) => prev.filter((w) => w.label !== windowLabel));
      });

      webview.once('tauri://error', (e) => {
        console.error('Failed to create window:', e);
      });
    } catch (e) {
      console.error('Failed to open standalone window:', e);
    }
  }, [filePath, getChapterForPage]);

  // Convenience function to open a standalone window - always opens in single page mode
  const openStandaloneWindow = useCallback(async (pageNumber: number, label?: string) => {
    await openStandaloneWindowWithState(pageNumber, zoom, 'single', label);
  }, [openStandaloneWindowWithState, zoom]);

  // Restore windows after PDF info is available (using ref to avoid circular dependencies)
  useEffect(() => {
    if (pendingWindowsRestoreRef.current && pdfInfo && filePath && !isStandaloneMode) {
      const windowsToRestore = pendingWindowsRestoreRef.current;
      pendingWindowsRestoreRef.current = null;
      setPendingWindowsRestore(null);
      windowsToRestore.forEach((win) => {
        openStandaloneWindowWithState(win.page, win.zoom, win.viewMode);
      });
    }
  }, [pdfInfo, filePath, isStandaloneMode, openStandaloneWindowWithState]);

  const closeWindow = useCallback(async (label: string) => {
    try {
      const win = await WebviewWindow.getByLabel(label);
      if (win) {
        await win.close();
      }
    } catch (e) {
      console.warn('Failed to close window', label, e);
    }
  }, []);

  const closeAllWindows = useCallback(async () => {
    for (const w of openWindows) {
      try {
        const win = await WebviewWindow.getByLabel(w.label);
        if (win) {
          await win.close();
        }
      } catch (e) {
        console.warn('Failed to close window', w.label, e);
      }
    }
    setOpenWindows([]);
  }, [openWindows]);

  const moveWindowToTab = useCallback((label: string, page: number) => {
    // Add tab and close window
    setTabs((prev) => {
      const id = tabIdRef.current++;
      const chapter = getChapterForPage(page);
      const tabLabel = chapter ? `P${page}: ${chapter}` : `Page ${page}`;
      const next = [...prev, { id, page, label: tabLabel }];
      setActiveTabId(id);
      return next;
    });
    closeWindow(label);
    setOpenWindows((prev) => prev.filter((w) => w.label !== label));
  }, [closeWindow, getChapterForPage]);

  const closeCurrentTab = useCallback(async () => {
    const mainWindow = getCurrentWebviewWindow();
    
    if (tabs.length === 0) {
      // No tabs open, close the window (which quits the app if it's the main window)
      try {
        await mainWindow.close();
      } catch (e) {
        console.error('Failed to close window:', e);
      }
      return;
    }

    // Find and close the active tab
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (activeIndex === -1) {
      // No active tab, close the window
      try {
        await mainWindow.close();
      } catch (e) {
        console.error('Failed to close window:', e);
      }
      return;
    }

    const newTabs = tabs.filter((t) => t.id !== activeTabId);
    setTabs(newTabs);

    if (newTabs.length === 0) {
      // No more tabs, close the window
      setActiveTabId(null);
      try {
        await mainWindow.close();
      } catch (e) {
        console.error('Failed to close window:', e);
      }
    } else {
      // Switch to adjacent tab
      const newIndex = Math.min(activeIndex, newTabs.length - 1);
      setActiveTabId(newTabs[newIndex].id);
      goToPage(newTabs[newIndex].page);
    }
  }, [tabs, activeTabId, goToPage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!totalPages) return;

      switch (e.key) {
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
          // Navigate search results when search is active
          if (searchQuery && searchResults.length > 0) {
            e.preventDefault();
            if (e.shiftKey) {
              handleSearchPrev();
            } else {
              handleSearchNext();
            }
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
  }, [currentPage, totalPages, goToPage, goToPrevPage, goToNextPage, handleZoomIn, handleZoomOut, handleZoomReset, isStandaloneMode, searchQuery, searchResults, handleSearchNext, handleSearchPrev, showSearchResults, closeCurrentTab, addTabFromCurrent, toggleBookmark, tabs, activeTabId, selectTab, openStandaloneWindow, goBack, goForward, historyIndex, pageHistory]);

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
