"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";
import type {
  Bookmark,
  HistoryEntry,
  OpenWindow,
  PdfInfo,
  SearchResult,
  Tab,
  TabState,
  ViewMode,
  WindowState,
} from "@/types";

/**
 * PDF file state group
 */
export interface PdfFileState {
  fileData: Uint8Array | null;
  fileName: string | null;
  filePath: string | null;
  pdfInfo: PdfInfo | null;
}

/**
 * Viewer display state group
 */
export interface ViewerState {
  currentPage: number;
  totalPages: number;
  zoom: number;
  viewMode: ViewMode;
  isLoading: boolean;
  isStandaloneMode: boolean;
}

/**
 * UI visibility state group
 */
export interface UIState {
  isTocOpen: boolean;
  showHistory: boolean;
  showBookmarks: boolean;
  showBookshelf: boolean;
  showWindows: boolean;
  showHeader: boolean;
  showSearchResults: boolean;
  showStandaloneSearch: boolean;
  sidebarWidth: number;
}

/**
 * Search state group
 */
export interface SearchState {
  query: string;
  results: SearchResult[];
  currentIndex: number;
  isSearching: boolean;
}

/**
 * Navigation history state group
 */
export interface HistoryState {
  pageHistory: HistoryEntry[];
  historyIndex: number;
}

/**
 * Tab and window management state group
 */
export interface TabWindowState {
  tabs: Tab[];
  activeTabId: number | null;
  openWindows: OpenWindow[];
}

/**
 * Pending restore states for session recovery
 */
export interface PendingRestoreState {
  pendingTabsRestore: TabState[] | null;
  pendingActiveTabIndex: number | null;
  pendingWindowsRestore: WindowState[] | null;
}

/**
 * All setters for PDF file state
 */
export interface PdfFileSetters {
  setFileData: Dispatch<SetStateAction<Uint8Array | null>>;
  setFileName: Dispatch<SetStateAction<string | null>>;
  setFilePath: Dispatch<SetStateAction<string | null>>;
  setPdfInfo: Dispatch<SetStateAction<PdfInfo | null>>;
}

/**
 * All setters for viewer state
 */
export interface ViewerSetters {
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  setZoom: Dispatch<SetStateAction<number>>;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setIsStandaloneMode: Dispatch<SetStateAction<boolean>>;
}

/**
 * All setters for UI state
 */
export interface UISetters {
  setIsTocOpen: Dispatch<SetStateAction<boolean>>;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  setShowBookmarks: Dispatch<SetStateAction<boolean>>;
  setShowBookshelf: Dispatch<SetStateAction<boolean>>;
  setShowWindows: Dispatch<SetStateAction<boolean>>;
  setShowHeader: Dispatch<SetStateAction<boolean>>;
  setShowSearchResults: Dispatch<SetStateAction<boolean>>;
  setShowStandaloneSearch: Dispatch<SetStateAction<boolean>>;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
}

/**
 * All setters for search state
 */
export interface SearchSetters {
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSearchResults: Dispatch<SetStateAction<SearchResult[]>>;
  setCurrentSearchIndex: Dispatch<SetStateAction<number>>;
  setIsSearching: Dispatch<SetStateAction<boolean>>;
}

/**
 * All setters for history state
 */
export interface HistorySetters {
  setPageHistory: Dispatch<SetStateAction<HistoryEntry[]>>;
  setHistoryIndex: Dispatch<SetStateAction<number>>;
}

/**
 * All setters for tab/window state
 */
export interface TabWindowSetters {
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveTabId: Dispatch<SetStateAction<number | null>>;
  setOpenWindows: Dispatch<SetStateAction<OpenWindow[]>>;
}

/**
 * All setters for pending restore state
 */
export interface PendingRestoreSetters {
  setPendingTabsRestore: Dispatch<SetStateAction<TabState[] | null>>;
  setPendingActiveTabIndex: Dispatch<SetStateAction<number | null>>;
  setPendingWindowsRestore: Dispatch<SetStateAction<WindowState[] | null>>;
}

/**
 * Refs used across the application
 */
export interface AppRefs {
  filePathRef: React.MutableRefObject<string | null>;
  tabIdRef: React.MutableRefObject<number>;
  headerWasHiddenBeforeSearchRef: React.MutableRefObject<boolean>;
  tempShowHeaderRef: React.MutableRefObject<boolean>;
  headerTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  standaloneSearchInputRef: React.RefObject<HTMLInputElement | null>;
  pdfDocRef: React.MutableRefObject<PDFDocumentProxy | null>;
  saveTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  isRestoringSessionRef: React.MutableRefObject<boolean>;
}

/**
 * Options for resetting state
 */
export interface ResetOptions {
  resetViewMode?: boolean;
}

/**
 * Complete state return type from usePdfViewerState hook
 */
export interface PdfViewerState {
  // State groups
  pdfFile: PdfFileState;
  viewer: ViewerState;
  ui: UIState;
  search: SearchState;
  history: HistoryState;
  tabWindow: TabWindowState;
  pendingRestore: PendingRestoreState;

  // Individual setters (for compatibility with existing hooks)
  pdfFileSetters: PdfFileSetters;
  viewerSetters: ViewerSetters;
  uiSetters: UISetters;
  searchSetters: SearchSetters;
  historySetters: HistorySetters;
  tabWindowSetters: TabWindowSetters;
  pendingRestoreSetters: PendingRestoreSetters;

  // Refs
  refs: AppRefs;

  // Bookmarks (separate because it has special handling)
  bookmarks: Bookmark[];
  setBookmarks: Dispatch<SetStateAction<Bookmark[]>>;

  // Utility functions
  resetAllState: (options?: ResetOptions) => void;
}

/**
 * Custom hook that manages all PDF viewer state in organized groups.
 * Provides both grouped state access and individual setters for compatibility.
 */
export function usePdfViewerState(): PdfViewerState {
  // ============================================
  // PDF File State
  // ============================================
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);

  // ============================================
  // Viewer State
  // ============================================
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [isLoading, setIsLoading] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("standalone") === "true";
  });

  // ============================================
  // UI State
  // ============================================
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showBookshelf, setShowBookshelf] = useState(false);
  const [showWindows, setShowWindows] = useState(false);
  const [showHeader, setShowHeader] = useState(true);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showStandaloneSearch, setShowStandaloneSearch] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);

  // ============================================
  // Search State
  // ============================================
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // ============================================
  // Navigation History State
  // ============================================
  const [pageHistory, setPageHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // ============================================
  // Tab and Window State
  // ============================================
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);

  // ============================================
  // Bookmarks (separate state)
  // ============================================
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  // ============================================
  // Pending Restore States
  // ============================================
  const [pendingTabsRestore, setPendingTabsRestore] = useState<
    TabState[] | null
  >(null);
  const [pendingActiveTabIndex, setPendingActiveTabIndex] = useState<
    number | null
  >(null);
  const [pendingWindowsRestore, setPendingWindowsRestore] = useState<
    WindowState[] | null
  >(null);

  // ============================================
  // Refs
  // ============================================
  const filePathRef = useRef<string | null>(null);
  const tabIdRef = useRef<number>(1);
  const headerWasHiddenBeforeSearchRef = useRef<boolean>(false);
  const tempShowHeaderRef = useRef<boolean>(false);
  const headerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const standaloneSearchInputRef = useRef<HTMLInputElement | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestoringSessionRef = useRef<boolean>(false);

  // ============================================
  // Reset Function
  // ============================================
  const resetAllState = useCallback((options?: ResetOptions) => {
    // PDF file state
    setFileData(null);
    setFileName(null);
    setFilePath(null);
    filePathRef.current = null;
    setPdfInfo(null);

    // Viewer state
    setCurrentPage(1);
    setTotalPages(0);
    setZoom(1.0);
    if (options?.resetViewMode) {
      setViewMode("single");
    }

    // Tab/Window state
    setTabs([]);
    setActiveTabId(null);

    // Bookmark state
    setBookmarks([]);

    // History state
    setPageHistory([]);
    setHistoryIndex(-1);

    // Search state
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);

    // Sidebar visibility
    setIsTocOpen(false);
    setShowHistory(false);
    setShowBookmarks(false);
    setShowWindows(false);
  }, []);

  // ============================================
  // Grouped State Objects
  // ============================================
  const pdfFile: PdfFileState = {
    fileData,
    fileName,
    filePath,
    pdfInfo,
  };

  const viewer: ViewerState = {
    currentPage,
    totalPages,
    zoom,
    viewMode,
    isLoading,
    isStandaloneMode,
  };

  const ui: UIState = {
    isTocOpen,
    showHistory,
    showBookmarks,
    showBookshelf,
    showWindows,
    showHeader,
    showSearchResults,
    showStandaloneSearch,
    sidebarWidth,
  };

  const search: SearchState = {
    query: searchQuery,
    results: searchResults,
    currentIndex: currentSearchIndex,
    isSearching,
  };

  const history: HistoryState = {
    pageHistory,
    historyIndex,
  };

  const tabWindow: TabWindowState = {
    tabs,
    activeTabId,
    openWindows,
  };

  const pendingRestore: PendingRestoreState = {
    pendingTabsRestore,
    pendingActiveTabIndex,
    pendingWindowsRestore,
  };

  // ============================================
  // Setter Groups (for compatibility)
  // ============================================
  const pdfFileSetters: PdfFileSetters = {
    setFileData,
    setFileName,
    setFilePath,
    setPdfInfo,
  };

  const viewerSetters: ViewerSetters = {
    setCurrentPage,
    setTotalPages,
    setZoom,
    setViewMode,
    setIsLoading,
    setIsStandaloneMode,
  };

  const uiSetters: UISetters = {
    setIsTocOpen,
    setShowHistory,
    setShowBookmarks,
    setShowBookshelf,
    setShowWindows,
    setShowHeader,
    setShowSearchResults,
    setShowStandaloneSearch,
    setSidebarWidth,
  };

  const searchSetters: SearchSetters = {
    setSearchQuery,
    setSearchResults,
    setCurrentSearchIndex,
    setIsSearching,
  };

  const historySetters: HistorySetters = {
    setPageHistory,
    setHistoryIndex,
  };

  const tabWindowSetters: TabWindowSetters = {
    setTabs,
    setActiveTabId,
    setOpenWindows,
  };

  const pendingRestoreSetters: PendingRestoreSetters = {
    setPendingTabsRestore,
    setPendingActiveTabIndex,
    setPendingWindowsRestore,
  };

  const refs: AppRefs = {
    filePathRef,
    tabIdRef,
    headerWasHiddenBeforeSearchRef,
    tempShowHeaderRef,
    headerTimerRef,
    standaloneSearchInputRef,
    pdfDocRef,
    saveTimeoutRef,
    isRestoringSessionRef,
  };

  return {
    // State groups
    pdfFile,
    viewer,
    ui,
    search,
    history,
    tabWindow,
    pendingRestore,

    // Setters
    pdfFileSetters,
    viewerSetters,
    uiSetters,
    searchSetters,
    historySetters,
    tabWindowSetters,
    pendingRestoreSetters,

    // Refs
    refs,

    // Bookmarks
    bookmarks,
    setBookmarks,

    // Utility
    resetAllState,
  };
}
