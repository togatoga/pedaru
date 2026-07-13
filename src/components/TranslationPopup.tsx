"use client";

import { emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ExternalLink, GripHorizontal, Languages, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  explainDirectly,
  getGeminiSettings,
  isGeminiConfigured,
  translateWithGemini,
} from "@/lib/settings";
import type { GeminiSettings, TranslationResponse } from "@/types";
import type { TranslationPopupProps } from "@/types/components";
import { TranslationBody } from "./translation/TranslationBody";
import { useExplanation } from "./translation/useExplanation";

export default function TranslationPopup({
  selection,
  autoExplain = false,
  onClose,
  onOpenSettings,
  viewMode = "single",
  currentPage = 1,
}: TranslationPopupProps) {
  const [translationResponse, setTranslationResponse] =
    useState<TranslationResponse | null>(null);
  const {
    explanationSummary,
    setExplanationSummary,
    explanationPoints,
    setExplanationPoints,
    isExplaining,
    error,
    setError,
    explain,
  } = useExplanation();
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [geminiSettings, setGeminiSettingsState] =
    useState<GeminiSettings | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    popupX: number;
    popupY: number;
  } | null>(null);
  const initializedRef = useRef(false);

  // Calculate initial popup position (only used on first render)
  const calculateInitialPosition = useCallback(() => {
    const { x, y } = selection.position; // x = right edge of selection + 10, y = top of selection
    const popupWidth = 600;
    const margin = 10;
    const headerHeight = 56; // h-14 = 56px
    const minTop = headerHeight + margin; // Ensure popup doesn't overlap with header

    let left: number;

    if (viewMode === "two-column") {
      // In two-column mode, determine if selection is on left or right page
      const selectionPage = selection.pageNumber ?? currentPage;
      // Left page (currentPage) -> show on right side
      // Right page (currentPage + 1) -> show on left side
      const isLeftPage = selectionPage === currentPage;

      if (isLeftPage) {
        // Show on right side of viewport
        left = window.innerWidth - popupWidth - margin;
      } else {
        // Show on left side of viewport
        left = margin;
      }
    } else {
      // Single page mode: show to the right of selection
      left = x;

      // If popup would go off right edge, position from right edge
      if (left + popupWidth > window.innerWidth - margin) {
        left = window.innerWidth - popupWidth - margin;
      }

      // Ensure left is not negative
      if (left < margin) {
        left = margin;
      }
    }

    // Ensure popup is always below the header
    const top = Math.max(y, minTop);

    return { left, top };
  }, [selection.position, selection.pageNumber, viewMode, currentPage]);

  // Position state - initialized once, updated only by dragging
  const [position, setPosition] = useState<{ left: number; top: number }>(() =>
    calculateInitialPosition(),
  );

  // Only update position on first mount, not on subsequent selection changes
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
    }
    // Don't update position when selection changes - keep the popup in place
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Allow dragging from anywhere except interactive elements
      const target = e.target as HTMLElement;
      const isInteractive = target.closest(
        'button, a, input, textarea, [role="button"], .overflow-y-auto',
      );

      if (!isInteractive) {
        e.preventDefault();
        // Capture pointer to continue receiving events outside the window
        target.setPointerCapture(e.pointerId);
        dragStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          popupX: position.left,
          popupY: position.top,
        };
        setIsDragging(true);
      }
    },
    [position],
  );

  useEffect(() => {
    if (!isDragging) return;

    const headerHeight = 56; // h-14 = 56px
    const minTop = headerHeight; // Minimum top position to stay below header

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      // Calculate new position with constraint
      const newTop = dragStartRef.current.popupY + deltaY;

      setPosition({
        left: dragStartRef.current.popupX + deltaX,
        top: Math.max(newTop, minTop), // Prevent moving above header
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging]);

  // Initial translation or explanation - wait for context to be loaded
  useEffect(() => {
    // Don't start while context is still loading
    if (selection.contextLoading) {
      setIsLoading(true);
      return;
    }

    let cancelled = false;

    const doProcess = async () => {
      setIsLoading(true);
      setError(null);
      setTranslationResponse(null);
      setExplanationSummary(null);
      setExplanationPoints(null);

      const configured = await isGeminiConfigured();
      if (!configured) {
        setIsConfigured(false);
        setIsLoading(false);
        return;
      }

      try {
        const settings = await getGeminiSettings();
        setGeminiSettingsState(settings);

        if (autoExplain) {
          // Direct explanation mode - skip translation, get explanation only
          const result = await explainDirectly(
            selection.selectedText,
            selection.contextBefore,
            selection.contextAfter,
            settings.explanationModel,
          );

          if (!cancelled) {
            console.log("Explanation result:", JSON.stringify(result, null, 2));
            // Store summary and points from ExplanationResponse
            setExplanationSummary(result.summary);
            setExplanationPoints(result.points);
            // Set a minimal translationResponse to trigger UI rendering
            setTranslationResponse({ translation: "", points: [] });
          }
        } else {
          // Translation mode
          const result = await translateWithGemini(
            selection.selectedText,
            selection.contextBefore,
            selection.contextAfter,
            settings.model,
          );

          if (!cancelled) {
            console.log("Translation result:", JSON.stringify(result, null, 2));
            setTranslationResponse(result);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    doProcess();

    return () => {
      cancelled = true;
    };
  }, [
    selection,
    autoExplain,
    setError,
    setExplanationSummary,
    setExplanationPoints,
  ]);

  // Handle "解説" button click - get more detailed explanation
  const handleExplain = useCallback(() => {
    if (!translationResponse || isExplaining || !geminiSettings) return;

    explain(
      selection.selectedText,
      selection.contextBefore,
      selection.contextAfter,
      geminiSettings.explanationModel,
    );
  }, [
    translationResponse,
    isExplaining,
    geminiSettings,
    explain,
    selection.selectedText,
    selection.contextBefore,
    selection.contextAfter,
  ]);

  // Note: Auto-trigger explanation is no longer needed
  // In autoExplain mode, we call explainDirectly in the initial useEffect

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Open translation in a new window
  const handleOpenInNewWindow = useCallback(async () => {
    if (!translationResponse) return;

    const origin = window.location.origin;
    const windowLabel = `translation-${Date.now()}`;
    const url = `${origin}/translation?windowLabel=${encodeURIComponent(windowLabel)}`;

    try {
      // Listen for ready signal from the new window before sending data
      const unlisten = await listen<{ windowLabel: string }>(
        "translation-ready",
        async (event) => {
          if (event.payload.windowLabel === windowLabel) {
            unlisten();
            await emitTo(windowLabel, "translation-data", {
              selectedText: selection.selectedText,
              contextBefore: selection.contextBefore,
              contextAfter: selection.contextAfter,
              translationResponse,
              autoExplain,
            });
            // Close the popup
            onClose();
          }
        },
      );

      const webview = new WebviewWindow(windowLabel, {
        url,
        title: "Translation",
        width: 600,
        height: 700,
        resizable: true,
        center: true,
      });

      webview.once("tauri://error", (e) => {
        console.error("Failed to create translation window:", e);
        unlisten();
      });
    } catch (e) {
      console.error("Failed to open translation window:", e);
    }
  }, [
    translationResponse,
    selection.selectedText,
    selection.contextBefore,
    selection.contextAfter,
    autoExplain,
    onClose,
  ]);

  return (
    <div
      ref={popupRef}
      className={`fixed z-50 bg-bg-secondary rounded-lg shadow-2xl border border-bg-tertiary w-[600px] max-h-[700px] overflow-hidden flex flex-col ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        left: position.left,
        top: position.top,
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary bg-bg-tertiary/50">
        <div className="flex items-center gap-2" data-drag-handle>
          <GripHorizontal
            className="w-4 h-4 text-text-tertiary"
            data-drag-handle
          />
          <Languages className="w-4 h-4 text-accent" data-drag-handle />
          <span
            className="text-xs font-medium text-text-primary select-none"
            data-drag-handle
          >
            Translation
          </span>
        </div>
        <div className="flex items-center gap-1">
          {translationResponse && (
            <button
              type="button"
              onClick={handleOpenInNewWindow}
              className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
              title="Open in new window"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <TranslationBody
        variant="popup"
        selectedText={selection.selectedText}
        contextBefore={selection.contextBefore}
        contextAfter={selection.contextAfter}
        translationResponse={translationResponse}
        explanationSummary={explanationSummary}
        explanationPoints={explanationPoints}
        error={error}
        isExplaining={isExplaining}
        geminiSettings={geminiSettings}
        onExplain={handleExplain}
        autoExplain={autoExplain}
        isConfigured={isConfigured}
        isLoading={isLoading}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}
