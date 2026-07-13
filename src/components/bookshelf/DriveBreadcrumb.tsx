"use client";

import { ChevronRight } from "lucide-react";

interface DriveBreadcrumbProps {
  folderPath: Array<{ id: string; name: string }>;
  onNavigate: (index: number) => void;
}

/**
 * Breadcrumb bar for navigating Google Drive folder hierarchy
 */
export default function DriveBreadcrumb({
  folderPath,
  onNavigate,
}: DriveBreadcrumbProps) {
  return (
    <div className="px-6 py-3 border-b border-bg-tertiary flex items-center gap-2 text-sm flex-wrap">
      <button
        type="button"
        onClick={() => onNavigate(0)}
        className="text-accent hover:underline"
      >
        My Drive
      </button>
      {folderPath.map((folder, index) => (
        <span
          key={folder.id || `path-${index}`}
          className="flex items-center gap-2"
        >
          <ChevronRight className="w-4 h-4 text-text-tertiary" />
          <button
            type="button"
            onClick={() => onNavigate(index + 1)}
            className="text-accent hover:underline"
          >
            {folder.name}
          </button>
        </span>
      ))}
    </div>
  );
}
