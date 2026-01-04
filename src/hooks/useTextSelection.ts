'use client';

import { useState, useCallback, useRef } from 'react';
import type { TextSelection } from '@/types';

/**
 * Hook for detecting and managing PDF text selection
 *
 * Translation is triggered manually via Cmd+J, not automatically on selection.
 *
 * @param pdfDocRef - Ref to the PDF document proxy from pdf.js
 * @param currentPage - The current page number
 * @param totalPages - Total number of pages in the document
 * @returns Selection data, clear function, and trigger function
 */
export function useTextSelection(
  pdfDocRef: React.MutableRefObject<any>,
  currentPage: number,
  totalPages: number
) {
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [autoExplain, setAutoExplain] = useState(false);
  const pageTextCacheRef = useRef<Map<number, string>>(new Map());

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelection(null);
    setAutoExplain(false);
  }, []);

  // Get text content from a page
  const getPageText = useCallback(
    async (pageNum: number): Promise<string> => {
      // Check cache first
      const cached = pageTextCacheRef.current.get(pageNum);
      if (cached !== undefined) {
        return cached;
      }

      const pdfDocument = pdfDocRef.current;
      if (!pdfDocument || pageNum < 1 || pageNum > totalPages) {
        return '';
      }

      try {
        if (pdfDocument._transport?.destroyed) {
          return '';
        }

        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .filter((item: any) => 'str' in item)
          .map((item: any) => item.str)
          .join(' ');

        // Cache the result
        pageTextCacheRef.current.set(pageNum, text);
        return text;
      } catch (error) {
        console.warn('Failed to get page text:', error);
        return '';
      }
    },
    [pdfDocRef, totalPages]
  );

  // Get the character offset and page number of the selection within the text layer
  const getSelectionInfo = useCallback((): { offset: number; pageNumber: number } | null => {
    const windowSelection = window.getSelection();
    if (!windowSelection || windowSelection.rangeCount === 0) {
      return null;
    }

    const range = windowSelection.getRangeAt(0);
    const startContainer = range.startContainer;

    // Find the text layer container
    const pdfViewer = document.getElementById('pdf-viewer-container');
    if (!pdfViewer) {
      return null;
    }

    // Find all custom text layers in the current page
    const textLayers = pdfViewer.querySelectorAll('.custom-text-layer');
    if (textLayers.length === 0) {
      return null;
    }

    // Find which span contains the selection start
    let selectedSpan: HTMLElement | null = null;
    let node: Node | null = startContainer;

    // Walk up the DOM tree to find the span with data-text-index
    while (node && node !== pdfViewer) {
      if (node instanceof HTMLElement && node.hasAttribute('data-text-index')) {
        selectedSpan = node;
        break;
      }
      node = node.parentNode;
    }

    if (!selectedSpan) {
      return null;
    }

    // Get the index of the selected span
    const spanIndex = parseInt(selectedSpan.getAttribute('data-text-index') || '-1', 10);
    if (spanIndex < 0) {
      return null;
    }

    // Find the text layer that contains this span and get its page number
    let containingTextLayer: Element | null = null;
    let pageNumber = -1;
    for (const textLayer of textLayers) {
      if (textLayer.contains(selectedSpan)) {
        containingTextLayer = textLayer;
        pageNumber = parseInt(textLayer.getAttribute('data-page-number') || '-1', 10);
        break;
      }
    }

    if (!containingTextLayer || pageNumber < 0) {
      return null;
    }

    // Get all spans in this text layer sorted by data-text-index
    const allSpans = Array.from(
      containingTextLayer.querySelectorAll('span[data-text-index]')
    ) as HTMLElement[];

    // Calculate offset: sum of (text length + 1 for space) for all spans before the selected one
    let offset = 0;
    for (const span of allSpans) {
      const idx = parseInt(span.getAttribute('data-text-index') || '-1', 10);
      if (idx < spanIndex) {
        // Add this span's text length + 1 for the space that joins items in getPageText
        offset += (span.textContent || '').length + 1;
      }
    }

    // Add the offset within the selected span
    offset += range.startOffset;

    return { offset, pageNumber };
  }, []);

  // Get surrounding context for the selection (before and after separately)
  const getContextParts = useCallback(
    async (
      selectedText: string,
      pageNum: number,
      selectionOffset: number
    ): Promise<{ contextBefore: string; contextAfter: string }> => {
      const contextLength = 500; // Characters before/after

      // Get text from current page and adjacent pages
      const prevPageText =
        pageNum > 1 ? await getPageText(pageNum - 1) : '';
      const currentPageText = await getPageText(pageNum);
      const nextPageText =
        pageNum < totalPages ? await getPageText(pageNum + 1) : '';

      // Combine texts
      const fullText = [prevPageText, currentPageText, nextPageText].join(' ');
      const prevPageLength = prevPageText.length + (prevPageText ? 1 : 0); // +1 for join space

      // Calculate the position in fullText using the selection offset directly
      let selectionIndex = -1;

      if (selectionOffset >= 0) {
        // Use the selection offset directly as the position within currentPageText
        // The offset from DOM corresponds to the position in the extracted text
        const estimatedIndex = prevPageLength + selectionOffset;

        // Verify by checking if the text at this position matches (with small tolerance)
        // Try exact position first, then search nearby if needed
        for (const delta of [0, -1, 1, -2, 2, -5, 5, -10, 10, -20, 20]) {
          const testIndex = estimatedIndex + delta;
          if (testIndex >= 0 && testIndex + selectedText.length <= fullText.length) {
            const textAtPosition = fullText.slice(
              testIndex,
              testIndex + selectedText.length
            );
            if (textAtPosition === selectedText) {
              selectionIndex = testIndex;
              break;
            }
          }
        }

        // If exact match not found nearby, use the estimated position anyway
        // (context will still be from the right area even if text doesn't match exactly)
        if (selectionIndex === -1) {
          selectionIndex = Math.max(0, Math.min(estimatedIndex, fullText.length - 1));
        }
      } else {
        // Fallback when offset is not available: search in current page region only
        const currentPageEnd =
          prevPageLength + currentPageText.length + (currentPageText ? 1 : 0);

        // Search only within current page region
        const currentPageRegion = fullText.slice(prevPageLength, currentPageEnd);
        const indexInCurrentPage = currentPageRegion.indexOf(selectedText);

        if (indexInCurrentPage !== -1) {
          selectionIndex = prevPageLength + indexInCurrentPage;
        } else {
          // Last resort: search entire text
          selectionIndex = fullText.indexOf(selectedText);
        }
      }

      if (selectionIndex === -1) {
        // If still not found, return current page text split in half as fallback
        const halfLength = Math.min(contextLength, currentPageText.length / 2);
        return {
          contextBefore: '...' + currentPageText.slice(0, halfLength),
          contextAfter: currentPageText.slice(-halfLength) + '...',
        };
      }

      // Extract context before the selection
      const beforeStartIndex = Math.max(0, selectionIndex - contextLength);
      let contextBefore = fullText.slice(beforeStartIndex, selectionIndex);
      if (beforeStartIndex > 0) {
        contextBefore = '...' + contextBefore;
      }

      // Extract context after the selection
      const afterEndIndex = Math.min(
        fullText.length,
        selectionIndex + selectedText.length + contextLength
      );
      let contextAfter = fullText.slice(selectionIndex + selectedText.length, afterEndIndex);
      if (afterEndIndex < fullText.length) {
        contextAfter = contextAfter + '...';
      }

      return { contextBefore, contextAfter };
    },
    [getPageText, totalPages]
  );

  // Determine if selection is a single word
  const isWordSelection = useCallback((text: string): boolean => {
    const trimmed = text.trim();

    // Check if text contains spaces or is very short
    if (!trimmed.includes(' ') && trimmed.length <= 30) {
      // Also check for punctuation that indicates sentences
      const sentencePunctuation = /[.!?;:,。、！？；：，]/;
      if (!sentencePunctuation.test(trimmed)) {
        return true;
      }
    }

    return false;
  }, []);

  // Manually trigger translation for current selection (called by Cmd+J or Cmd+E)
  const triggerTranslation = useCallback(async (withExplanation: boolean = false) => {
    const windowSelection = window.getSelection();
    if (!windowSelection || windowSelection.isCollapsed) {
      return;
    }

    const selectedText = windowSelection.toString().trim();
    if (!selectedText || selectedText.length === 0) {
      return;
    }

    // Check if selection is within the PDF viewer
    const range = windowSelection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const pdfViewer = document.getElementById('pdf-viewer-container');
    if (!pdfViewer || !pdfViewer.contains(container as Node)) {
      return;
    }

    // Get selection info (offset and page number) from DOM BEFORE clearing selection
    const selectionInfo = getSelectionInfo();
    const selectionOffset = selectionInfo?.offset ?? -1;
    const selectionPage = selectionInfo?.pageNumber ?? currentPage;

    // Determine if word or sentence
    const isWord = isWordSelection(selectedText);

    // Get position for popup (right side of selection)
    const rect = range.getBoundingClientRect();
    const position = {
      x: rect.right + 10,
      y: rect.top,
    };

    // Set auto-explain flag if Cmd+E was used
    setAutoExplain(withExplanation);

    // Show popup immediately with loading state
    setSelection({
      selectedText,
      contextBefore: '',
      contextAfter: '',
      isWord,
      position,
      contextLoading: true,
      pageNumber: selectionPage,
    });

    // Get context asynchronously and update (using selection page and offset for accurate positioning)
    const { contextBefore, contextAfter } = await getContextParts(selectedText, selectionPage, selectionOffset);
    setSelection({
      selectedText,
      contextBefore,
      contextAfter,
      isWord,
      position,
      contextLoading: false,
      pageNumber: selectionPage,
    });
  }, [currentPage, getContextParts, getSelectionInfo, isWordSelection]);

  // Trigger translation with auto-explanation (called by Cmd+E)
  const triggerExplanation = useCallback(async () => {
    await triggerTranslation(true);
  }, [triggerTranslation]);

  // Clear cache
  const clearCache = useCallback(() => {
    pageTextCacheRef.current.clear();
  }, []);

  return {
    selection,
    autoExplain,
    clearSelection,
    triggerTranslation,
    triggerExplanation,
    clearCache,
  };
}
