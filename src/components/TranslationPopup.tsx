'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, Languages, AlertCircle, Settings, GripHorizontal, ChevronDown, ChevronUp, Sparkles, BookOpen, MessageSquare, Cpu, ExternalLink } from 'lucide-react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import ReactMarkdown from 'react-markdown';
import type { TextSelection, GeminiSettings, TranslationResponse, ViewMode } from '@/types';
import { translateWithGemini, explainDirectly, isGeminiConfigured, getGeminiSettings, GEMINI_MODELS } from '@/lib/settings';
import type { TranslationPopupProps } from '@/types/components';

// Custom components for ReactMarkdown to render ***text*** with yellow highlight
const markdownComponents = {
  // ***text*** renders as <strong><em>text</em></strong>
  // We style strong > em with yellow highlight
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold">
      {children}
    </strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <mark className="bg-yellow-500/30 text-yellow-200 font-bold px-0.5 rounded not-italic">
      {children}
    </mark>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
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
      {isOpen && (
        <div className="px-3 py-2 bg-bg-primary/30">
          {children}
        </div>
      )}
    </div>
  );
}

export default function TranslationPopup({
  selection,
  autoExplain = false,
  onClose,
  onOpenSettings,
  viewMode = 'single',
  currentPage = 1,
}: TranslationPopupProps) {
  const [translationResponse, setTranslationResponse] = useState<TranslationResponse | null>(null);
  const [explanationSummary, setExplanationSummary] = useState<string | null>(null);
  const [explanationPoints, setExplanationPoints] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExplaining, setIsExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [geminiSettings, setGeminiSettingsState] = useState<GeminiSettings | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; popupX: number; popupY: number } | null>(null);
  const initializedRef = useRef(false);

  // Calculate initial popup position (only used on first render)
  const calculateInitialPosition = useCallback(() => {
    const { x, y } = selection.position; // x = right edge of selection + 10, y = top of selection
    const popupWidth = 600;
    const margin = 10;
    const headerHeight = 56; // h-14 = 56px
    const minTop = headerHeight + margin; // Ensure popup doesn't overlap with header

    let left: number;

    if (viewMode === 'two-column') {
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
  const [position, setPosition] = useState<{ left: number; top: number }>(() => calculateInitialPosition());

  // Only update position on first mount, not on subsequent selection changes
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
    }
    // Don't update position when selection changes - keep the popup in place
  }, [selection]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Allow dragging from anywhere except interactive elements
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, a, input, textarea, [role="button"], .overflow-y-auto');

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
  }, [position]);

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

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
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
            selection.context,
            settings.explanationModel
          );

          if (!cancelled) {
            console.log('Explanation result:', JSON.stringify(result, null, 2));
            // Store summary and points from ExplanationResponse
            setExplanationSummary(result.summary);
            setExplanationPoints(result.points);
            // Set a minimal translationResponse to trigger UI rendering
            setTranslationResponse({ translation: '', points: [] });
          }
        } else {
          // Translation mode
          const result = await translateWithGemini(
            selection.selectedText,
            selection.context,
            settings.model
          );

          if (!cancelled) {
            console.log('Translation result:', JSON.stringify(result, null, 2));
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
  }, [selection, autoExplain]);

  // Handle "解説" button click - get more detailed explanation
  const handleExplain = useCallback(() => {
    if (!translationResponse || isExplaining || !geminiSettings) return;

    setIsExplaining(true);
    setError(null);

    // Use setTimeout to allow React to re-render before the blocking API call
    setTimeout(async () => {
      try {
        const result = await explainDirectly(
          selection.selectedText,
          selection.context,
          geminiSettings.explanationModel
        );

        // Update the explanation summary and points, keep the original translation
        setExplanationSummary(result.summary);
        setExplanationPoints(result.points);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsExplaining(false);
      }
    }, 0);
  }, [translationResponse, isExplaining, geminiSettings, selection.selectedText, selection.context]);

  // Note: Auto-trigger explanation is no longer needed
  // In autoExplain mode, we call explainDirectly in the initial useEffect

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Open translation in a new window
  const handleOpenInNewWindow = useCallback(async () => {
    if (!translationResponse) return;

    const origin = window.location.origin;
    const windowLabel = `translation-${Date.now()}`;
    const url = `${origin}/translation?windowLabel=${encodeURIComponent(windowLabel)}`;

    try {
      // Listen for ready signal from the new window before sending data
      const unlisten = await listen<{ windowLabel: string }>('translation-ready', async (event) => {
        if (event.payload.windowLabel === windowLabel) {
          unlisten();
          await emitTo(windowLabel, 'translation-data', {
            selectedText: selection.selectedText,
            context: selection.context,
            translationResponse,
            autoExplain,
          });
          // Close the popup
          onClose();
        }
      });

      const webview = new WebviewWindow(windowLabel, {
        url,
        title: 'Translation',
        width: 600,
        height: 700,
        resizable: true,
        center: true,
      });

      webview.once('tauri://error', (e) => {
        console.error('Failed to create translation window:', e);
        unlisten();
      });
    } catch (e) {
      console.error('Failed to open translation window:', e);
    }
  }, [translationResponse, selection.selectedText, selection.context, autoExplain, onClose]);

  return (
    <div
      ref={popupRef}
      className={`fixed z-50 bg-bg-secondary rounded-lg shadow-2xl border border-bg-tertiary w-[600px] max-h-[700px] overflow-hidden flex flex-col ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        left: position.left,
        top: position.top,
      }}
      onPointerDown={handlePointerDown}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-bg-tertiary bg-bg-tertiary/50"
      >
        <div className="flex items-center gap-2" data-drag-handle>
          <GripHorizontal className="w-4 h-4 text-text-tertiary" data-drag-handle />
          <Languages className="w-4 h-4 text-accent" data-drag-handle />
          <span className="text-xs font-medium text-text-primary select-none" data-drag-handle>
            Translation
          </span>
        </div>
        <div className="flex items-center gap-1">
          {translationResponse && (
            <button
              onClick={handleOpenInNewWindow}
              className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
              title="Open in new window"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context (collapsible, for debugging) */}
      <div className="border-b border-bg-tertiary">
        <button
          onClick={() => setShowContext(!showContext)}
          className="w-full px-3 py-1.5 flex items-center justify-between text-xs text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <span>Context (debug)</span>
          {showContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showContext && (
          <div className="px-3 pb-2">
            <p className="text-xs text-text-tertiary font-mono whitespace-pre-wrap max-h-[150px] overflow-y-auto bg-bg-primary p-2 rounded">
              {selection.context || '(no context)'}
            </p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!isConfigured && (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <AlertCircle className="w-8 h-8 text-yellow-500 mb-2" />
            <p className="text-sm text-text-primary mb-2">API Key Not Configured</p>
            <p className="text-xs text-text-tertiary mb-3">
              Please set your Gemini API key in Settings to use translation.
            </p>
            {onOpenSettings && (
              <button
                onClick={() => {
                  onClose();
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
            <span className="ml-2 text-sm text-text-secondary">Translating...</span>
          </div>
        )}

        {isConfigured && error && (
          <div className="flex flex-col items-center py-4 text-center">
            <AlertCircle className="w-6 h-6 text-red-400 mb-2" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {isConfigured && translationResponse && (
          <div className="space-y-2">
            {/* Original Text Section */}
            <CollapsibleSection
              title="原文"
              icon={Languages}
              defaultOpen={false}
            >
              <p className="text-text-primary text-sm leading-relaxed font-mono whitespace-pre-wrap">
                {selection.selectedText}
              </p>
            </CollapsibleSection>

            {/* In autoExplain mode with explanation loaded: show only explanation */}
            {autoExplain && (explanationSummary || (explanationPoints && explanationPoints.length > 0)) ? (
              <CollapsibleSection
                title="解説"
                icon={Sparkles}
                defaultOpen={true}
              >
                <div className="space-y-3">
                  {/* Summary */}
                  {explanationSummary && (
                    <div className="text-text-primary text-sm font-medium bg-accent/10 p-2 rounded border-l-2 border-accent">
                      <ReactMarkdown components={markdownComponents}>{explanationSummary}</ReactMarkdown>
                    </div>
                  )}
                  {/* Points */}
                  {explanationPoints && explanationPoints.length > 0 && (
                    <ul className="text-text-primary text-sm list-disc list-inside space-y-2">
                      {explanationPoints.map((point, index) => (
                        <li key={index}>
                          <ReactMarkdown components={markdownComponents}>{point}</ReactMarkdown>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CollapsibleSection>
            ) : (
              <>
                {/* Translation Section */}
                <CollapsibleSection
                  title="翻訳"
                  icon={MessageSquare}
                  defaultOpen={true}
                >
                  <p className="text-text-primary text-sm leading-relaxed">
                    {translationResponse.translation || '(翻訳結果がありません)'}
                  </p>
                </CollapsibleSection>

                {/* Points Section */}
                <CollapsibleSection
                  title="翻訳のポイント"
                  icon={BookOpen}
                  defaultOpen={true}
                >
                  {translationResponse.points && translationResponse.points.length > 0 ? (
                    <ul className="text-text-primary text-sm list-disc list-inside space-y-2">
                      {translationResponse.points.map((point, index) => (
                        <li key={index}>
                          <ReactMarkdown components={markdownComponents}>{point}</ReactMarkdown>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-text-tertiary text-sm">(ポイントがありません)</p>
                  )}
                </CollapsibleSection>

                {/* Explanation Section (shown after clicking 解説 button in translation mode) */}
                {(explanationSummary || (explanationPoints && explanationPoints.length > 0)) && (
                  <CollapsibleSection
                    title="解説"
                    icon={Sparkles}
                    defaultOpen={true}
                  >
                    <div className="space-y-3">
                      {/* Summary */}
                      {explanationSummary && (
                        <div className="text-text-primary text-sm font-medium bg-accent/10 p-2 rounded border-l-2 border-accent">
                          <ReactMarkdown components={markdownComponents}>{explanationSummary}</ReactMarkdown>
                        </div>
                      )}
                      {/* Points */}
                      {explanationPoints && explanationPoints.length > 0 && (
                        <ul className="text-text-primary text-sm list-disc list-inside space-y-2">
                          {explanationPoints.map((point, index) => (
                            <li key={index}>
                              <ReactMarkdown components={markdownComponents}>{point}</ReactMarkdown>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CollapsibleSection>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer with model info and action buttons */}
      {isConfigured && translationResponse && !isLoading && (
        <div className="px-3 py-2 border-t border-bg-tertiary bg-bg-tertiary/30 flex items-center justify-between gap-2">
          {/* Model indicators */}
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            {/* Show translation model only when not in autoExplain mode */}
            {!autoExplain && geminiSettings && (
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3" />
                <span>翻訳: {GEMINI_MODELS.find(m => m.id === geminiSettings.model)?.name || geminiSettings.model}</span>
              </div>
            )}
            {/* Show explanation model when explanation is loaded or in autoExplain mode */}
            {(explanationPoints || autoExplain) && geminiSettings && (
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                <span>解説: {GEMINI_MODELS.find(m => m.id === geminiSettings.explanationModel)?.name || geminiSettings.explanationModel}</span>
              </div>
            )}
          </div>

          {/* Action buttons - hide in autoExplain mode or after explanation is loaded */}
          {!autoExplain && !explanationPoints && (
            <button
              onClick={handleExplain}
              disabled={isExplaining}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
                isExplaining
                  ? 'bg-accent/40 text-accent cursor-wait'
                  : 'bg-accent/20 text-accent hover:bg-accent/30'
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
      )}
    </div>
  );
}
