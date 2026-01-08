"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
  Cloud,
  Download,
  ExternalLink,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  Grid,
  HardDrive,
  Info,
  Library,
  List,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookDetailModal from "@/components/BookDetailModal";
import { useBookshelf } from "@/hooks/useBookshelf";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { filterBySource, getItemKey } from "@/lib/bookshelfUtils";
import { generateThumbnailsInBackground } from "@/lib/thumbnailGenerator";
import type { BookshelfItem as BookshelfItemType, DriveItem } from "@/types";
import type { BookshelfMainViewProps } from "@/types/components";
import type { PdfInfo } from "@/types/pdf";

/**
 * Main view bookshelf component for full-screen book selection
 */
export default function BookshelfMainView({
  onOpenPdf,
  currentFilePath,
  onClose,
}: BookshelfMainViewProps) {
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
    listDriveItems,
    importDriveFiles,
    addSyncFolder,
    removeSyncFolder,
  } = useGoogleAuth();

  const {
    items,
    isLoading: bookshelfLoading,
    isSyncing,
    error: bookshelfError,
    queueState,
    sync,
    downloadItem,
    cancelDownload,
    deleteLocalCopy,
    resetDownloadStatus,
    updateThumbnail,
    updateLocalThumbnail,
    updateLastOpened,
    getItemsNeedingThumbnails,
    importLocalFiles,
    importLocalDirectory,
    deleteItem,
    toggleFavorite,
    downloadAllQueued,
    stopDownloadQueue,
    cancelQueuedDownload,
  } = useBookshelf();

  const [showSettings, setShowSettings] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [showCloudFileBrowser, setShowCloudFileBrowser] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [browseItems, setBrowseItems] = useState<DriveItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<DriveItem[]>([]);
  const [folderPath, setFolderPath] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browserViewMode, setBrowserViewMode] = useState<"grid" | "list">(
    "grid",
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<
    "all" | "pending" | "downloaded"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<"local" | "cloud" | null>(
    null,
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortKey, setSortKey] = useState<
    "title" | "author" | "createdAt" | "modifiedTime" | "fileSize"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Book detail modal state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBookForDetail, setSelectedBookForDetail] =
    useState<BookshelfItemType | null>(null);
  const [selectedBookPdfInfo, setSelectedBookPdfInfo] =
    useState<PdfInfo | null>(null);
  const [isTocLoading, setIsTocLoading] = useState(false);

  // Credentials input (for first-time setup)
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  // Track items that have been queued for thumbnail generation
  const thumbnailQueueRef = useRef<Set<string>>(new Set());
  const isGeneratingRef = useRef(false);

  // Generate thumbnails for newly downloaded/imported items
  useEffect(() => {
    if (isGeneratingRef.current) return;

    // Get items needing thumbnails and filter those not already queued
    const itemsNeedingThumbnails = getItemsNeedingThumbnails().filter(
      (item) => {
        // Use driveFileId for cloud items, or `local-${id}` for local items
        const queueKey = item.driveFileId || `local-${item.id}`;
        return !thumbnailQueueRef.current.has(queueKey);
      },
    );

    if (itemsNeedingThumbnails.length === 0) return;

    // Add items to queue
    itemsNeedingThumbnails.forEach((item) => {
      const queueKey = item.driveFileId || `local-${item.id}`;
      thumbnailQueueRef.current.add(queueKey);
    });

    isGeneratingRef.current = true;

    (async () => {
      try {
        await generateThumbnailsInBackground(
          itemsNeedingThumbnails
            .filter((item) => item.localPath)
            .map((item) => ({
              driveFileId: item.driveFileId || undefined,
              itemId: item.driveFileId ? undefined : item.id,
              // localPath is guaranteed by the filter above
              localPath: item.localPath as string,
            })),
          async (thumbnailItem, thumbnailData) => {
            if (thumbnailItem.driveFileId) {
              // Cloud item
              await updateThumbnail(thumbnailItem.driveFileId, thumbnailData);
            } else if (thumbnailItem.itemId !== undefined) {
              // Local item
              await updateLocalThumbnail(thumbnailItem.itemId, thumbnailData);
            }
          },
        );
      } finally {
        isGeneratingRef.current = false;
      }
    })();
  }, [getItemsNeedingThumbnails, updateThumbnail, updateLocalThumbnail]);

  // Browse folders only (for folder sync in settings)
  const browseFoldersOnly = useCallback(
    async (folderId: string | null) => {
      setIsBrowsing(true);
      try {
        const folders = await listDriveFolders(folderId || undefined);
        // Convert DriveFolder to DriveItem format
        const items: DriveItem[] = folders.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: "application/vnd.google-apps.folder",
          modifiedTime: f.modifiedTime,
          isFolder: true,
        }));
        setBrowseItems(items);
        setCurrentFolderId(folderId);
      } catch (err) {
        console.error("Failed to browse folders:", err);
      } finally {
        setIsBrowsing(false);
      }
    },
    [listDriveFolders],
  );

  // Browse files and folders (for file import)
  const browseFilesAndFolders = useCallback(
    async (folderId: string | null) => {
      setIsBrowsing(true);
      try {
        const items = await listDriveItems(folderId || undefined);
        setBrowseItems(items);
        setCurrentFolderId(folderId);
        setSelectedFiles([]); // Clear selection when navigating
      } catch (err) {
        console.error("Failed to browse items:", err);
      } finally {
        setIsBrowsing(false);
      }
    },
    [listDriveItems],
  );

  const navigateToFolderForSync = useCallback(
    (item: DriveItem) => {
      setFolderPath((prev) => [...prev, { id: item.id, name: item.name }]);
      browseFoldersOnly(item.id);
    },
    [browseFoldersOnly],
  );

  const navigateToFolderForImport = useCallback(
    (item: DriveItem) => {
      setFolderPath((prev) => [...prev, { id: item.id, name: item.name }]);
      browseFilesAndFolders(item.id);
    },
    [browseFilesAndFolders],
  );

  const toggleFileSelection = useCallback((file: DriveItem) => {
    setSelectedFiles((prev) => {
      const isSelected = prev.some((f) => f.id === file.id);
      if (isSelected) {
        return prev.filter((f) => f.id !== file.id);
      } else {
        return [...prev, file];
      }
    });
  }, []);

  const navigateBackForSync = useCallback(
    (index: number) => {
      const newPath = folderPath.slice(0, index);
      setFolderPath(newPath);
      browseFoldersOnly(
        newPath.length > 0 ? newPath[newPath.length - 1].id : null,
      );
    },
    [folderPath, browseFoldersOnly],
  );

  const navigateBackForImport = useCallback(
    (index: number) => {
      const newPath = folderPath.slice(0, index);
      setFolderPath(newPath);
      browseFilesAndFolders(
        newPath.length > 0 ? newPath[newPath.length - 1].id : null,
      );
    },
    [folderPath, browseFilesAndFolders],
  );

  const handleAddCurrentFolder = useCallback(async () => {
    if (folderPath.length > 0) {
      const currentFolder = folderPath[folderPath.length - 1];
      await addSyncFolder(currentFolder.id, currentFolder.name);
      setShowFolderBrowser(false);
      setFolderPath([]);
      // Trigger sync immediately after adding folder
      await sync();
    }
  }, [folderPath, addSyncFolder, sync]);

  const handleImportSelectedFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setIsImporting(true);
    try {
      const parentFolderId = currentFolderId || undefined;
      const count = await importDriveFiles(selectedFiles, parentFolderId);
      console.log(`Imported ${count} files from Google Drive`);
      setShowCloudFileBrowser(false);
      setFolderPath([]);
      setSelectedFiles([]);
      // Trigger sync immediately after importing files
      await sync();
    } catch (error) {
      console.error("Failed to import files:", error);
    } finally {
      setIsImporting(false);
    }
  }, [selectedFiles, currentFolderId, importDriveFiles, sync]);

  const handleOpenPdf = useCallback(
    async (item: BookshelfItemType) => {
      if (item.localPath) {
        if (currentFilePath === item.localPath) {
          console.log("File already open, skipping reload");
          onClose?.();
          return;
        }

        try {
          const { exists } = await import("@tauri-apps/plugin-fs");
          const fileExists = await exists(item.localPath);

          if (!fileExists) {
            console.error("File missing:", item.localPath);
            if (item.driveFileId) {
              // Cloud item: reset download status so it can be re-downloaded
              await resetDownloadStatus(item.driveFileId);
            } else {
              // Local item: remove from bookshelf since file no longer exists
              await deleteItem(item.id);
            }
            return;
          }

          // Update last opened timestamp
          await updateLastOpened(item.localPath);

          onOpenPdf(item.localPath);
          onClose?.();
        } catch (error) {
          console.error("Error checking file:", error);
        }
      }
    },
    [
      onOpenPdf,
      resetDownloadStatus,
      deleteItem,
      updateLastOpened,
      currentFilePath,
      onClose,
    ],
  );

  const handleDownload = useCallback(
    async (item: BookshelfItemType) => {
      // Check auth status first if it's a cloud item (triggers Keychain access)
      if (!hasCheckedAuth && item.driveFileId) {
        await checkAuthStatus();
      }
      await downloadItem(item);
    },
    [hasCheckedAuth, checkAuthStatus, downloadItem],
  );

  const _handleDelete = useCallback(
    async (item: BookshelfItemType) => {
      await deleteLocalCopy(item.driveFileId || "");
    },
    [deleteLocalCopy],
  );

  const handleCancel = useCallback(
    async (item: BookshelfItemType) => {
      await cancelDownload(item.driveFileId || "");
    },
    [cancelDownload],
  );

  const handleSaveCredentials = useCallback(async () => {
    if (clientId && clientSecret) {
      await saveCredentials(clientId, clientSecret);
      setClientId("");
      setClientSecret("");
    }
  }, [clientId, clientSecret, saveCredentials]);

  // Handle sync with auth check (triggers Keychain access only when syncing)
  const handleSync = useCallback(async () => {
    // Check auth status first (this triggers Keychain access)
    if (!hasCheckedAuth) {
      await checkAuthStatus();
    }
    // After checking, if authenticated, proceed with sync
    // The actual sync will be triggered by button click after auth is confirmed
    await sync();
    setShowSettings(false);
  }, [hasCheckedAuth, checkAuthStatus, sync]);

  // Import local files
  const handleImportFiles = useCallback(async () => {
    setShowAddMenu(false);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [{ name: "PDF Files", extensions: ["pdf"] }],
      });

      if (
        selected &&
        (Array.isArray(selected) ? selected.length > 0 : selected)
      ) {
        setIsImporting(true);
        const paths = Array.isArray(selected) ? selected : [selected];
        const result = await importLocalFiles(paths);
        if (result) {
          console.log(
            `Imported: ${result.importedCount}, Skipped: ${result.skippedCount}, Errors: ${result.errorCount}`,
          );
        }
      }
    } catch (error) {
      console.error("Failed to import files:", error);
    } finally {
      setIsImporting(false);
    }
  }, [importLocalFiles]);

  // Import local directory
  const handleImportDirectory = useCallback(async () => {
    setShowAddMenu(false);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === "string") {
        setIsImporting(true);
        const result = await importLocalDirectory(selected);
        if (result) {
          console.log(
            `Imported: ${result.importedCount}, Skipped: ${result.skippedCount}, Errors: ${result.errorCount}`,
          );
        }
      }
    } catch (error) {
      console.error("Failed to import directory:", error);
    } finally {
      setIsImporting(false);
    }
  }, [importLocalDirectory]);

  // Handle delete for both local and cloud items
  const handleDeleteItem = useCallback(
    async (item: BookshelfItemType) => {
      if (item.sourceType === "local") {
        await deleteItem(item.id);
      } else {
        await deleteLocalCopy(item.driveFileId || "");
      }
    },
    [deleteItem, deleteLocalCopy],
  );

  // Handle toggle favorite
  const handleToggleFavorite = useCallback(
    async (item: BookshelfItemType, e: React.MouseEvent) => {
      e.stopPropagation();
      const isCloud = item.sourceType === "google_drive";
      await toggleFavorite(item.id, isCloud);
    },
    [toggleFavorite],
  );

  // Handle show book detail modal
  const handleShowDetail = useCallback(
    (item: BookshelfItemType, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedBookForDetail(item);
      setShowDetailModal(true);

      // Show basic info immediately from bookshelf data
      const basicInfo: PdfInfo = {
        title: item.pdfTitle || item.fileName,
        author: item.pdfAuthor || null,
        creationDate: null,
        modDate: item.modifiedTime || null,
        fileSize: item.fileSize || null,
        pageCount: null,
        toc: [], // TOC will be loaded async
      };
      setSelectedBookPdfInfo(basicInfo);

      // If the file is available locally, fetch full PDF info including TOC asynchronously
      if (item.localPath) {
        setIsTocLoading(true);
        (async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const pdfInfo = await invoke<PdfInfo>("get_pdf_info", {
              path: item.localPath,
            });
            // Update with full info including TOC
            setSelectedBookPdfInfo(pdfInfo);
          } catch (error) {
            console.error("Failed to get PDF info:", error);
            // Keep basic info on error
          } finally {
            setIsTocLoading(false);
          }
        })();
      }
    },
    [],
  );

  // Get thumbnail URL for the modal
  const getBookDetailThumbnail = useCallback(
    (item: BookshelfItemType | null): string | null => {
      if (!item?.thumbnailData) return null;
      return `data:image/png;base64,${item.thumbnailData}`;
    },
    [],
  );

  // Get downloadable items count (only cloud files that are not queued/downloading can be downloaded)
  const downloadableItems = useMemo(() => {
    return items.filter(
      (item) =>
        item.sourceType === "google_drive" &&
        (item.downloadStatus === "pending" || item.downloadStatus === "error"),
    );
  }, [items]);
  const downloadableCount = downloadableItems.length;

  // Check if any items are queued (for showing stop button instead of download all)
  const hasQueuedItems = useMemo(() => {
    return items.some((item) => item.downloadStatus === "queued");
  }, [items]);

  // Handle sort column click
  const handleSort = useCallback(
    (key: "title" | "author" | "createdAt" | "modifiedTime" | "fileSize") => {
      if (sortKey === key) {
        // Toggle order if same key
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        // Set new key with default order
        setSortKey(key);
        // Date columns default to descending (newest first)
        setSortOrder(
          key === "createdAt" || key === "modifiedTime" ? "desc" : "asc",
        );
      }
    },
    [sortKey],
  );

  // Filter items by search query, download status, source type, and favorites
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Favorites filter
    if (showFavoritesOnly) {
      filtered = filtered.filter((item) => item.isFavorite);
    }

    // Source type filter (using utility to prevent ID collision bugs)
    filtered = filterBySource(filtered, sourceFilter);

    // Download status filter
    if (filterMode === "pending") {
      filtered = filtered.filter((item) => item.downloadStatus !== "completed");
    } else if (filterMode === "downloaded") {
      filtered = filtered.filter((item) => item.downloadStatus === "completed");
    }

    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item) => {
        const title = (item.pdfTitle || "").toLowerCase();
        const fileName = (item.fileName || "").toLowerCase();
        const author = (item.pdfAuthor || "").toLowerCase();
        return (
          title.includes(query) ||
          fileName.includes(query) ||
          author.includes(query)
        );
      });
    }

    // Sort items
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "title": {
          const titleA = (a.pdfTitle || a.fileName || "").toLowerCase();
          const titleB = (b.pdfTitle || b.fileName || "").toLowerCase();
          comparison = titleA.localeCompare(titleB, "ja");
          break;
        }
        case "author": {
          const authorA = (a.pdfAuthor || "").toLowerCase();
          const authorB = (b.pdfAuthor || "").toLowerCase();
          // Put empty authors at the end
          if (!authorA && authorB) return sortOrder === "asc" ? 1 : -1;
          if (authorA && !authorB) return sortOrder === "asc" ? -1 : 1;
          comparison = authorA.localeCompare(authorB, "ja");
          break;
        }
        case "createdAt": {
          comparison = a.createdAt - b.createdAt;
          break;
        }
        case "modifiedTime": {
          // Parse ISO date strings, put items without modifiedTime at the end
          const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
          const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
          if (!a.modifiedTime && b.modifiedTime)
            return sortOrder === "asc" ? 1 : -1;
          if (a.modifiedTime && !b.modifiedTime)
            return sortOrder === "asc" ? -1 : 1;
          comparison = timeA - timeB;
          break;
        }
        case "fileSize": {
          const sizeA = a.fileSize || 0;
          const sizeB = b.fileSize || 0;
          comparison = sizeA - sizeB;
          break;
        }
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [
    items,
    searchQuery,
    filterMode,
    sourceFilter,
    showFavoritesOnly,
    sortKey,
    sortOrder,
  ]);

  const downloadedCount = useMemo(() => {
    return items.filter((item) => item.downloadStatus === "completed").length;
  }, [items]);

  const notDownloadedCount = useMemo(() => {
    return items.filter((item) => item.downloadStatus !== "completed").length;
  }, [items]);

  const localCount = useMemo(() => {
    return items.filter((item) => item.sourceType === "local").length;
  }, [items]);

  const cloudCount = useMemo(() => {
    return items.filter((item) => item.sourceType === "google_drive").length;
  }, [items]);

  const favoriteCount = useMemo(() => {
    return items.filter((item) => item.isFavorite).length;
  }, [items]);

  const downloadingItem = useMemo(() => {
    return items.find((item) => item.downloadStatus === "downloading");
  }, [items]);

  const handleDownloadAll = useCallback(async () => {
    if (downloadableItems.length === 0) return;

    // Check auth status first (triggers Keychain access)
    if (!hasCheckedAuth) {
      const status = await checkAuthStatus();
      if (!status?.authenticated) {
        setShowSettings(true);
        return;
      }
    } else if (!authStatus.authenticated) {
      setShowSettings(true);
      return;
    }

    // Use the queue-based download
    await downloadAllQueued();
  }, [downloadableItems.length, hasCheckedAuth, checkAuthStatus, authStatus.authenticated, downloadAllQueued]);

  const handleStopDownloadAll = useCallback(async () => {
    await stopDownloadQueue();
  }, [stopDownloadQueue]);

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date with time (from Unix timestamp)
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format date from ISO string
  const formatIsoDate = (isoString?: string) => {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Render a single book item
  const renderBookItem = (item: BookshelfItemType) => {
    const isDownloaded = item.downloadStatus === "completed" && item.localPath;
    const isDownloading = item.downloadStatus === "downloading";
    const isQueued = item.downloadStatus === "queued";
    const hasError = item.downloadStatus === "error";
    const displayName = item.pdfTitle || item.fileName;

    if (viewMode === "list") {
      // Table row for list view - rendered inside tbody
      return null; // Table rows are rendered separately
    }

    // Grid view
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: role/tabIndex added conditionally based on download status
      <div
        role={isDownloaded ? "button" : undefined}
        tabIndex={isDownloaded ? 0 : undefined}
        key={getItemKey(item)}
        className={`
          relative group rounded-lg overflow-hidden
          bg-bg-tertiary hover:bg-bg-secondary
          transition-all duration-200
          ${isDownloaded ? "cursor-pointer" : ""}
        `}
        onClick={isDownloaded ? () => handleOpenPdf(item) : undefined}
        onKeyDown={
          isDownloaded
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenPdf(item);
                }
              }
            : undefined
        }
      >
        <div className="aspect-[3/4] flex items-center justify-center bg-bg-primary/50">
          {item.thumbnailData ? (
            // biome-ignore lint/performance/noImgElement: base64 data URI cannot be optimized by Next.js Image
            <img
              src={`data:image/png;base64,${item.thumbnailData}`}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <FileText className="w-16 h-16 text-text-tertiary" />
          )}

          {(isDownloading || isQueued) && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
              <span className="text-white text-base mt-2">
                {isQueued ? "Queued" : `${item.downloadProgress.toFixed(0)}%`}
              </span>
              {isDownloading && (
                <div className="w-3/4 h-1.5 bg-white/30 rounded-full mt-2">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-200"
                    style={{ width: `${item.downloadProgress}%` }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isQueued) {
                    cancelQueuedDownload(item.driveFileId || "");
                  } else {
                    handleCancel(item);
                  }
                }}
                className="mt-3 px-4 py-1.5 bg-red-500/80 hover:bg-red-500 text-white text-sm rounded transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          )}

          {hasError && (
            <div className="absolute inset-0 bg-red-900/60 flex flex-col items-center justify-center">
              <AlertCircle className="w-10 h-10 text-white" />
              <span className="text-white text-sm mt-2">Error</span>
            </div>
          )}

          {isDownloaded && !isDownloading && (
            <div className="absolute top-3 right-3 bg-green-500 rounded-full p-1.5">
              <Check className="w-4 h-4 text-white" />
            </div>
          )}

          {/* Favorite indicator */}
          {item.isFavorite && (
            <div className="absolute top-3 left-3">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 drop-shadow" />
            </div>
          )}
        </div>

        <div className="p-3">
          <p className="text-sm text-text-primary truncate" title={displayName}>
            {displayName}
          </p>
          {item.pdfAuthor && (
            <p
              className="text-xs text-text-secondary truncate mt-0.5"
              title={item.pdfAuthor}
            >
              {item.pdfAuthor}
            </p>
          )}
          {item.fileSize && (
            <p className="text-xs text-text-tertiary mt-0.5">
              {formatFileSize(item.fileSize)}
            </p>
          )}
        </div>

        <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {/* Favorite button - always visible on hover */}
          <button
            type="button"
            onClick={(e) => handleToggleFavorite(item, e)}
            className={`p-2 rounded transition-colors ${
              item.isFavorite
                ? "bg-yellow-500 text-white hover:bg-yellow-600"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-secondary"
            }`}
            title={
              item.isFavorite ? "Remove from favorites" : "Add to favorites"
            }
          >
            <Star
              className={`w-4 h-4 ${item.isFavorite ? "fill-white" : ""}`}
            />
          </button>
          {/* Info button - always visible on hover */}
          <button
            type="button"
            onClick={(e) => handleShowDetail(item, e)}
            className="p-2 bg-bg-tertiary text-text-secondary rounded hover:bg-bg-secondary transition-colors"
            title="Book details"
          >
            <Info className="w-4 h-4" />
          </button>
          {isDownloaded ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenPdf(item);
                }}
                className="p-2 bg-accent text-white rounded hover:bg-accent/80 transition-colors"
                title="Open"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteItem(item);
                }}
                className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : !isDownloading &&
            authStatus.authenticated &&
            item.sourceType !== "local" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(item);
              }}
              className="p-2 bg-accent text-white rounded hover:bg-accent/80 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  // Settings modal
  if (showSettings) {
    return (
      <div className="h-full flex flex-col bg-bg-primary">
        <div className="flex items-center justify-between px-6 py-4 border-b border-bg-tertiary">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-accent" />
            <span className="text-lg font-medium text-text-primary">
              Bookshelf Settings
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings(false)}
            className="p-2 hover:bg-bg-tertiary rounded"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
          {!authStatus.configured && (
            <div className="space-y-4 pb-6 border-b border-bg-tertiary">
              <p className="text-text-secondary">
                Set up OAuth credentials to connect to Google Drive.
              </p>
              <div>
                <label
                  htmlFor="bookshelf-client-id"
                  className="block text-sm text-text-tertiary mb-2"
                >
                  Client ID
                </label>
                <input
                  id="bookshelf-client-id"
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-secondary border border-bg-tertiary rounded focus:outline-none focus:border-accent"
                  placeholder="xxxx.apps.googleusercontent.com"
                />
              </div>
              <div>
                <label
                  htmlFor="bookshelf-client-secret"
                  className="block text-sm text-text-tertiary mb-2"
                >
                  Client Secret
                </label>
                <input
                  id="bookshelf-client-secret"
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-secondary border border-bg-tertiary rounded focus:outline-none focus:border-accent"
                  placeholder="GOCSPX-xxxx"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveCredentials}
                disabled={!clientId || !clientSecret || authLoading}
                className="w-full px-4 py-2 bg-accent text-white rounded font-medium disabled:opacity-50 hover:bg-accent/80 transition-colors"
              >
                {authLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  "Save Credentials"
                )}
              </button>
            </div>
          )}

          {(authStatus.configured || hasCheckedAuth) && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-text-primary">
                  {authStatus.authenticated
                    ? "Connected to Google"
                    : "Not connected"}
                </span>
                <button
                  type="button"
                  onClick={authStatus.authenticated ? logout : login}
                  disabled={authLoading}
                  className={`px-4 py-2 rounded flex items-center gap-2 ${
                    authStatus.authenticated
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "bg-accent text-white hover:bg-accent/80"
                  }`}
                >
                  {authLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : authStatus.authenticated ? (
                    <>
                      <LogOut className="w-5 h-5" />
                      Logout
                    </>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      Login
                    </>
                  )}
                </button>
              </div>

              {(authStatus.authenticated || hasCheckedAuth) && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-text-tertiary">
                      Synced Folders
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        // Ensure auth is checked before browsing folders
                        if (!hasCheckedAuth) {
                          const status = await checkAuthStatus();
                          if (!status?.authenticated) {
                            return;
                          }
                        } else if (!authStatus.authenticated) {
                          return;
                        }
                        setShowSettings(false); // Close settings first
                        setShowFolderBrowser(true);
                        browseFoldersOnly(null);
                      }}
                      className="text-sm text-accent hover:underline flex items-center gap-1"
                    >
                      <FolderPlus className="w-4 h-4" />
                      Add Folder
                    </button>
                  </div>
                  {syncedFolders.length === 0 ? (
                    <p className="text-text-tertiary mb-4">No synced folders</p>
                  ) : (
                    <ul className="space-y-2 mb-4">
                      {syncedFolders.map((folder, index) => (
                        <li
                          key={folder.folderId || `synced-${index}`}
                          className="flex items-center justify-between py-2 px-3 bg-bg-tertiary rounded"
                        >
                          <span className="text-text-primary truncate">
                            {folder.folderName}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSyncFolder(folder.folderId)}
                            className="text-text-tertiary hover:text-red-400"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="w-full px-4 py-2 bg-accent text-white rounded font-medium hover:bg-accent/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-5 h-5 ${isSyncing ? "animate-spin" : ""}`}
                    />
                    {isSyncing ? "Syncing..." : "Sync Now"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Folder browser modal (for folder sync - shows only folders)
  if (showFolderBrowser) {
    const folders = browseItems.filter((item) => item.isFolder);

    return (
      <div className="h-full flex flex-col bg-bg-primary">
        <div className="flex items-center justify-between px-6 py-4 border-b border-bg-tertiary">
          <div className="flex items-center gap-3">
            <FolderPlus className="w-5 h-5 text-accent" />
            <span className="text-lg font-medium text-text-primary">
              Select Folder to Sync
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowFolderBrowser(false);
              setFolderPath([]);
            }}
            className="p-2 hover:bg-bg-tertiary rounded"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-bg-tertiary flex items-center gap-2 text-sm flex-wrap">
          <button
            type="button"
            onClick={() => navigateBackForSync(0)}
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
                onClick={() => navigateBackForSync(index + 1)}
                className="text-accent hover:underline"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isBrowsing ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
          ) : folders.length === 0 ? (
            <div className="text-center py-12 text-text-tertiary">
              No folders found
            </div>
          ) : (
            <ul className="space-y-2">
              {folders.map((folder, index) => (
                <li key={folder.id || `folder-${index}`}>
                  <button
                    type="button"
                    onClick={() => navigateToFolderForSync(folder)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-tertiary rounded-lg text-left"
                  >
                    <FolderOpen className="w-5 h-5 text-accent" />
                    <span className="text-text-primary truncate flex-1">
                      {folder.name}
                    </span>
                    <ChevronRight className="w-5 h-5 text-text-tertiary" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {folderPath.length > 0 && (
          <div className="p-6 border-t border-bg-tertiary">
            <button
              type="button"
              onClick={handleAddCurrentFolder}
              className="w-full px-4 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent/80 transition-colors flex items-center justify-center gap-2"
            >
              <FolderPlus className="w-5 h-5" />
              Sync This Folder
            </button>
          </div>
        )}
      </div>
    );
  }

  // Cloud file browser modal (for file import - shows files with thumbnails)
  if (showCloudFileBrowser) {
    const folders = browseItems.filter((item) => item.isFolder);
    const files = browseItems.filter((item) => !item.isFolder);

    return (
      <div className="h-full flex flex-col bg-bg-primary">
        <div className="flex items-center justify-between px-6 py-4 border-b border-bg-tertiary">
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-accent" />
            <span className="text-lg font-medium text-text-primary">
              Import from Google Drive
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setBrowserViewMode(browserViewMode === "grid" ? "list" : "grid")
              }
              className="p-2 hover:bg-bg-tertiary rounded transition-colors"
              title={browserViewMode === "grid" ? "List view" : "Grid view"}
            >
              {browserViewMode === "grid" ? (
                <List className="w-5 h-5 text-text-secondary" />
              ) : (
                <Grid className="w-5 h-5 text-text-secondary" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCloudFileBrowser(false);
                setFolderPath([]);
                setSelectedFiles([]);
              }}
              className="p-2 hover:bg-bg-tertiary rounded"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-bg-tertiary flex items-center gap-2 text-sm flex-wrap">
          <button
            type="button"
            onClick={() => navigateBackForImport(0)}
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
                onClick={() => navigateBackForImport(index + 1)}
                className="text-accent hover:underline"
              >
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isBrowsing ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
          ) : browseItems.length === 0 ? (
            <div className="text-center py-12 text-text-tertiary">
              No folders or PDF files found
            </div>
          ) : browserViewMode === "grid" ? (
            /* Grid view */
            <div className="space-y-6">
              {/* Folders section - grid */}
              {folders.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase text-text-tertiary mb-3 px-1">
                    Folders
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {folders.map((folder, index) => (
                      <button
                        type="button"
                        key={folder.id || `folder-${index}`}
                        onClick={() => navigateToFolderForImport(folder)}
                        className="p-4 bg-bg-tertiary hover:bg-bg-secondary rounded-lg flex flex-col items-center gap-2 transition-colors"
                      >
                        <FolderOpen className="w-12 h-12 text-accent" />
                        <span className="text-text-primary text-sm truncate w-full text-center">
                          {folder.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Files section - grid with thumbnails */}
              {files.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase text-text-tertiary mb-3 px-1">
                    PDF Files ({files.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {files.map((file, index) => {
                      const isSelected = selectedFiles.some(
                        (f) => f.id === file.id,
                      );
                      return (
                        <button
                          type="button"
                          key={file.id || `file-${index}`}
                          onClick={() => toggleFileSelection(file)}
                          className={`relative rounded-lg overflow-hidden transition-all ${
                            isSelected
                              ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-primary"
                              : "hover:ring-1 hover:ring-text-tertiary"
                          }`}
                        >
                          <div className="aspect-[3/4] bg-bg-tertiary flex items-center justify-center">
                            {file.thumbnailLink ? (
                              // biome-ignore lint/performance/noImgElement: external Google Drive thumbnail URL
                              <img
                                src={file.thumbnailLink}
                                alt={file.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback to icon if thumbnail fails to load
                                  e.currentTarget.style.display = "none";
                                  e.currentTarget.nextElementSibling?.classList.remove(
                                    "hidden",
                                  );
                                }}
                              />
                            ) : null}
                            <FileText
                              className={`w-12 h-12 text-text-tertiary ${file.thumbnailLink ? "hidden" : ""}`}
                            />
                          </div>
                          <div className="p-2 bg-bg-secondary">
                            <p className="text-xs text-text-primary truncate">
                              {file.name}
                            </p>
                            {file.size && (
                              <p className="text-xs text-text-tertiary">
                                {(
                                  parseInt(file.size, 10) /
                                  (1024 * 1024)
                                ).toFixed(1)}{" "}
                                MB
                              </p>
                            )}
                          </div>
                          {/* Selection indicator */}
                          <div
                            className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? "bg-accent border-accent"
                                : "bg-black/30 border-white/50"
                            }`}
                          >
                            {isSelected && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* List view */
            <div className="space-y-4">
              {/* Folders section - list */}
              {folders.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase text-text-tertiary mb-2 px-2">
                    Folders
                  </h3>
                  <ul className="space-y-1">
                    {folders.map((folder, index) => (
                      <li key={folder.id || `folder-${index}`}>
                        <button
                          type="button"
                          onClick={() => navigateToFolderForImport(folder)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-tertiary rounded-lg text-left"
                        >
                          <FolderOpen className="w-5 h-5 text-accent" />
                          <span className="text-text-primary truncate flex-1">
                            {folder.name}
                          </span>
                          <ChevronRight className="w-5 h-5 text-text-tertiary" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Files section - list with thumbnails */}
              {files.length > 0 && (
                <div>
                  <h3 className="text-xs uppercase text-text-tertiary mb-2 px-2">
                    PDF Files ({files.length})
                  </h3>
                  <ul className="space-y-1">
                    {files.map((file, index) => {
                      const isSelected = selectedFiles.some(
                        (f) => f.id === file.id,
                      );
                      return (
                        <li key={file.id || `file-${index}`}>
                          <button
                            type="button"
                            onClick={() => toggleFileSelection(file)}
                            className={`w-full px-4 py-2 flex items-center gap-3 rounded-lg text-left transition-colors ${
                              isSelected
                                ? "bg-accent/20 border border-accent"
                                : "hover:bg-bg-tertiary border border-transparent"
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "bg-accent border-accent"
                                  : "border-text-tertiary"
                              }`}
                            >
                              {isSelected && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            {/* Thumbnail */}
                            <div className="w-10 h-14 bg-bg-tertiary rounded overflow-hidden flex items-center justify-center shrink-0">
                              {file.thumbnailLink ? (
                                // biome-ignore lint/performance/noImgElement: external Google Drive thumbnail URL
                                <img
                                  src={file.thumbnailLink}
                                  alt={file.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    e.currentTarget.nextElementSibling?.classList.remove(
                                      "hidden",
                                    );
                                  }}
                                />
                              ) : null}
                              <FileText
                                className={`w-5 h-5 text-text-tertiary ${file.thumbnailLink ? "hidden" : ""}`}
                              />
                            </div>
                            <span className="text-text-primary truncate flex-1">
                              {file.name}
                            </span>
                            {file.size && (
                              <span className="text-xs text-text-tertiary shrink-0">
                                {(
                                  parseInt(file.size, 10) /
                                  (1024 * 1024)
                                ).toFixed(1)}{" "}
                                MB
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {(selectedFiles.length > 0 || folderPath.length > 0) && (
          <div className="p-6 border-t border-bg-tertiary space-y-3">
            {selectedFiles.length > 0 && (
              <button
                type="button"
                onClick={handleImportSelectedFiles}
                disabled={isImporting}
                className="w-full px-4 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent/80 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isImporting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                Import {selectedFiles.length} File
                {selectedFiles.length > 1 ? "s" : ""}
              </button>
            )}
            {folderPath.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const currentFolder = folderPath[folderPath.length - 1];
                  await addSyncFolder(currentFolder.id, currentFolder.name);
                  setShowCloudFileBrowser(false);
                  setFolderPath([]);
                  setSelectedFiles([]);
                  await sync();
                }}
                disabled={isImporting}
                className={`w-full px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                  selectedFiles.length > 0
                    ? "bg-bg-tertiary text-text-primary hover:bg-bg-secondary"
                    : "bg-accent text-white hover:bg-accent/80"
                }`}
              >
                <FolderPlus className="w-5 h-5" />
                Sync This Folder
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Main bookshelf view
  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-bg-tertiary shrink-0">
        <div className="flex items-center gap-3">
          <Library className="w-6 h-6 text-accent" />
          <span className="text-xl font-medium text-text-primary">
            Bookshelf
          </span>
          <span className="text-sm text-text-tertiary">
            ({items.length} books)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Add button with dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddMenu(!showAddMenu)}
              disabled={isImporting}
              className="p-2 hover:bg-bg-tertiary rounded transition-colors"
              title="Add books"
            >
              {isImporting ? (
                <Loader2 className="w-5 h-5 text-accent animate-spin" />
              ) : (
                <Plus className="w-5 h-5 text-accent" />
              )}
            </button>
            {showAddMenu && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-10 cursor-default bg-transparent border-none"
                  onClick={() => setShowAddMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-56 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-lg z-20 overflow-hidden">
                  <button
                    type="button"
                    onClick={handleImportFiles}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-tertiary text-left"
                  >
                    <FilePlus className="w-5 h-5 text-accent" />
                    <div>
                      <div className="text-text-primary text-sm">
                        Import Files
                      </div>
                      <div className="text-text-tertiary text-xs">
                        Add PDF files
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleImportDirectory}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-tertiary text-left"
                  >
                    <FolderOpen className="w-5 h-5 text-accent" />
                    <div>
                      <div className="text-text-primary text-sm">
                        Import Folder
                      </div>
                      <div className="text-text-tertiary text-xs">
                        Add all PDFs from folder
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowAddMenu(false);
                      // Check auth status when clicking cloud import
                      if (!hasCheckedAuth) {
                        const status = await checkAuthStatus();
                        if (!status?.authenticated) {
                          // Not authenticated, open settings instead
                          setShowSettings(true);
                          return;
                        }
                      } else if (!authStatus.authenticated) {
                        setShowSettings(true);
                        return;
                      }
                      setShowCloudFileBrowser(true);
                      browseFilesAndFolders(null);
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-tertiary text-left border-t border-bg-tertiary"
                  >
                    <Cloud className="w-5 h-5 text-accent" />
                    <div>
                      <div className="text-text-primary text-sm">
                        Import from Cloud
                      </div>
                      <div className="text-text-tertiary text-xs">
                        Select PDFs from Google Drive
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowAddMenu(false);
                      // Check auth status when clicking Google Drive option
                      if (!hasCheckedAuth) {
                        await checkAuthStatus();
                      }
                      setShowSettings(true);
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-tertiary text-left"
                  >
                    <Settings className="w-5 h-5 text-text-secondary" />
                    <div>
                      <div className="text-text-primary text-sm">
                        Cloud Settings
                      </div>
                      <div className="text-text-tertiary text-xs">
                        Manage synced folders
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            className="p-2 hover:bg-bg-tertiary rounded transition-colors"
            title={viewMode === "grid" ? "List view" : "Grid view"}
          >
            {viewMode === "grid" ? (
              <List className="w-5 h-5 text-text-secondary" />
            ) : (
              <Grid className="w-5 h-5 text-text-secondary" />
            )}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="p-2 hover:bg-bg-tertiary rounded transition-colors"
            title="Sync with Google Drive"
          >
            <RefreshCw
              className={`w-5 h-5 text-text-secondary ${isSyncing ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-bg-tertiary rounded transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5 text-text-secondary" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-bg-tertiary rounded transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {(authError || bookshelfError) && (
        <div className="px-6 py-3 bg-red-500/20 text-red-400 text-sm shrink-0">
          {authError || bookshelfError}
        </div>
      )}

      {/* Loading state */}
      {bookshelfLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-accent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <Library className="w-20 h-20 text-text-tertiary mb-6" />
          <p className="text-lg text-text-secondary mb-2">Bookshelf is empty</p>
          <p className="text-text-tertiary text-center">
            Click the + button to add PDFs
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Search and filter bar */}
          <div className="px-6 py-4 border-b border-bg-tertiary shrink-0">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search books..."
                  className="w-full pl-10 pr-10 py-2 bg-bg-secondary border border-bg-tertiary rounded-lg focus:outline-none focus:border-accent"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              <div className="flex border border-bg-tertiary rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    filterMode === "all"
                      ? "bg-accent text-white"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  All ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("pending")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    filterMode === "pending"
                      ? "bg-accent text-white"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  Not DL ({notDownloadedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("downloaded")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    filterMode === "downloaded"
                      ? "bg-accent text-white"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  Downloaded ({downloadedCount})
                </button>
              </div>
              {/* Source type filter */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSourceFilter(sourceFilter === "local" ? null : "local")
                  }
                  className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1 border rounded-lg ${
                    sourceFilter === "local"
                      ? "bg-accent text-white border-accent"
                      : "text-text-tertiary hover:text-text-secondary border-bg-tertiary"
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  Local ({localCount})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSourceFilter(sourceFilter === "cloud" ? null : "cloud")
                  }
                  className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1 border rounded-lg ${
                    sourceFilter === "cloud"
                      ? "bg-accent text-white border-accent"
                      : "text-text-tertiary hover:text-text-secondary border-bg-tertiary"
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  Cloud ({cloudCount})
                </button>
              </div>
              {/* Favorites filter */}
              <button
                type="button"
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1 border rounded-lg ${
                  showFavoritesOnly
                    ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/50"
                    : "text-text-tertiary hover:text-text-secondary border-bg-tertiary"
                }`}
              >
                <Star
                  className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-yellow-500" : ""}`}
                />
                Favorites ({favoriteCount})
              </button>
            </div>
          </div>

          {/* Download progress (queue-based) */}
          {(queueState?.isRunning || hasQueuedItems || (downloadingItem && downloadingItem.downloadProgress > 0)) && (
            <div className="px-6 py-3 bg-accent/10 border-b border-bg-tertiary shrink-0">
              <div className="flex items-center gap-3 text-sm text-text-primary">
                <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                <span className="truncate flex-1">
                  {queueState?.currentItem?.fileName ||
                    downloadingItem?.pdfTitle ||
                    downloadingItem?.fileName ||
                    "Starting..."}
                </span>
                {(queueState?.isRunning || hasQueuedItems) ? (
                  <>
                    <span className="text-text-tertiary shrink-0">
                      {queueState?.pendingCount && queueState.pendingCount > 0
                        ? `${queueState.pendingCount} remaining`
                        : null}
                    </span>
                    <button
                      type="button"
                      onClick={handleStopDownloadAll}
                      className="px-3 py-1 bg-red-500/80 hover:bg-red-500 text-white text-xs rounded transition-colors flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      Stop
                    </button>
                  </>
                ) : downloadingItem ? (
                  <span className="text-text-tertiary shrink-0">
                    {downloadingItem.downloadProgress.toFixed(0)}%
                  </span>
                ) : null}
              </div>
              {downloadingItem && (
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{
                        width: `${downloadingItem.downloadProgress}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Download All button (only for cloud files, hidden when downloading/queued or viewing local only) */}
          {downloadableCount > 0 &&
            !queueState?.isRunning &&
            !hasQueuedItems &&
            !(downloadingItem && downloadingItem.downloadProgress > 0) &&
            sourceFilter !== "local" && (
              <div className="px-6 py-3 border-b border-bg-tertiary shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={queueState?.isRunning}
                  className="px-6 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/80 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Download className="w-5 h-5" />
                  Download All ({downloadableCount})
                </button>
              </div>
            )}

          {/* Items grid/list */}
          {filteredItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <Search className="w-12 h-12 text-text-tertiary mb-4" />
              <p className="text-text-tertiary text-center">
                {searchQuery
                  ? `No books found for "${searchQuery}"`
                  : filterMode === "pending"
                    ? "All books are downloaded"
                    : filterMode === "downloaded"
                      ? "No downloaded books yet"
                      : "No books found"}
              </p>
            </div>
          ) : viewMode === "list" ? (
            // Table view
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-bg-primary border-b border-bg-tertiary z-10">
                  <tr className="text-left text-sm text-text-tertiary">
                    <th className="px-6 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("title")}
                        className="flex items-center gap-1 hover:text-text-primary transition-colors"
                      >
                        Title
                        {sortKey === "title" ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("author")}
                        className="flex items-center gap-1 hover:text-text-primary transition-colors"
                      >
                        Author
                        {sortKey === "author" ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium w-36">
                      <button
                        type="button"
                        onClick={() => handleSort("modifiedTime")}
                        className="flex items-center gap-1 hover:text-text-primary transition-colors"
                      >
                        Modified
                        {sortKey === "modifiedTime" ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium w-36">
                      <button
                        type="button"
                        onClick={() => handleSort("createdAt")}
                        className="flex items-center gap-1 hover:text-text-primary transition-colors"
                      >
                        Imported
                        {sortKey === "createdAt" ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium w-24">
                      <button
                        type="button"
                        onClick={() => handleSort("fileSize")}
                        className="flex items-center gap-1 hover:text-text-primary transition-colors ml-auto"
                      >
                        Size
                        {sortKey === "fileSize" ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium w-28">Status</th>
                    <th className="px-4 py-3 font-medium w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-tertiary">
                  {filteredItems.map((item) => {
                    const isDownloaded =
                      item.downloadStatus === "completed" && item.localPath;
                    const isDownloading = item.downloadStatus === "downloading";
                    const isQueued = item.downloadStatus === "queued";
                    const hasError = item.downloadStatus === "error";
                    const displayName = item.pdfTitle || item.fileName;

                    return (
                      <tr
                        key={getItemKey(item)}
                        className={`hover:bg-bg-tertiary transition-colors ${isDownloaded ? "cursor-pointer" : ""}`}
                        onClick={() => isDownloaded && handleOpenPdf(item)}
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-14 flex-shrink-0 flex items-center justify-center bg-bg-tertiary rounded overflow-hidden">
                              {item.thumbnailData ? (
                                // biome-ignore lint/performance/noImgElement: base64 data URI cannot be optimized by Next.js Image
                                <img
                                  src={`data:image/png;base64,${item.thumbnailData}`}
                                  alt={displayName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <FileText className="w-5 h-5 text-text-tertiary" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              {item.isFavorite && (
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                              )}
                              <span
                                className="text-text-primary truncate"
                                title={displayName}
                              >
                                {displayName}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-text-secondary truncate max-w-[200px]"
                          title={item.pdfAuthor || ""}
                        >
                          {item.pdfAuthor || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-tertiary">
                          {formatIsoDate(item.modifiedTime)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-tertiary">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-tertiary text-right">
                          {formatFileSize(item.fileSize)}
                        </td>
                        <td className="px-4 py-3">
                          {isDownloading ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden max-w-16">
                                <div
                                  className="h-full bg-accent rounded-full transition-all"
                                  style={{ width: `${item.downloadProgress}%` }}
                                />
                              </div>
                              <span className="text-xs text-accent">
                                {item.downloadProgress.toFixed(0)}%
                              </span>
                            </div>
                          ) : isQueued ? (
                            <span className="inline-flex items-center gap-1 text-xs text-accent">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Queued
                            </span>
                          ) : isDownloaded ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-500">
                              <Check className="w-3 h-3" />
                              Downloaded
                            </span>
                          ) : hasError ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-400">
                              <AlertCircle className="w-3 h-3" />
                              Error
                            </span>
                          ) : (
                            <span className="text-xs text-text-tertiary">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* Favorite toggle button */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleFavorite(item, e)}
                              className={`p-1.5 hover:bg-bg-hover rounded transition-colors ${
                                item.isFavorite
                                  ? "text-yellow-500"
                                  : "text-text-tertiary hover:text-yellow-500"
                              }`}
                              title={
                                item.isFavorite
                                  ? "Remove from favorites"
                                  : "Add to favorites"
                              }
                            >
                              <Star
                                className={`w-4 h-4 ${item.isFavorite ? "fill-yellow-500" : ""}`}
                              />
                            </button>
                            {/* Info button */}
                            <button
                              type="button"
                              onClick={(e) => handleShowDetail(item, e)}
                              className="p-1.5 hover:bg-bg-hover rounded transition-colors text-text-tertiary hover:text-text-secondary"
                              title="Book details"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            {(isDownloading || isQueued) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isQueued) {
                                    cancelQueuedDownload(item.driveFileId || "");
                                  } else {
                                    handleCancel(item);
                                  }
                                }}
                                className="p-1.5 hover:bg-bg-hover rounded transition-colors"
                                title="Cancel"
                              >
                                <X className="w-4 h-4 text-text-secondary hover:text-red-400" />
                              </button>
                            )}
                            {isDownloaded && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenPdf(item);
                                  }}
                                  className="p-1.5 hover:bg-bg-hover rounded transition-colors"
                                  title="Open"
                                >
                                  <ExternalLink className="w-4 h-4 text-text-secondary" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(item);
                                  }}
                                  className="p-1.5 hover:bg-bg-hover rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4 text-text-secondary hover:text-red-400" />
                                </button>
                              </>
                            )}
                            {!isDownloaded &&
                              !isDownloading &&
                              !isQueued &&
                              authStatus.authenticated &&
                              item.sourceType !== "local" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(item);
                                  }}
                                  className="p-1.5 hover:bg-bg-hover rounded transition-colors"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4 text-accent" />
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            // Grid view
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredItems.map(renderBookItem)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Book Detail Modal */}
      <BookDetailModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedBookForDetail(null);
          setSelectedBookPdfInfo(null);
          setIsTocLoading(false);
        }}
        pdfInfo={selectedBookPdfInfo}
        thumbnailUrl={getBookDetailThumbnail(selectedBookForDetail)}
        filePath={
          selectedBookForDetail?.localPath ||
          selectedBookForDetail?.originalPath ||
          null
        }
        isTocLoading={isTocLoading}
      />
    </div>
  );
}
