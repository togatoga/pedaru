"use client";

import { ChevronRight, FolderOpen, FolderPlus, Loader2, X } from "lucide-react";
import { useCallback } from "react";
import DriveBreadcrumb from "@/components/bookshelf/DriveBreadcrumb";
import { useDriveBrowser } from "@/components/bookshelf/useDriveBrowser";
import type { DriveFolder, DriveItem } from "@/types";

interface DriveFolderBrowserProps {
  listDriveFolders: (parentId?: string) => Promise<DriveFolder[]>;
  onSyncFolder: (folderId: string, folderName: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Full-screen browser for selecting a Google Drive folder to sync (shows only folders)
 */
export default function DriveFolderBrowser({
  listDriveFolders,
  onSyncFolder,
  onClose,
}: DriveFolderBrowserProps) {
  const fetchFolders = useCallback(
    async (parentId?: string): Promise<DriveItem[]> => {
      const driveFolders = await listDriveFolders(parentId);
      // Convert DriveFolder to DriveItem format
      return driveFolders.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: "application/vnd.google-apps.folder",
        modifiedTime: f.modifiedTime,
        isFolder: true,
      }));
    },
    [listDriveFolders],
  );

  const {
    browseItems,
    folderPath,
    isBrowsing,
    navigateToFolder,
    navigateBack,
  } = useDriveBrowser(fetchFolders);

  const handleAddCurrentFolder = useCallback(async () => {
    if (folderPath.length > 0) {
      const currentFolder = folderPath[folderPath.length - 1];
      await onSyncFolder(currentFolder.id, currentFolder.name);
    }
  }, [folderPath, onSyncFolder]);

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
          onClick={onClose}
          className="p-2 hover:bg-bg-tertiary rounded"
        >
          <X className="w-5 h-5 text-text-secondary" />
        </button>
      </div>

      <DriveBreadcrumb folderPath={folderPath} onNavigate={navigateBack} />

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
                  onClick={() => navigateToFolder(folder)}
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
