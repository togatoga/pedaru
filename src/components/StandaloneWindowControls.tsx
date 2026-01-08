"use client";

import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Bookmark as BookmarkIcon,
  Columns,
  History,
  List,
  PanelTop,
  Search,
  X,
} from "lucide-react";
import type { StandaloneWindowControlsProps } from "@/types/components";

/**
 * Floating navigation controls for standalone PDF windows.
 * Appears on hover at the top-right corner of standalone windows.
 */
export function StandaloneWindowControls({
  currentPage,
  totalPages,
  zoom,
  viewMode,
  isTocOpen,
  showHistory,
  showStandaloneSearch,
  searchQuery,
  bookmarks,
  isCurrentPageBookmarked,
  canGoBack,
  canGoForward,
  standaloneSearchInputRef,
  goBack,
  goForward,
  goToPrevPage,
  goToNextPage,
  setIsTocOpen,
  setViewMode,
  setShowHistory,
  toggleBookmark,
  handleZoomIn,
  handleZoomOut,
  setShowStandaloneSearch,
  setSearchQuery,
}: StandaloneWindowControlsProps) {
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-bg-secondary/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-bg-tertiary transition-opacity duration-150 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
      {/* History back/forward */}
      <button
        onClick={goBack}
        disabled={!canGoBack}
        className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Back"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <button
        onClick={goForward}
        disabled={!canGoForward}
        className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Forward"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
      <button
        onClick={goToPrevPage}
        disabled={currentPage <= 1}
        className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Previous Page (←)"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
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
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      {/* ToC toggle */}
      <button
        onClick={() => setIsTocOpen((prev) => !prev)}
        className={`ml-2 p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors ${isTocOpen ? "text-accent" : ""}`}
        title={isTocOpen ? "Hide Table of Contents" : "Show Table of Contents"}
        aria-label={
          isTocOpen ? "Hide Table of Contents" : "Show Table of Contents"
        }
      >
        <List className="w-5 h-5" />
      </button>

      {/* View mode toggle */}
      <button
        onClick={() =>
          setViewMode((prev) =>
            prev === "two-column" ? "single" : "two-column",
          )
        }
        className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors"
        title={
          viewMode === "two-column"
            ? "Switch to Single Page"
            : "Switch to Two-Column"
        }
      >
        <Columns
          className={`w-5 h-5 ${viewMode === "two-column" ? "text-accent" : ""}`}
        />
      </button>

      {/* History toggle */}
      <button
        onClick={() => setShowHistory((prev) => !prev)}
        className={`p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors ${showHistory ? "text-accent" : ""}`}
        title={showHistory ? "Hide History" : "Show History"}
        aria-label={showHistory ? "Hide History" : "Show History"}
      >
        <History className="w-5 h-5" />
      </button>

      {/* Bookmark toggle */}
      <button
        onClick={toggleBookmark}
        className={`relative p-1.5 rounded hover:bg-bg-tertiary transition-colors ${isCurrentPageBookmarked ? "text-yellow-500" : "text-text-primary"}`}
        title={isCurrentPageBookmarked ? "Remove Bookmark" : "Add Bookmark"}
        aria-label={
          isCurrentPageBookmarked ? "Remove Bookmark" : "Add Bookmark"
        }
      >
        <BookmarkIcon
          className={`w-5 h-5 ${isCurrentPageBookmarked ? "fill-yellow-500" : ""}`}
        />
        {bookmarks.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center bg-yellow-500 text-white text-[10px] font-bold rounded-full px-0.5">
            {bookmarks.length > 99 ? "99+" : bookmarks.length}
          </span>
        )}
      </button>

      {/* Zoom controls */}
      <div className="ml-2 flex items-center gap-2">
        <button
          onClick={handleZoomOut}
          className="p-1.5 rounded hover:bg-bg-tertiary text-text-primary transition-colors"
          title="Zoom Out"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 12H5"
            />
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
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v14M19 12H5"
            />
          </svg>
        </button>
      </div>

      {/* Text search */}
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
                if (e.key === "Escape") {
                  setShowStandaloneSearch(false);
                  setSearchQuery("");
                }
              }}
              placeholder="Search in page..."
              className="w-32 bg-transparent text-sm text-text-primary placeholder-text-secondary outline-none"
              autoFocus
            />
            <button
              onClick={() => {
                setShowStandaloneSearch(false);
                setSearchQuery("");
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
          await emit("move-window-to-tab", {
            label: win.label,
            page: currentPage,
          });
          await win.close();
        }}
        className="ml-2 p-1.5 rounded bg-accent hover:bg-accent/80 text-white transition-colors"
        title="Move to Tab"
      >
        <PanelTop className="w-5 h-5" />
      </button>
    </div>
  );
}
