import { useCallback, useState } from "react";

/**
 * Custom hook for managing context menu state and handlers
 *
 * Handles showing/hiding context menu for PDF text selection
 * with copy, translate, and explain actions
 *
 * @param triggerTranslation - Function to trigger translation (optionally with auto-explain)
 * @param triggerExplanation - Function to trigger explanation
 * @returns Context menu state and handlers
 */
export function useContextMenu(
  triggerTranslation: (autoExplain?: boolean) => void,
  triggerExplanation: () => void,
) {
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Handle context menu (right-click)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Only show context menu if there's selected text
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
    const pdfViewer = document.getElementById("pdf-viewer-container");
    if (!pdfViewer || !pdfViewer.contains(container as Node)) {
      return;
    }

    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  // Copy selected text to clipboard
  const handleContextMenuCopy = useCallback(() => {
    const windowSelection = window.getSelection();
    if (windowSelection) {
      const selectedText = windowSelection.toString();
      navigator.clipboard.writeText(selectedText);
    }
  }, []);

  // Trigger translation
  const handleContextMenuTranslate = useCallback(() => {
    triggerTranslation(false);
  }, [triggerTranslation]);

  // Trigger explanation
  const handleContextMenuExplain = useCallback(() => {
    triggerExplanation();
  }, [triggerExplanation]);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  return {
    contextMenuPosition,
    handleContextMenu,
    handleContextMenuCopy,
    handleContextMenuTranslate,
    handleContextMenuExplain,
    closeContextMenu,
  };
}
