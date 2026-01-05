"use client";

import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Cpu,
  GripHorizontal,
  Languages,
  Loader2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  explainDirectly,
  GEMINI_MODELS,
  getGeminiSettings,
} from "@/lib/settings";
import type { GeminiSettings, TranslationResponse } from "@/types";

interface TranslationData {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  translationResponse: TranslationResponse;
  autoExplain: boolean;
}

// Custom components for ReactMarkdown to render ***text*** with yellow highlight
const markdownComponents = {
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <mark className="bg-yellow-500/30 text-yellow-200 font-bold px-0.5 rounded not-italic">
      {children}
    </mark>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
};

// Collapsible section component
function CollapsibleSection({
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
  const [explanationSummary, setExplanationSummary] = useState<string | null>(
    null,
  );
  const [explanationPoints, setExplanationPoints] = useState<string[] | null>(
    null,
  );
  const [isExplaining, setIsExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
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

  // Auto-trigger explanation when autoExplain is true
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, geminiSettings]);

  // Handle "解説" button click
  const handleExplain = useCallback(() => {
    if (!data?.translationResponse || isExplaining || !geminiSettings) return;

    setIsExplaining(true);
    setError(null);

    setTimeout(async () => {
      try {
        const result = await explainDirectly(
          data.selectedText,
          data.contextBefore,
          data.contextAfter,
          geminiSettings.explanationModel,
        );
        setExplanationSummary(result.summary);
        setExplanationPoints(result.points);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsExplaining(false);
      }
    }, 0);
  }, [data, isExplaining, geminiSettings]);

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

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Context (collapsible, for debugging) */}
        <div className="mb-4 border-b border-bg-tertiary pb-2">
          <button
            onClick={() => setShowContext(!showContext)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <span>Context (debug)</span>
            {showContext ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
          {showContext && (
            <div className="px-3 pb-2 space-y-2">
              <div>
                <span className="text-xs text-text-tertiary">Before:</span>
                <p className="text-xs text-text-tertiary font-mono whitespace-pre-wrap max-h-[75px] overflow-y-auto bg-bg-secondary p-2 rounded">
                  {data.contextBefore || "(no context)"}
                </p>
              </div>
              <div>
                <span className="text-xs text-text-tertiary">After:</span>
                <p className="text-xs text-text-tertiary font-mono whitespace-pre-wrap max-h-[75px] overflow-y-auto bg-bg-secondary p-2 rounded">
                  {data.contextAfter || "(no context)"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="space-y-2">
          {error && (
            <div className="flex flex-col items-center py-4 text-center">
              <AlertCircle className="w-6 h-6 text-red-400 mb-2" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Original Text Section */}
          <CollapsibleSection title="原文" icon={Languages} defaultOpen={false}>
            <p className="text-text-primary text-sm leading-relaxed font-mono whitespace-pre-wrap">
              {data.selectedText}
            </p>
          </CollapsibleSection>

          {/* Translation Section */}
          <CollapsibleSection
            title="翻訳"
            icon={MessageSquare}
            defaultOpen={true}
          >
            <p className="text-text-primary text-sm leading-relaxed">
              {data.translationResponse.translation || "(翻訳結果がありません)"}
            </p>
          </CollapsibleSection>

          {/* Points Section */}
          <CollapsibleSection
            title="翻訳のポイント"
            icon={BookOpen}
            defaultOpen={true}
          >
            {data.translationResponse.points &&
            data.translationResponse.points.length > 0 ? (
              <ul className="text-text-primary text-sm list-disc list-inside space-y-2">
                {data.translationResponse.points.map((point, index) => (
                  <li key={index}>
                    <ReactMarkdown components={markdownComponents}>
                      {point}
                    </ReactMarkdown>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-text-tertiary text-sm">
                (ポイントがありません)
              </p>
            )}
          </CollapsibleSection>

          {/* Explanation Section */}
          {(explanationSummary ||
            (explanationPoints && explanationPoints.length > 0)) && (
            <CollapsibleSection title="解説" icon={Sparkles} defaultOpen={true}>
              <div className="space-y-3">
                {/* Summary */}
                {explanationSummary && (
                  <div className="text-text-primary text-sm font-medium bg-accent/10 p-2 rounded border-l-2 border-accent">
                    <ReactMarkdown components={markdownComponents}>
                      {explanationSummary}
                    </ReactMarkdown>
                  </div>
                )}
                {/* Points */}
                {explanationPoints && explanationPoints.length > 0 && (
                  <ul className="text-text-primary text-sm list-disc list-inside space-y-2">
                    {explanationPoints.map((point, index) => (
                      <li key={index}>
                        <ReactMarkdown components={markdownComponents}>
                          {point}
                        </ReactMarkdown>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CollapsibleSection>
          )}
        </div>

        {/* Footer with model info and action buttons */}
        <div className="mt-4 pt-3 border-t border-bg-tertiary flex items-center justify-between gap-2">
          {/* Model indicators */}
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            {geminiSettings && (
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3" />
                <span>
                  翻訳:{" "}
                  {GEMINI_MODELS.find((m) => m.id === geminiSettings.model)
                    ?.name || geminiSettings.model}
                </span>
              </div>
            )}
            {explanationPoints && geminiSettings && (
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                <span>
                  解説:{" "}
                  {GEMINI_MODELS.find(
                    (m) => m.id === geminiSettings.explanationModel,
                  )?.name || geminiSettings.explanationModel}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!explanationPoints && (
            <button
              onClick={handleExplain}
              disabled={isExplaining}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
                isExplaining
                  ? "bg-accent/40 text-accent cursor-wait"
                  : "bg-accent/20 text-accent hover:bg-accent/30"
              }`}
            >
              {isExplaining ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  解説生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  解説
                </>
              )}
            </button>
          )}
        </div>
      </div>
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
