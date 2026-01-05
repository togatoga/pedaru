"use client";

import type { TextSelection, ViewMode } from "@/types";
import ContextMenu from "./ContextMenu";
import Settings from "./Settings";
import TranslationPopup from "./TranslationPopup";

export interface OverlayContainerProps {
  // Translation popup
  selection: TextSelection | null;
  autoExplain: boolean;
  onClearSelection: () => void;
  onOpenSettings: () => void;
  viewMode: ViewMode;
  currentPage: number;
  // Context menu
  contextMenuPosition: { x: number; y: number } | null;
  onContextMenuCopy: () => void;
  onContextMenuTranslate: () => void;
  onContextMenuExplain: () => void;
  onCloseContextMenu: () => void;
  // Settings
  showSettingsModal: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onCloseSettings: () => void;
}

/**
 * Container for overlay components (popups, modals, context menus).
 * Groups all floating UI elements for cleaner page.tsx organization.
 */
export default function OverlayContainer({
  // Translation popup
  selection,
  autoExplain,
  onClearSelection,
  onOpenSettings,
  viewMode,
  currentPage,
  // Context menu
  contextMenuPosition,
  onContextMenuCopy,
  onContextMenuTranslate,
  onContextMenuExplain,
  onCloseContextMenu,
  // Settings
  showSettingsModal,
  onViewModeChange,
  onCloseSettings,
}: OverlayContainerProps) {
  return (
    <>
      {/* Translation popup - don't show when settings modal is open */}
      {selection && !showSettingsModal && (
        <TranslationPopup
          selection={selection}
          autoExplain={autoExplain}
          onClose={onClearSelection}
          onOpenSettings={onOpenSettings}
          viewMode={viewMode}
          currentPage={currentPage}
        />
      )}

      {/* Context menu */}
      {contextMenuPosition && (
        <ContextMenu
          position={contextMenuPosition}
          onCopy={onContextMenuCopy}
          onTranslate={onContextMenuTranslate}
          onExplain={onContextMenuExplain}
          onClose={onCloseContextMenu}
        />
      )}

      {/* Settings modal */}
      <Settings
        isOpen={showSettingsModal}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onClose={onCloseSettings}
      />
    </>
  );
}
