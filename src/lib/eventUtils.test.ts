import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTauriEventListener, useTauriEventListeners } from "./eventUtils";

// Mock @tauri-apps/api/event
const mockUnlisten = vi.fn();
const mockListen = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

describe("eventUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation that resolves with unlisten function
    mockListen.mockResolvedValue(mockUnlisten);
  });

  afterEach(() => {
    cleanup();
  });

  describe("useTauriEventListener", () => {
    it("should register a listener on mount", async () => {
      const handler = vi.fn();

      renderHook(() => useTauriEventListener("test-event", handler));

      // Wait for the async listen to be called
      await vi.waitFor(() => {
        expect(mockListen).toHaveBeenCalledTimes(1);
      });

      expect(mockListen).toHaveBeenCalledWith(
        "test-event",
        expect.any(Function),
      );
    });

    it("should call unlisten on unmount", async () => {
      const handler = vi.fn();

      const { unmount } = renderHook(() =>
        useTauriEventListener("test-event", handler),
      );

      // Wait for listener to be registered
      await vi.waitFor(() => {
        expect(mockListen).toHaveBeenCalled();
      });

      unmount();

      // Wait for cleanup
      await vi.waitFor(() => {
        expect(mockUnlisten).toHaveBeenCalled();
      });
    });

    it("should call handler when event is received", async () => {
      const handler = vi.fn();
      let capturedCallback: ((event: { payload: unknown }) => void) | null =
        null;

      mockListen.mockImplementation((_eventName, callback) => {
        capturedCallback = callback;
        return Promise.resolve(mockUnlisten);
      });

      renderHook(() => useTauriEventListener("test-event", handler));

      await vi.waitFor(() => {
        expect(capturedCallback).not.toBeNull();
      });

      // Simulate event - use type assertion since TypeScript can't track mock assignment
      (capturedCallback as unknown as (event: { payload: unknown }) => void)({
        payload: { data: "test" },
      });

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledWith({ data: "test" });
      });
    });

    it("should not call handler after unmount", async () => {
      const handler = vi.fn();
      let capturedCallback: ((event: { payload: unknown }) => void) | null =
        null;

      mockListen.mockImplementation((_eventName, callback) => {
        capturedCallback = callback;
        return Promise.resolve(mockUnlisten);
      });

      const { unmount } = renderHook(() =>
        useTauriEventListener("test-event", handler),
      );

      await vi.waitFor(() => {
        expect(capturedCallback).not.toBeNull();
      });

      unmount();

      // Try to call handler after unmount - use type assertion since TypeScript can't track mock assignment
      (capturedCallback as unknown as (event: { payload: unknown }) => void)({
        payload: { data: "test" },
      });

      // Handler should not be called because component is unmounted
      expect(handler).not.toHaveBeenCalled();
    });

    it("should re-register listener when event name changes", async () => {
      const handler = vi.fn();

      const { rerender } = renderHook(
        ({ eventName }) => useTauriEventListener(eventName, handler),
        { initialProps: { eventName: "event-1" } },
      );

      await vi.waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith(
          "event-1",
          expect.any(Function),
        );
      });

      rerender({ eventName: "event-2" });

      await vi.waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith(
          "event-2",
          expect.any(Function),
        );
      });

      expect(mockListen).toHaveBeenCalledTimes(2);
    });
  });

  describe("useTauriEventListeners", () => {
    it("should register multiple listeners on mount", async () => {
      const handlers = [
        { event: "event-1", handler: vi.fn() },
        { event: "event-2", handler: vi.fn() },
        { event: "event-3", handler: vi.fn() },
      ];

      renderHook(() => useTauriEventListeners(handlers));

      await vi.waitFor(() => {
        expect(mockListen).toHaveBeenCalledTimes(3);
      });

      expect(mockListen).toHaveBeenCalledWith("event-1", expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith("event-2", expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith("event-3", expect.any(Function));
    });

    it("should call all unlisten functions on unmount", async () => {
      const unlisten1 = vi.fn();
      const unlisten2 = vi.fn();

      let callCount = 0;
      mockListen.mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? unlisten1 : unlisten2);
      });

      const handlers = [
        { event: "event-1", handler: vi.fn() },
        { event: "event-2", handler: vi.fn() },
      ];

      const { unmount } = renderHook(() => useTauriEventListeners(handlers));

      await vi.waitFor(() => {
        expect(mockListen).toHaveBeenCalledTimes(2);
      });

      unmount();

      await vi.waitFor(() => {
        expect(unlisten1).toHaveBeenCalled();
        expect(unlisten2).toHaveBeenCalled();
      });
    });

    it("should call correct handler for each event", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const callbacks: Record<string, (event: { payload: unknown }) => void> =
        {};

      mockListen.mockImplementation((eventName, callback) => {
        callbacks[eventName] = callback;
        return Promise.resolve(mockUnlisten);
      });

      const handlers = [
        { event: "event-1", handler: handler1 },
        { event: "event-2", handler: handler2 },
      ];

      renderHook(() => useTauriEventListeners(handlers));

      await vi.waitFor(() => {
        expect(Object.keys(callbacks).length).toBe(2);
      });

      // Trigger event-1
      callbacks["event-1"]({ payload: { data: "from-1" } });

      await vi.waitFor(() => {
        expect(handler1).toHaveBeenCalledWith({ data: "from-1" });
        expect(handler2).not.toHaveBeenCalled();
      });

      // Trigger event-2
      callbacks["event-2"]({ payload: { data: "from-2" } });

      await vi.waitFor(() => {
        expect(handler2).toHaveBeenCalledWith({ data: "from-2" });
      });
    });

    it("should use latest handler reference", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      let capturedCallback: ((event: { payload: unknown }) => void) | null =
        null;

      mockListen.mockImplementation((_eventName, callback) => {
        capturedCallback = callback;
        return Promise.resolve(mockUnlisten);
      });

      const { rerender } = renderHook(
        ({ handler }) =>
          useTauriEventListeners([{ event: "test-event", handler }]),
        { initialProps: { handler: handler1 } },
      );

      await vi.waitFor(() => {
        expect(capturedCallback).not.toBeNull();
      });

      // Update handler without re-registering listener
      rerender({ handler: handler2 });

      // Trigger event - should use updated handler - use type assertion since TypeScript can't track mock assignment
      (capturedCallback as unknown as (event: { payload: unknown }) => void)({
        payload: { data: "test" },
      });

      await vi.waitFor(() => {
        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).toHaveBeenCalledWith({ data: "test" });
      });
    });
  });
});
