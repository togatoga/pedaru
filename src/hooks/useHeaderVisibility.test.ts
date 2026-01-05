import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHeaderVisibility } from "./useHeaderVisibility";

describe("useHeaderVisibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should toggle header visibility", () => {
    const setShowHeader = vi.fn();
    const tempShowHeaderRef = { current: false };
    const headerTimerRef = { current: null };

    const { result } = renderHook(() =>
      useHeaderVisibility(
        true,
        setShowHeader,
        tempShowHeaderRef,
        headerTimerRef,
      ),
    );

    act(() => {
      result.current.handleToggleHeader();
    });

    expect(setShowHeader).toHaveBeenCalled();
    // Check that the callback was passed to setState
    const callback = setShowHeader.mock.calls[0][0];
    expect(typeof callback).toBe("function");
    // Simulate the setState callback
    expect(callback(true)).toBe(false);
    expect(callback(false)).toBe(true);
  });

  it("should show header temporarily when header is hidden", () => {
    const setShowHeader = vi.fn();
    const tempShowHeaderRef = { current: false };
    const headerTimerRef = { current: null };

    const { result } = renderHook(() =>
      useHeaderVisibility(
        false,
        setShowHeader,
        tempShowHeaderRef,
        headerTimerRef,
      ),
    );

    act(() => {
      result.current.showHeaderTemporarily();
    });

    expect(setShowHeader).toHaveBeenCalledWith(true);
    expect(tempShowHeaderRef.current).toBe(true);
    expect(headerTimerRef.current).not.toBeNull();
  });

  it("should hide header after 2 seconds", () => {
    const setShowHeader = vi.fn();
    const tempShowHeaderRef = { current: false };
    const headerTimerRef = { current: null };

    const { result } = renderHook(() =>
      useHeaderVisibility(
        false,
        setShowHeader,
        tempShowHeaderRef,
        headerTimerRef,
      ),
    );

    act(() => {
      result.current.showHeaderTemporarily();
    });

    // Clear previous calls
    setShowHeader.mockClear();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(setShowHeader).toHaveBeenCalledWith(false);
    expect(tempShowHeaderRef.current).toBe(false);
    expect(headerTimerRef.current).toBeNull();
  });

  it("should not auto-hide when header is permanently shown", () => {
    const setShowHeader = vi.fn();
    const tempShowHeaderRef = { current: false }; // Not temporary
    const headerTimerRef = { current: null };

    const { result } = renderHook(() =>
      useHeaderVisibility(
        true,
        setShowHeader,
        tempShowHeaderRef,
        headerTimerRef,
      ),
    );

    act(() => {
      result.current.showHeaderTemporarily();
    });

    // Should not set or clear anything when header is permanently visible
    expect(setShowHeader).not.toHaveBeenCalled();
  });

  it("should reset timer when called multiple times", () => {
    const setShowHeader = vi.fn();
    const tempShowHeaderRef = { current: false };
    const headerTimerRef = { current: null };

    const { result } = renderHook(() =>
      useHeaderVisibility(
        false,
        setShowHeader,
        tempShowHeaderRef,
        headerTimerRef,
      ),
    );

    act(() => {
      result.current.showHeaderTemporarily();
    });

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Call again to reset timer
    setShowHeader.mockClear();

    // Re-render with showHeader=true (header is now visible)
    const { result: result2 } = renderHook(() =>
      useHeaderVisibility(
        true,
        setShowHeader,
        tempShowHeaderRef,
        headerTimerRef,
      ),
    );

    act(() => {
      result2.current.showHeaderTemporarily();
    });

    // Advance another 1 second (total 2 from last call)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should not have hidden yet (timer was reset)
    expect(setShowHeader).not.toHaveBeenCalledWith(false);

    // Advance remaining 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Now it should hide
    expect(setShowHeader).toHaveBeenCalledWith(false);
  });
});
