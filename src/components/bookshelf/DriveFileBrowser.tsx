"use client";

import {
  Check,
  ChevronRight,
  Cloud,
  Download,
  FolderOpen,
  FolderPlus,
  Grid,
  List,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import DriveBreadcrumb from "@/components/bookshelf/DriveBreadcrumb";
import DriveFileThumbnail from "@/components/bookshelf/DriveFileThumbnail";
import { useDriveBrowser } from "@/components/bookshelf/useDriveBrowser";
import { formatFileSize } from "@/lib/formatUtils";
import type { DriveItem } from "@/types";

interface DriveFileBrowserProps {
  listDriveItems: (parentId?: string) => Promise<DriveItem[]>;
  isImporting: boolean;
  onImport: (files: DriveItem[], parentFolderId?: string) => Promise<void>;
  onSyncFolder: (folderId: string, folderName: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Full-screen browser for importing files from Google Drive (shows files with thumbnails)
 */
export default function DriveFileBrowser({
  listDriveItems,
  isImporting,
  onImport,
  onSyncFolder,
  onClose,
}: DriveFileBrowserProps) {
  const {
    browseItems,
    selectedFiles,
    currentFolderId,
    folderPath,
    isBrowsing,
    navigateToFolder,
    navigateBack,
    toggleFileSelection,
  } = useDriveBrowser(listDriveItems);

  const [browserViewMode, setBrowserViewMode] = useState<"grid" | "list">(
    "grid",
  );

  const handleImportSelectedFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    await onImport(selectedFiles, currentFolderId || undefined);
  }, [selectedFiles, currentFolderId, onImport]);

  const handleSyncCurrentFolder = useCallback(async () => {
    const currentFolder = folderPath[folderPath.length - 1];
    await onSyncFolder(currentFolder.id, currentFolder.name);
  }, [folderPath, onSyncFolder]);

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
            onClick={onClose}
            className="p-2 hover:bg-bg-tertiary rounded"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>
      </div>

      <DriveBreadcrumb folderPath={folderPath} onNavigate={navigateBack} />

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
                      onClick={() => navigateToFolder(folder)}
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
                          <DriveFileThumbnail
                            file={file}
                            iconClassName="w-12 h-12"
                          />
                        </div>
                        <div className="p-2 bg-bg-secondary">
                          <p className="text-xs text-text-primary truncate">
                            {file.name}
                          </p>
                          {file.size && (
                            <p className="text-xs text-text-tertiary">
                              {formatFileSize(parseInt(file.size, 10))}
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
                            <DriveFileThumbnail
                              file={file}
                              iconClassName="w-5 h-5"
                            />
                          </div>
                          <span className="text-text-primary truncate flex-1">
                            {file.name}
                          </span>
                          {file.size && (
                            <span className="text-xs text-text-tertiary shrink-0">
                              {formatFileSize(parseInt(file.size, 10))}
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
              onClick={handleSyncCurrentFolder}
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
