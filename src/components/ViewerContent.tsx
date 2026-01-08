"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { SearchResult } from "@/hooks/types";
import type { ViewMode } from "@/types";
import BookshelfMainView from "./BookshelfMainView";
import SearchResultsSidebar from "./SearchResultsSidebar";

// Dynamic import for PdfViewer to avoid SSR issues with pdfjs-dist
const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-bg-primary">
      <Loader2 className="w-10 h-10 animate-spin text-accent" />
    </div>
  ),
});

export interface ViewerContentProps {
  // Mode flags
  showBookshelf: boolean;
  isStandaloneMode: boolean;
  // Bookshelf props
  onOpenPdf: (path: string) => void;
  currentFilePath: string | null;
  onCloseBookshelf: () => void;
  // PdfViewer props
  fileData: Uint8Array | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  viewMode: ViewMode;
  filePath: string | null;
  searchQuery: string;
  focusedSearchPage: number | undefined;
  focusedSearchMatchIndex: number | undefined;
  bookmarkedPages: number[];
  onToggleBookmark: (page: number) => void;
  onLoadSuccess: (numPages: number) => void;
  onDocumentLoad: (pdf: PDFDocumentProxy) => void;
  onNavigatePage: (page: number) => void;
  // Context menu
  onContextMenu: (e: React.MouseEvent) => void;
  // Search results sidebar
  showSearchResults: boolean;
  searchResults: SearchResult[];
  currentSearchIndex: number;
  isSearching: boolean;
  onSearchResultSelect: (index: number) => void;
  onOpenInWindow: (page: number) => void;
  onCloseSearchResults: () => void;
}

/**
 * Main viewer content area.
 * Switches between BookshelfMainView and PdfViewer based on mode.
 * Also includes the SearchResultsSidebar when active.
 */
export default function ViewerContent({
  showBookshelf,
  isStandaloneMode,
  onOpenPdf,
  currentFilePath,
  onCloseBookshelf,
  fileData,
  currentPage,
  totalPages,
  zoom,
  viewMode,
  filePath,
  searchQuery,
  focusedSearchPage,
  focusedSearchMatchIndex,
  bookmarkedPages,
  onToggleBookmark,
  onLoadSuccess,
  onDocumentLoad,
  onNavigatePage,
  onContextMenu,
  showSearchResults,
  searchResults,
  currentSearchIndex,
  isSearching,
  onSearchResultSelect,
  onOpenInWindow,
  onCloseSearchResults,
}: ViewerContentProps) {
  return (
    <>
      {/* Main viewer or Bookshelf */}
      <main
        className="flex-1 min-w-0 relative flex flex-col"
        onContextMenu={onContextMenu}
      >
        {showBookshelf && !isStandaloneMode ? (
          <BookshelfMainView
            onOpenPdf={onOpenPdf}
            currentFilePath={currentFilePath}
            onClose={onCloseBookshelf}
          />
        ) : (
          <PdfViewer
            fileData={fileData}
            currentPage={currentPage}
            totalPages={totalPages}
            zoom={zoom}
            viewMode={viewMode}
            filePath={filePath}
            searchQuery={searchQuery}
            focusedSearchPage={focusedSearchPage}
            focusedSearchMatchIndex={focusedSearchMatchIndex}
            bookmarkedPages={bookmarkedPages}
            onToggleBookmark={onToggleBookmark}
            onLoadSuccess={onLoadSuccess}
            onDocumentLoad={onDocumentLoad}
            onNavigatePage={onNavigatePage}
          />
        )}
      </main>

      {/* Search results sidebar on the right */}
      {showSearchResults && (
        <SearchResultsSidebar
          query={searchQuery}
          results={searchResults}
          currentIndex={currentSearchIndex}
          isSearching={isSearching}
          onSelect={onSearchResultSelect}
          onOpenInWindow={onOpenInWindow}
          onClose={onCloseSearchResults}
        />
      )}
    </>
  );
}
