"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { getSourceTypeFromIsCloud, itemMatches } from "@/lib/bookshelfUtils";
import type {
  BookshelfItem,
  DownloadProgress,
  ImportResult,
  SourceType,
  SyncResult,
} from "@/types";

/**
 * Hook for managing bookshelf items (PDFs from Google Drive)
 */
export function useBookshelf() {
  const [items, setItems] = useState<BookshelfItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Apply a partial update to the item with the given Drive file ID
   */
  const patchItemByDriveId = useCallback(
    (
      driveFileId: BookshelfItem["driveFileId"],
      patch: Partial<BookshelfItem>,
    ) => {
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.driveFileId === driveFileId ? { ...item, ...patch } : item,
        ),
      );
    },
    [],
  );

  /**
   * Apply a partial update to the item with the given ID and source type.
   * Both must match since cloud and local items can have the same id
   * (from different tables).
   */
  const patchItemById = useCallback(
    (itemId: number, sourceType: SourceType, patch: Partial<BookshelfItem>) => {
      setItems((prevItems) =>
        prevItems.map((item) =>
          itemMatches(item, itemId, sourceType) ? { ...item, ...patch } : item,
        ),
      );
    },
    [],
  );

  // Load items on mount
  useEffect(() => {
    if (isInitialized) return;
    setIsInitialized(true);

    const doLoad = async () => {
      try {
        setIsLoading(true);
        const bookshelfItems = await invoke<BookshelfItem[]>(
          "get_bookshelf_items",
        );
        setItems(bookshelfItems);
        setError(null);
      } catch (err) {
        console.error("Failed to load bookshelf items:", err);
        setError(String(err));
        // Even on error, we should show empty state not loading
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    doLoad();
  }, [isInitialized]);

  // Listen for download progress events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      unlisten = await listen<DownloadProgress>(
        "download-progress",
        (event) => {
          const { driveFileId, progress } = event.payload;

          patchItemByDriveId(driveFileId, {
            downloadProgress: progress,
            downloadStatus: progress >= 100 ? "completed" : "downloading",
          });
        },
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [patchItemByDriveId]);

  /**
   * Load all bookshelf items from database
   */
  const loadItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const bookshelfItems = await invoke<BookshelfItem[]>(
        "get_bookshelf_items",
      );
      setItems(bookshelfItems);
      setError(null);
    } catch (err) {
      console.error("Failed to load bookshelf items:", err);
      setError(String(err));
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Sync bookshelf with Google Drive
   */
  const sync = useCallback(async (): Promise<SyncResult | null> => {
    try {
      setIsSyncing(true);
      setError(null);
      const result = await invoke<SyncResult>("sync_bookshelf");
      await loadItems(); // Reload items after sync
      return result;
    } catch (err) {
      console.error("Failed to sync bookshelf:", err);
      setError(String(err));
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [loadItems]);

  /**
   * Download a bookshelf item
   */
  const downloadItem = useCallback(
    async (item: BookshelfItem): Promise<string | null> => {
      try {
        setError(null);

        patchItemByDriveId(item.driveFileId, {
          downloadStatus: "downloading",
          downloadProgress: 0,
        });

        const localPath = await invoke<string>("download_bookshelf_item", {
          driveFileId: item.driveFileId,
          fileName: item.fileName,
        });

        patchItemByDriveId(item.driveFileId, {
          downloadStatus: "completed",
          downloadProgress: 100,
          localPath,
        });

        return localPath;
      } catch (err) {
        console.error("Failed to download item:", err);
        setError(String(err));

        patchItemByDriveId(item.driveFileId, {
          downloadStatus: "error",
          downloadProgress: 0,
        });

        return null;
      }
    },
    [patchItemByDriveId],
  );

  /**
   * Cancel a downloading item
   */
  const cancelDownload = useCallback(
    async (driveFileId: string): Promise<boolean> => {
      const markPending = () =>
        patchItemByDriveId(driveFileId, {
          downloadStatus: "pending",
          downloadProgress: 0,
        });

      try {
        const cancelled = await invoke<boolean>("cancel_bookshelf_download", {
          driveFileId,
        });

        if (cancelled) {
          markPending();
        }

        return cancelled;
      } catch (err) {
        console.error("Failed to cancel download:", err);
        markPending();
        return false;
      }
    },
    [patchItemByDriveId],
  );

  /**
   * Delete local copy of a bookshelf item (deletes file from disk)
   */
  const deleteLocalCopy = useCallback(
    async (driveFileId: string): Promise<boolean> => {
      try {
        await invoke("delete_local_copy", { driveFileId });

        patchItemByDriveId(driveFileId, {
          downloadStatus: "pending",
          downloadProgress: 0,
          localPath: undefined,
        });

        return true;
      } catch (err) {
        console.error("Failed to delete local copy:", err);
        setError(String(err));
        return false;
      }
    },
    [patchItemByDriveId],
  );

  /**
   * Reset download status without deleting the file (for missing files)
   */
  const resetDownloadStatus = useCallback(
    async (driveFileId: string): Promise<boolean> => {
      try {
        await invoke("reset_download_status", { driveFileId });

        patchItemByDriveId(driveFileId, {
          downloadStatus: "pending",
          downloadProgress: 0,
          localPath: undefined,
          thumbnailData: undefined,
        });

        return true;
      } catch (err) {
        console.error("Failed to reset download status:", err);
        return false;
      }
    },
    [patchItemByDriveId],
  );

  /**
   * Import local PDF files to bookshelf
   */
  const importLocalFiles = useCallback(
    async (paths: string[]): Promise<ImportResult | null> => {
      try {
        setError(null);
        const result = await invoke<ImportResult>("import_local_files", {
          paths,
        });
        await loadItems(); // Reload items after import
        return result;
      } catch (err) {
        console.error("Failed to import local files:", err);
        setError(String(err));
        return null;
      }
    },
    [loadItems],
  );

  /**
   * Import all PDFs from a local directory
   */
  const importLocalDirectory = useCallback(
    async (dirPath: string): Promise<ImportResult | null> => {
      try {
        setError(null);
        const result = await invoke<ImportResult>("import_local_directory", {
          dirPath,
        });
        await loadItems(); // Reload items after import
        return result;
      } catch (err) {
        console.error("Failed to import local directory:", err);
        setError(String(err));
        return null;
      }
    },
    [loadItems],
  );

  /**
   * Delete a local bookshelf item (removes from database and deletes the copied file)
   * Note: This only works for local items (sourceType === "local")
   */
  const deleteItem = useCallback(async (itemId: number): Promise<boolean> => {
    try {
      await invoke("delete_bookshelf_item", { itemId });

      // Remove from local state - must match both id and sourceType since
      // cloud and local items can have the same id (from different tables)
      setItems((prevItems) =>
        prevItems.filter((item) => !itemMatches(item, itemId, "local")),
      );

      return true;
    } catch (err) {
      console.error("Failed to delete item:", err);
      setError(String(err));
      return false;
    }
  }, []);

  /**
   * Toggle favorite status for a bookshelf item
   * @param itemId - The item ID
   * @param isCloud - Whether the item is a cloud item (Google Drive) or local item
   */
  const toggleFavorite = useCallback(
    async (itemId: number, isCloud: boolean): Promise<boolean> => {
      try {
        const newStatus = await invoke<boolean>("toggle_bookshelf_favorite", {
          itemId,
          isCloud,
        });

        patchItemById(itemId, getSourceTypeFromIsCloud(isCloud), {
          isFavorite: newStatus,
        });

        return newStatus;
      } catch (err) {
        console.error("Failed to toggle favorite:", err);
        setError(String(err));
        return false;
      }
    },
    [patchItemById],
  );

  /**
   * Update thumbnail for a cloud bookshelf item
   */
  const updateThumbnail = useCallback(
    async (driveFileId: string, thumbnailData: string): Promise<boolean> => {
      try {
        await invoke("update_bookshelf_thumbnail", {
          driveFileId,
          thumbnailData,
        });

        patchItemByDriveId(driveFileId, { thumbnailData });

        return true;
      } catch (err) {
        console.error("Failed to update thumbnail:", err);
        return false;
      }
    },
    [patchItemByDriveId],
  );

  /**
   * Update thumbnail for a local bookshelf item
   */
  const updateLocalThumbnail = useCallback(
    async (itemId: number, thumbnailData: string): Promise<boolean> => {
      try {
        await invoke("update_local_thumbnail", { itemId, thumbnailData });

        patchItemById(itemId, "local", { thumbnailData });

        return true;
      } catch (err) {
        console.error("Failed to update local thumbnail:", err);
        return false;
      }
    },
    [patchItemById],
  );

  /**
   * Update last_opened timestamp when a PDF is opened
   */
  const updateLastOpened = useCallback(
    async (localPath: string): Promise<boolean> => {
      try {
        await invoke("update_bookshelf_last_opened", { localPath });

        // Update local state
        const now = Math.floor(Date.now() / 1000);
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.localPath === localPath ? { ...item, lastOpened: now } : item,
          ),
        );

        return true;
      } catch (err) {
        console.error("Failed to update last opened:", err);
        return false;
      }
    },
    [],
  );

  /**
   * Get items that need thumbnails generated
   */
  const getItemsNeedingThumbnails = useCallback(() => {
    return items.filter(
      (item) =>
        item.downloadStatus === "completed" &&
        item.localPath &&
        !item.thumbnailData,
    );
  }, [items]);

  return {
    // State
    items,
    isLoading,
    isSyncing,
    error,

    // Actions
    loadItems,
    sync,
    downloadItem,
    cancelDownload,
    deleteLocalCopy,
    resetDownloadStatus,
    updateThumbnail,
    updateLocalThumbnail,
    updateLastOpened,
    importLocalFiles,
    importLocalDirectory,
    deleteItem,
    toggleFavorite,

    // Getters
    getItemsNeedingThumbnails,
  };
}
