"use client";

import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Redo2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FooterSliderProps } from "@/types/components";

export function FooterSlider({
  currentPage,
  totalPages,
  tocBreadcrumb,
  canGoBack,
  canGoForward,
  onPageChange,
  onPagePreview,
  onSlideStart,
  onSlideEnd,
  onFirstPage,
  onPrevPage,
  onNextPage,
  onLastPage,
  onGoBack,
  onGoForward,
}: FooterSliderProps) {
  const [isSliding, setIsSliding] = useState(false);
  const [sliderPage, setSliderPage] = useState(currentPage);
  const [tooltipPosition, setTooltipPosition] = useState(0);
  const [inputValue, setInputValue] = useState(currentPage.toString());
  const sliderRef = useRef<HTMLInputElement>(null);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  // Sync slider page with current page when not sliding
  useEffect(() => {
    if (!isSliding) {
      setSliderPage(currentPage);
    }
  }, [currentPage, isSliding]);

  // Sync input value with current page
  useEffect(() => {
    setInputValue(currentPage.toString());
  }, [currentPage]);

  // Update tooltip position based on slider value
  const updateTooltipPosition = useCallback(
    (page: number) => {
      if (sliderContainerRef.current) {
        const container = sliderContainerRef.current;
        const percentage = (page - 1) / Math.max(totalPages - 1, 1);
        const thumbWidth = 14;
        const availableWidth = container.offsetWidth - thumbWidth;
        setTooltipPosition(percentage * availableWidth + thumbWidth / 2);
      }
    },
    [totalPages],
  );

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const page = Number.parseInt(e.target.value, 10);
      setSliderPage(page);
      updateTooltipPosition(page);
      onPagePreview(page);
    },
    [onPagePreview, updateTooltipPosition],
  );

  const handleSliderMouseDown = useCallback(() => {
    setIsSliding(true);
    updateTooltipPosition(sliderPage);
    onSlideStart?.();
  }, [onSlideStart, sliderPage, updateTooltipPosition]);

  const handleSliderMouseUp = useCallback(() => {
    setIsSliding(false);
    onPageChange(sliderPage);
    onSlideEnd?.();
  }, [sliderPage, onPageChange, onSlideEnd]);

  const handleTouchStart = useCallback(() => {
    setIsSliding(true);
    updateTooltipPosition(sliderPage);
    onSlideStart?.();
  }, [onSlideStart, sliderPage, updateTooltipPosition]);

  const handleTouchEnd = useCallback(() => {
    setIsSliding(false);
    onPageChange(sliderPage);
    onSlideEnd?.();
  }, [sliderPage, onPageChange, onSlideEnd]);

  // Format breadcrumb: always show the last item fully, truncate earlier items if needed
  const formatBreadcrumb = useCallback((breadcrumb: string[]): string => {
    if (breadcrumb.length === 0) return "";
    if (breadcrumb.length === 1) return breadcrumb[0];

    // Always show last item (deepest level) fully
    const lastItem = breadcrumb[breadcrumb.length - 1];

    if (breadcrumb.length === 2) {
      return `${breadcrumb[0]} > ${lastItem}`;
    }

    if (breadcrumb.length === 3) {
      return `${breadcrumb[0]} > ${breadcrumb[1]} > ${lastItem}`;
    }

    // For 4+ items, show: first > ... > secondLast > last
    const firstItem = breadcrumb[0];
    const secondLastItem = breadcrumb[breadcrumb.length - 2];
    return `${firstItem} > ... > ${secondLastItem} > ${lastItem}`;
  }, []);

  const displayBreadcrumb = formatBreadcrumb(tocBreadcrumb);

  if (totalPages <= 0) return null;

  const displayPage = isSliding ? sliderPage : currentPage;

  return (
    <div className="flex-shrink-0 bg-neutral-900 border-t border-neutral-800">
      {/* Main controls bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Left navigation controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onFirstPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="First page"
            title="First page"
          >
            <ChevronFirst className="w-4 h-4 text-neutral-300" />
          </button>
          <button
            type="button"
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-neutral-300" />
          </button>
          <button
            type="button"
            onClick={onGoBack}
            disabled={!canGoBack}
            className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Go back"
            title="Go back (Ctrl+,)"
          >
            <Undo2 className="w-4 h-4 text-neutral-300" />
          </button>
          <button
            type="button"
            onClick={onGoForward}
            disabled={!canGoForward}
            className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Go forward"
            title="Go forward (Ctrl+.)"
          >
            <Redo2 className="w-4 h-4 text-neutral-300" />
          </button>
        </div>

        {/* Page number display - editable input */}
        <div className="flex items-center gap-1 min-w-[70px] justify-center">
          <input
            type="text"
            inputMode="numeric"
            value={inputValue}
            onChange={(e) => {
              const value = e.target.value;
              // Allow empty string or numbers only
              if (value === "" || /^\d+$/.test(value)) {
                setInputValue(value);
              }
            }}
            onBlur={() => {
              const page = Number.parseInt(inputValue, 10);
              if (!Number.isNaN(page) && page >= 1 && page <= totalPages) {
                onPageChange(page);
              } else {
                // Reset to current page if invalid
                setInputValue(currentPage.toString());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="w-12 px-1 py-0.5 bg-neutral-800 border border-neutral-700 rounded text-center text-sm text-neutral-300 tabular-nums focus:outline-none focus:border-neutral-500 hover:border-neutral-600 transition-colors"
          />
          <span className="text-sm text-neutral-500">/</span>
          <span className="text-sm text-neutral-500 tabular-nums">
            {totalPages}
          </span>
        </div>

        {/* Slider */}
        <div ref={sliderContainerRef} className="flex-1 relative">
          {/* Floating tooltip during sliding */}
          {isSliding && (
            <div
              className="absolute bottom-full mb-3 px-3 py-1.5 bg-neutral-700 text-neutral-100 text-sm rounded-lg shadow-lg whitespace-nowrap pointer-events-none z-50"
              style={{
                left: `clamp(60px, ${tooltipPosition}px, calc(100% - 60px))`,
                transform: "translateX(-50%)",
              }}
            >
              <span className="font-medium tabular-nums">{sliderPage}</span>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-neutral-700" />
            </div>
          )}

          <input
            ref={sliderRef}
            type="range"
            min={1}
            max={totalPages}
            value={displayPage}
            onChange={handleSliderChange}
            onMouseDown={handleSliderMouseDown}
            onMouseUp={handleSliderMouseUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3.5
              [&::-webkit-slider-thumb]:h-3.5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-neutral-200
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-sm
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-webkit-slider-thumb]:active:scale-125
              [&::-moz-range-thumb]:w-3.5
              [&::-moz-range-thumb]:h-3.5
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-neutral-200
              [&::-moz-range-thumb]:border-none
              [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-thumb]:shadow-sm
              [&::-moz-range-track]:bg-neutral-700
              [&::-moz-range-track]:rounded-full"
            aria-label="Page slider"
          />
        </div>

        {/* Right navigation controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4 text-neutral-300" />
          </button>
          <button
            type="button"
            onClick={onLastPage}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Last page"
            title="Last page"
          >
            <ChevronLast className="w-4 h-4 text-neutral-300" />
          </button>
        </div>
      </div>

      {/* TOC Breadcrumb bar - below slider */}
      {displayBreadcrumb && (
        <div
          className={`px-3 py-1.5 text-center border-t border-neutral-800 transition-colors ${
            isSliding ? "bg-neutral-800" : "bg-neutral-900"
          }`}
        >
          <span
            className="text-xs text-neutral-400 truncate block max-w-full"
            title={tocBreadcrumb.join(" > ")}
          >
            {displayBreadcrumb}
          </span>
        </div>
      )}
    </div>
  );
}

export default FooterSlider;
