'use client';

import { ViewMode } from '@/components/Settings';

interface WindowEntry {
  page: number;
  label: string;
  chapter?: string;
  zoom: number;
  viewMode: ViewMode;
}

interface WindowSidebarProps {
  windows: WindowEntry[];
  currentPage: number;
  onFocus: (label: string) => Promise<void> | void;
  onClose: (label: string) => void;
  onMoveToTab: (label: string, page: number) => void;
}

export default function WindowSidebar({ windows, currentPage, onFocus, onClose, onMoveToTab }: WindowSidebarProps) {
  return (
    <aside className="w-80 bg-bg-secondary border-r border-bg-tertiary flex flex-col flex-shrink-0 overflow-hidden">
      <div className="p-4 border-b border-bg-tertiary flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Windows</h2>
        <span className="text-xs text-text-secondary">{windows.length}</span>
      </div>

      <ul className="flex-1 overflow-y-auto py-2">
        {windows.map((w) => (
          <li
            key={w.label}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('application/x-pedaru-window', JSON.stringify({ label: w.label, page: w.page }));
            }}
            className="px-3 py-2 hover:bg-bg-tertiary transition-colors cursor-grab active:cursor-grabbing"
            onClick={async () => {
              try {
                await onFocus(w.label);
              } catch (e) {
                console.warn('Failed to focus window', w.label, e);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm ${w.page === currentPage ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                Page {w.page}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="text-[11px] text-text-secondary hover:text-text-primary px-2 py-1 rounded bg-bg-tertiary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToTab(w.label, w.page);
                  }}
                  aria-label="Move to tab"
                  title="Move to tab"
                >
                  Tab
                </button>
                <button
                  className="text-xs text-red-500 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(w.label);
                  }}
                  aria-label="Close window"
                  title="Close window"
                >
                  ×
                </button>
              </div>
            </div>
            {w.chapter && (
              <div className="text-xs text-accent mt-1 truncate" title={w.chapter}>
                {w.chapter}
              </div>
            )}
            <div className="text-xs text-text-tertiary mt-1 flex items-center gap-2">
              <span>{Math.round(w.zoom * 100)}%</span>
              <span>{w.viewMode === 'two-column' ? '2col' : '1col'}</span>
            </div>
          </li>
        ))}
        {windows.length === 0 && (
          <li className="px-3 py-2 text-text-secondary text-sm">No open windows</li>
        )}
      </ul>
    </aside>
  );
}
