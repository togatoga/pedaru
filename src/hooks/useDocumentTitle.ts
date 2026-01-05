import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect } from "react";
import type { PdfInfo } from "./types";

/**
 * Custom hook for managing document and window title updates
 *
 * Updates both the browser document title and native window title
 * based on PDF info, filename, and current page (for standalone mode)
 *
 * @param fileName - Current PDF file name
 * @param pdfInfo - PDF metadata including title
 * @param isStandaloneMode - Whether running in standalone window mode
 * @param currentPage - Current page number
 * @param getChapterForPage - Function to get chapter name for a page
 */
export function useDocumentTitle(
  fileName: string | null,
  pdfInfo: PdfInfo | null,
  isStandaloneMode: boolean,
  currentPage: number,
  getChapterForPage: (page: number) => string | undefined,
) {
  // Update document title for main window
  useEffect(() => {
    // Skip in standalone mode - handled separately below
    if (isStandaloneMode) return;

    if (pdfInfo?.title) {
      document.title = `${pdfInfo.title} - Pedaru`;
    } else if (fileName) {
      document.title = `${fileName} - Pedaru`;
    } else {
      document.title = "Pedaru - PDF Viewer";
    }
  }, [pdfInfo, fileName, isStandaloneMode]);

  // Update standalone window title when page changes
  useEffect(() => {
    if (!isStandaloneMode) return;

    const updateTitle = async () => {
      try {
        const chapter = pdfInfo ? getChapterForPage(currentPage) : undefined;
        const title = chapter
          ? `${chapter} (Page ${currentPage})`
          : `Page ${currentPage}`;
        document.title = title;
        const win = getCurrentWebviewWindow();
        await win.setTitle(title);
      } catch (e) {
        console.error("Failed to update window title:", e);
      }
    };

    updateTitle();
  }, [isStandaloneMode, currentPage, pdfInfo, getChapterForPage]);
}
