'use client';

import {
  FileUp,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  List,
  Loader2,
  Monitor,
  Columns,
  History,
  Search,
  X,
  AppWindow,
  XSquare,
  Bookmark
} from 'lucide-react';
import { ViewMode } from './Settings';

interface HeaderProps {
  fileName: string | null;
  pdfTitle: string | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  viewMode: ViewMode;
  isLoading: boolean;
  showHistory: boolean;
  showWindows: boolean;
  showBookmarks: boolean;
  searchQuery: string;
  searchResultCount: number;
  currentSearchIndex: number;
  windowCount: number;
  tabCount: number;
  bookmarkCount: number;
  onOpenFile: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleToc: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleHistory: () => void;
  onToggleWindows: () => void;
  onToggleBookmarks: () => void;
  onSearchChange: (query: string) => void;
  onSearchPrev: () => void;
  onSearchNext: () => void;
  onCloseAllWindows: () => void;
}

export default function Header({
  fileName,
  pdfTitle,
  currentPage,
  totalPages,
  zoom,
  viewMode,
  isLoading,
  showHistory,
  showWindows,
  showBookmarks,
  searchQuery,
  searchResultCount,
  currentSearchIndex,
  windowCount,
  tabCount,
  bookmarkCount,
  onOpenFile,
  onPrevPage,
  onNextPage,
  onPageChange,
  onZoomIn,
  onZoomOut,
  onToggleToc,
  onViewModeChange,
  onToggleHistory,
  onToggleWindows,
  onToggleBookmarks,
  onSearchChange,
  onSearchPrev,
  onSearchNext,
  onCloseAllWindows,
}: HeaderProps) {
  const isPdfLoaded = totalPages > 0;

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-bg-secondary border-b border-bg-tertiary flex-shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenFile}
          disabled={isLoading}
          className="flex items-center justify-center p-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileUp className="w-4 h-4" />
          )}
        </button>
        {(pdfTitle || fileName) && (
          <span className="text-text-secondary text-sm truncate max-w-[200px]" title={pdfTitle || undefined}>
            {fileName || pdfTitle}
          </span>
        )}

        {/* Search */}
        <div className="flex items-center gap-1 ml-2">
          <div className="relative flex items-center">
            <Search className="absolute left-2 w-4 h-4 text-text-secondary pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              disabled={!isPdfLoaded}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck="false"
              className="w-40 pl-8 pr-8 py-1.5 bg-bg-tertiary border border-bg-hover rounded-lg text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent disabled:opacity-40"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 p-0.5 rounded hover:bg-bg-hover text-text-secondary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {searchQuery && searchResultCount > 0 && (
            <>
              <span className="text-text-secondary text-xs min-w-[50px] text-center">
                {currentSearchIndex + 1}/{searchResultCount}
              </span>
              <button
                onClick={onSearchPrev}
                disabled={searchResultCount === 0}
                className="p-1 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40"
                title="Previous (Shift+Enter)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onSearchNext}
                disabled={searchResultCount === 0}
                className="p-1 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40"
                title="Next (Enter)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {searchQuery && searchResultCount === 0 && (
            <span className="text-red-400 text-xs">No results</span>
          )}
        </div>
      </div>

      {/* Center section - Page navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPrevPage}
          disabled={!isPdfLoaded || currentPage <= 1}
          className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-text-primary">
          <input
            type="number"
            value={currentPage}
            onChange={(e) => onPageChange(parseInt(e.target.value) || 1)}
            disabled={!isPdfLoaded}
            min={1}
            max={totalPages}
            className="w-14 px-2 py-1 bg-bg-tertiary border border-bg-hover rounded text-center text-sm focus:outline-none focus:border-accent disabled:opacity-40"
          />
          <span className="text-text-secondary">/</span>
          <span className="text-text-secondary">{totalPages || 0}</span>
        </div>

        <button
          onClick={onNextPage}
          disabled={!isPdfLoaded || currentPage >= totalPages}
          className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Right section - Zoom and TOC */}
      <div className="flex items-center gap-2">
        <button
          onClick={onZoomOut}
          disabled={!isPdfLoaded}
          className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary disabled:opacity-40 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>

        <span className="text-text-primary text-sm min-w-[50px] text-center">
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={onZoomIn}
          disabled={!isPdfLoaded}
          className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary disabled:opacity-40 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-bg-tertiary mx-2" />

        <button
          onClick={onToggleToc}
          disabled={!isPdfLoaded}
          className="flex items-center justify-center p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary disabled:opacity-40 transition-colors"
          aria-label="Toggle TOC"
        >
          <List className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-bg-tertiary mx-2" />

        <button
          onClick={onToggleHistory}
          disabled={!isPdfLoaded}
          className={`flex items-center justify-center p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary disabled:opacity-40 transition-colors ${showHistory ? 'border border-accent text-accent' : 'border border-transparent'}`}
          title={showHistory ? 'Hide History' : 'Show History'}
          aria-label={showHistory ? 'Hide History' : 'Show History'}
        >
          <History className="w-5 h-5" />
        </button>

        <button
          onClick={onToggleBookmarks}
          disabled={!isPdfLoaded}
          className={`relative flex items-center justify-center p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary disabled:opacity-40 transition-colors ${showBookmarks ? 'border border-accent text-accent' : 'border border-transparent'}`}
          title={showBookmarks ? 'Hide Bookmarks' : 'Show Bookmarks'}
          aria-label={showBookmarks ? 'Hide Bookmarks' : 'Show Bookmarks'}
        >
          <Bookmark className="w-5 h-5" />
          {bookmarkCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-yellow-500 text-white text-xs font-bold rounded-full px-1">
              {bookmarkCount > 99 ? '99+' : bookmarkCount}
            </span>
          )}
        </button>

        {/* Windows toggle button - always shown like bookmarks */}
        <button
          onClick={onToggleWindows}
          disabled={!isPdfLoaded}
          className={`relative flex items-center justify-center p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary disabled:opacity-40 transition-colors ${showWindows ? 'border border-accent text-accent' : 'border border-transparent'}`}
          title={showWindows ? 'Hide Windows' : 'Show Windows'}
          aria-label={showWindows ? 'Hide Windows' : 'Show Windows'}
        >
          <AppWindow className="w-5 h-5" />
          {windowCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-accent text-white text-xs font-bold rounded-full px-1">
              {windowCount > 99 ? '99+' : windowCount}
            </span>
          )}
        </button>
        {windowCount > 0 && (
          <button
            onClick={onCloseAllWindows}
            className="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-hover text-red-400 hover:text-red-500 transition-colors"
            title="Close all windows"
            aria-label="Close all windows"
          >
            <XSquare className="w-5 h-5" />
          </button>
        )}

        <div className="w-px h-6 bg-bg-tertiary mx-2" />

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-bg-tertiary rounded-lg p-1">
          <button
            onClick={() => onViewModeChange('single')}
            disabled={!isPdfLoaded}
            className={`p-2 rounded transition-colors disabled:opacity-40 ${
              viewMode === 'single'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            title="Single Page"
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewModeChange('two-column')}
            disabled={!isPdfLoaded}
            className={`p-2 rounded transition-colors disabled:opacity-40 ${
              viewMode === 'two-column'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-primary'
            }`}
            title="Two Column"
          >
            <Columns className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
