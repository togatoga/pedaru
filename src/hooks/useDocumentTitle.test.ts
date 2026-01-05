import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PdfInfo } from "./types";
import { useDocumentTitle } from "./useDocumentTitle";

// Mock Tauri APIs
const mockSetTitle = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    label: "test-window",
    setTitle: mockSetTitle,
  })),
}));

describe("useDocumentTitle", () => {
  const originalTitle = document.title;

  beforeEach(() => {
    document.title = "Test";
    mockSetTitle.mockClear();
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  describe("main window mode", () => {
    it("should set title from PDF title when available", () => {
      const pdfInfo: PdfInfo = {
        title: "My PDF Document",
        author: null,
        subject: null,
        toc: [],
      };

      renderHook(() =>
        useDocumentTitle("file.pdf", pdfInfo, false, 1, () => undefined),
      );

      expect(document.title).toBe("My PDF Document - Pedaru");
    });

    it("should set title from filename when PDF title is not available", () => {
      renderHook(() =>
        useDocumentTitle("my-file.pdf", null, false, 1, () => undefined),
      );

      expect(document.title).toBe("my-file.pdf - Pedaru");
    });

    it("should set default title when no PDF is loaded", () => {
      renderHook(() => useDocumentTitle(null, null, false, 1, () => undefined));

      expect(document.title).toBe("Pedaru - PDF Viewer");
    });

    it("should prefer PDF title over filename", () => {
      const pdfInfo: PdfInfo = {
        title: "PDF Title",
        author: null,
        subject: null,
        toc: [],
      };

      renderHook(() =>
        useDocumentTitle("filename.pdf", pdfInfo, false, 1, () => undefined),
      );

      expect(document.title).toBe("PDF Title - Pedaru");
    });
  });

  describe("standalone window mode", () => {
    it("should set title with page number", async () => {
      renderHook(() =>
        useDocumentTitle("file.pdf", null, true, 5, () => undefined),
      );

      // Wait for async effect
      await vi.waitFor(() => {
        expect(document.title).toBe("Page 5");
      });
      expect(mockSetTitle).toHaveBeenCalledWith("Page 5");
    });

    it("should include chapter name when available", async () => {
      const pdfInfo: PdfInfo = {
        title: "Test",
        author: null,
        subject: null,
        toc: [],
      };
      const getChapter = (page: number) =>
        page === 5 ? "Chapter 1" : undefined;

      renderHook(() =>
        useDocumentTitle("file.pdf", pdfInfo, true, 5, getChapter),
      );

      await vi.waitFor(() => {
        expect(document.title).toBe("Chapter 1 (Page 5)");
      });
      expect(mockSetTitle).toHaveBeenCalledWith("Chapter 1 (Page 5)");
    });

    it("should update title when page changes", async () => {
      const getChapter = () => undefined;

      const { rerender } = renderHook(
        ({ page }) =>
          useDocumentTitle("file.pdf", null, true, page, getChapter),
        { initialProps: { page: 1 } },
      );

      await vi.waitFor(() => {
        expect(document.title).toBe("Page 1");
      });

      rerender({ page: 10 });

      await vi.waitFor(() => {
        expect(document.title).toBe("Page 10");
      });
    });
  });
});
