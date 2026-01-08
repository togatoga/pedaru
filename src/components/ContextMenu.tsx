"use client";

import { Copy, Languages, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ContextMenuProps } from "@/types/components";

export default function ContextMenu({
  position,
  onCopy,
  onTranslate,
  onExplain,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    // Delay adding listener to avoid immediate close from the right-click event
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Calculate position to keep menu within viewport
  const getAdjustedPosition = () => {
    const menuWidth = 160;
    const menuHeight = 120;
    const margin = 10;
    const headerHeight = 56; // h-14 = 56px
    const minTop = headerHeight + margin;

    let left = position.x;
    let top = position.y;

    // Adjust horizontal position
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    // Adjust vertical position
    if (top + menuHeight > window.innerHeight - margin) {
      top = position.y - menuHeight;
    }
    // Ensure menu doesn't overlap with header
    if (top < minTop) {
      top = minTop;
    }

    return { left, top };
  };

  const adjustedPosition = getAdjustedPosition();

  const menuItems = [
    { label: "Copy", icon: Copy, onClick: onCopy, shortcut: "Cmd+C" },
    { label: "翻訳", icon: Languages, onClick: onTranslate, shortcut: "Cmd+J" },
    { label: "解説", icon: Sparkles, onClick: onExplain, shortcut: "Cmd+E" },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-bg-secondary rounded-lg shadow-2xl border border-bg-tertiary py-1 min-w-[160px]"
      style={{
        left: adjustedPosition.left,
        top: adjustedPosition.top,
      }}
    >
      {menuItems.map((item, _index) => (
        <button
          type="button"
          key={item.label}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className="w-full px-3 py-2 flex items-center justify-between gap-3 text-sm text-text-primary hover:bg-bg-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <item.icon className="w-4 h-4 text-text-secondary" />
            <span>{item.label}</span>
          </div>
          <span className="text-xs text-text-tertiary">{item.shortcut}</span>
        </button>
      ))}
    </div>
  );
}
