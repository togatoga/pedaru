"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSourceTypeFromIsCloud, itemMatches } from "@/lib/bookshelfUtils";
import type {
  BookshelfItem,
  DownloadProgress,
  DownloadQueueState,
  ImportResult,
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
  const [queueState, setQueueState] = useState<DownloadQueueState | null>(null);

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

          setItems((prevItems) =>
            prevItems.map((item) =>
              item.driveFileId === driveFileId
                ? {
                    ...item,
                    downloadProgress: progress,
                    downloadStatus:
                      progress >= 100 ? "completed" : "downloading",
                  }
                : item,
            ),
          );
        },
      );
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Track previous queue state to detect completed downloads
  const prevQueueStateRef = useRef<DownloadQueueState | null>(null);

  // Load queue state on mount and listen for changes
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const loadQueueState = async () => {
      try {
        const state = await invoke<DownloadQueueState>(
          "get_download_queue_state",
        );
        setQueueState(state);
        prevQueueStateRef.current = state;
      } catch (err) {
        console.error("Failed to load queue state:", err);
      }
    };

    const setupListener = async () => {
      unlisten = await listen<DownloadQueueState>(
        "download-queue-changed",
        async (event) => {
          const newState = event.payload;
          const prevState = prevQueueStateRef.current;

          setQueueState(newState);
          prevQueueStateRef.current = newState;

          // Detect when a download completes:
          // - Previous state had a currentItem with status "processing"
          // - New state has no currentItem OR different currentItem
          // This means the previous item finished (completed, cancelled, or error)
          if (
            prevState?.currentItem?.status === "processing" &&
            (!newState.currentItem ||
              newState.currentItem.driveFileId !==
                prevState.currentItem.driveFileId)
          ) {
            // Reload items to get updated localPath, but preserve queued status
            try {
              const bookshelfItems = await invoke<BookshelfItem[]>(
                "get_bookshelf_items",
              );

              // If queue is still running, preserve queued status for pending items
              if (newState.isRunning || newState.pendingCount > 0) {
                setItems((prevItems) => {
                  // Build a set of currently queued drive file IDs
                  const queuedIds = new Set(
                    prevItems
                      .filter(
                        (item) =>
                          item.downloadStatus === "queued" && item.driveFileId,
                      )
                      .map((item) => item.driveFileId),
                  );

                  // Update items but preserve queued status
                  return bookshelfItems.map((item) => {
                    if (
                      item.driveFileId &&
                      queuedIds.has(item.driveFileId) &&
                      item.downloadStatus === "pending"
                    ) {
                      return { ...item, downloadStatus: "queued" as const };
                    }
                    return item;
                  });
                });
              } else {
                setItems(bookshelfItems);
              }
            } catch (err) {
              console.error("Failed to reload items after download:", err);
            }
          }
        },
      );
    };

    loadQueueState();
    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

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

        // Update local state to show downloading
        setItems((prevItems) =>
          prevItems.map((i) =>
            i.driveFileId === item.driveFileId
              ? {
                  ...i,
                  downloadStatus: "downloading" as const,
                  downloadProgress: 0,
                }
              : i,
          ),
        );

        const localPath = await invoke<string>("download_bookshelf_item", {
          driveFileId: item.driveFileId,
          fileName: item.fileName,
        });

        // Update local state with completed download
        setItems((prevItems) =>
          prevItems.map((i) =>
            i.driveFileId === item.driveFileId
              ? {
                  ...i,
                  downloadStatus: "completed" as const,
                  downloadProgress: 100,
                  localPath,
                }
              : i,
          ),
        );

        return localPath;
      } catch (err) {
        console.error("Failed to download item:", err);
        setError(String(err));

        // Update local state to show error
        setItems((prevItems) =>
          prevItems.map((i) =>
            i.driveFileId === item.driveFileId
              ? { ...i, downloadStatus: "error" as const, downloadProgress: 0 }
              : i,
          ),
        );

        return null;
      }
    },
    [],
  );

  /**
   * Cancel a downloading item
   */
  const cancelDownload = useCallback(
    async (driveFileId: string): Promise<boolean> => {
      try {
        const cancelled = await invoke<boolean>("cancel_bookshelf_download", {
          driveFileId,
        });

        if (cancelled) {
          setItems((prevItems) =>
            prevItems.map((item) =>
              item.driveFileId === driveFileId
                ? {
                    ...item,
                    downloadStatus: "pending" as const,
                    downloadProgress: 0,
                  }
                : item,
            ),
          );
        }

        return cancelled;
      } catch (err) {
        console.error("Failed to cancel download:", err);
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.driveFileId === driveFileId
              ? {
                  ...item,
                  downloadStatus: "pending" as const,
                  downloadProgress: 0,
                }
              : item,
          ),
        );
        return false;
      }
    },
    [],
  );

  /**
   * Delete local copy of a bookshelf item (deletes file from disk)
   */
  const deleteLocalCopy = useCallback(
    async (driveFileId: string): Promise<boolean> => {
      try {
        await invoke("delete_local_copy", { driveFileId });

        // Update local state
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.driveFileId === driveFileId
              ? {
                  ...item,
                  downloadStatus: "pending" as const,
                  downloadProgress: 0,
                  localPath: undefined,
                }
              : item,
          ),
        );

        return true;
      } catch (err) {
        console.error("Failed to delete local copy:", err);
        setError(String(err));
        return false;
      }
    },
    [],
  );

  /**
   * Reset download status without deleting the file (for missing files)
   */
  const resetDownloadStatus = useCallback(
    async (driveFileId: string): Promise<boolean> => {
      try {
        await invoke("reset_download_status", { driveFileId });

        // Update local state
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.driveFileId === driveFileId
              ? {
                  ...item,
                  downloadStatus: "pending" as const,
                  downloadProgress: 0,
                  localPath: undefined,
                  thumbnailData: undefined,
                }
              : item,
          ),
        );

        return true;
      } catch (err) {
        console.error("Failed to reset download status:", err);
        return false;
      }
    },
    [],
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

        // Update local state - must match both id and sourceType since
        // cloud and local items can have the same id (from different tables)
        const expectedSourceType = getSourceTypeFromIsCloud(isCloud);
        setItems((prevItems) =>
          prevItems.map((item) =>
            itemMatches(item, itemId, expectedSourceType)
              ? { ...item, isFavorite: newStatus }
              : item,
          ),
        );

        return newStatus;
      } catch (err) {
        console.error("Failed to toggle favorite:", err);
        setError(String(err));
        return false;
      }
    },
    [],
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

        // Update local state
        setItems((prevItems) =>
          prevItems.map((item) =>
            item.driveFileId === driveFileId
              ? { ...item, thumbnailData }
              : item,
          ),
        );

        return true;
      } catch (err) {
        console.error("Failed to update thumbnail:", err);
        return false;
      }
    },
    [],
  );

  /**
   * Update thumbnail for a local bookshelf item
   */
  const updateLocalThumbnail = useCallback(
    async (itemId: number, thumbnailData: string): Promise<boolean> => {
      try {
        await invoke("update_local_thumbnail", { itemId, thumbnailData });

        // Update local state - must match both id and sourceType since
        // cloud and local items can have the same id (from different tables)
        setItems((prevItems) =>
          prevItems.map((item) =>
            itemMatches(item, itemId, "local")
              ? { ...item, thumbnailData }
              : item,
          ),
        );

        return true;
      } catch (err) {
        console.error("Failed to update local thumbnail:", err);
        return false;
      }
    },
    [],
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

  /**
   * Get downloaded items
   */
  const getDownloadedItems = useCallback(() => {
    return items.filter(
      (item) => item.downloadStatus === "completed" && item.localPath,
    );
  }, [items]);

  /**
   * Get pending items
   */
  const getPendingItems = useCallback(() => {
    return items.filter((item) => item.downloadStatus === "pending");
  }, [items]);

  /**
   * Add all pending items to download queue and start worker
   */
  const downloadAllQueued = useCallback(async (): Promise<number> => {
    try {
      const count = await invoke<number>("add_all_to_download_queue");

      // Immediately update UI to show items as queued
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.sourceType === "google_drive" &&
          (item.downloadStatus === "pending" || item.downloadStatus === "error")
            ? {
                ...item,
                downloadStatus: "queued" as const,
                downloadProgress: 0,
              }
            : item,
        ),
      );

      // Always try to start worker (it will handle already-running case)
      try {
        await invoke("start_download_worker");
      } catch {
        // Worker may already be running, which is fine - ignore error
      }

      return count;
    } catch (err) {
      console.error("Failed to start download queue:", err);
      setError(String(err));
      return 0;
    }
  }, []);

  /**
   * Stop the download worker
   */
  const stopDownloadQueue = useCallback(async (): Promise<void> => {
    try {
      await invoke("stop_download_worker");
      // Immediately reset queued/downloading items to pending
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.downloadStatus === "queued" ||
          item.downloadStatus === "downloading"
            ? {
                ...item,
                downloadStatus: "pending" as const,
                downloadProgress: 0,
              }
            : item,
        ),
      );
    } catch (err) {
      console.error("Failed to stop download queue:", err);
    }
  }, []);

  /**
   * Cancel a queued download
   */
  const cancelQueuedDownload = useCallback(
    async (driveFileId: string): Promise<boolean> => {
      try {
        const result = await invoke<boolean>("cancel_queued_download", {
          driveFileId,
        });
        if (result) {
          // Immediately update UI to show item as pending
          setItems((prevItems) =>
            prevItems.map((item) =>
              item.driveFileId === driveFileId
                ? {
                    ...item,
                    downloadStatus: "pending" as const,
                    downloadProgress: 0,
                  }
                : item,
            ),
          );
        }
        return result;
      } catch (err) {
        console.error("Failed to cancel queued download:", err);
        return false;
      }
    },
    [],
  );

  return {
    // State
    items,
    isLoading,
    isSyncing,
    error,
    queueState,

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

    // Queue actions
    downloadAllQueued,
    stopDownloadQueue,
    cancelQueuedDownload,

    // Getters
    getItemsNeedingThumbnails,
    getDownloadedItems,
    getPendingItems,
  };
}
