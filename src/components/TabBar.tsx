"use client";

import type { Tab } from "@/types";
import type { TabBarProps } from "@/types/components";

/**
 * Tab bar component for managing multiple PDF tabs.
 * Supports drag-and-drop to reorder tabs or convert windows to tabs.
 */
export function TabBar({
  tabs,
  activeTabId,
  openWindowsCount,
  selectTab,
  openStandaloneWindow,
  moveWindowToTab,
  navigateToPageWithoutTabUpdate,
  closePdf,
  setTabs,
  setActiveTabId,
}: TabBarProps) {
  const handleWindowDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-pedaru-window")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleWindowDrop = (e: React.DragEvent) => {
    const windowData = e.dataTransfer.getData("application/x-pedaru-window");
    if (windowData) {
      e.preventDefault();
      try {
        const { label, page } = JSON.parse(windowData);
        moveWindowToTab(label, page);
      } catch (err) {
        console.warn("Failed to parse window data", err);
      }
    }
  };

  const handleTabClose = (e: React.MouseEvent, tab: Tab) => {
    e.stopPropagation();
    const tabIndex = tabs.findIndex((t) => t.id === tab.id);
    const newTabs = tabs.filter((t) => t.id !== tab.id);
    setTabs(newTabs);
    if (activeTabId === tab.id && newTabs.length > 0) {
      const newIndex = Math.min(tabIndex, newTabs.length - 1);
      setActiveTabId(newTabs[newIndex].id);
      navigateToPageWithoutTabUpdate(newTabs[newIndex].page);
    } else if (newTabs.length === 0) {
      setActiveTabId(null);
      closePdf();
    }
  };

  const handleTabDragEnd = (e: React.DragEvent, tab: Tab) => {
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (
      rect &&
      (e.clientY < rect.top - 50 ||
        e.clientY > rect.bottom + 50 ||
        e.clientX < rect.left - 50 ||
        e.clientX > rect.right + 50)
    ) {
      openStandaloneWindow(tab.page);
      setTabs((prev) => prev.filter((t) => t.id !== tab.id));
      if (activeTabId === tab.id) {
        const remaining = tabs.filter((t) => t.id !== tab.id);
        if (remaining.length > 0) {
          setActiveTabId(remaining[0].id);
          navigateToPageWithoutTabUpdate(remaining[0].page);
        } else {
          setActiveTabId(null);
        }
      }
    }
  };

  return (
    <div
      role="tablist"
      className="flex items-center gap-2 px-4 py-2 bg-bg-secondary border-b border-bg-tertiary min-h-[44px] overflow-x-auto scrollbar-thin scrollbar-thumb-bg-tertiary scrollbar-track-transparent"
      onDragOver={handleWindowDragOver}
      onDrop={handleWindowDrop}
    >
      {tabs.length === 0 && openWindowsCount > 0 && (
        <output
          className="text-text-secondary text-sm flex-1 py-2"
          onDragOver={handleWindowDragOver}
          onDrop={handleWindowDrop}
        >
          Drag windows here to create tabs
        </output>
      )}
      {tabs.map((tab) => (
        <div
          role="tab"
          tabIndex={0}
          aria-selected={activeTabId === tab.id}
          key={tab.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData(
              "application/x-pedaru-tab",
              JSON.stringify({ id: tab.id, page: tab.page }),
            );
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-pedaru-window")) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={(e) => {
            const windowData = e.dataTransfer.getData(
              "application/x-pedaru-window",
            );
            if (windowData) {
              e.preventDefault();
              e.stopPropagation();
              try {
                const { label, page } = JSON.parse(windowData);
                moveWindowToTab(label, page);
              } catch (err) {
                console.warn("Failed to parse window data", err);
              }
            }
          }}
          onDragEnd={(e) => handleTabDragEnd(e, tab)}
          onClick={() => selectTab(tab.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectTab(tab.id);
            }
          }}
          className={`group/tab flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-lg text-sm transition-colors cursor-grab active:cursor-grabbing max-w-[220px] shrink-0 ${
            activeTabId === tab.id
              ? "bg-accent text-white"
              : "bg-bg-tertiary hover:bg-bg-hover text-text-primary"
          }`}
          title={`${tab.label} - Drag outside to open in new window`}
        >
          <span className="truncate">{tab.label}</span>
          <button
            type="button"
            onClick={(e) => handleTabClose(e, tab)}
            className={`p-0.5 rounded opacity-0 group-hover/tab:opacity-100 transition-opacity ${
              activeTabId === tab.id
                ? "hover:bg-white/20"
                : "hover:bg-bg-tertiary"
            }`}
            title="Close tab"
            aria-label="Close tab"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
