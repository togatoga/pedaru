import { describe, it, expect, vi } from 'vitest';
import { getChapterForPage, formatPageLabel, formatTabLabel } from './pdfUtils';
import type { PdfInfo } from '@/types/pdf';

describe('pdfUtils', () => {
  describe('getChapterForPage', () => {
    const mockPdfInfo: PdfInfo = {
      title: 'Test PDF',
      author: null,
      subject: null,
      toc: [
        { title: 'Chapter 1', page: 1, children: [] },
        {
          title: 'Chapter 2',
          page: 10,
          children: [
            { title: 'Section 2.1', page: 12, children: [] },
            { title: 'Section 2.2', page: 15, children: [] },
          ],
        },
        { title: 'Chapter 3', page: 20, children: [] },
      ],
    };

    it('should return undefined when pdfInfo is null', () => {
      expect(getChapterForPage(null, 5)).toBeUndefined();
    });

    it('should return undefined when TOC is empty', () => {
      const emptyTocInfo: PdfInfo = {
        title: 'Test PDF',
        author: null,
        subject: null,
        toc: [],
      };
      expect(getChapterForPage(emptyTocInfo, 5)).toBeUndefined();
    });

    it('should find chapter for page in top-level TOC', () => {
      expect(getChapterForPage(mockPdfInfo, 5)).toBe('Chapter 1');
      expect(getChapterForPage(mockPdfInfo, 11)).toBe('Chapter 2');
      expect(getChapterForPage(mockPdfInfo, 25)).toBe('Chapter 3');
    });

    it('should find nested section for page', () => {
      expect(getChapterForPage(mockPdfInfo, 13)).toBe('Section 2.1');
      expect(getChapterForPage(mockPdfInfo, 16)).toBe('Section 2.2');
    });

    it('should return most recent chapter when page is before first chapter', () => {
      // If page is before first chapter, should return undefined
      // But if there's a chapter at page 1, and we're on page 1, it should return that
      expect(getChapterForPage(mockPdfInfo, 1)).toBe('Chapter 1');
    });

    it('should return last applicable chapter for pages after last TOC entry', () => {
      expect(getChapterForPage(mockPdfInfo, 100)).toBe('Chapter 3');
    });
  });

  describe('formatPageLabel', () => {
    it('should format page number without chapter', () => {
      expect(formatPageLabel(5)).toBe('Page 5');
    });

    it('should format page number with chapter', () => {
      expect(formatPageLabel(5, 'Introduction')).toBe('P5: Introduction');
    });
  });

  describe('formatTabLabel', () => {
    it('should format tab label without chapter', () => {
      expect(formatTabLabel(5)).toBe('Page 5');
    });

    it('should format tab label with short chapter name', () => {
      expect(formatTabLabel(5, 'Intro')).toBe('Intro (P5)');
    });

    it('should truncate long chapter names', () => {
      const longChapter = 'This is a very long chapter title that should be truncated';
      const result = formatTabLabel(5, longChapter);
      expect(result).toBe('This is a very long ... (P5)');
      expect(result.length).toBeLessThan(longChapter.length + 10);
    });
  });
});
