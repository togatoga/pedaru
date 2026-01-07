'use client';

import { useState, useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
    Minus,
    Square,
    X,
    FileText,
} from 'lucide-react';

interface TitleBarProps {
    onOpenFile: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onPrevPage: () => void;
    onNextPage: () => void;
    onFirstPage: () => void;
    onLastPage: () => void;
    onCloseAllWindows: () => void;
    onToggleTwoColumn: () => void;
    onToggleHeader: () => void;
    onNewTab: () => void;
    onCloseTab: () => void;
    onNextTab: () => void;
    onPrevTab: () => void;
    onNewWindow: () => void;
    onOpenSettings: () => void;
    onSearch: () => void;
    onToggleBookmark: () => void;
}

interface MenuItem {
    label: string;
    action?: () => void;
    shortcut?: string;
    separator?: boolean;
}

interface MenuGroup {
    label: string;
    items: MenuItem[];
}

export default function TitleBar({
    onOpenFile,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onPrevPage,
    onNextPage,
    onFirstPage,
    onLastPage,
    onCloseAllWindows,
    onToggleTwoColumn,
    onToggleHeader,
    onNewTab,
    onCloseTab,
    onNextTab,
    onPrevTab,
    onNewWindow,
    onOpenSettings,
    onSearch,
    onToggleBookmark,
}: TitleBarProps) {
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const menus: MenuGroup[] = [
        {
            label: 'File',
            items: [
                { label: 'Open File...', action: onOpenFile, shortcut: 'Ctrl+O' },
                { label: 'Settings', action: onOpenSettings },
                { label: '-', separator: true },
                { label: 'Exit', action: () => getCurrentWebviewWindow().close() },
            ]
        },
        {
            label: 'Edit',
            items: [
                { label: 'Undo', shortcut: 'Ctrl+Z' },
                { label: 'Redo', shortcut: 'Ctrl+Y' },
                { label: '-', separator: true },
                { label: 'Cut', shortcut: 'Ctrl+X' },
                { label: 'Copy', shortcut: 'Ctrl+C' },
                { label: 'Paste', shortcut: 'Ctrl+V' },
                { label: 'Select All', shortcut: 'Ctrl+A' },
            ]
        },
        {
            label: 'View',
            items: [
                { label: 'Zoom In', action: onZoomIn, shortcut: 'Ctrl+=' },
                { label: 'Zoom Out', action: onZoomOut, shortcut: 'Ctrl+-' },
                { label: 'Reset Zoom', action: onZoomReset, shortcut: 'Ctrl+0' },
                { label: '-', separator: true },
                { label: 'Two-Column Mode', action: onToggleTwoColumn, shortcut: 'Ctrl+\\' },
                { label: 'Hide Header', action: onToggleHeader, shortcut: 'Ctrl+Shift+H' },
            ]
        },
        {
            label: 'Go',
            items: [
                { label: 'Previous Page', action: onPrevPage, shortcut: 'Left' },
                { label: 'Next Page', action: onNextPage, shortcut: 'Right' },
                { label: '-', separator: true },
                { label: 'First Page', action: onFirstPage, shortcut: 'Home' },
                { label: 'Last Page', action: onLastPage, shortcut: 'End' },
            ]
        },
        {
            label: 'Tabs',
            items: [
                { label: 'New Tab', action: onNewTab, shortcut: 'Ctrl+T' },
                { label: 'Close Tab', action: onCloseTab, shortcut: 'Ctrl+W' },
                { label: '-', separator: true },
                { label: 'Previous Tab', action: onPrevTab, shortcut: 'Ctrl+[' },
                { label: 'Next Tab', action: onNextTab, shortcut: 'Ctrl+]' },
            ]
        },
        {
            label: 'Window',
            items: [
                { label: 'New Window', action: onNewWindow, shortcut: 'Ctrl+N' },
                { label: '-', separator: true },
                { label: 'Minimize', action: () => getCurrentWebviewWindow().minimize() },
                { label: 'Maximize', action: () => getCurrentWebviewWindow().toggleMaximize() },
                { label: 'Close', action: () => getCurrentWebviewWindow().close() },
                { label: '-', separator: true },
                { label: 'Close All Windows', action: onCloseAllWindows },
            ]
        },
        {
            label: 'Tools',
            items: [
                { label: 'Search...', action: onSearch, shortcut: 'Ctrl+F' },
                { label: '-', separator: true },
                { label: 'Toggle Bookmark', action: onToggleBookmark, shortcut: 'Ctrl+B' },
            ]
        }
    ];

    return (
        <div className="h-8 bg-bg-secondary flex items-center justify-between select-none titlebar border-b border-bg-tertiary" data-tauri-drag-region>
            <div className="flex items-center h-full px-2" ref={menuRef}>
                {/* App Icon */}
                <div className="mr-3 flex items-center justify-center text-accent">
                    <FileText className="w-4 h-4" />
                </div>

                {/* Menu Items */}
                {menus.map((menu) => (
                    <div key={menu.label} className="relative h-full">
                        <button
                            className={`h-full px-2.5 text-xs text-text-primary hover:bg-bg-hover focus:outline-none flex items-center ${activeMenu === menu.label ? 'bg-bg-hover' : ''}`}
                            onClick={() => setActiveMenu(activeMenu === menu.label ? null : menu.label)}
                            onMouseEnter={() => activeMenu && setActiveMenu(menu.label)}
                        >
                            {menu.label}
                        </button>

                        {activeMenu === menu.label && (
                            <div className="absolute top-full left-0 min-w-[200px] bg-bg-secondary border border-bg-tertiary shadow-xl py-1 z-50 rounded-b-md">
                                {menu.items.map((item, index) => (
                                    item.separator ? (
                                        <div key={index} className="h-px bg-bg-tertiary my-1" />
                                    ) : (
                                        <button
                                            key={index}
                                            className="w-full text-left px-4 py-1.5 text-xs text-text-primary hover:bg-accent hover:text-white flex items-center justify-between group"
                                            onClick={() => {
                                                item.action?.();
                                                setActiveMenu(null);
                                            }}
                                        >
                                            <span>{item.label}</span>
                                            {item.shortcut && <span className="text-text-secondary group-hover:text-white/80 ml-4">{item.shortcut}</span>}
                                        </button>
                                    )
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Window Controls */}
            <div className="flex items-center h-full">
                <button
                    onClick={() => getCurrentWebviewWindow().minimize()}
                    className="h-full w-10 flex items-center justify-center hover:bg-bg-hover text-text-primary transition-colors focus:outline-none"
                    title="Minimize"
                    tabIndex={-1}
                >
                    <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => getCurrentWebviewWindow().toggleMaximize()}
                    className="h-full w-10 flex items-center justify-center hover:bg-bg-hover text-text-primary transition-colors focus:outline-none"
                    title="Maximize"
                    tabIndex={-1}
                >
                    <Square className="w-3 h-3" />
                </button>
                <button
                    onClick={() => getCurrentWebviewWindow().close()}
                    className="h-full w-10 flex items-center justify-center hover:bg-red-500 hover:text-white text-text-primary transition-colors focus:outline-none"
                    title="Close"
                    tabIndex={-1}
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
