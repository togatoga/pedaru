'use client';

import type { HistoryEntry } from '@/types';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { formatDateTime } from '@/lib/formatUtils';
import type { HistorySidebarProps } from '@/types/components';

export default function HistorySidebar({ history, index, currentPage, onSelect, onClear }: HistorySidebarProps) {
  const activeItemRef = useAutoScroll<HTMLLIElement>([currentPage, index]);
  const items = [...history].reverse(); // newest first

  return (
    <aside className={`w-64 shrink-0 border-r border-bg-tertiary bg-bg-secondary overflow-auto`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary">
        <span className="text-sm font-medium text-text-primary">History</span>
        {onClear && (
          <button onClick={onClear} className="text-xs text-text-secondary hover:text-text-primary">Clear</button>
        )}
      </div>
      <ul className="p-2 space-y-1">
        {items.map((entry, i) => {
          const originalIndex = history.length - 1 - i;
          return (
            <li
              key={`${originalIndex}-${entry.page}-${entry.timestamp}`}
              ref={entry.page === currentPage ? activeItemRef : null}
            >
            <button
              className={`w-full text-left px-2 py-1 rounded transition-colors ${
                entry.page === currentPage ? 'bg-bg-tertiary text-text-primary' : 'hover:bg-bg-tertiary text-text-secondary'
              } ${originalIndex === index ? 'ring-1 ring-accent' : ''}`}
              onClick={() => onSelect(entry.page)}
            >
              <div className="flex justify-between items-center">
                <span>Page {entry.page}</span>
                <span className="text-[11px] text-text-tertiary ml-2">{formatDateTime(parseInt(entry.timestamp, 10) * 1000)}</span>
              </div>
            </button>
            </li>
          );
        })}
        {history.length === 0 && (
          <li className="px-2 py-1 text-text-secondary text-sm">No history yet</li>
        )}
      </ul>
    </aside>
  );
}
