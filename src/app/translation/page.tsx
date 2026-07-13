"use client";

import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { GripHorizontal, Languages, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TranslationBody } from "@/components/translation/TranslationBody";
import { useExplanation } from "@/components/translation/useExplanation";
import { getGeminiSettings } from "@/lib/settings";
import type { GeminiSettings, TranslationResponse } from "@/types";

interface TranslationData {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  translationResponse: TranslationResponse;
  autoExplain: boolean;
}

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="flex items-center gap-2 text-text-secondary">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

// Inner component that uses useSearchParams
function TranslationContent() {
  const searchParams = useSearchParams();
  const windowLabel = searchParams.get("windowLabel");

  const [data, setData] = useState<TranslationData | null>(null);
  const {
    explanationSummary,
    explanationPoints,
    isExplaining,
    error,
    explain,
  } = useExplanation();
  const [geminiSettings, setGeminiSettingsState] =
    useState<GeminiSettings | null>(null);

  // Listen for translation data from main window
  useEffect(() => {
    if (!windowLabel) return;

    let unlisten: (() => void) | null = null;

    const setup = async () => {
      // Load Gemini settings
      try {
        const settings = await getGeminiSettings();
        setGeminiSettingsState(settings);
      } catch (e) {
        console.error("Failed to load Gemini settings:", e);
      }

      // Listen for translation data
      unlisten = await listen<TranslationData>("translation-data", (event) => {
        setData(event.payload);
        // Set window title
        const win = getCurrentWebviewWindow();
        const preview = event.payload.selectedText.slice(0, 30);
        win.setTitle(
          `Translation: ${preview}${event.payload.selectedText.length > 30 ? "..." : ""}`,
        );
      });

      // Notify parent that we're ready to receive data
      await emit("translation-ready", { windowLabel });
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [windowLabel]);

  // Handle "解説" button click
  const handleExplain = useCallback(() => {
    if (!data?.translationResponse || isExplaining || !geminiSettings) return;

    explain(
      data.selectedText,
      data.contextBefore,
      data.contextAfter,
      geminiSettings.explanationModel,
    );
  }, [data, isExplaining, geminiSettings, explain]);

  // Auto-trigger explanation when autoExplain is true
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleExplain is stable via useCallback
  useEffect(() => {
    if (
      data?.autoExplain &&
      data.translationResponse &&
      !explanationPoints &&
      !isExplaining &&
      geminiSettings
    ) {
      handleExplain();
    }
  }, [data, geminiSettings, explanationPoints, isExplaining]);

  if (!data) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Waiting for translation data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      {/* Draggable Header */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-4 py-3 border-b border-bg-tertiary bg-bg-secondary cursor-grab active:cursor-grabbing select-none"
      >
        <GripHorizontal className="w-4 h-4 text-text-tertiary pointer-events-none" />
        <Languages className="w-4 h-4 text-accent pointer-events-none" />
        <span className="text-sm font-medium text-text-primary pointer-events-none">
          Translation
        </span>
      </div>

      <TranslationBody
        variant="page"
        selectedText={data.selectedText}
        contextBefore={data.contextBefore}
        contextAfter={data.contextAfter}
        translationResponse={data.translationResponse}
        explanationSummary={explanationSummary}
        explanationPoints={explanationPoints}
        error={error}
        isExplaining={isExplaining}
        geminiSettings={geminiSettings}
        onExplain={handleExplain}
      />
    </div>
  );
}

// Main page component with Suspense boundary
export default function TranslationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <TranslationContent />
    </Suspense>
  );
}
