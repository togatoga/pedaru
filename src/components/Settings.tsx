'use client';

import { X, Monitor, Columns } from 'lucide-react';

export type ViewMode = 'single' | 'two-column';

interface SettingsProps {
  isOpen: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onClose: () => void;
}

export default function Settings({
  isOpen,
  viewMode,
  onViewModeChange,
  onClose,
}: SettingsProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-secondary rounded-xl shadow-2xl w-[400px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bg-tertiary">
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* View Mode */}
          <div>
            <h3 className="text-sm font-medium text-text-primary mb-3">Display Mode</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onViewModeChange('single')}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  viewMode === 'single'
                    ? 'border-accent bg-accent/10'
                    : 'border-bg-tertiary hover:border-bg-hover'
                }`}
              >
                <Monitor className={`w-8 h-8 ${viewMode === 'single' ? 'text-accent' : 'text-text-secondary'}`} />
                <span className={`text-sm font-medium ${viewMode === 'single' ? 'text-accent' : 'text-text-primary'}`}>
                  Single Page
                </span>
              </button>

              <button
                onClick={() => onViewModeChange('two-column')}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  viewMode === 'two-column'
                    ? 'border-accent bg-accent/10'
                    : 'border-bg-tertiary hover:border-bg-hover'
                }`}
              >
                <Columns className={`w-8 h-8 ${viewMode === 'two-column' ? 'text-accent' : 'text-text-secondary'}`} />
                <span className={`text-sm font-medium ${viewMode === 'two-column' ? 'text-accent' : 'text-text-primary'}`}>
                  Two Column
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
