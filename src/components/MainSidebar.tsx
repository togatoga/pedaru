"use client";

import type { HistoryEntry, OpenWindow } from "@/hooks/types";
import type { Bookmark, TocEntry } from "@/types";
import BookmarkSidebar from "./BookmarkSidebar";
import HistorySidebar from "./HistorySidebar";
import TocSidebar from "./TocSidebar";
import WindowSidebar from "./WindowSidebar";

export interface MainSidebarProps {
  // Visibility flags
  showSidebar: boolean;
  isTocOpen: boolean;
  showWindows: boolean;
  showHistory: boolean;
  showBookmarks: boolean;
  // Sidebar width
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  // TOC
  toc: TocEntry[];
  currentPage: number;
  // Windows
  windows: OpenWindow[];
  onFocusWindow: (label: string) => void;
  onCloseWindow: (label: string) => void;
  onMoveWindowToTab: (label: string, page: number) => void;
  // History
  history: HistoryEntry[];
  historyIndex: number;
  onClearHistory: () => void;
  // Bookmarks
  bookmarks: Bookmark[];
  onRemoveBookmark: (page: number) => void;
  onClearBookmarks: () => void;
  // Navigation
  goToPage: (page: number) => void;
}

/**
 * Main sidebar container with resizable width.
 * Contains TOC, Windows, History, and Bookmarks panels.
 */
export default function MainSidebar({
  showSidebar,
  isTocOpen,
  showWindows,
  showHistory,
  showBookmarks,
  sidebarWidth,
  setSidebarWidth,
  toc,
  currentPage,
  windows,
  onFocusWindow,
  onCloseWindow,
  onMoveWindowToTab,
  history,
  historyIndex,
  onClearHistory,
  bookmarks,
  onRemoveBookmark,
  onClearBookmarks,
  goToPage,
}: MainSidebarProps) {
  if (!showSidebar) {
    return null;
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      setSidebarWidth(Math.max(220, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className="flex flex-col overflow-hidden shrink-0 border-r border-bg-tertiary bg-bg-secondary relative"
      style={{ width: sidebarWidth, minWidth: 220, maxWidth: 600 }}
    >
      {/* Resize handle - uses div with role="separator" because hr is horizontal and this is a vertical interactive resizer */}
      {/* biome-ignore lint/a11y/useSemanticElements: vertical interactive separator requires div with role, not hr element */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={sidebarWidth}
        aria-valuemin={220}
        aria-valuemax={600}
        tabIndex={0}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/50 active:bg-accent z-10"
        onMouseDown={handleMouseDown}
      />

      {isTocOpen && (
        <div className="flex-[2] min-h-[200px] max-h-[60vh] overflow-auto border-b border-bg-tertiary resize-y">
          <TocSidebar
            toc={toc}
            currentPage={currentPage}
            isOpen={isTocOpen}
            onPageSelect={goToPage}
          />
        </div>
      )}

      {showWindows && (
        <div className="flex-1 min-h-[100px] max-h-[40vh] overflow-auto border-b border-bg-tertiary resize-y">
          <WindowSidebar
            windows={windows}
            currentPage={currentPage}
            onFocus={onFocusWindow}
            onClose={onCloseWindow}
            onMoveToTab={onMoveWindowToTab}
          />
        </div>
      )}

      {showHistory && (
        <div className="flex-1 min-h-[100px] max-h-[40vh] overflow-auto border-b border-bg-tertiary resize-y">
          <HistorySidebar
            history={history}
            index={historyIndex}
            currentPage={currentPage}
            onSelect={goToPage}
            onClear={onClearHistory}
          />
        </div>
      )}

      {showBookmarks && (
        <div className="flex-1 min-h-[100px] max-h-[40vh] overflow-auto border-b border-bg-tertiary resize-y">
          <BookmarkSidebar
            bookmarks={bookmarks}
            currentPage={currentPage}
            onSelect={goToPage}
            onRemove={onRemoveBookmark}
            onClear={onClearBookmarks}
          />
        </div>
      )}
    </div>
  );
}
