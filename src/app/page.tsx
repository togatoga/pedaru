'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { StandaloneWindowControls } from '@/components/StandaloneWindowControls';
import MainWindowHeader from '@/components/MainWindowHeader';
import MainSidebar from '@/components/MainSidebar';
import ViewerContent from '@/components/ViewerContent';
import OverlayContainer from '@/components/OverlayContainer';
import type { ViewMode, Bookmark, TabState, WindowState } from '@/types';

import { getTabLabel } from '@/lib/formatUtils';
import { getChapterForPage as getChapter } from '@/lib/pdfUtils';
import { useTauriEventListener } from '@/lib/eventUtils';
import { zoomIn, zoomOut, resetZoom } from '@/lib/zoomConfig';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useNavigation } from '@/hooks/useNavigation';
import { useSearch } from '@/hooks/useSearch';
import { useTabManagement } from '@/hooks/useTabManagement';
import { useWindowManagement } from '@/hooks/useWindowManagement';
import { usePdfLoader } from '@/hooks/usePdfLoader';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useStartup } from '@/hooks/useStartup';
import { usePdfViewerState } from '@/hooks/usePdfViewerState';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useHeaderVisibility } from '@/hooks/useHeaderVisibility';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useContextMenu } from '@/hooks/useContextMenu';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { useMenuHandlers } from '@/hooks/useMenuHandlers';
import { useWindowSync } from '@/hooks/useWindowSync';
import type { OpenWindow, Tab, HistoryEntry } from '@/hooks/types';

export default function Home() {
  // Debug: Log immediately on component mount
  console.log('=== Home component mounting ===');
  console.log('window.location.href:', typeof window !== 'undefined' ? window.location.href : 'SSR');
  console.log('window.location.search:', typeof window !== 'undefined' ? window.location.search : 'SSR');
  
  // All state managed via usePdfViewerState hook
  const {
    // State groups
    pdfFile,
    viewer,
    ui,
    search,
    history,
    tabWindow,
    pendingRestore,
    // Setters
    pdfFileSetters,
    viewerSetters,
    uiSetters,
    searchSetters,
    historySetters,
    tabWindowSetters,
    pendingRestoreSetters,
    // Refs
    refs,
    // Bookmarks
    bookmarks,
    setBookmarks,
    // Utility
    resetAllState,
  } = usePdfViewerState();

  // Destructure for easier access (compatibility with existing code)
  const { fileData, fileName, filePath, pdfInfo } = pdfFile;
  const { setFileData, setFileName, setFilePath, setPdfInfo } = pdfFileSetters;

  const { currentPage, totalPages, zoom, viewMode, isLoading, isStandaloneMode } = viewer;
  const { setCurrentPage, setTotalPages, setZoom, setViewMode, setIsLoading, setIsStandaloneMode } = viewerSetters;

  const { isTocOpen, showHistory, showBookmarks, showBookshelf, showWindows, showHeader, showSearchResults, showStandaloneSearch, sidebarWidth } = ui;
  const { setIsTocOpen, setShowHistory, setShowBookmarks, setShowBookshelf, setShowWindows, setShowHeader, setShowSearchResults, setShowStandaloneSearch, setSidebarWidth } = uiSetters;

  const searchQuery = search.query;
  const searchResults = search.results;
  const currentSearchIndex = search.currentIndex;
  const isSearching = search.isSearching;
  const { setSearchQuery, setSearchResults, setCurrentSearchIndex, setIsSearching } = searchSetters;

  const { pageHistory, historyIndex } = history;
  const { setPageHistory, setHistoryIndex } = historySetters;

  const { tabs, activeTabId, openWindows } = tabWindow;
  const { setTabs, setActiveTabId, setOpenWindows } = tabWindowSetters;

  const { pendingTabsRestore, pendingActiveTabIndex, pendingWindowsRestore } = pendingRestore;
  const { setPendingTabsRestore, setPendingActiveTabIndex, setPendingWindowsRestore } = pendingRestoreSetters;

  const {
    filePathRef,
    tabIdRef,
    headerWasHiddenBeforeSearchRef,
    tempShowHeaderRef,
    headerTimerRef,
    standaloneSearchInputRef,
    pdfDocRef,
    saveTimeoutRef,
    isRestoringSessionRef,
  } = refs;

  // Keep filePathRef in sync with filePath state
  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath, filePathRef]);

  const updateNativeWindowTitle = useCallback(async (page: number, forceStandalone?: boolean) => {
    // Check if we're in standalone mode - use forceStandalone for initial load
    // since isStandaloneMode state might not be set yet
    const isStandalone = forceStandalone ?? isStandaloneMode;
    if (!isStandalone) return;
    try {
      const win = getCurrentWebviewWindow();
      await win.setTitle(`Page ${page}`);
    } catch (e) {
      console.warn('Failed to update window title:', e);
    }
  }, [isStandaloneMode]);

  // Debug: Log component state changes
  useEffect(() => {
    console.log('Component state:', {
      hasFileData: !!fileData,
      fileName,
      filePath,
      currentPage,
      totalPages,
      isStandaloneMode,
      isLoading
    });
  }, [fileData, fileName, filePath, currentPage, totalPages, isStandaloneMode, isLoading]);

  // Helper function for getting chapter names
  const getChapterForPage = useCallback(
    (page: number) => getChapter(pdfInfo, page),
    [pdfInfo]
  );

  // Initialize custom hooks
  const {
    navigateToPageWithoutTabUpdate,
    goToPage,
    goToPageWithoutHistory,
    goToPrevPage,
    goToNextPage,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  } = useNavigation(
    currentPage,
    setCurrentPage,
    totalPages,
    viewMode,
    pageHistory,
    setPageHistory,
    historyIndex,
    setHistoryIndex,
    isStandaloneMode,
    tabs,
    setTabs,
    activeTabId,
    pdfInfo
  );

  const {
    toggleBookmark,
    removeBookmark,
    clearBookmarks,
    isCurrentPageBookmarked,
  } = useBookmarks(
    bookmarks,
    setBookmarks,
    currentPage,
    getChapterForPage,
    isStandaloneMode
  );

  const {
    performSearch,
    handleSearchChange,
    handleSearchNext,
    handleSearchPrev,
    handleSearchNextPreview,
    handleSearchPrevPreview,
    handleSearchConfirm,
    handlePdfDocumentLoad,
  } = useSearch(
    pdfDocRef,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    currentSearchIndex,
    setCurrentSearchIndex,
    isSearching,
    setIsSearching,
    showSearchResults,
    setShowSearchResults,
    totalPages,
    goToPage,
    goToPageWithoutHistory,
    isStandaloneMode,
    setViewMode
  );

  // Text selection and translation
  const { selection, autoExplain, clearSelection, triggerTranslation, triggerExplanation } = useTextSelection(
    pdfDocRef,
    currentPage,
    totalPages
  );

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Context menu (extracted to hook)
  const {
    contextMenuPosition,
    handleContextMenu,
    handleContextMenuCopy,
    handleContextMenuTranslate,
    handleContextMenuExplain,
    closeContextMenu,
  } = useContextMenu(triggerTranslation, triggerExplanation);

  // Close PDF and reset to empty state
  const closePdf = useCallback(() => {
    console.log('[closePdf] Closing PDF and resetting state');
    resetAllState();
  }, [resetAllState]);

  const {
    addTabFromCurrent,
    addTabForPage,
    selectTab,
    selectPrevTab,
    selectNextTab,
    closeCurrentTab,
  } = useTabManagement(
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    currentPage,
    tabIdRef,
    getChapterForPage,
    navigateToPageWithoutTabUpdate,
    goToPage,
    pdfInfo,
    isStandaloneMode,
    pendingTabsRestore,
    setPendingTabsRestore,
    pendingActiveTabIndex,
    setPendingActiveTabIndex,
    closePdf
  );

  const {
    focusWindow,
    openStandaloneWindowWithState,
    openStandaloneWindow,
    closeWindow,
    closeAllWindows,
    moveWindowToTab,
  } = useWindowManagement(
    filePath,
    openWindows,
    setOpenWindows,
    zoom,
    isStandaloneMode,
    pdfInfo,
    getChapterForPage,
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    tabIdRef,
    pendingWindowsRestore,
    setPendingWindowsRestore
  );

  const { loadPdfFromPath, loadPdfInternal: loadPdfFromPathInternal } = usePdfLoader({
    setFileData,
    setFileName,
    setFilePath,
    setPdfInfo,
    setCurrentPage,
    setZoom,
    setViewMode,
    setBookmarks,
    setPageHistory,
    setHistoryIndex,
    setSearchQuery,
    setSearchResults,
    setShowSearchResults,
    setIsLoading,
    setOpenWindows,
    setTabs,
    setActiveTabId,
    setPendingTabsRestore,
    setPendingActiveTabIndex,
    setPendingWindowsRestore,
    openWindows,
    isRestoringSessionRef,
  });

  // Zoom handlers using centralized config (consistent across keyboard and menu)
  const handleZoomIn = useCallback(() => {
    setZoom(zoomIn);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(zoomOut);
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(resetZoom());
  }, []);

  // Header visibility (extracted to hook)
  const { handleToggleHeader, showHeaderTemporarily } = useHeaderVisibility(
    showHeader,
    setShowHeader,
    tempShowHeaderRef,
    headerTimerRef
  );

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    currentPage,
    totalPages,
    goToPage,
    goToPrevPage,
    goToNextPage,
    goBack,
    goForward,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    isStandaloneMode,
    searchQuery,
    searchResults,
    handleSearchNextPreview,
    handleSearchPrevPreview,
    handleSearchConfirm,
    showSearchResults,
    setSearchQuery,
    setSearchResults,
    setShowSearchResults,
    setShowStandaloneSearch,
    standaloneSearchInputRef,
    tabs,
    activeTabId,
    addTabFromCurrent,
    closeCurrentTab,
    selectTab,
    toggleBookmark,
    openStandaloneWindow,
    toggleTwoColumn: () => setViewMode((prev) => (prev === 'two-column' ? 'single' : 'two-column')),
    toggleHeader: handleToggleHeader,
    showHeader,
    setShowHeader,
    headerWasHiddenBeforeSearchRef,
    showHeaderTemporarily,
    triggerTranslation,
    triggerExplanation,
  });

  // Note: loadPdfFromPathInternal and loadPdfFromPath now provided by usePdfLoader hook
  // Note: New PDFs are opened in new windows via the Opened event in Rust (like Preview app).

  // Open settings callback
  const handleOpenSettings = useCallback(() => {
    setShowSettingsModal(true);
  }, []);

  // Focus search input callback (for menu)
  const focusSearch = useCallback(() => {
    if (isStandaloneMode) {
      setShowStandaloneSearch(true);
      setTimeout(() => standaloneSearchInputRef.current?.focus(), 0);
    } else {
      // If header is hidden, show it and remember the state
      if (!showHeader) {
        headerWasHiddenBeforeSearchRef.current = true;
        setShowHeader(true);
      }
      // Focus search input in main window
      const searchInput = document.querySelector('input[placeholder="Search..."]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      // If there's a search query, show the results panel
      if (searchQuery && searchResults.length > 0) {
        setShowSearchResults(true);
      }
    }
  }, [isStandaloneMode, showHeader, searchQuery, searchResults.length]);

  // Menu event handlers (extracted to hook)
  useMenuHandlers({
    resetAllState,
    loadPdfFromPath,
    filePathRef,
    isStandaloneMode,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleToggleHeader,
    setViewMode,
    handleOpenSettings,
    goToPage,
    goToPrevPage,
    goToNextPage,
    goBack,
    goForward,
    totalPages,
    currentPage,
    addTabFromCurrent,
    closeCurrentTab,
    selectPrevTab,
    selectNextTab,
    openStandaloneWindow,
    focusSearch,
    toggleBookmark,
    triggerTranslation,
    triggerExplanation,
  });

  // Application startup logic (standalone mode, CLI file, session restore)
  useStartup({
    setIsStandaloneMode,
    setIsTocOpen,
    setCurrentPage,
    setZoom,
    setViewMode,
    setPdfInfo,
    setBookmarks,
    setPageHistory,
    setHistoryIndex,
    setPendingTabsRestore,
    setPendingActiveTabIndex,
    setPendingWindowsRestore,
    loadPdfFromPathInternal,
    loadPdfFromPath,
    updateNativeWindowTitle,
  });

  // Note: Tab and window restoration are handled via refs to avoid circular dependencies
  const pendingTabsRestoreRef = useRef<{ tabs: TabState[]; activeIndex: number | null } | null>(null);
  const pendingWindowsRestoreRef = useRef<WindowState[] | null>(null);

  // Update refs when pending restore states change
  useEffect(() => {
    if (pendingTabsRestore) {
      pendingTabsRestoreRef.current = { tabs: pendingTabsRestore, activeIndex: pendingActiveTabIndex };
      setPendingTabsRestore(null);
      setPendingActiveTabIndex(null);
    }
  }, [pendingTabsRestore, pendingActiveTabIndex]);

  useEffect(() => {
    if (pendingWindowsRestore) {
      pendingWindowsRestoreRef.current = pendingWindowsRestore;
      setPendingWindowsRestore(null);
    }
  }, [pendingWindowsRestore]);

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (selected && typeof selected === 'string') {
        await loadPdfFromPath(selected);
      }
    } catch (error) {
      console.error('Error opening file:', error);
      setIsLoading(false);
    }
  }, [loadPdfFromPath]);

  // Listen for open file menu event (must be after handleOpenFile is defined)
  useTauriEventListener(
    'menu-open-file-requested',
    handleOpenFile,
    [handleOpenFile]
  );

  const handleLoadSuccess = useCallback((numPages: number) => {
    setTotalPages(numPages);
  }, []);

  // Note: Navigation, bookmarks, search, tabs, and window management functions
  // are now provided by custom hooks above

  // Session persistence (extracted to hook)
  useSessionPersistence(
    filePath,
    isStandaloneMode,
    currentPage,
    zoom,
    viewMode,
    tabs,
    activeTabId,
    openWindows,
    bookmarks,
    pageHistory,
    historyIndex,
    saveTimeoutRef,
    isRestoringSessionRef
  );

  // Document title updates (extracted to hook)
  useDocumentTitle(fileName, pdfInfo, isStandaloneMode, currentPage, getChapterForPage);

  // Window synchronization (extracted to hook)
  useWindowSync(
    isStandaloneMode,
    zoom,
    viewMode,
    getChapterForPage,
    setOpenWindows,
    setBookmarks,
    setTabs,
    setActiveTabId,
    setCurrentPage,
    tabIdRef
  );


  // Show sidebar in main window for all sidebar types, or in standalone for ToC/History/Bookmarks
  const showSidebar = isStandaloneMode
    ? (isTocOpen || showHistory || showBookmarks)
    : (isTocOpen || showHistory || showBookmarks || showWindows);

  return (
    <main className="flex flex-col h-screen bg-bg-primary relative group">
      {/* Main window header (Header + TabBar) */}
      {!isStandaloneMode && (
        <MainWindowHeader
          showHeader={showHeader}
          fileName={fileName}
          pdfTitle={pdfInfo?.title || null}
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          viewMode={viewMode}
          isLoading={isLoading}
          showHistory={showHistory}
          showBookmarks={showBookmarks}
          showBookshelf={showBookshelf}
          showWindows={showWindows}
          searchQuery={searchQuery}
          searchResultCount={searchResults.length}
          currentSearchIndex={currentSearchIndex}
          windowCount={openWindows.length}
          tabCount={tabs.length}
          bookmarkCount={bookmarks.length}
          onOpenFile={handleOpenFile}
          onPrevPage={goToPrevPage}
          onNextPage={goToNextPage}
          onPageChange={goToPage}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onToggleToc={() => setIsTocOpen(!isTocOpen)}
          onViewModeChange={setViewMode}
          onToggleHistory={() => setShowHistory((prev) => !prev)}
          onToggleWindows={() => setShowWindows((prev) => !prev)}
          onToggleBookmarks={() => setShowBookmarks((prev) => !prev)}
          onToggleBookshelf={() => setShowBookshelf((prev) => !prev)}
          onSearchChange={handleSearchChange}
          onSearchPrev={handleSearchPrev}
          onSearchNext={handleSearchNext}
          onCloseAllWindows={closeAllWindows}
          tabs={tabs}
          activeTabId={activeTabId}
          openWindowsCount={openWindows.length}
          selectTab={selectTab}
          closeTab={closeCurrentTab}
          openStandaloneWindow={openStandaloneWindow}
          moveWindowToTab={moveWindowToTab}
          navigateToPageWithoutTabUpdate={navigateToPageWithoutTabUpdate}
          goToPage={goToPage}
          closePdf={closePdf}
          setTabs={setTabs}
          setActiveTabId={setActiveTabId}
        />
      )}

      {/* Standalone mode: Floating navigation */}
      {isStandaloneMode && totalPages > 0 && (
        <StandaloneWindowControls
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          viewMode={viewMode}
          isTocOpen={isTocOpen}
          showHistory={showHistory}
          showStandaloneSearch={showStandaloneSearch}
          searchQuery={searchQuery}
          bookmarks={bookmarks}
          isCurrentPageBookmarked={isCurrentPageBookmarked}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          standaloneSearchInputRef={standaloneSearchInputRef}
          goBack={goBack}
          goForward={goForward}
          goToPrevPage={goToPrevPage}
          goToNextPage={goToNextPage}
          setIsTocOpen={setIsTocOpen}
          setViewMode={setViewMode}
          setShowHistory={setShowHistory}
          toggleBookmark={toggleBookmark}
          handleZoomIn={handleZoomIn}
          handleZoomOut={handleZoomOut}
          setShowStandaloneSearch={setShowStandaloneSearch}
          setSearchQuery={setSearchQuery}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <MainSidebar
          showSidebar={showSidebar}
          isTocOpen={isTocOpen}
          showWindows={showWindows}
          showHistory={showHistory}
          showBookmarks={showBookmarks}
          sidebarWidth={sidebarWidth}
          setSidebarWidth={setSidebarWidth}
          toc={pdfInfo?.toc || []}
          currentPage={currentPage}
          windows={openWindows}
          onFocusWindow={focusWindow}
          onCloseWindow={(label) => {
            closeWindow(label);
            setOpenWindows((prev) => prev.filter((w) => w.label !== label));
          }}
          onMoveWindowToTab={(label, page) => moveWindowToTab(label, page)}
          history={pageHistory}
          historyIndex={historyIndex}
          onClearHistory={() => {
            setPageHistory([]);
            setHistoryIndex(-1);
          }}
          bookmarks={bookmarks}
          onRemoveBookmark={removeBookmark}
          onClearBookmarks={clearBookmarks}
          goToPage={goToPage}
        />

        {/* Viewer content */}
        <ViewerContent
          showBookshelf={showBookshelf}
          isStandaloneMode={isStandaloneMode}
          onOpenPdf={loadPdfFromPath}
          currentFilePath={filePath}
          onCloseBookshelf={() => setShowBookshelf(false)}
          fileData={fileData}
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          viewMode={viewMode}
          filePath={filePath}
          searchQuery={searchQuery}
          focusedSearchPage={searchResults[currentSearchIndex]?.page}
          focusedSearchMatchIndex={searchResults[currentSearchIndex]?.matchIndex}
          bookmarkedPages={bookmarks.map(b => b.page)}
          onToggleBookmark={(page) => {
            const existingIndex = bookmarks.findIndex((b) => b.page === page);
            if (existingIndex >= 0) {
              setBookmarks((prev) => prev.filter((b) => b.page !== page));
            } else {
              const chapter = getChapterForPage(page);
              const label = getTabLabel(page, chapter);
              setBookmarks((prev) => [...prev, { page, label, createdAt: Date.now() }]);
            }
          }}
          onLoadSuccess={handleLoadSuccess}
          onDocumentLoad={handlePdfDocumentLoad}
          onNavigatePage={goToPage}
          onContextMenu={handleContextMenu}
          showSearchResults={showSearchResults}
          searchResults={searchResults}
          currentSearchIndex={currentSearchIndex}
          isSearching={isSearching}
          onSearchResultSelect={(index) => {
            setCurrentSearchIndex(index);
            if (isStandaloneMode) {
              setViewMode('single');
            }
            goToPage(searchResults[index].page);
          }}
          onOpenInWindow={(page) => openStandaloneWindow(page)}
          onCloseSearchResults={() => {
            setShowSearchResults(false);
            setSearchQuery('');
            setSearchResults([]);
          }}
        />
      </div>

      {/* Overlay components (popups, modals, context menus) */}
      <OverlayContainer
        selection={selection}
        autoExplain={autoExplain}
        onClearSelection={clearSelection}
        onOpenSettings={() => setShowSettingsModal(true)}
        viewMode={viewMode}
        currentPage={currentPage}
        contextMenuPosition={contextMenuPosition}
        onContextMenuCopy={handleContextMenuCopy}
        onContextMenuTranslate={handleContextMenuTranslate}
        onContextMenuExplain={handleContextMenuExplain}
        onCloseContextMenu={closeContextMenu}
        showSettingsModal={showSettingsModal}
        onViewModeChange={setViewMode}
        onCloseSettings={() => setShowSettingsModal(false)}
      />
    </main>
  );
}
