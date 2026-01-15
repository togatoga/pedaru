/**
 * Component Props type definitions
 * Centralized Props interfaces for all components
 */

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type {
  Bookmark,
  HistoryEntry,
  OpenWindow,
  SearchResult,
  Tab,
  TextSelection,
  ViewMode,
} from "./index";
import type { TocEntry } from "./pdf";

// ============================================
// Header Component
// ============================================

export interface HeaderProps {
  fileName: string | null;
  pdfTitle: string | null;
  totalPages: number;
  zoom: number;
  viewMode: ViewMode;
  isLoading: boolean;
  showHistory: boolean;
  showWindows: boolean;
  showBookmarks: boolean;
  showBookshelf: boolean;
  searchQuery: string;
  searchResultCount: number;
  currentSearchIndex: number;
  windowCount: number;
  bookmarkCount: number;
  thumbnailUrl: string | null;
  onOpenFile: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleToc: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleHistory: () => void;
  onToggleWindows: () => void;
  onToggleBookmarks: () => void;
  onToggleBookshelf: () => void;
  onSearchChange: (query: string) => void;
  onSearchPrev: () => void;
  onSearchNext: () => void;
  onCloseAllWindows: () => void;
}

// ============================================
// PDF Viewer Components
// ============================================

export interface PageWithCustomTextLayerProps {
  pageNumber: number;
  scale: number;
  searchQuery?: string;
  focusedMatchIndex?: number;
  pdfDocument: PDFDocumentProxy | null;
  bookmarkedPages: number[];
  onToggleBookmark?: (page: number) => void;
}

export interface PdfViewerProps {
  fileData: Uint8Array | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  viewMode: ViewMode;
  filePath: string | null;
  openedPages?: Set<number>;
  searchQuery?: string;
  focusedSearchPage?: number;
  focusedSearchMatchIndex?: number;
  bookmarkedPages?: number[];
  onToggleBookmark?: (page: number) => void;
  onLoadSuccess: (numPages: number) => void;
  onDocumentLoad?: (pdf: PDFDocumentProxy) => void;
  onNavigatePage?: (pageNumber: number) => void;
}

export interface CustomTextLayerProps {
  page: PDFPageProxy;
  scale: number;
  pageNumber: number;
  searchQuery?: string;
  focusedMatchIndex?: number;
}

// ============================================
// Sidebar Components
// ============================================

export interface TocSidebarProps {
  toc: TocEntry[];
  currentPage: number;
  isOpen: boolean;
  onPageSelect: (page: number) => void;
  // Book info for header card
  pdfTitle?: string | null;
  pdfAuthor?: string | null;
  thumbnailUrl?: string | null;
  // For book detail modal
  pdfInfo?: import("./pdf").PdfInfo | null;
  filePath?: string | null;
}

export interface TocItemProps {
  entry: TocEntry;
  depth: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
}

export interface HistorySidebarProps {
  history: HistoryEntry[];
  index: number;
  currentPage: number;
  onSelect: (page: number) => void;
  onClear?: () => void;
}

export interface BookmarkSidebarProps {
  bookmarks: Bookmark[];
  currentPage: number;
  onSelect: (page: number) => void;
  onRemove: (page: number) => void;
  onClear?: () => void;
}

export interface WindowSidebarProps {
  windows: OpenWindow[];
  currentPage: number;
  onFocus: (label: string) => Promise<void> | void;
  onClose: (label: string) => void;
  onMoveToTab: (label: string, page: number) => void;
}

export interface SearchResultsSidebarProps {
  query: string;
  results: SearchResult[];
  currentIndex: number;
  isSearching: boolean;
  onSelect: (index: number) => void;
  onOpenInWindow: (page: number) => void;
  onClose: () => void;
}

export interface SidebarContainerProps {
  header: ReactNode;
  children: ReactNode;
  className?: string;
  width?: string;
}

// ============================================
// Tab and Window Components
// ============================================

export interface TabBarProps {
  tabs: Tab[];
  activeTabId: number | null;
  openWindowsCount: number;
  selectTab: (tabId: number) => void;
  closeTab: (tabId: number) => void;
  openStandaloneWindow: (page: number) => void;
  moveWindowToTab: (label: string, page: number) => void;
  navigateToPageWithoutTabUpdate: (page: number) => void;
  goToPage: (page: number) => void;
  closePdf: () => void;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveTabId: Dispatch<SetStateAction<number | null>>;
}

export interface StandaloneWindowControlsProps {
  currentPage: number;
  totalPages: number;
  zoom: number;
  viewMode: ViewMode;
  isTocOpen: boolean;
  showHistory: boolean;
  showStandaloneSearch: boolean;
  searchQuery: string;
  bookmarks: Bookmark[];
  isCurrentPageBookmarked: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  standaloneSearchInputRef: RefObject<HTMLInputElement | null>;
  goBack: () => void;
  goForward: () => void;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  setIsTocOpen: (fn: (prev: boolean) => boolean) => void;
  setViewMode: (fn: (prev: ViewMode) => ViewMode) => void;
  setShowHistory: (fn: (prev: boolean) => boolean) => void;
  toggleBookmark: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  setShowStandaloneSearch: (value: boolean) => void;
  setSearchQuery: (query: string) => void;
}

// ============================================
// Settings and Popup Components
// ============================================

export interface SettingsProps {
  isOpen: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onClose: () => void;
}

export interface TranslationPopupProps {
  selection: TextSelection;
  autoExplain?: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  viewMode?: ViewMode;
  currentPage?: number;
}

export interface ContextMenuProps {
  position: { x: number; y: number };
  onCopy: () => void;
  onTranslate: () => void;
  onExplain: () => void;
  onClose: () => void;
}

// ============================================
// Bookshelf Components
// ============================================

export interface BookshelfMainViewProps {
  onOpenPdf: (localPath: string) => void;
  currentFilePath?: string | null;
  onClose?: () => void;
}

// ============================================
// Footer Slider Component
// ============================================

export interface FooterSliderProps {
  currentPage: number;
  totalPages: number;
  tocBreadcrumb: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  onPageChange: (page: number) => void;
  onPagePreview: (page: number) => void;
  onSlideStart?: () => void;
  onSlideEnd?: () => void;
  onFirstPage: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onLastPage: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
}
