"use client";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Bookmark, FileQuestion, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PageWithCustomTextLayerProps,
  PdfViewerProps,
} from "@/types/components";
import CustomTextLayer from "./CustomTextLayer";

// Set up PDF.js worker from CDN (local bundling doesn't work well with Next.js)
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Configure cMap for CJK fonts support
const cMapUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`;
const cMapPacked = true;

function PageWithCustomTextLayer({
  pageNumber,
  scale,
  searchQuery,
  focusedMatchIndex,
  pdfDocument,
  bookmarkedPages,
  onToggleBookmark,
}: PageWithCustomTextLayerProps) {
  const [pdfPage, setPdfPage] = useState<pdfjs.PDFPageProxy | null>(null);

  useEffect(() => {
    if (!pdfDocument) {
      setPdfPage(null);
      return;
    }

    let cancelled = false;

    const loadPage = async () => {
      try {
        // Check if document is still valid
        if (pdfDocument._transport?.destroyed) {
          return;
        }
        const page = await pdfDocument.getPage(pageNumber);
        if (!cancelled) {
          setPdfPage(page);
        }
      } catch (error) {
        // Ignore errors if component was unmounted or document was destroyed
        if (!cancelled) {
          console.warn("Failed to load page:", error);
        }
      }
    };

    loadPage();

    return () => {
      cancelled = true;
      setPdfPage(null);
    };
  }, [pdfDocument, pageNumber]);

  return (
    <div className="relative group">
      <Page
        pageNumber={pageNumber}
        scale={scale}
        loading={
          <div className="flex items-center justify-center p-20">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        }
        className="shadow-2xl"
        renderTextLayer={false}
        renderAnnotationLayer={true}
      />
      {/* Custom text layer overlay */}
      {pdfPage && (
        <CustomTextLayer
          page={pdfPage}
          scale={scale}
          pageNumber={pageNumber}
          searchQuery={searchQuery}
          focusedMatchIndex={focusedMatchIndex}
        />
      )}
      {/* Bookmark button */}
      {onToggleBookmark && (
        <button
          type="button"
          onClick={() => onToggleBookmark(pageNumber)}
          className={`absolute top-2 right-2 p-1 rounded transition-opacity ${
            bookmarkedPages.includes(pageNumber)
              ? "text-yellow-500 opacity-100"
              : "text-gray-400 opacity-60 hover:opacity-100 hover:text-gray-300"
          }`}
          title={
            bookmarkedPages.includes(pageNumber)
              ? "Remove Bookmark"
              : "Add Bookmark"
          }
          style={{ zIndex: 10 }}
        >
          <Bookmark
            className={`w-5 h-5 ${bookmarkedPages.includes(pageNumber) ? "fill-yellow-500" : ""}`}
          />
        </button>
      )}
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-accent/50 transition-colors pointer-events-none rounded" />
    </div>
  );
}

export default function PdfViewer({
  fileData,
  currentPage,
  totalPages,
  zoom,
  viewMode,
  filePath,
  searchQuery,
  focusedSearchPage,
  focusedSearchMatchIndex,
  bookmarkedPages = [],
  onToggleBookmark,
  onLoadSuccess,
  onDocumentLoad,
  onNavigatePage,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Create PDF source object for react-pdf (pass data directly instead of blob URL for Tauri compatibility)
  const pdfSource = useMemo(() => {
    if (!fileData) return null;
    // Create a new ArrayBuffer copy to ensure type compatibility
    const buffer = new ArrayBuffer(fileData.byteLength);
    new Uint8Array(buffer).set(fileData);
    return { data: buffer };
  }, [fileData]);

  // Memoize PDF.js options to prevent unnecessary reloads
  const pdfOptions = useMemo(
    () => ({
      cMapUrl,
      cMapPacked,
    }),
    [],
  );

  // Simple scale calculation - just use zoom directly
  const scale = Math.max(zoom, 0.1);

  // Store PDF document reference for named destination resolution
  const [pdfDocument, setPdfDocument] = useState<pdfjs.PDFDocumentProxy | null>(
    null,
  );

  // Reset document state when file data changes
  useEffect(() => {
    // When fileData changes, the old document will be destroyed by react-pdf
    // Reset our reference to prevent accessing destroyed document
    setPdfDocument(null);
  }, []);

  // Handle internal PDF link clicks (called by react-pdf when internal link is clicked)
  const handleInternalLinkClick = useCallback(
    (item: { dest?: unknown; pageIndex: number; pageNumber: number }) => {
      console.log("Internal link clicked:", item);
      if (onNavigatePage && item.pageNumber) {
        onNavigatePage(item.pageNumber);
      }
    },
    [onNavigatePage],
  );

  // Handle clicks on annotation layer links
  useEffect(() => {
    if (!containerRef.current) return;
    // Wait for pdfDocument to be loaded
    if (!pdfDocument) return;

    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Find the anchor element or section with data-annotation-id
      let anchor: HTMLAnchorElement | null = null;
      let section: HTMLElement | null = null;
      let el: HTMLElement | null = target;

      while (el) {
        if (el.tagName === "A" && !anchor) {
          anchor = el as HTMLAnchorElement;
        }
        if (el.tagName === "SECTION" && el.hasAttribute("data-annotation-id")) {
          section = el;
          break;
        }
        el = el.parentElement;
      }

      // Debug logging
      console.log("Click detected:", {
        target: target.tagName,
        anchor: anchor?.tagName,
        section: section?.tagName,
        href: anchor?.getAttribute("href"),
        dataDest: anchor?.getAttribute("data-dest"),
        annotationId: section?.getAttribute("data-annotation-id"),
      });

      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      const dataDest = anchor.getAttribute("data-dest");
      const annotationId = section?.getAttribute("data-annotation-id");

      // External links (http/https) - open in system browser
      if (href.startsWith("http://") || href.startsWith("https://")) {
        e.preventDefault();
        e.stopPropagation();
        openUrl(href).catch((err) => {
          console.error("Failed to open URL:", err);
        });
        return;
      }

      // If href is just "#" with no destination, try to get destination from annotation
      if (href === "#" && annotationId && onNavigatePage && pdfDocument) {
        e.preventDefault();
        e.stopPropagation();

        // Check if document is still valid
        if (pdfDocument._transport?.destroyed) {
          return;
        }

        console.log("Trying to resolve from annotation:", annotationId);

        // Find which page this annotation is on by checking parent elements
        let pageElement: HTMLElement | null = section;
        while (
          pageElement &&
          !pageElement.classList.contains("react-pdf__Page")
        ) {
          pageElement = pageElement.parentElement;
        }

        if (pageElement) {
          const pageNumberAttr = pageElement.getAttribute("data-page-number");
          const pageNum = pageNumberAttr
            ? parseInt(pageNumberAttr, 10)
            : currentPage;
          console.log("Annotation is on page:", pageNum);

          try {
            // Get annotations for the current page
            const page = await pdfDocument.getPage(pageNum);
            const annotations = await page.getAnnotations();
            console.log("Page annotations:", annotations.length);

            // Find the annotation with matching id
            const annotation = annotations.find(
              (a: { id: string; dest?: unknown }) => a.id === annotationId,
            );
            console.log("Found annotation:", annotation);

            if (annotation?.dest) {
              console.log("Annotation dest:", annotation.dest);

              // dest can be a string (named destination) or an array (explicit destination)
              if (typeof annotation.dest === "string") {
                const dest = await pdfDocument.getDestination(annotation.dest);
                if (dest && Array.isArray(dest) && dest.length > 0) {
                  const targetPageIndex = await pdfDocument.getPageIndex(
                    dest[0],
                  );
                  const targetPage = targetPageIndex + 1;
                  console.log("Resolved to page:", targetPage);
                  if (targetPage >= 1 && targetPage <= totalPages) {
                    onNavigatePage(targetPage);
                    return;
                  }
                }
              } else if (
                Array.isArray(annotation.dest) &&
                annotation.dest.length > 0
              ) {
                const targetPageIndex = await pdfDocument.getPageIndex(
                  annotation.dest[0],
                );
                const targetPage = targetPageIndex + 1;
                console.log("Resolved to page from array:", targetPage);
                if (targetPage >= 1 && targetPage <= totalPages) {
                  onNavigatePage(targetPage);
                  return;
                }
              }
            }
          } catch (err) {
            console.warn("Failed to get annotation info:", err);
          }
        }
        return;
      }

      // Internal link with data-dest attribute (PDF.js format)
      if (dataDest && onNavigatePage && pdfDocument) {
        e.preventDefault();
        e.stopPropagation();

        // Check if document is still valid
        if (pdfDocument._transport?.destroyed) {
          return;
        }

        console.log("Processing data-dest:", dataDest);

        try {
          // Try parsing as JSON array first
          const destArray = JSON.parse(dataDest);
          console.log("Parsed as JSON array:", destArray);
          if (Array.isArray(destArray) && destArray.length > 0) {
            const pageIndex = await pdfDocument.getPageIndex(destArray[0]);
            const pageNum = pageIndex + 1;
            console.log("Resolved page:", pageNum);
            if (pageNum >= 1 && pageNum <= totalPages) {
              onNavigatePage(pageNum);
              return;
            }
          }
        } catch {
          // Not JSON, try as named destination
          console.log("Not JSON, trying as named destination:", dataDest);
          try {
            const dest = await pdfDocument.getDestination(dataDest);
            console.log("Got destination:", dest);
            if (dest && Array.isArray(dest) && dest.length > 0) {
              const pageIndex = await pdfDocument.getPageIndex(dest[0]);
              const pageNum = pageIndex + 1;
              console.log("Resolved page from named dest:", pageNum);
              if (pageNum >= 1 && pageNum <= totalPages) {
                onNavigatePage(pageNum);
                return;
              }
            }
          } catch (err) {
            console.warn("Failed to resolve destination:", dataDest, err);
          }
        }
        return;
      }

      // Internal link with # href (but not just "#")
      if (
        href.startsWith("#") &&
        href.length > 1 &&
        onNavigatePage &&
        pdfDocument
      ) {
        e.preventDefault();
        e.stopPropagation();

        // Check if document is still valid
        if (pdfDocument._transport?.destroyed) {
          return;
        }

        const destName = decodeURIComponent(href.slice(1)); // Remove the '#' and decode
        console.log("Processing # href, destName:", destName);

        // Strategy 1: Try #page=XX format
        const pageMatch = destName.match(/^page=(\d+)/);
        if (pageMatch) {
          const pageNum = parseInt(pageMatch[1], 10);
          console.log("Matched page= format:", pageNum);
          if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
            onNavigatePage(pageNum);
            return;
          }
        }

        // Strategy 2: Try as a direct page number (some PDFs use #123)
        const directPageMatch = destName.match(/^(\d+)$/);
        if (directPageMatch) {
          const pageNum = parseInt(directPageMatch[1], 10);
          console.log("Matched direct page number:", pageNum);
          if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
            onNavigatePage(pageNum);
            return;
          }
        }

        // Strategy 3: Try named destination
        try {
          const dest = await pdfDocument.getDestination(destName);
          console.log("Got destination for named:", destName, dest);
          if (dest && Array.isArray(dest) && dest.length > 0) {
            const pageIndex = await pdfDocument.getPageIndex(dest[0]);
            const pageNum = pageIndex + 1;
            console.log("Resolved page:", pageNum);
            if (pageNum >= 1 && pageNum <= totalPages) {
              onNavigatePage(pageNum);
              return;
            }
          }
        } catch (err) {
          console.warn("Failed to get destination:", err);
        }

        console.warn("Could not resolve destination for:", destName);
      }
    };

    // Use capture phase to intercept before default behavior
    const container = containerRef.current;
    container.addEventListener("click", handleClick, true);

    return () => {
      container.removeEventListener("click", handleClick, true);
    };
  }, [pdfDocument, onNavigatePage, totalPages, currentPage]);

  if (!fileData || !pdfSource) {
    console.log("PdfViewer: No file data", {
      hasFileData: !!fileData,
      hasPdfSource: !!pdfSource,
      filePath,
    });
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-primary text-text-secondary">
        <FileQuestion className="w-24 h-24 opacity-20 mb-6" />
        <h2 className="text-2xl font-light text-text-primary mb-2">
          Pedaru PDF Viewer
        </h2>
        <p className="text-sm">Click "Open PDF" to get started</p>
        {filePath && (
          <p className="text-xs text-red-400 mt-4">
            Failed to load: {filePath}
          </p>
        )}
      </div>
    );
  }

  // Calculate pages to show for two-column mode
  const leftPage =
    viewMode === "two-column"
      ? currentPage % 2 === 0
        ? currentPage - 1
        : currentPage
      : currentPage;
  const rightPage = viewMode === "two-column" ? leftPage + 1 : null;
  const showRightPage = rightPage && rightPage <= totalPages;

  return (
    <div
      ref={containerRef}
      id="pdf-viewer-container"
      className="flex-1 bg-bg-primary overflow-auto"
    >
      <div
        className="flex items-center justify-center py-2 px-4"
        style={{
          minHeight: "100%",
        }}
      >
        <Document
          key={fileData?.length}
          file={pdfSource}
          options={pdfOptions}
          onLoadSuccess={(pdf) => {
            onLoadSuccess(pdf.numPages);
            setPdfDocument(pdf);
            if (onDocumentLoad) {
              onDocumentLoad(pdf);
            }
          }}
          onItemClick={handleInternalLinkClick}
          onLoadError={(error) => {
            console.error("PDF load error:", error);
          }}
          onPassword={(callback, reason) => {
            // Try empty password first for PDFs with owner password only
            if (reason === 1) {
              // Need password - try empty first
              callback("");
            } else {
              // Incorrect password - leave empty for now
              console.warn("PDF requires password");
              callback("");
            }
          }}
          loading={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-10 h-10 animate-spin text-accent" />
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center h-full text-red-400">
              <FileQuestion className="w-16 h-16 mb-4" />
              <p>Failed to load PDF</p>
            </div>
          }
          className="flex justify-center items-center"
        >
          {/* Left/Single Page */}
          <PageWithCustomTextLayer
            pageNumber={leftPage}
            scale={scale}
            searchQuery={searchQuery}
            focusedMatchIndex={
              leftPage === focusedSearchPage
                ? focusedSearchMatchIndex
                : undefined
            }
            pdfDocument={pdfDocument}
            bookmarkedPages={bookmarkedPages}
            onToggleBookmark={onToggleBookmark}
          />

          {/* Right Page (Two-column mode only) */}
          {viewMode === "two-column" && showRightPage && rightPage && (
            <PageWithCustomTextLayer
              pageNumber={rightPage}
              scale={scale}
              searchQuery={searchQuery}
              focusedMatchIndex={
                rightPage === focusedSearchPage
                  ? focusedSearchMatchIndex
                  : undefined
              }
              pdfDocument={pdfDocument}
              bookmarkedPages={bookmarkedPages}
              onToggleBookmark={onToggleBookmark}
            />
          )}
        </Document>
      </div>
    </div>
  );
}
