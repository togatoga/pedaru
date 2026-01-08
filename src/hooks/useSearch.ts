import type {
  PDFDocumentProxy,
  TextItem,
} from "pdfjs-dist/types/src/display/api";
import { type Dispatch, type SetStateAction, useCallback, useRef } from "react";
import type { SearchResult, ViewMode } from "./types";

/**
 * Custom hook for PDF full-text search functionality
 *
 * Handles incremental search, result navigation, and search cancellation
 *
 * @param pdfDocRef - Ref to the PDF document proxy from pdf.js
 * @param searchQuery - Current search query string
 * @param setSearchQuery - State setter for search query
 * @param searchResults - Array of search results
 * @param setSearchResults - State setter for search results
 * @param currentSearchIndex - Current position in search results
 * @param setCurrentSearchIndex - State setter for current search index
 * @param isSearching - Whether search is in progress
 * @param setIsSearching - State setter for searching status
 * @param showSearchResults - Whether search results panel is visible
 * @param setShowSearchResults - State setter for search results visibility
 * @param totalPages - Total number of pages in PDF
 * @param goToPage - Function to navigate to a specific page (adds to history)
 * @param goToPageWithoutHistory - Function to navigate to a specific page (does not add to history)
 * @param isStandaloneMode - Whether running in standalone window
 * @param setViewMode - State setter for view mode (for auto-switching to single page)
 * @returns Search functions and PDF document handler
 */
export function useSearch(
  pdfDocRef: React.MutableRefObject<PDFDocumentProxy | null>,
  _searchQuery: string,
  setSearchQuery: Dispatch<SetStateAction<string>>,
  searchResults: SearchResult[],
  setSearchResults: Dispatch<SetStateAction<SearchResult[]>>,
  currentSearchIndex: number,
  setCurrentSearchIndex: Dispatch<SetStateAction<number>>,
  _isSearching: boolean,
  setIsSearching: Dispatch<SetStateAction<boolean>>,
  _showSearchResults: boolean,
  setShowSearchResults: Dispatch<SetStateAction<boolean>>,
  totalPages: number,
  goToPage: (page: number) => void,
  goToPageWithoutHistory: (page: number) => void,
  isStandaloneMode: boolean,
  setViewMode: Dispatch<SetStateAction<ViewMode>>,
) {
  // Ref to track current search ID for cancellation
  const searchIdRef = useRef<number>(0);

  /**
   * Performs full-text search across all pages
   * Uses incremental updates and setTimeout to avoid blocking UI
   */
  const performSearch = useCallback(
    async (query: string) => {
      // Increment search ID to cancel any previous search
      const currentSearchId = ++searchIdRef.current;

      if (!query.trim() || !pdfDocRef.current) {
        setSearchResults([]);
        setCurrentSearchIndex(0);
        setShowSearchResults(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setShowSearchResults(true);
      setSearchResults([]); // Clear previous results

      const results: SearchResult[] = [];
      const lowerQuery = query.toLowerCase();
      const doc = pdfDocRef.current;
      const contextLength = 40;

      try {
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          // Check if search was cancelled
          if (searchIdRef.current !== currentSearchId) {
            return;
          }

          const page = await doc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const fullText = textContent.items
            .filter((item): item is TextItem => "str" in item)
            .map((item) => item.str)
            .join(" ");
          const lowerText = fullText.toLowerCase();

          let startIndex = 0;
          let foundIndex = lowerText.indexOf(lowerQuery, startIndex);
          let matchIndex = 0;

          while (foundIndex !== -1) {
            const contextStart = Math.max(0, foundIndex - contextLength);
            const contextEnd = Math.min(
              fullText.length,
              foundIndex + query.length + contextLength,
            );

            const contextBefore = fullText.slice(contextStart, foundIndex);
            const matchText = fullText.slice(
              foundIndex,
              foundIndex + query.length,
            );
            const contextAfter = fullText.slice(
              foundIndex + query.length,
              contextEnd,
            );

            results.push({
              page: pageNum,
              matchIndex,
              contextBefore,
              matchText,
              contextAfter,
            });

            matchIndex++;
            startIndex = foundIndex + 1;
            foundIndex = lowerText.indexOf(lowerQuery, startIndex);
          }

          // Yield to UI thread every few pages to keep it responsive
          if (pageNum % 5 === 0) {
            // Update results incrementally
            if (searchIdRef.current === currentSearchId) {
              setSearchResults([...results]);
            }
            // Allow UI to update
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      } catch (e) {
        console.error("Search error:", e);
      }

      // Final update if search wasn't cancelled
      if (searchIdRef.current === currentSearchId) {
        setSearchResults(results);
        setCurrentSearchIndex(0);
        setIsSearching(false);
      }
    },
    [
      totalPages,
      setSearchResults,
      setCurrentSearchIndex,
      setShowSearchResults,
      setIsSearching,
      pdfDocRef.current,
    ],
  );

  /**
   * Handles search query changes with debouncing
   */
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      // Debounce search
      const timeoutId = setTimeout(() => {
        performSearch(query);
      }, 300);
      return () => clearTimeout(timeoutId);
    },
    [performSearch, setSearchQuery],
  );

  /**
   * Navigate to next search result
   * Wraps around to first result after last
   */
  const handleSearchNext = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    // Switch to single page mode only in standalone window
    if (isStandaloneMode) {
      setViewMode("single");
    }
    goToPage(searchResults[nextIndex].page);
  }, [
    searchResults,
    currentSearchIndex,
    goToPage,
    isStandaloneMode,
    setCurrentSearchIndex,
    setViewMode,
  ]);

  /**
   * Navigate to previous search result
   * Wraps around to last result before first
   */
  const handleSearchPrev = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    // Switch to single page mode only in standalone window
    if (isStandaloneMode) {
      setViewMode("single");
    }
    goToPage(searchResults[prevIndex].page);
  }, [
    searchResults,
    currentSearchIndex,
    goToPage,
    isStandaloneMode,
    setCurrentSearchIndex,
    setViewMode,
  ]);

  /**
   * Preview next search result without adding to history
   * Wraps around to first result after last
   */
  const handleSearchNextPreview = useCallback(() => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    // Switch to single page mode only in standalone window
    if (isStandaloneMode) {
      setViewMode("single");
    }
    goToPageWithoutHistory(searchResults[nextIndex].page);
  }, [
    searchResults,
    currentSearchIndex,
    goToPageWithoutHistory,
    isStandaloneMode,
    setCurrentSearchIndex,
    setViewMode,
  ]);

  /**
   * Preview previous search result without adding to history
   * Wraps around to last result before first
   */
  const handleSearchPrevPreview = useCallback(() => {
    if (searchResults.length === 0) return;
    const prevIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(prevIndex);
    // Switch to single page mode only in standalone window
    if (isStandaloneMode) {
      setViewMode("single");
    }
    goToPageWithoutHistory(searchResults[prevIndex].page);
  }, [
    searchResults,
    currentSearchIndex,
    goToPageWithoutHistory,
    isStandaloneMode,
    setCurrentSearchIndex,
    setViewMode,
  ]);

  /**
   * Confirm current search result and add to history
   * Closes the search results panel
   */
  const handleSearchConfirm = useCallback(() => {
    if (searchResults.length === 0) return;
    // Add current page to history
    goToPage(searchResults[currentSearchIndex].page);
    // Close search results panel
    setShowSearchResults(false);
  }, [searchResults, currentSearchIndex, goToPage, setShowSearchResults]);

  /**
   * Store PDF document reference for search operations
   * Called by PdfViewer when document loads
   */
  const handlePdfDocumentLoad = useCallback(
    (pdf: PDFDocumentProxy) => {
      pdfDocRef.current = pdf;
    },
    [pdfDocRef],
  );

  return {
    performSearch,
    handleSearchChange,
    handleSearchNext,
    handleSearchPrev,
    handleSearchNextPreview,
    handleSearchPrevPreview,
    handleSearchConfirm,
    handlePdfDocumentLoad,
  };
}
