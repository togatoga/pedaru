"use client";

import type { SidebarContainerProps } from "@/types/components";

/**
 * Reusable sidebar container component with consistent styling.
 * Used by all sidebar components (TOC, History, Bookmarks, Windows).
 */
export function SidebarContainer({
  header,
  children,
  className = "",
  width = "w-64",
}: SidebarContainerProps) {
  return (
    <aside
      className={`${width} shrink-0 border-r border-bg-tertiary bg-bg-secondary overflow-auto flex flex-col ${className}`}
    >
      <div className="px-3 py-2 border-b border-bg-tertiary shrink-0">
        {header}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
