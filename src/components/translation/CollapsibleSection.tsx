"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

// Collapsible section component
export function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-bg-tertiary rounded-lg overflow-hidden mb-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between bg-bg-tertiary/50 hover:bg-bg-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-text-tertiary" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        )}
      </button>
      {isOpen && <div className="px-3 py-2 bg-bg-primary/30">{children}</div>}
    </div>
  );
}
