"use client";

import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { PdfInfo, TocEntry } from "@/types/pdf";

export interface BookDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfInfo: PdfInfo | null;
  thumbnailUrl: string | null;
  filePath: string | null;
  isTocLoading?: boolean;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold text-text-primary">{label}</span>
      <span className="text-sm text-text-secondary truncate">
        {value || "Unknown"}
      </span>
    </div>
  );
}

// TOC Item with collapsible children
function TocItem({ entry, depth }: { entry: TocEntry; depth: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = entry.children.length > 0;

  return (
    <li>
      <div
        className="flex items-center gap-2 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary rounded px-2 -mx-2"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 hover:bg-bg-hover rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="flex-1 truncate">{entry.title}</span>
        {entry.page && (
          <span className="text-xs text-text-secondary">{entry.page}</span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <ul className="list-none">
          {entry.children.map((child, index) => (
            <TocItem
              key={`${child.title}-${child.page ?? index}`}
              entry={child}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function BookDetailModal({
  isOpen,
  onClose,
  pdfInfo,
  thumbnailUrl,
  filePath,
  isTocLoading = false,
}: BookDetailModalProps) {
  const [showToc, setShowToc] = useState(false);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fileName = filePath?.split("/").pop() || "Unknown";
  const hasToc = pdfInfo?.toc && pdfInfo.toc.length > 0;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key is handled via useEffect
    // biome-ignore lint/a11y/noStaticElementInteractions: Modal overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation is for click events only */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Modal content container */}
      <div
        className="bg-bg-secondary rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bg-tertiary">
          <h2 className="text-lg font-semibold text-text-primary">
            Book Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-bg-tertiary hover:bg-bg-hover text-text-secondary transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Book Info Header */}
        <div className="p-6 border-b border-bg-tertiary">
          <div className="flex items-start gap-4">
            {thumbnailUrl && (
              <div className="w-24 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-bg-tertiary border border-bg-hover relative shadow-md">
                <Image
                  src={thumbnailUrl}
                  alt="PDF thumbnail"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-semibold text-text-primary leading-tight">
                {pdfInfo?.title || fileName}
              </h3>
              {pdfInfo?.author && (
                <p className="text-sm text-text-secondary mt-2 line-clamp-2">
                  {pdfInfo.author}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="p-6 grid grid-cols-3 gap-x-6 gap-y-4 border-b border-bg-tertiary">
          <InfoItem label="Pages" value={pdfInfo?.pageCount?.toString()} />
          <InfoItem label="Created" value={formatDate(pdfInfo?.creationDate)} />
          <InfoItem label="Modified" value={formatDate(pdfInfo?.modDate)} />
          <InfoItem label="Format" value="PDF" />
          <InfoItem
            label="File Size"
            value={formatFileSize(pdfInfo?.fileSize)}
          />
          <div /> {/* Empty cell for grid alignment */}
        </div>

        {/* Table of Contents (Collapsible) */}
        {(hasToc || isTocLoading) && (
          <div className="border-b border-bg-tertiary">
            <button
              type="button"
              onClick={() => setShowToc(!showToc)}
              className="w-full flex items-center justify-between p-4 hover:bg-bg-tertiary/50 transition-colors"
            >
              <span className="text-sm font-semibold text-text-primary flex items-center gap-2">
                Table of Contents
                {isTocLoading ? (
                  <Loader2 className="w-4 h-4 text-text-tertiary animate-spin" />
                ) : hasToc ? (
                  <span className="text-text-tertiary font-normal">
                    ({pdfInfo?.toc.length} items)
                  </span>
                ) : null}
              </span>
              {showToc ? (
                <ChevronDown className="w-5 h-5 text-text-secondary" />
              ) : (
                <ChevronRight className="w-5 h-5 text-text-secondary" />
              )}
            </button>
            {showToc && (
              <div className="px-4 pb-4 max-h-64 overflow-y-auto">
                {isTocLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 text-accent animate-spin" />
                  </div>
                ) : hasToc ? (
                  <ul className="list-none">
                    {pdfInfo?.toc.map((entry, index) => (
                      <TocItem
                        key={`${entry.title}-${entry.page ?? index}`}
                        entry={entry}
                        depth={0}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-tertiary py-2">
                    No table of contents available
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* File Path */}
        {filePath && (
          <div className="p-6">
            <span className="text-sm font-semibold text-text-primary">
              File Path
            </span>
            <p className="text-sm text-text-secondary mt-1 break-all">
              {filePath}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
