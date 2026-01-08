"use client";

import { ArrowUpDown, Bookmark as BookmarkIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { formatDateTime } from "@/lib/formatUtils";
import type { Bookmark } from "@/types";
import type { BookmarkSidebarProps } from "@/types/components";

// Re-export for backward compatibility
export type { Bookmark };

type SortMode = "date" | "page";

export default function BookmarkSidebar({
  bookmarks,
  currentPage,
  onSelect,
  onRemove,
  onClear,
}: BookmarkSidebarProps) {
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const activeItemRef = useAutoScroll<HTMLLIElement>([currentPage]);

  // Sort based on mode
  const sortedBookmarks = [...bookmarks].sort((a, b) => {
    if (sortMode === "date") {
      return b.createdAt - a.createdAt; // Newest first
    } else {
      return a.page - b.page; // Page order
    }
  });

  return (
    <aside className="w-64 shrink-0 border-r border-bg-tertiary bg-bg-secondary overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary">
        <div className="flex items-center gap-2">
          <BookmarkIcon className="w-4 h-4 text-yellow-500 fill-yellow-500" />
          <span className="text-sm font-medium text-text-primary">
            Bookmarks
          </span>
        </div>
        <div className="flex items-center gap-2">
          {bookmarks.length > 0 && (
            <button
              type="button"
              onClick={() => setSortMode(sortMode === "date" ? "page" : "date")}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
              title={`Sort by ${sortMode === "date" ? "page" : "date"}`}
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortMode === "date" ? "Date" : "Page"}
            </button>
          )}
          {onClear && bookmarks.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <ul className="p-2 space-y-1">
        {sortedBookmarks.map((bookmark) => (
          <li
            key={bookmark.page}
            className="group"
            ref={bookmark.page === currentPage ? activeItemRef : null}
          >
            <div
              className={`flex items-center justify-between w-full text-left px-2 py-1.5 rounded transition-colors ${
                bookmark.page === currentPage
                  ? "bg-bg-tertiary text-text-primary"
                  : "hover:bg-bg-tertiary text-text-secondary"
              }`}
            >
              <button
                type="button"
                className="flex-1 flex items-center gap-2 text-left min-w-0"
                onClick={() => onSelect(bookmark.page)}
              >
                <BookmarkIcon className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm">{bookmark.label}</span>
                  <span className="text-xs text-text-secondary">
                    {formatDateTime(bookmark.createdAt)}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(bookmark.page);
                }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                title="Remove bookmark"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
        {bookmarks.length === 0 && (
          <li className="px-2 py-1 text-text-secondary text-sm">
            No bookmarks yet. Press Cmd+B to bookmark the current page.
          </li>
        )}
      </ul>
    </aside>
  );
}
