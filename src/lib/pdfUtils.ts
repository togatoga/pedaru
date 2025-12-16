/**
 * PDF utility functions
 * Pure functions for PDF-related operations
 */

import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { PdfInfo, TocEntry } from '@/types/pdf';

/**
 * Finds the chapter/section title for a given page number from the PDF's table of contents
 *
 * @param pdfInfo - PDF metadata including table of contents
 * @param pageNum - Page number to find chapter for
 * @returns Chapter title if found, undefined otherwise
 */
export function getChapterForPage(
  pdfInfo: PdfInfo | null,
  pageNum: number
): string | undefined {
  if (!pdfInfo?.toc || pdfInfo.toc.length === 0) return undefined;

  let currentChapter: string | undefined;

  const findChapter = (entries: TocEntry[]): void => {
    for (const entry of entries) {
      if (entry.page !== null && entry.page <= pageNum) {
        currentChapter = entry.title;
      }
      if (entry.children && entry.children.length > 0) {
        findChapter(entry.children);
      }
    }
  };

  findChapter(pdfInfo.toc);
  return currentChapter;
}

/**
 * Updates the title of the current standalone window
 *
 * @param page - Page number to display in title
 */
export async function updateWindowTitle(page: number): Promise<void> {
  try {
    const win = getCurrentWebviewWindow();
    await win.setTitle(`Page ${page}`);
  } catch (e) {
    console.warn('Failed to update window title:', e);
  }
}

/**
 * Formats a page label with optional chapter information
 *
 * @param page - Page number
 * @param chapter - Optional chapter/section title
 * @returns Formatted label string
 */
export function formatPageLabel(page: number, chapter?: string): string {
  return chapter ? `P${page}: ${chapter}` : `Page ${page}`;
}

/**
 * Formats a tab label with page and chapter information
 *
 * @param page - Page number
 * @param chapter - Optional chapter/section title
 * @returns Formatted tab label
 */
export function formatTabLabel(page: number, chapter?: string): string {
  if (!chapter) return `Page ${page}`;
  if (chapter.length <= 20) return `${chapter} (P${page})`;
  return `${chapter.substring(0, 20)}... (P${page})`;
}
