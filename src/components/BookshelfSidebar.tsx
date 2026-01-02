'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Library,
  RefreshCw,
  Settings,
  LogIn,
  LogOut,
  FolderPlus,
  ChevronRight,
  Loader2,
  X,
  Download,
  Grid,
  List,
  Search,
} from 'lucide-react';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { useBookshelf } from '@/hooks/useBookshelf';
import { generateThumbnailsInBackground } from '@/lib/thumbnailGenerator';
import BookshelfItem, { type BookshelfViewMode } from './BookshelfItem';
import type { BookshelfItem as BookshelfItemType, DriveFolder } from '@/types';

interface BookshelfSidebarProps {
  onOpenPdf: (localPath: string) => void;
  currentFilePath?: string | null;
}

/**
 * Bookshelf sidebar component for managing Google Drive PDFs
 */
export default function BookshelfSidebar({ onOpenPdf, currentFilePath }: BookshelfSidebarProps) {
  const {
    authStatus,
    isLoading: authLoading,
    error: authError,
    syncedFolders,
    hasCheckedAuth,
    checkAuthStatus,
    saveCredentials,
    login,
    logout,
    listDriveFolders,
    addSyncFolder,
    removeSyncFolder,
  } = useGoogleAuth();

  const {
    items,
    isLoading: bookshelfLoading,
    isSyncing,
    error: bookshelfError,
    sync,
    downloadItem,
    cancelDownload,
    deleteLocalCopy,
    resetDownloadStatus,
    updateThumbnail,
    updateLocalThumbnail,
    getItemsNeedingThumbnails,
    deleteItem,
  } = useBookshelf();

  const [showSettings, setShowSettings] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [browseFolders, setBrowseFolders] = useState<DriveFolder[]>([]);
  const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [viewMode, setViewMode] = useState<BookshelfViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentDownloadIndex, setCurrentDownloadIndex] = useState(0);
  const [totalDownloads, setTotalDownloads] = useState(0);
  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'downloaded'>('all');

  // Credentials input (for first-time setup)
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  // Track items that have been queued for thumbnail generation
  const thumbnailQueueRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(false);

  // Generate thumbnails for newly downloaded/imported items (with deduplication)
  useEffect(() => {
    // Prevent concurrent thumbnail generation
    if (isGeneratingRef.current) return;

    // Get items needing thumbnails and filter those not already queued
    const itemsNeedingThumbnails = getItemsNeedingThumbnails().filter((item) => {
      // Use driveFileId for cloud items, or `local-${id}` for local items
      const queueKey = item.driveFileId || `local-${item.id}`;
      return !thumbnailQueueRef.current.has(queueKey);
    });

    if (itemsNeedingThumbnails.length === 0) return;

    // Add items to queue
    itemsNeedingThumbnails.forEach((item) => {
      const queueKey = item.driveFileId || `local-${item.id}`;
      thumbnailQueueRef.current.add(queueKey);
    });

    isGeneratingRef.current = true;

    // Run thumbnail generation asynchronously
    (async () => {
      try {
        await generateThumbnailsInBackground(
          itemsNeedingThumbnails.map((item) => ({
            driveFileId: item.driveFileId || undefined,
            itemId: item.driveFileId ? undefined : item.id,
            localPath: item.localPath!,
          })),
          async (thumbnailItem, thumbnailData) => {
            if (thumbnailItem.driveFileId) {
              // Cloud item
              await updateThumbnail(thumbnailItem.driveFileId, thumbnailData);
            } else if (thumbnailItem.itemId !== undefined) {
              // Local item
              await updateLocalThumbnail(thumbnailItem.itemId, thumbnailData);
            }
          }
        );
      } finally {
        isGeneratingRef.current = false;
      }
    })();
  }, [getItemsNeedingThumbnails, updateThumbnail, updateLocalThumbnail]);

  // Browse folders
  const browseFolderContents = useCallback(async (folderId: string | null) => {
    setIsBrowsing(true);
    try {
      const folders = await listDriveFolders(folderId || undefined);
      setBrowseFolders(folders);
      setCurrentFolderId(folderId);
    } finally {
      setIsBrowsing(false);
    }
  }, [listDriveFolders]);

  const navigateToFolder = useCallback((folder: DriveFolder) => {
    setFolderPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    browseFolderContents(folder.id);
  }, [browseFolderContents]);

  const navigateBack = useCallback((index: number) => {
    const newPath = folderPath.slice(0, index);
    setFolderPath(newPath);
    browseFolderContents(newPath.length > 0 ? newPath[newPath.length - 1].id : null);
  }, [folderPath, browseFolderContents]);

  const handleAddCurrentFolder = useCallback(async () => {
    if (folderPath.length > 0) {
      const currentFolder = folderPath[folderPath.length - 1];
      await addSyncFolder(currentFolder.id, currentFolder.name);
      setShowFolderBrowser(false);
      setFolderPath([]);
    }
  }, [folderPath, addSyncFolder]);

  const handleOpenPdf = useCallback(async (item: BookshelfItemType) => {
    if (item.localPath) {
      // Skip if already open
      if (currentFilePath === item.localPath) {
        console.log('File already open, skipping reload');
        return;
      }

      try {
        // Check if file exists before trying to open
        const { exists } = await import('@tauri-apps/plugin-fs');
        const fileExists = await exists(item.localPath);

        if (!fileExists) {
          console.error('File missing:', item.localPath);
          if (item.driveFileId) {
            // Cloud item: reset download status so it can be re-downloaded
            await resetDownloadStatus(item.driveFileId);
          } else {
            // Local item: remove from bookshelf since file no longer exists
            await deleteItem(item.id);
          }
          return;
        }

        onOpenPdf(item.localPath);
      } catch (error) {
        console.error('Error checking file:', error);
        // Don't reset status on error - file might still exist
      }
    }
  }, [onOpenPdf, resetDownloadStatus, deleteItem, currentFilePath]);

  const handleDownload = useCallback(async (item: BookshelfItemType) => {
    // Check auth status first if it's a cloud item (triggers Keychain access)
    if (!hasCheckedAuth && item.driveFileId) {
      await checkAuthStatus();
    }
    await downloadItem(item);
  }, [hasCheckedAuth, checkAuthStatus, downloadItem]);

  const handleDelete = useCallback(async (item: BookshelfItemType) => {
    await deleteLocalCopy(item.driveFileId || '');
  }, [deleteLocalCopy]);

  const handleCancel = useCallback(async (item: BookshelfItemType) => {
    await cancelDownload(item.driveFileId || '');
  }, [cancelDownload]);

  const handleSaveCredentials = useCallback(async () => {
    if (clientId && clientSecret) {
      await saveCredentials(clientId, clientSecret);
      setClientId('');
      setClientSecret('');
    }
  }, [clientId, clientSecret, saveCredentials]);

  // Handle sync with auth check (triggers Keychain access only when syncing)
  const handleSync = useCallback(async () => {
    if (!hasCheckedAuth) {
      await checkAuthStatus();
    }
    await sync();
    setShowSettings(false);
  }, [hasCheckedAuth, checkAuthStatus, sync]);

  // Get downloadable items count (pending or error status)
  const downloadableItems = items.filter(item =>
    item.downloadStatus === 'pending' || item.downloadStatus === 'error'
  );
  const downloadableCount = downloadableItems.length;

  // Filter items by search query and download status
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Filter by download status
    if (filterMode === 'pending') {
      filtered = filtered.filter(item => item.downloadStatus !== 'completed');
    } else if (filterMode === 'downloaded') {
      filtered = filtered.filter(item => item.downloadStatus === 'completed');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const title = (item.pdfTitle || '').toLowerCase();
        const fileName = (item.fileName || '').toLowerCase();
        return title.includes(query) || fileName.includes(query);
      });
    }

    return filtered;
  }, [items, searchQuery, filterMode]);

  // Count for each filter category
  const downloadedCount = useMemo(() => {
    return items.filter(item => item.downloadStatus === 'completed').length;
  }, [items]);

  const notDownloadedCount = useMemo(() => {
    return items.filter(item => item.downloadStatus !== 'completed').length;
  }, [items]);

  // Get currently downloading item
  const downloadingItem = useMemo(() => {
    return items.find(item => item.downloadStatus === 'downloading');
  }, [items]);

  // Download all pending/error items
  const handleDownloadAll = useCallback(async () => {
    if (downloadableItems.length === 0) return;

    setIsDownloadingAll(true);
    setTotalDownloads(downloadableItems.length);
    setCurrentDownloadIndex(0);
    try {
      // Download items sequentially to avoid overwhelming the server
      for (let i = 0; i < downloadableItems.length; i++) {
        setCurrentDownloadIndex(i + 1);
        await downloadItem(downloadableItems[i]);
      }
    } finally {
      setIsDownloadingAll(false);
      setCurrentDownloadIndex(0);
      setTotalDownloads(0);
    }
  }, [downloadableItems, downloadItem]);

  // Note: We no longer show a separate "not configured" screen
  // OAuth credentials setup is now handled in the Settings view

  // Folder browser modal
  if (showFolderBrowser) {
    return (
      <aside className="h-full flex flex-col bg-bg-secondary">
        <div className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-text-primary">Select Folder</span>
          </div>
          <button
            onClick={() => {
              setShowFolderBrowser(false);
              setFolderPath([]);
            }}
            className="p-1 hover:bg-bg-tertiary rounded"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="px-3 py-2 border-b border-bg-tertiary flex items-center gap-1 text-xs flex-wrap">
          <button
            onClick={() => navigateBack(0)}
            className="text-accent hover:underline"
          >
            My Drive
          </button>
          {folderPath.map((folder, index) => (
            <span key={folder.id || `path-${index}`} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-text-tertiary" />
              <button
                onClick={() => navigateBack(index + 1)}
                className="text-accent hover:underline"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-auto">
          {isBrowsing ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          ) : browseFolders.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary text-sm">
              No folders found
            </div>
          ) : (
            <ul className="py-2">
              {browseFolders.map((folder, index) => (
                <li key={folder.id || `folder-${index}`}>
                  <button
                    onClick={() => navigateToFolder(folder)}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-bg-tertiary text-left"
                  >
                    <FolderPlus className="w-4 h-4 text-accent" />
                    <span className="text-sm text-text-primary truncate">{folder.name}</span>
                    <ChevronRight className="w-4 h-4 text-text-tertiary ml-auto" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add folder button */}
        {folderPath.length > 0 && (
          <div className="p-3 border-t border-bg-tertiary">
            <button
              onClick={handleAddCurrentFolder}
              className="w-full px-3 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent/80 transition-colors"
            >
              Add This Folder
            </button>
          </div>
        )}
      </aside>
    );
  }

  // Settings view
  if (showSettings) {
    return (
      <aside className="h-full flex flex-col bg-bg-secondary">
        <div className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-text-primary">Settings</span>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="p-1 hover:bg-bg-tertiary rounded"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* OAuth Credentials Setup - show when not configured */}
          {!authStatus.configured && (
            <div className="space-y-3 pb-4 border-b border-bg-tertiary">
              <p className="text-sm text-text-secondary">
                Set up OAuth credentials to connect to Google Drive.
              </p>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Client ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-bg-primary border border-bg-tertiary rounded focus:outline-none focus:border-accent"
                  placeholder="xxxx.apps.googleusercontent.com"
                />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">Client Secret</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-bg-primary border border-bg-tertiary rounded focus:outline-none focus:border-accent"
                  placeholder="GOCSPX-xxxx"
                />
              </div>
              <button
                onClick={handleSaveCredentials}
                disabled={!clientId || !clientSecret || authLoading}
                className="w-full px-3 py-2 bg-accent text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent/80 transition-colors"
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Credentials'}
              </button>
              <p className="text-xs text-text-tertiary">
                Create an OAuth 2.0 Client ID at{' '}
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Google Cloud Console
                </a>
              </p>
            </div>
          )}

          {/* Auth status - show when configured */}
          {authStatus.configured && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-primary">
                {authStatus.authenticated ? 'Connected to Google' : 'Not connected'}
              </span>
              <button
                onClick={authStatus.authenticated ? logout : login}
                disabled={authLoading}
                className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 ${
                  authStatus.authenticated
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-accent text-white hover:bg-accent/80'
                }`}
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : authStatus.authenticated ? (
                  <>
                    <LogOut className="w-4 h-4" />
                    Logout
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Login
                  </>
                )}
              </button>
            </div>
          )}

          {/* Synced folders */}
          {authStatus.authenticated && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-tertiary">Synced Folders</span>
                <button
                  onClick={() => {
                    setShowFolderBrowser(true);
                    browseFolderContents(null);
                  }}
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  <FolderPlus className="w-3 h-3" />
                  Add
                </button>
              </div>
              {syncedFolders.length === 0 ? (
                <p className="text-sm text-text-tertiary">
                  No synced folders
                </p>
              ) : (
                <>
                  <ul className="space-y-1">
                    {syncedFolders.map((folder, index) => (
                      <li
                        key={folder.folderId || `synced-${index}`}
                        className="flex items-center justify-between py-1.5 px-2 bg-bg-tertiary rounded"
                      >
                        <span className="text-sm text-text-primary truncate">
                          {folder.folderName}
                        </span>
                        <button
                          onClick={() => removeSyncFolder(folder.folderId)}
                          className="text-text-tertiary hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {/* Sync button in settings */}
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="w-full mt-3 px-3 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    );
  }

  // Main bookshelf view
  return (
    <aside className="h-full flex flex-col bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary shrink-0">
        <div className="flex items-center gap-2">
          <Library className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">Bookshelf</span>
        </div>
        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-1.5 hover:bg-bg-tertiary rounded transition-colors"
            title={viewMode === 'grid' ? 'List view' : 'Grid view'}
          >
            {viewMode === 'grid' ? (
              <List className="w-4 h-4 text-text-secondary" />
            ) : (
              <Grid className="w-4 h-4 text-text-secondary" />
            )}
          </button>
          {authStatus.configured && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="p-1.5 hover:bg-bg-tertiary rounded transition-colors"
              title="Sync with Google Drive"
            >
              <RefreshCw className={`w-4 h-4 text-text-secondary ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 hover:bg-bg-tertiary rounded transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Error message */}
      {(authError || bookshelfError) && (
        <div className="px-3 py-2 bg-red-500/20 text-red-400 text-xs shrink-0">
          {authError || bookshelfError}
        </div>
      )}

      {/* Loading state */}
      {bookshelfLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        /* Empty state - show different message based on auth status */
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <Library className="w-12 h-12 text-text-tertiary mb-4" />
          <p className="text-sm text-text-secondary mb-2 text-center">
            Bookshelf is empty
          </p>
          <p className="text-xs text-text-tertiary text-center mb-4">
            {authStatus.authenticated
              ? 'Add a folder in settings and sync'
              : 'Connect to Google Drive to sync PDFs'}
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="px-4 py-2 bg-accent/20 text-accent rounded text-sm hover:bg-accent/30 transition-colors flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Open Settings
          </button>
        </div>
      ) : (
        /* Grid of items */
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Search input */}
          <div className="p-2 border-b border-bg-tertiary shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search books..."
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-bg-primary border border-bg-tertiary rounded focus:outline-none focus:border-accent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-bg-tertiary shrink-0">
            <button
              onClick={() => setFilterMode('all')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                filterMode === 'all'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              All ({items.length})
            </button>
            <button
              onClick={() => setFilterMode('pending')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                filterMode === 'pending'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Not DL ({notDownloadedCount})
            </button>
            <button
              onClick={() => setFilterMode('downloaded')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                filterMode === 'downloaded'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              Downloaded ({downloadedCount})
            </button>
          </div>

          {/* Download progress display */}
          {(isDownloadingAll || downloadingItem) && (
            <div className="px-3 py-2 bg-accent/10 border-b border-bg-tertiary shrink-0">
              <div className="flex items-center gap-2 text-xs text-text-primary">
                <Loader2 className="w-3 h-3 text-accent animate-spin shrink-0" />
                <span className="truncate flex-1">
                  {downloadingItem ? (downloadingItem.pdfTitle || downloadingItem.fileName) : 'Starting...'}
                </span>
              </div>
              {isDownloadingAll && totalDownloads > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${(currentDownloadIndex / totalDownloads) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-tertiary shrink-0">
                    {currentDownloadIndex}/{totalDownloads}
                  </span>
                </div>
              )}
              {downloadingItem && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${downloadingItem.downloadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-tertiary shrink-0">
                    {downloadingItem.downloadProgress.toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Download All button - only show when authenticated */}
          {authStatus.authenticated && downloadableCount > 0 && !isDownloadingAll && (
            <div className="p-2 border-b border-bg-tertiary shrink-0">
              <button
                onClick={handleDownloadAll}
                disabled={isDownloadingAll}
                className="w-full px-3 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Download All ({downloadableCount})
              </button>
            </div>
          )}

          {/* Items list */}
          {filteredItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <Search className="w-8 h-8 text-text-tertiary mb-2" />
              <p className="text-sm text-text-tertiary text-center">
                {searchQuery
                  ? `No books found for "${searchQuery}"`
                  : filterMode === 'pending'
                    ? 'All books are downloaded'
                    : filterMode === 'downloaded'
                      ? 'No downloaded books yet'
                      : 'No books found'}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'}>
                {filteredItems.map((item, index) => (
                  <BookshelfItem
                    key={item.driveFileId || `item-${index}`}
                    item={item}
                    viewMode={viewMode}
                    isAuthenticated={authStatus.authenticated}
                    onOpen={handleOpenPdf}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
