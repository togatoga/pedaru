import { type DependencyList, type RefObject, useEffect, useRef } from "react";

/**
 * Options for auto-scroll behavior
 */
interface AutoScrollOptions {
  /**
   * Scroll behavior - 'smooth' for animated, 'instant' for immediate
   * @default 'smooth'
   */
  behavior?: ScrollBehavior;
  /**
   * Vertical alignment of the element in the viewport
   * @default 'nearest'
   */
  block?: ScrollLogicalPosition;
  /**
   * Horizontal alignment of the element in the viewport
   * @default 'nearest'
   */
  inline?: ScrollLogicalPosition;
}

const defaultOptions: AutoScrollOptions = {
  behavior: "smooth",
  block: "nearest",
  inline: "nearest",
};

/**
 * Hook that provides a ref and automatically scrolls to the referenced element
 * when dependencies change.
 *
 * @param deps - Dependency array that triggers scroll when changed
 * @param options - Scroll behavior options
 * @returns A ref to attach to the element that should be scrolled into view
 *
 * @example
 * ```tsx
 * function List({ items, activeIndex }) {
 *   const activeRef = useAutoScroll([activeIndex]);
 *
 *   return (
 *     <ul>
 *       {items.map((item, index) => (
 *         <li
 *           key={item.id}
 *           ref={index === activeIndex ? activeRef : null}
 *         >
 *           {item.name}
 *         </li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function useAutoScroll<T extends HTMLElement = HTMLElement>(
  deps: DependencyList,
  options: AutoScrollOptions = {},
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const mergedOptions = { ...defaultOptions, ...options };

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView({
        behavior: mergedOptions.behavior,
        block: mergedOptions.block,
        inline: mergedOptions.inline,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
