import { Dispatch, MutableRefObject, SetStateAction, useCallback } from "react";

/**
 * Custom hook for managing header visibility with temporary show/hide behavior
 *
 * Handles toggling header visibility and showing it temporarily during tab operations
 *
 * @param showHeader - Current header visibility state
 * @param setShowHeader - State setter for header visibility
 * @param tempShowHeaderRef - Ref to track if header is temporarily shown
 * @param headerTimerRef - Ref to store the auto-hide timer
 * @returns Header visibility control functions
 */
export function useHeaderVisibility(
  showHeader: boolean,
  setShowHeader: Dispatch<SetStateAction<boolean>>,
  tempShowHeaderRef: MutableRefObject<boolean>,
  headerTimerRef: MutableRefObject<NodeJS.Timeout | null>,
) {
  // Toggle header visibility
  const handleToggleHeader = useCallback(() => {
    setShowHeader((prev) => !prev);
  }, [setShowHeader]);

  // Show header temporarily (auto-hides after 2 seconds)
  const showHeaderTemporarily = useCallback(() => {
    // If header is permanently shown by user (not temp), don't auto-hide
    if (showHeader && !tempShowHeaderRef.current) {
      return;
    }

    // Show header temporarily if not already shown
    if (!showHeader) {
      tempShowHeaderRef.current = true;
      setShowHeader(true);
    }

    // Clear any existing timer and reset
    if (headerTimerRef.current) {
      clearTimeout(headerTimerRef.current);
    }

    // Hide after 2 seconds of no tab operations
    headerTimerRef.current = setTimeout(() => {
      tempShowHeaderRef.current = false;
      setShowHeader(false);
      headerTimerRef.current = null;
    }, 2000);
  }, [showHeader, setShowHeader, tempShowHeaderRef, headerTimerRef]);

  return {
    handleToggleHeader,
    showHeaderTemporarily,
  };
}
