"use client";

import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Cpu,
  Languages,
  Loader2,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { GEMINI_MODELS } from "@/lib/settings";
import type { GeminiSettings, TranslationResponse } from "@/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { markdownComponents } from "./markdownComponents";

interface TranslationBodyProps {
  variant: "popup" | "page";
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  translationResponse: TranslationResponse | null;
  explanationSummary: string | null;
  explanationPoints: string[] | null;
  error: string | null;
  isExplaining: boolean;
  geminiSettings: GeminiSettings | null;
  onExplain: () => void;
  autoExplain?: boolean;
  isConfigured?: boolean;
  isLoading?: boolean;
  onClose?: () => void;
  onOpenSettings?: () => void;
}

export function TranslationBody({
  variant,
  selectedText,
  contextBefore,
  contextAfter,
  translationResponse,
  explanationSummary,
  explanationPoints,
  error,
  isExplaining,
  geminiSettings,
  onExplain,
  autoExplain = false,
  isConfigured = true,
  isLoading = false,
  onClose,
  onOpenSettings,
}: TranslationBodyProps) {
  const [showContext, setShowContext] = useState(false);
  const isPopup = variant === "popup";

  const hasExplanation =
    explanationSummary || (explanationPoints && explanationPoints.length > 0);

  const contextTextClass = `text-xs text-text-tertiary font-mono whitespace-pre-wrap max-h-[75px] overflow-y-auto ${
    isPopup ? "bg-bg-primary" : "bg-bg-secondary"
  } p-2 rounded`;

  // Context (collapsible, for debugging)
  const contextSection = (
    <div
      className={
        isPopup
          ? "border-b border-bg-tertiary"
          : "mb-4 border-b border-bg-tertiary pb-2"
      }
    >
      <button
        type="button"
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
            <p className={contextTextClass}>
              {contextBefore || "(no context)"}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary">After:</span>
            <p className={contextTextClass}>{contextAfter || "(no context)"}</p>
          </div>
        </div>
      )}
    </div>
  );

  const errorContent = error && (
    <div className="flex flex-col items-center py-4 text-center">
      <AlertCircle className="w-6 h-6 text-red-400 mb-2" />
      <p className="text-sm text-red-400">{error}</p>
    </div>
  );

  const explanationSection = (
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
              <li key={`explanation-${index}-${point.slice(0, 20)}`}>
                <ReactMarkdown components={markdownComponents}>
                  {point}
                </ReactMarkdown>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CollapsibleSection>
  );

  const sections = translationResponse && (
    <>
      {/* Original Text Section */}
      <CollapsibleSection title="原文" icon={Languages} defaultOpen={false}>
        <p className="text-text-primary text-sm leading-relaxed font-mono whitespace-pre-wrap">
          {selectedText}
        </p>
      </CollapsibleSection>

      {/* In autoExplain mode with explanation loaded: show only explanation */}
      {autoExplain && hasExplanation ? (
        explanationSection
      ) : (
        <>
          {/* Translation Section */}
          <CollapsibleSection
            title="翻訳"
            icon={MessageSquare}
            defaultOpen={true}
          >
            <p className="text-text-primary text-sm leading-relaxed">
              {translationResponse.translation || "(翻訳結果がありません)"}
            </p>
          </CollapsibleSection>

          {/* Points Section */}
          <CollapsibleSection
            title="翻訳のポイント"
            icon={BookOpen}
            defaultOpen={true}
          >
            {translationResponse.points &&
            translationResponse.points.length > 0 ? (
              <ul className="text-text-primary text-sm list-disc list-inside space-y-2">
                {translationResponse.points.map((point, index) => (
                  <li key={`point-${index}-${point.slice(0, 20)}`}>
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

          {/* Explanation Section (shown after clicking 解説 button in translation mode) */}
          {hasExplanation && explanationSection}
        </>
      )}
    </>
  );

  const footer = (
    <div
      className={
        isPopup
          ? "px-3 py-2 border-t border-bg-tertiary bg-bg-tertiary/30 flex items-center justify-between gap-2"
          : "mt-4 pt-3 border-t border-bg-tertiary flex items-center justify-between gap-2"
      }
    >
      {/* Model indicators */}
      <div className="flex items-center gap-3 text-xs text-text-tertiary">
        {/* Show translation model only when not in autoExplain mode */}
        {!autoExplain && geminiSettings && (
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3" />
            <span>
              翻訳:{" "}
              {GEMINI_MODELS.find((m) => m.id === geminiSettings.model)?.name ||
                geminiSettings.model}
            </span>
          </div>
        )}
        {/* Show explanation model when explanation is loaded or in autoExplain mode */}
        {(explanationPoints || autoExplain) && geminiSettings && (
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

      {/* Action buttons - hide in autoExplain mode or after explanation is loaded */}
      {!autoExplain && !explanationPoints && (
        <button
          type="button"
          onClick={onExplain}
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
  );

  if (isPopup) {
    return (
      <>
        {contextSection}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {!isConfigured && (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <AlertCircle className="w-8 h-8 text-yellow-500 mb-2" />
              <p className="text-sm text-text-primary mb-2">
                API Key Not Configured
              </p>
              <p className="text-xs text-text-tertiary mb-3">
                Please set your Gemini API key in Settings to use translation.
              </p>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    onOpenSettings();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent/90 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  Open Settings
                </button>
              )}
            </div>
          )}

          {isConfigured && isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="ml-2 text-sm text-text-secondary">
                Translating...
              </span>
            </div>
          )}

          {isConfigured && errorContent}

          {isConfigured && translationResponse && (
            <div className="space-y-2">{sections}</div>
          )}
        </div>

        {/* Footer with model info and action buttons */}
        {isConfigured && translationResponse && !isLoading && footer}
      </>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {contextSection}

      {/* Content */}
      <div className="space-y-2">
        {errorContent}
        {sections}
      </div>

      {/* Footer with model info and action buttons */}
      {footer}
    </div>
  );
}
