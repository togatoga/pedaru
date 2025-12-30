'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// TextItem type definition (not exported from pdfjs-dist main module)
interface TextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

interface ProcessedTextItem extends TextItem {
  tx: number[];
  fontSize: number;
  angle: number;
  targetWidth: number;
}

interface CustomTextLayerProps {
  page: pdfjsLib.PDFPageProxy;
  scale: number;
  pageNumber: number;
  searchQuery?: string;
  focusedMatchIndex?: number; // Which match on this page is currently focused (0-indexed)
}

export default function CustomTextLayer({ page, scale, pageNumber, searchQuery, focusedMatchIndex }: CustomTextLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textSpanRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const [processedItems, setProcessedItems] = useState<ProcessedTextItem[]>([]);
  const [viewport, setViewport] = useState<pdfjsLib.PageViewport | null>(null);
  const [scaleXValues, setScaleXValues] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    let cancelled = false;

    const loadTextContent = async () => {
      try {
        // Check if page is still valid before accessing
        if (!page || page._transport?.destroyed) {
          return;
        }

        const vp = page.getViewport({ scale });
        if (cancelled) return;
        setViewport(vp);

        const textContent = await page.getTextContent();
        if (cancelled) return;

        const items = textContent.items.filter(
          (item): item is TextItem => 'str' in item && !!(item as TextItem).str
        ) as TextItem[];

        // Pre-process items with transform calculations
        const processed = items.map((item) => {
          const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
          const fontSize = Math.hypot(tx[0], tx[1]);
          const angle = Math.atan2(tx[1], tx[0]);
          const targetWidth = item.width * vp.scale;

          return {
            ...item,
            tx,
            fontSize,
            angle,
            targetWidth,
          };
        });

        setProcessedItems(processed);
        // Reset scale values when content changes
        setScaleXValues(new Map());
      } catch (error) {
        // Ignore errors if component was unmounted or page was destroyed
        if (!cancelled) {
          console.warn('Failed to load text content:', error);
        }
      }
    };

    loadTextContent();

    return () => {
      cancelled = true;
    };
  }, [page, scale]);

  // Calculate --scale-x values after render
  const calculateScaleX = useCallback(() => {
    if (processedItems.length === 0) return;

    const newScaleXValues = new Map<number, number>();

    processedItems.forEach((item, index) => {
      const span = textSpanRefs.current.get(index);
      if (span && item.targetWidth > 0) {
        // Get the actual rendered width of the text
        const actualWidth = span.getBoundingClientRect().width;
        // Get current scaleX to account for it in measurement
        const currentScaleX = scaleXValues.get(index) || 1;
        // Calculate the unscaled width
        const unscaledWidth = actualWidth / currentScaleX;

        if (unscaledWidth > 0) {
          const scaleX = item.targetWidth / unscaledWidth;
          // Only update if significantly different (avoid infinite loops)
          const currentValue = scaleXValues.get(index);
          if (currentValue === undefined || Math.abs(scaleX - currentValue) > 0.001) {
            newScaleXValues.set(index, scaleX);
          }
        }
      }
    });

    if (newScaleXValues.size > 0) {
      setScaleXValues((prev) => {
        const merged = new Map(prev);
        newScaleXValues.forEach((value, key) => merged.set(key, value));
        return merged;
      });
    }
  }, [processedItems, scaleXValues]);

  // Run scale calculation after initial render and font loading
  useEffect(() => {
    if (processedItems.length === 0) return;

    // Initial calculation
    const timeoutId = setTimeout(calculateScaleX, 0);

    // Recalculate after fonts are loaded
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setTimeout(calculateScaleX, 0);
      });
    }

    return () => clearTimeout(timeoutId);
  }, [processedItems, calculateScaleX]);

  const setSpanRef = useCallback((index: number, el: HTMLSpanElement | null) => {
    if (el) {
      textSpanRefs.current.set(index, el);
    } else {
      textSpanRefs.current.delete(index);
    }
  }, []);

  if (!viewport) return null;

  return (
    <div
      ref={containerRef}
      className="custom-text-layer"
      data-page-number={pageNumber}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        overflow: 'hidden',
        lineHeight: 1.0,
        pointerEvents: 'auto',
      }}
    >
      {(() => {
        // Track global match index across all text items on this page
        let globalMatchIndex = 0;

        return processedItems.map((item, index) => {
          const { tx, fontSize, angle, targetWidth } = item;
          const scaleX = scaleXValues.get(index) || 1;

          // Highlight search matches if searchQuery is provided
          let content: React.ReactNode = item.str;
          if (searchQuery) {
            const lowerText = item.str.toLowerCase();
            const lowerQuery = searchQuery.toLowerCase();
            if (lowerText.includes(lowerQuery)) {
              const parts: React.ReactNode[] = [];
              let lastIndex = 0;
              let matchIndex = lowerText.indexOf(lowerQuery);
              let partKey = 0;

              while (matchIndex !== -1) {
                if (matchIndex > lastIndex) {
                  parts.push(
                    <span key={partKey++}>{item.str.slice(lastIndex, matchIndex)}</span>
                  );
                }

                // Check if this match is the focused one
                const isFocused = focusedMatchIndex !== undefined && globalMatchIndex === focusedMatchIndex;
                globalMatchIndex++;

                parts.push(
                  <mark
                    key={partKey++}
                    style={isFocused ? {
                      background: 'rgba(255, 100, 100, 0.7)',
                      color: 'red',
                      fontWeight: 'bold',
                    } : {
                      background: 'rgba(255, 255, 0, 0.4)',
                    }}
                  >
                    {item.str.slice(matchIndex, matchIndex + searchQuery.length)}
                  </mark>
                );
                lastIndex = matchIndex + searchQuery.length;
                matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
              }

              if (lastIndex < item.str.length) {
                parts.push(<span key={partKey++}>{item.str.slice(lastIndex)}</span>);
              }
              content = parts;
            }
          }

        // Build transform string with scaleX and rotation
        const transforms: string[] = [`scaleX(${scaleX})`];
        if (angle !== 0) {
          transforms.push(`rotate(${angle}rad)`);
        }

        const style: React.CSSProperties = {
          position: 'absolute',
          left: `${tx[4]}px`,
          top: `${tx[5] - fontSize}px`,
          fontSize: `${fontSize}px`,
          fontFamily: item.fontName || 'sans-serif',
          color: 'transparent',
          whiteSpace: 'pre',
          transformOrigin: '0% 0%',
          transform: transforms.join(' '),
        };

          return (
            <span
              key={index}
              ref={(el) => setSpanRef(index, el)}
              style={style}
              data-target-width={targetWidth}
              data-text-index={index}
            >
              {content}
            </span>
          );
        });
      })()}
    </div>
  );
}
