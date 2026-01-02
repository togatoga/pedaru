import { useCallback, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import {
  useTauriEventListener,
  useTauriEventListeners,
} from '@/lib/eventUtils';
import type { ViewMode } from './types';

/**
 * Custom hook for handling application menu events
 *
 * Manages menu-triggered actions including reset, zoom controls,
 * view mode toggles, and opening recent files
 *
 * @param resetAllState - Function to reset all application state
 * @param loadPdfFromPath - Function to load a PDF from path
 * @param filePathRef - Ref to current file path
 * @param isStandaloneMode - Whether running in standalone window mode
 * @param handleZoomIn - Function to zoom in
 * @param handleZoomOut - Function to zoom out
 * @param handleZoomReset - Function to reset zoom
 * @param handleToggleHeader - Function to toggle header visibility
 * @param setViewMode - Setter for view mode
 * @param handleOpenSettings - Function to open settings
 */
export function useMenuHandlers(
  resetAllState: (options?: { resetViewMode?: boolean }) => void,
  loadPdfFromPath: (path: string) => Promise<void>,
  filePathRef: MutableRefObject<string | null>,
  isStandaloneMode: boolean,
  handleZoomIn: () => void,
  handleZoomOut: () => void,
  handleZoomReset: () => void,
  handleToggleHeader: () => void,
  setViewMode: Dispatch<SetStateAction<ViewMode>>,
  handleOpenSettings: () => void
) {
  // Handle reset all data request from app menu
  const handleResetAllData = useCallback(async () => {
    // Show native confirmation dialog
    const confirmed = await confirm(
      'This will delete:\n\n' +
        '• All bookmarks\n' +
        '• All session history\n' +
        '• Last opened file info\n\n' +
        'This action cannot be undone.',
      {
        title: 'Initialize App?',
        kind: 'warning',
        okLabel: 'Initialize',
        cancelLabel: 'Cancel',
      }
    );

    if (confirmed) {
      // Clear all localStorage data for this app
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('pedaru_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      // Reset current state (including viewMode for full reset)
      resetAllState({ resetViewMode: true });
    }
  }, [resetAllState]);

  // Handle opening a recent file
  const handleOpenRecent = useCallback(
    async (selectedFilePath: string) => {
      try {
        if (selectedFilePath === filePathRef.current) {
          console.log('File already open, skipping reload');
          return;
        }
        await loadPdfFromPath(selectedFilePath);
      } catch (error) {
        console.error('Failed to open recent file:', error);
      }
    },
    [loadPdfFromPath, filePathRef]
  );

  // Toggle two-column mode
  const handleToggleTwoColumn = useCallback(() => {
    setViewMode((prev) => (prev === 'two-column' ? 'single' : 'two-column'));
  }, [setViewMode]);

  // Listen for reset all data request from app menu (main window only)
  useTauriEventListener(
    'reset-all-data-requested',
    handleResetAllData,
    [isStandaloneMode, handleResetAllData]
  );

  // Listen for menu events from system menu bar (zoom, view mode, settings)
  useTauriEventListeners(
    [
      { event: 'menu-zoom-in', handler: handleZoomIn },
      { event: 'menu-zoom-out', handler: handleZoomOut },
      { event: 'menu-zoom-reset', handler: handleZoomReset },
      { event: 'menu-toggle-two-column', handler: handleToggleTwoColumn },
      { event: 'menu-toggle-header', handler: handleToggleHeader },
      { event: 'menu-open-settings', handler: handleOpenSettings },
    ],
    [
      handleZoomIn,
      handleZoomOut,
      handleZoomReset,
      handleToggleTwoColumn,
      handleToggleHeader,
      handleOpenSettings,
    ]
  );

  // Listen for open recent file selection (needs payload access)
  useTauriEventListener<string>(
    'menu-open-recent-selected',
    handleOpenRecent,
    [handleOpenRecent]
  );
}
