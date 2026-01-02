'use client';

import { Download, FileText, ExternalLink, Trash2, Loader2, Check, AlertCircle, X } from 'lucide-react';
import type { BookshelfItem as BookshelfItemType } from '@/types';

export type BookshelfViewMode = 'grid' | 'list';

interface BookshelfItemProps {
  item: BookshelfItemType;
  viewMode: BookshelfViewMode;
  isAuthenticated: boolean;
  onOpen: (item: BookshelfItemType) => void;
  onDownload: (item: BookshelfItemType) => void;
  onDelete: (item: BookshelfItemType) => void;
  onCancel?: (item: BookshelfItemType) => void;
}

/**
 * Individual bookshelf item component with thumbnail and actions
 */
export default function BookshelfItem({
  item,
  viewMode,
  isAuthenticated,
  onOpen,
  onDownload,
  onDelete,
  onCancel,
}: BookshelfItemProps) {
  const isDownloaded = item.downloadStatus === 'completed' && item.localPath;
  const isDownloading = item.downloadStatus === 'downloading';
  const hasError = item.downloadStatus === 'error';

  // Display title or filename
  const displayName = item.pdfTitle || item.fileName;

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // List view
  if (viewMode === 'list') {
    return (
      <div
        className={`
          flex items-center gap-3 p-2 rounded-lg
          bg-bg-tertiary hover:bg-bg-secondary
          transition-all duration-200
          ${isDownloaded ? 'cursor-pointer' : ''}
        `}
        onClick={() => isDownloaded && onOpen(item)}
      >
        {/* Thumbnail or icon */}
        <div className="w-10 h-14 flex-shrink-0 flex items-center justify-center bg-bg-primary/50 rounded overflow-hidden">
          {item.thumbnailData ? (
            <img
              src={`data:image/png;base64,${item.thumbnailData}`}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <FileText className="w-5 h-5 text-text-tertiary" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary truncate" title={displayName}>
            {displayName}
          </p>
          {item.pdfAuthor && (
            <p className="text-xs text-text-secondary truncate" title={item.pdfAuthor}>
              {item.pdfAuthor}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            {item.fileSize && <span>{formatFileSize(item.fileSize)}</span>}
            {isDownloading && (
              <span className="text-accent">{item.downloadProgress.toFixed(0)}%</span>
            )}
            {isDownloaded && <span className="text-green-500">Downloaded</span>}
            {hasError && <span className="text-red-400">Error</span>}
          </div>
          {/* Progress bar for downloading */}
          {isDownloading && (
            <div className="w-full h-1 bg-bg-primary rounded-full mt-1">
              <div
                className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${item.downloadProgress}%` }}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isDownloading && (
            <>
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
              {onCancel && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(item);
                  }}
                  className="p-1.5 hover:bg-bg-hover rounded transition-colors"
                  title="Cancel download"
                >
                  <X className="w-4 h-4 text-text-secondary hover:text-red-400" />
                </button>
              )}
            </>
          )}
          {isDownloaded && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(item);
                }}
                className="p-1.5 hover:bg-bg-hover rounded transition-colors"
                title="Open"
              >
                <ExternalLink className="w-4 h-4 text-text-secondary" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item);
                }}
                className="p-1.5 hover:bg-bg-hover rounded transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-text-secondary hover:text-red-400" />
              </button>
            </>
          )}
          {!isDownloaded && !isDownloading && isAuthenticated && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(item);
              }}
              className="p-1.5 hover:bg-bg-hover rounded transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4 text-accent" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div
      className={`
        relative group rounded-lg overflow-hidden
        bg-bg-tertiary hover:bg-bg-secondary
        transition-all duration-200
        ${isDownloaded ? 'cursor-pointer' : ''}
      `}
      onClick={() => isDownloaded && onOpen(item)}
    >
      {/* Thumbnail or placeholder */}
      <div className="aspect-[3/4] flex items-center justify-center bg-bg-primary/50">
        {item.thumbnailData ? (
          <img
            src={`data:image/png;base64,${item.thumbnailData}`}
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <FileText className="w-12 h-12 text-text-tertiary" />
        )}

        {/* Download status overlay */}
        {isDownloading && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
            <span className="text-white text-sm mt-2">
              {item.downloadProgress.toFixed(0)}%
            </span>
            {/* Progress bar */}
            <div className="w-3/4 h-1 bg-white/30 rounded-full mt-2">
              <div
                className="h-full bg-accent rounded-full transition-all duration-200"
                style={{ width: `${item.downloadProgress}%` }}
              />
            </div>
            {/* Cancel button */}
            {onCancel && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel(item);
                }}
                className="mt-3 px-3 py-1 bg-red-500/80 hover:bg-red-500 text-white text-xs rounded transition-colors flex items-center gap-1"
                title="Cancel download"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Error overlay */}
        {hasError && (
          <div className="absolute inset-0 bg-red-900/60 flex flex-col items-center justify-center">
            <AlertCircle className="w-8 h-8 text-white" />
            <span className="text-white text-xs mt-2">Error</span>
          </div>
        )}

        {/* Downloaded indicator */}
        {isDownloaded && !isDownloading && (
          <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-2">
        <p
          className="text-xs text-text-primary truncate"
          title={displayName}
        >
          {displayName}
        </p>
        {item.pdfAuthor && (
          <p className="text-[10px] text-text-secondary truncate mt-0.5" title={item.pdfAuthor}>
            {item.pdfAuthor}
          </p>
        )}
        {item.fileSize && (
          <p className="text-[10px] text-text-tertiary mt-0.5">
            {formatFileSize(item.fileSize)}
          </p>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        {isDownloaded ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen(item);
              }}
              className="p-1.5 bg-accent text-white rounded hover:bg-accent/80 transition-colors"
              title="Open"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
              className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : !isDownloading && isAuthenticated ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(item);
            }}
            className="p-1.5 bg-accent text-white rounded hover:bg-accent/80 transition-colors"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
