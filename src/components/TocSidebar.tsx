"use client";

import { ChevronRight, FileText, Info } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { TocItemProps, TocSidebarProps } from "@/types/components";
import type { TocEntry } from "@/types/pdf";
import BookDetailModal from "./BookDetailModal";

// Helper: check if a TocEntry tree contains a specific page
function containsPage(entry: TocEntry, page: number): boolean {
  if (entry.page === page) return true;
  for (const child of entry.children) {
    if (containsPage(child, page)) return true;
  }
  return false;
}

function TocItem({ entry, depth, currentPage, onPageSelect }: TocItemProps) {
  // Default collapsed, but auto-expand the branch that contains the current page
  const isCurrentBranch = useMemo(
    () => containsPage(entry, currentPage),
    [entry, currentPage],
  );
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  useEffect(() => {
    setIsExpanded(isCurrentBranch);
  }, [isCurrentBranch]);
  const hasChildren = entry.children.length > 0;
  const isActive = entry.page !== null && entry.page === currentPage;
  const isNearby = entry.page !== null && entry.page <= currentPage;

  const handleClick = () => {
    if (entry.page) {
      onPageSelect(entry.page);
    }
  };

  return (
    <li>
      <button
        type="button"
        className={`
          toc-item flex items-center gap-2 py-2 px-3 cursor-pointer rounded-lg mx-2 my-0.5 w-[calc(100%-16px)] text-left
          ${isActive ? "bg-accent text-white" : isNearby ? "text-text-primary" : "text-text-secondary"}
          hover:bg-bg-tertiary
        `}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={handleClick}
      >
        {hasChildren && (
          <span
            role="img"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }
            }}
            className="p-0.5 hover:bg-bg-hover rounded transition-transform"
            style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            <ChevronRight className="w-4 h-4" />
          </span>
        )}
        {!hasChildren && <FileText className="w-4 h-4 opacity-50" />}

        <span className="flex-1 truncate text-sm">{entry.title}</span>

        {entry.page && (
          <span
            className={`text-xs ${isActive ? "text-white/80" : "text-text-secondary"}`}
          >
            {entry.page}
          </span>
        )}
      </button>

      {hasChildren && isExpanded && (
        <ul className="list-none">
          {entry.children.map((child) => (
            <TocItem
              key={`${child.title}-${child.page ?? "no-page"}`}
              entry={child}
              depth={depth + 1}
              currentPage={currentPage}
              onPageSelect={onPageSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function TocSidebar({
  toc,
  currentPage,
  isOpen,
  onPageSelect,
  pdfTitle,
  pdfAuthor,
  thumbnailUrl,
  pdfInfo,
  filePath,
}: TocSidebarProps) {
  const [showDetailModal, setShowDetailModal] = useState(false);

  if (!isOpen) return null;

  return (
    <aside className="w-80 bg-bg-secondary border-r border-bg-tertiary flex flex-col flex-shrink-0 overflow-hidden">
      {/* Book Info Card - Clickable to show details */}
      {(pdfTitle || thumbnailUrl) && (
        <button
          type="button"
          onClick={() => setShowDetailModal(true)}
          className="p-4 border-b border-bg-tertiary hover:bg-bg-tertiary/50 transition-colors text-left w-full"
        >
          <div className="flex items-start gap-3">
            {thumbnailUrl && (
              <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-bg-tertiary border border-bg-hover relative shadow-sm">
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
              {pdfTitle && (
                <h2 className="text-sm font-semibold text-text-primary leading-tight line-clamp-2">
                  {pdfTitle}
                </h2>
              )}
              {pdfAuthor && (
                <p className="text-xs text-text-secondary mt-1 truncate">
                  {pdfAuthor}
                </p>
              )}
            </div>
            <Info className="w-4 h-4 text-text-secondary flex-shrink-0 mt-0.5" />
          </div>
        </button>
      )}

      {/* Book Detail Modal */}
      <BookDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        pdfInfo={pdfInfo ?? null}
        thumbnailUrl={thumbnailUrl ?? null}
        filePath={filePath ?? null}
      />

      <div className="flex-1 overflow-y-auto py-2">
        {toc.length > 0 ? (
          <ul className="list-none">
            {toc.map((entry) => (
              <TocItem
                key={`${entry.title}-${entry.page ?? "no-page"}`}
                entry={entry}
                depth={0}
                currentPage={currentPage}
                onPageSelect={onPageSelect}
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary">
            <FileText className="w-12 h-12 opacity-30 mb-3" />
            <p className="text-sm">No table of contents</p>
          </div>
        )}
      </div>
    </aside>
  );
}
