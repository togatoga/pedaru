"use client";

import { ExternalLink, Loader2, X } from "lucide-react";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { SearchResult } from "@/types";
import type { SearchResultsSidebarProps } from "@/types/components";

// Re-export for backward compatibility
export type { SearchResult };

export default function SearchResultsSidebar({
  query,
  results,
  currentIndex,
  isSearching,
  onSelect,
  onOpenInWindow,
  onClose,
}: SearchResultsSidebarProps) {
  const activeItemRef = useAutoScroll<HTMLButtonElement>([currentIndex]);

  if (!query) {
    return null;
  }

  return (
    <div className="w-80 min-w-[280px] max-w-[400px] bg-bg-secondary border-l border-bg-tertiary flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary">
        <div className="flex flex-col">
          <h3 className="text-sm font-medium text-text-primary">
            Search Results
          </h3>
          {isSearching ? (
            <span className="text-xs text-text-secondary flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Searching...
            </span>
          ) : (
            <span className="text-xs text-text-secondary">
              {results.length} match{results.length !== 1 ? "es" : ""} for "
              {query}"
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          title="Close search results"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-auto">
        {isSearching ? (
          <div className="flex items-center justify-center py-12 text-text-secondary">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
            <p className="text-sm">No results found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        ) : (
          results.map((result, index) => (
            <button
              type="button"
              key={`${result.page}-${result.matchIndex}`}
              ref={index === currentIndex ? activeItemRef : null}
              className={`w-full text-left px-4 py-3 border-b border-bg-tertiary cursor-pointer transition-colors hover:bg-bg-tertiary ${
                index === currentIndex
                  ? "bg-accent/20 border-l-2 border-l-accent"
                  : ""
              }`}
              onClick={() => onSelect(index)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-accent">
                  Page {result.page}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenInWindow(result.page);
                  }}
                  className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-accent transition-colors"
                  title="Open in new window"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                <span className="text-text-tertiary">...</span>
                {result.contextBefore}
                <mark className="bg-yellow-500/40 text-text-primary px-0.5 rounded">
                  {result.matchText}
                </mark>
                {result.contextAfter}
                <span className="text-text-tertiary">...</span>
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
