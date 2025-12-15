'use client';

import { useEffect, useRef, useState } from 'react';
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

interface CustomTextLayerProps {
  page: pdfjsLib.PDFPageProxy;
  scale: number;
  searchQuery?: string;
}

export default function CustomTextLayer({ page, scale, searchQuery }: CustomTextLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [viewport, setViewport] = useState<pdfjsLib.PageViewport | null>(null);

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
        setTextItems(items);
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

  if (!viewport) return null;

  return (
    <div
      ref={containerRef}
      className="custom-text-layer"
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
      {textItems.map((item, index) => {
        // Use PDF.js transform utility to calculate exact position
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontSize = Math.hypot(tx[0], tx[1]);
        const angle = Math.atan2(tx[1], tx[0]);

        // Calculate the width in viewport coordinates
        const width = item.width * viewport.scale;

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
              parts.push(
                <mark key={partKey++} style={{ background: 'rgba(255, 255, 0, 0.4)' }}>
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

        const style: React.CSSProperties = {
          position: 'absolute',
          left: `${tx[4]}px`,
          top: `${tx[5] - fontSize}px`,
          fontSize: `${fontSize}px`,
          fontFamily: item.fontName || 'sans-serif',
          color: 'transparent',
          whiteSpace: 'pre',
          transformOrigin: '0% 0%',
          width: 'auto',
          minWidth: `${width}px`,
          maxWidth: `${width}px`,
        };

        // Build transform string with rotation
        const transforms: string[] = [];
        if (angle !== 0) {
          transforms.push(`rotate(${angle}rad)`);
        }

        if (transforms.length > 0) {
          style.transform = transforms.join(' ');
        }

        return (
          <span key={index} style={style}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
