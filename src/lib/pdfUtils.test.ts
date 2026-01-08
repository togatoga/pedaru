import { describe, expect, it } from "vitest";
import type { PdfInfo } from "@/types/pdf";
import {
  formatPageLabel,
  formatTabLabel,
  getChapterForPage,
  getTocBreadcrumb,
} from "./pdfUtils";

describe("pdfUtils", () => {
  describe("getChapterForPage", () => {
    const mockPdfInfo: PdfInfo = {
      title: "Test PDF",
      author: null,
      subject: null,
      toc: [
        { title: "Chapter 1", page: 1, children: [] },
        {
          title: "Chapter 2",
          page: 10,
          children: [
            { title: "Section 2.1", page: 12, children: [] },
            { title: "Section 2.2", page: 15, children: [] },
          ],
        },
        { title: "Chapter 3", page: 20, children: [] },
      ],
    };

    it("should return undefined when pdfInfo is null", () => {
      expect(getChapterForPage(null, 5)).toBeUndefined();
    });

    it("should return undefined when TOC is empty", () => {
      const emptyTocInfo: PdfInfo = {
        title: "Test PDF",
        author: null,
        subject: null,
        toc: [],
      };
      expect(getChapterForPage(emptyTocInfo, 5)).toBeUndefined();
    });

    it("should find chapter for page in top-level TOC", () => {
      expect(getChapterForPage(mockPdfInfo, 5)).toBe("Chapter 1");
      expect(getChapterForPage(mockPdfInfo, 11)).toBe("Chapter 2");
      expect(getChapterForPage(mockPdfInfo, 25)).toBe("Chapter 3");
    });

    it("should find nested section for page", () => {
      expect(getChapterForPage(mockPdfInfo, 13)).toBe("Section 2.1");
      expect(getChapterForPage(mockPdfInfo, 16)).toBe("Section 2.2");
    });

    it("should return most recent chapter when page is before first chapter", () => {
      // If page is before first chapter, should return undefined
      // But if there's a chapter at page 1, and we're on page 1, it should return that
      expect(getChapterForPage(mockPdfInfo, 1)).toBe("Chapter 1");
    });

    it("should return last applicable chapter for pages after last TOC entry", () => {
      expect(getChapterForPage(mockPdfInfo, 100)).toBe("Chapter 3");
    });
  });

  describe("formatPageLabel", () => {
    it("should format page number without chapter", () => {
      expect(formatPageLabel(5)).toBe("Page 5");
    });

    it("should format page number with chapter", () => {
      expect(formatPageLabel(5, "Introduction")).toBe("P5: Introduction");
    });
  });

  describe("formatTabLabel", () => {
    it("should format tab label without chapter", () => {
      expect(formatTabLabel(5)).toBe("Page 5");
    });

    it("should format tab label with short chapter name", () => {
      expect(formatTabLabel(5, "Intro")).toBe("Intro (P5)");
    });

    it("should truncate long chapter names", () => {
      const longChapter =
        "This is a very long chapter title that should be truncated";
      const result = formatTabLabel(5, longChapter);
      expect(result).toBe("This is a very long ... (P5)");
      expect(result.length).toBeLessThan(longChapter.length + 10);
    });
  });

  describe("getTocBreadcrumb", () => {
    it("should return empty array when pdfInfo is null", () => {
      expect(getTocBreadcrumb(null, 5)).toEqual([]);
    });

    it("should return empty array when TOC is empty", () => {
      const emptyTocInfo: PdfInfo = {
        title: "Test PDF",
        author: null,
        subject: null,
        toc: [],
      };
      expect(getTocBreadcrumb(emptyTocInfo, 5)).toEqual([]);
    });

    it("should return breadcrumb for 2-level hierarchy", () => {
      const pdfInfo: PdfInfo = {
        title: "Test PDF",
        author: null,
        subject: null,
        toc: [
          {
            title: "Chapter 1",
            page: 1,
            children: [{ title: "Section 1.1", page: 5, children: [] }],
          },
        ],
      };
      expect(getTocBreadcrumb(pdfInfo, 6)).toEqual([
        "Chapter 1",
        "Section 1.1",
      ]);
    });

    it("should return breadcrumb for 3-level hierarchy", () => {
      const pdfInfo: PdfInfo = {
        title: "Test PDF",
        author: null,
        subject: null,
        toc: [
          {
            title: "Chapter 1",
            page: 1,
            children: [
              {
                title: "Section 1.1",
                page: 5,
                children: [
                  { title: "Subsection 1.1.1", page: 10, children: [] },
                ],
              },
            ],
          },
        ],
      };
      expect(getTocBreadcrumb(pdfInfo, 12)).toEqual([
        "Chapter 1",
        "Section 1.1",
        "Subsection 1.1.1",
      ]);
    });

    it("should return breadcrumb for 4-level hierarchy", () => {
      const pdfInfo: PdfInfo = {
        title: "Test PDF",
        author: null,
        subject: null,
        toc: [
          {
            title: "Part 1",
            page: 1,
            children: [
              {
                title: "Chapter 1",
                page: 5,
                children: [
                  {
                    title: "Section 1.1",
                    page: 10,
                    children: [
                      { title: "Subsection 1.1.1", page: 15, children: [] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(getTocBreadcrumb(pdfInfo, 18)).toEqual([
        "Part 1",
        "Chapter 1",
        "Section 1.1",
        "Subsection 1.1.1",
      ]);
    });

    it("should return breadcrumb for 5-level hierarchy", () => {
      const pdfInfo: PdfInfo = {
        title: "Test PDF",
        author: null,
        subject: null,
        toc: [
          {
            title: "Part 1",
            page: 1,
            children: [
              {
                title: "Chapter 1",
                page: 5,
                children: [
                  {
                    title: "Section 1.1",
                    page: 10,
                    children: [
                      {
                        title: "Subsection 1.1.1",
                        page: 15,
                        children: [
                          { title: "Paragraph A", page: 20, children: [] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      expect(getTocBreadcrumb(pdfInfo, 22)).toEqual([
        "Part 1",
        "Chapter 1",
        "Section 1.1",
        "Subsection 1.1.1",
        "Paragraph A",
      ]);
    });

    it("should find correct breadcrumb when page is between entries", () => {
      const pdfInfo: PdfInfo = {
        title: "Test PDF",
        author: null,
        subject: null,
        toc: [
          {
            title: "Chapter 1",
            page: 1,
            children: [
              { title: "Section 1.1", page: 5, children: [] },
              { title: "Section 1.2", page: 15, children: [] },
            ],
          },
        ],
      };
      // Page 10 is after Section 1.1 (page 5) but before Section 1.2 (page 15)
      expect(getTocBreadcrumb(pdfInfo, 10)).toEqual([
        "Chapter 1",
        "Section 1.1",
      ]);
    });
  });
});
