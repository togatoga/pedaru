'use client';

import { useState } from 'react';
import { Bookmark as BookmarkIcon, Trash2, ArrowUpDown } from 'lucide-react';

export interface Bookmark {
  page: number;
  label: string;
  createdAt: number;
}

interface BookmarkSidebarProps {
  bookmarks: Bookmark[];
  currentPage: number;
  onSelect: (page: number) => void;
  onRemove: (page: number) => void;
  onClear?: () => void;
}

type SortMode = 'date' | 'page';

// Format date and time
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export default function BookmarkSidebar({
  bookmarks,
  currentPage,
  onSelect,
  onRemove,
  onClear,
}: BookmarkSidebarProps) {
  const [sortMode, setSortMode] = useState<SortMode>('date');

  // Sort based on mode
  const sortedBookmarks = [...bookmarks].sort((a, b) => {
    if (sortMode === 'date') {
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
          <span className="text-sm font-medium text-text-primary">Bookmarks</span>
        </div>
        <div className="flex items-center gap-2">
          {bookmarks.length > 0 && (
            <button
              onClick={() => setSortMode(sortMode === 'date' ? 'page' : 'date')}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
              title={`Sort by ${sortMode === 'date' ? 'page' : 'date'}`}
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortMode === 'date' ? 'Date' : 'Page'}
            </button>
          )}
          {onClear && bookmarks.length > 0 && (
            <button
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
          <li key={bookmark.page} className="group">
            <div
              className={`flex items-center justify-between w-full text-left px-2 py-1.5 rounded transition-colors ${
                bookmark.page === currentPage
                  ? 'bg-bg-tertiary text-text-primary'
                  : 'hover:bg-bg-tertiary text-text-secondary'
              }`}
            >
              <button
                className="flex-1 flex items-center gap-2 text-left min-w-0"
                onClick={() => onSelect(bookmark.page)}
              >
                <BookmarkIcon className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm">{bookmark.label}</span>
                  <span className="text-xs text-text-secondary">{formatDateTime(bookmark.createdAt)}</span>
                </div>
              </button>
              <button
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
