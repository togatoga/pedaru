"use client";

import { createContext, type ReactNode, useContext } from "react";
import {
  type PdfViewerState,
  usePdfViewerState,
} from "@/hooks/usePdfViewerState";

/**
 * Context for sharing PDF viewer state across components and hooks
 */
const PdfViewerContext = createContext<PdfViewerState | null>(null);

/**
 * Provider component that wraps the application with PDF viewer state
 */
export function PdfViewerProvider({ children }: { children: ReactNode }) {
  const state = usePdfViewerState();

  return (
    <PdfViewerContext.Provider value={state}>
      {children}
    </PdfViewerContext.Provider>
  );
}

/**
 * Hook to access PDF viewer state from context
 * Must be used within a PdfViewerProvider
 */
export function usePdfViewerContext(): PdfViewerState {
  const context = useContext(PdfViewerContext);
  if (context === null) {
    throw new Error(
      "usePdfViewerContext must be used within a PdfViewerProvider",
    );
  }
  return context;
}

/**
 * Convenience hooks for accessing specific state groups
 */

export function usePdfFileContext() {
  const { pdfFile, pdfFileSetters } = usePdfViewerContext();
  return { ...pdfFile, ...pdfFileSetters };
}

export function useViewerContext() {
  const { viewer, viewerSetters } = usePdfViewerContext();
  return { ...viewer, ...viewerSetters };
}

export function useUIContext() {
  const { ui, uiSetters } = usePdfViewerContext();
  return { ...ui, ...uiSetters };
}

export function useSearchContext() {
  const { search, searchSetters } = usePdfViewerContext();
  return {
    searchQuery: search.query,
    searchResults: search.results,
    currentSearchIndex: search.currentIndex,
    isSearching: search.isSearching,
    ...searchSetters,
  };
}

export function useHistoryContext() {
  const { history, historySetters } = usePdfViewerContext();
  return { ...history, ...historySetters };
}

export function useTabWindowContext() {
  const { tabWindow, tabWindowSetters } = usePdfViewerContext();
  return { ...tabWindow, ...tabWindowSetters };
}

export function useBookmarksContext() {
  const { bookmarks, setBookmarks } = usePdfViewerContext();
  return { bookmarks, setBookmarks };
}

export function useRefsContext() {
  const { refs } = usePdfViewerContext();
  return refs;
}

export function usePendingRestoreContext() {
  const { pendingRestore, pendingRestoreSetters } = usePdfViewerContext();
  return { ...pendingRestore, ...pendingRestoreSetters };
}

export function useResetAllState() {
  const { resetAllState } = usePdfViewerContext();
  return resetAllState;
}
