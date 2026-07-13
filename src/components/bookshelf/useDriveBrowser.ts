"use client";

import { useCallback, useEffect, useState } from "react";
import type { DriveItem } from "@/types";

/**
 * Hook for browsing Google Drive folder hierarchy with selection support.
 * Loads the root folder on mount; `fetchItems` decides what a folder
 * contains (folders only for sync, folders and files for import).
 */
export function useDriveBrowser(
  fetchItems: (parentId?: string) => Promise<DriveItem[]>,
) {
  const [browseItems, setBrowseItems] = useState<DriveItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<DriveItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [isBrowsing, setIsBrowsing] = useState(true);

  const browse = useCallback(
    async (folderId: string | null) => {
      setIsBrowsing(true);
      try {
        const items = await fetchItems(folderId || undefined);
        setBrowseItems(items);
        setCurrentFolderId(folderId);
        setSelectedFiles([]); // Clear selection when navigating
      } catch (err) {
        console.error("Failed to browse items:", err);
      } finally {
        setIsBrowsing(false);
      }
    },
    [fetchItems],
  );

  const navigateToFolder = useCallback(
    (item: DriveItem) => {
      setFolderPath((prev) => [...prev, { id: item.id, name: item.name }]);
      browse(item.id);
    },
    [browse],
  );

  const navigateBack = useCallback(
    (index: number) => {
      const newPath = folderPath.slice(0, index);
      setFolderPath(newPath);
      browse(newPath.length > 0 ? newPath[newPath.length - 1].id : null);
    },
    [folderPath, browse],
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

  useEffect(() => {
    browse(null);
  }, [browse]);

  return {
    browseItems,
    selectedFiles,
    currentFolderId,
    folderPath,
    isBrowsing,
    navigateToFolder,
    navigateBack,
    toggleFileSelection,
  };
}
