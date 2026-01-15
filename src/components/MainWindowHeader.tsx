"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Tab, ViewMode } from "@/types";
import Header from "./Header";
import { TabBar } from "./TabBar";

export interface MainWindowHeaderProps {
  // Visibility
  showHeader: boolean;
  // Header props
  fileName: string | null;
  pdfTitle: string | null;
  totalPages: number;
  zoom: number;
  viewMode: ViewMode;
  isLoading: boolean;
  showHistory: boolean;
  showBookmarks: boolean;
  showBookshelf: boolean;
  showWindows: boolean;
  searchQuery: string;
  searchResultCount: number;
  currentSearchIndex: number;
  windowCount: number;
  bookmarkCount: number;
  thumbnailUrl: string | null;
  // Header handlers
  onOpenFile: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleToc: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleHistory: () => void;
  onToggleWindows: () => void;
  onToggleBookmarks: () => void;
  onToggleBookshelf: () => void;
  onSearchChange: (query: string) => void;
  onSearchPrev: () => void;
  onSearchNext: () => void;
  onCloseAllWindows: () => void;
  // TabBar props
  tabs: Tab[];
  activeTabId: number | null;
  openWindowsCount: number;
  selectTab: (id: number) => void;
  closeTab: () => void;
  openStandaloneWindow: (page: number) => void;
  moveWindowToTab: (label: string, page: number) => void;
  navigateToPageWithoutTabUpdate: (page: number) => void;
  goToPage: (page: number) => void;
  closePdf: () => void;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveTabId: Dispatch<SetStateAction<number | null>>;
}

/**
 * Main window header area containing the navigation header and tab bar.
 * Only rendered in main window mode (not standalone).
 */
export default function MainWindowHeader({
  // Visibility
  showHeader,
  // Header props
  fileName,
  pdfTitle,
  totalPages,
  zoom,
  viewMode,
  isLoading,
  showHistory,
  showBookmarks,
  showBookshelf,
  showWindows,
  searchQuery,
  searchResultCount,
  currentSearchIndex,
  windowCount,
  bookmarkCount,
  thumbnailUrl,
  onOpenFile,
  onZoomIn,
  onZoomOut,
  onToggleToc,
  onViewModeChange,
  onToggleHistory,
  onToggleWindows,
  onToggleBookmarks,
  onToggleBookshelf,
  onSearchChange,
  onSearchPrev,
  onSearchNext,
  onCloseAllWindows,
  // TabBar props
  tabs,
  activeTabId,
  openWindowsCount,
  selectTab,
  closeTab,
  openStandaloneWindow,
  moveWindowToTab,
  navigateToPageWithoutTabUpdate,
  goToPage,
  closePdf,
  setTabs,
  setActiveTabId,
}: MainWindowHeaderProps) {
  if (!showHeader) {
    return null;
  }

  return (
    <>
      <Header
        fileName={fileName}
        pdfTitle={pdfTitle}
        totalPages={totalPages}
        zoom={zoom}
        viewMode={viewMode}
        isLoading={isLoading}
        showHistory={showHistory}
        showBookmarks={showBookmarks}
        showBookshelf={showBookshelf}
        searchQuery={searchQuery}
        searchResultCount={searchResultCount}
        currentSearchIndex={currentSearchIndex}
        onOpenFile={onOpenFile}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onToggleToc={onToggleToc}
        onViewModeChange={onViewModeChange}
        onToggleHistory={onToggleHistory}
        onToggleWindows={onToggleWindows}
        onToggleBookmarks={onToggleBookmarks}
        onToggleBookshelf={onToggleBookshelf}
        onSearchChange={onSearchChange}
        onSearchPrev={onSearchPrev}
        onSearchNext={onSearchNext}
        windowCount={windowCount}
        bookmarkCount={bookmarkCount}
        onCloseAllWindows={onCloseAllWindows}
        showWindows={showWindows}
        thumbnailUrl={thumbnailUrl}
      />

      {/* Tabs bar - shows when tabs exist OR when windows exist (for drop target) */}
      {(tabs.length > 0 || openWindowsCount > 0) && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          openWindowsCount={openWindowsCount}
          selectTab={selectTab}
          closeTab={closeTab}
          openStandaloneWindow={openStandaloneWindow}
          moveWindowToTab={moveWindowToTab}
          navigateToPageWithoutTabUpdate={navigateToPageWithoutTabUpdate}
          goToPage={goToPage}
          closePdf={closePdf}
          setTabs={setTabs}
          setActiveTabId={setActiveTabId}
        />
      )}
    </>
  );
}
