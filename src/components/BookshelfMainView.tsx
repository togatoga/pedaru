"use client";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Cloud,
  Download,
  FilePlus,
  FileText,
  FolderOpen,
  Grid,
  HardDrive,
  Info,
  Library,
  List,
  Loader2,
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
import BookshelfSettings from "@/components/bookshelf/BookshelfSettings";
import DriveFileBrowser from "@/components/bookshelf/DriveFileBrowser";
import DriveFolderBrowser from "@/components/bookshelf/DriveFolderBrowser";
import { useBookshelf } from "@/hooks/useBookshelf";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { filterBySource, getItemKey } from "@/lib/bookshelfUtils";
import { formatDate, formatFileSize, formatIsoDate } from "@/lib/formatUtils";
import { generateThumbnailsInBackground } from "@/lib/thumbnailGenerator";
import type { BookshelfItem as BookshelfItemType, DriveItem } from "@/types";
import type { BookshelfMainViewProps } from "@/types/components";
import type { PdfInfo } from "@/types/pdf";

type SortKey = "title" | "author" | "createdAt" | "modifiedTime" | "fileSize";

const SORTABLE_COLUMNS: {
  key: SortKey;
  label: string;
  className: string;
  buttonClassName?: string;
}[] = [
  { key: "title", label: "Title", className: "px-6 py-3 font-medium" },
  { key: "author", label: "Author", className: "px-4 py-3 font-medium" },
  {
    key: "modifiedTime",
    label: "Modified",
    className: "px-4 py-3 font-medium w-36",
  },
  {
    key: "createdAt",
    label: "Imported",
    className: "px-4 py-3 font-medium w-36",
  },
  {
    key: "fileSize",
    label: "Size",
    className: "px-4 py-3 font-medium w-24",
    buttonClassName: "ml-auto",
  },
];

// Sortable column header with sort direction indicator
function SortableHeader({
  label,
  sortKey,
  activeKey,
  order,
  onSort,
  className,
  buttonClassName,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  order: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className: string;
  buttonClassName?: string;
}) {
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 hover:text-text-primary transition-colors${buttonClassName ? ` ${buttonClassName}` : ""}`}
      >
        {label}
        {activeKey === sortKey ? (
          order === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}

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
  } = useBookshelf();

  const [showSettings, setShowSettings] = useState(false);
  // Credentials input (for first-time setup); lives here so unsaved input
  // survives closing and reopening the settings screen
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [showCloudFileBrowser, setShowCloudFileBrowser] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentDownloadIndex, setCurrentDownloadIndex] = useState(0);
  const [totalDownloads, setTotalDownloads] = useState(0);
  const [filterMode, setFilterMode] = useState<
    "all" | "pending" | "downloaded"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<"local" | "cloud" | null>(
    null,
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Book detail modal state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBookForDetail, setSelectedBookForDetail] =
    useState<BookshelfItemType | null>(null);
  const [selectedBookPdfInfo, setSelectedBookPdfInfo] =
    useState<PdfInfo | null>(null);
  const [isTocLoading, setIsTocLoading] = useState(false);

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

  const handleAddSyncFolder = useCallback(
    async (folderId: string, folderName: string) => {
      await addSyncFolder(folderId, folderName);
      setShowFolderBrowser(false);
      setShowCloudFileBrowser(false);
      // Trigger sync immediately after adding folder
      await sync();
    },
    [addSyncFolder, sync],
  );

  const handleImportDriveFiles = useCallback(
    async (files: DriveItem[], parentFolderId?: string) => {
      setIsImporting(true);
      try {
        const count = await importDriveFiles(files, parentFolderId);
        console.log(`Imported ${count} files from Google Drive`);
        setShowCloudFileBrowser(false);
        // Trigger sync immediately after importing files
        await sync();
      } catch (error) {
        console.error("Failed to import files:", error);
      } finally {
        setIsImporting(false);
      }
    },
    [importDriveFiles, sync],
  );

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

  // Get downloadable items count (only cloud files can be downloaded)
  const downloadableItems = useMemo(() => {
    return items.filter(
      (item) =>
        item.sourceType === "google_drive" &&
        (item.downloadStatus === "pending" || item.downloadStatus === "error"),
    );
  }, [items]);
  const downloadableCount = downloadableItems.length;

  // Handle sort column click
  const handleSort = useCallback(
    (key: SortKey) => {
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

    setIsDownloadingAll(true);
    setTotalDownloads(downloadableItems.length);
    setCurrentDownloadIndex(0);
    try {
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

  // Render a single book item
  const renderBookItem = (item: BookshelfItemType) => {
    const isDownloaded = item.downloadStatus === "completed" && item.localPath;
    const isDownloading = item.downloadStatus === "downloading";
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

          {isDownloading && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
              <span className="text-white text-base mt-2">
                {item.downloadProgress.toFixed(0)}%
              </span>
              <div className="w-3/4 h-1.5 bg-white/30 rounded-full mt-2">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-200"
                  style={{ width: `${item.downloadProgress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel(item);
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
      <BookshelfSettings
        authStatus={authStatus}
        authLoading={authLoading}
        hasCheckedAuth={hasCheckedAuth}
        syncedFolders={syncedFolders}
        isSyncing={isSyncing}
        clientId={clientId}
        clientSecret={clientSecret}
        onClientIdChange={setClientId}
        onClientSecretChange={setClientSecret}
        onSaveCredentials={handleSaveCredentials}
        checkAuthStatus={checkAuthStatus}
        login={login}
        logout={logout}
        removeSyncFolder={removeSyncFolder}
        onSync={handleSync}
        onBrowseFolders={() => {
          setShowSettings(false); // Close settings first
          setShowFolderBrowser(true);
        }}
        onClose={() => setShowSettings(false)}
      />
    );
  }

  // Folder browser modal (for folder sync - shows only folders)
  if (showFolderBrowser) {
    return (
      <DriveFolderBrowser
        listDriveFolders={listDriveFolders}
        onSyncFolder={handleAddSyncFolder}
        onClose={() => setShowFolderBrowser(false)}
      />
    );
  }

  // Cloud file browser modal (for file import - shows files with thumbnails)
  if (showCloudFileBrowser) {
    return (
      <DriveFileBrowser
        listDriveItems={listDriveItems}
        isImporting={isImporting}
        onImport={handleImportDriveFiles}
        onSyncFolder={handleAddSyncFolder}
        onClose={() => setShowCloudFileBrowser(false)}
      />
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

          {/* Download progress */}
          {(isDownloadingAll || downloadingItem) && (
            <div className="px-6 py-3 bg-accent/10 border-b border-bg-tertiary shrink-0">
              <div className="flex items-center gap-3 text-sm text-text-primary">
                <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
                <span className="truncate flex-1">
                  {downloadingItem
                    ? downloadingItem.pdfTitle || downloadingItem.fileName
                    : "Starting..."}
                </span>
              </div>
              {isDownloadingAll && totalDownloads > 0 && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{
                        width: `${(currentDownloadIndex / totalDownloads) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm text-text-tertiary shrink-0">
                    {currentDownloadIndex}/{totalDownloads}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Download All button (only for cloud files, hidden when viewing local only) */}
          {authStatus.authenticated &&
            downloadableCount > 0 &&
            !isDownloadingAll &&
            sourceFilter !== "local" && (
              <div className="px-6 py-3 border-b border-bg-tertiary shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={isDownloadingAll}
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
                    {SORTABLE_COLUMNS.map((column) => (
                      <SortableHeader
                        key={column.key}
                        label={column.label}
                        sortKey={column.key}
                        activeKey={sortKey}
                        order={sortOrder}
                        onSort={handleSort}
                        className={column.className}
                        buttonClassName={column.buttonClassName}
                      />
                    ))}
                    <th className="px-4 py-3 font-medium w-28">Status</th>
                    <th className="px-4 py-3 font-medium w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-tertiary">
                  {filteredItems.map((item) => {
                    const isDownloaded =
                      item.downloadStatus === "completed" && item.localPath;
                    const isDownloading = item.downloadStatus === "downloading";
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
                          {item.fileSize ? formatFileSize(item.fileSize) : "-"}
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
                            {isDownloading && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancel(item);
                                }}
                                className="p-1.5 hover:bg-bg-hover rounded transition-colors"
                                title="Cancel"
                              >
                                <X className="w-4 h-4 text-text-secondary hover:text-red-400" />
                              </button>
                            )}
                            {isDownloaded && (
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
                            )}
                            {!isDownloaded &&
                              !isDownloading &&
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
