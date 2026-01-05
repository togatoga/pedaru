"use client";

import { ChevronRight, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TocItemProps, TocSidebarProps } from "@/types/components";
import { TocEntry } from "@/types/pdf";

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
      <div
        className={`
          toc-item flex items-center gap-2 py-2 px-3 cursor-pointer rounded-lg mx-2 my-0.5
          ${isActive ? "bg-accent text-white" : isNearby ? "text-text-primary" : "text-text-secondary"}
          hover:bg-bg-tertiary
        `}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={handleClick}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-bg-hover rounded transition-transform"
            style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
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
      </div>

      {hasChildren && isExpanded && (
        <ul className="list-none">
          {entry.children.map((child, index) => (
            <TocItem
              key={index}
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
}: TocSidebarProps) {
  if (!isOpen) return null;

  return (
    <aside className="w-80 bg-bg-secondary border-r border-bg-tertiary flex flex-col flex-shrink-0 overflow-hidden">
      <div className="p-4 border-b border-bg-tertiary">
        <h2 className="text-lg font-semibold text-text-primary">
          Table of Contents
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {toc.length > 0 ? (
          <ul className="list-none">
            {toc.map((entry, index) => (
              <TocItem
                key={index}
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
