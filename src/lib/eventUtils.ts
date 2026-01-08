"use client";

import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { DependencyList, useEffect, useRef } from "react";

/**
 * Hook for listening to a single Tauri event with proper lifecycle management.
 * Handles mount/unmount cleanup and prevents stale handler calls.
 *
 * @param eventName - The name of the Tauri event to listen to
 * @param handler - The callback function to execute when the event is received
 * @param deps - Dependency array for the effect (similar to useEffect deps)
 */
export function useTauriEventListener<T = unknown>(
  eventName: string,
  handler: (payload: T) => void | Promise<void>,
  deps: DependencyList = [],
): void {
  // Use ref to always have access to latest handler without re-subscribing
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let mounted = true;
    let unlistenFn: UnlistenFn | null = null;

    listen<T>(eventName, async (event) => {
      if (!mounted) return;
      try {
        await handlerRef.current(event.payload);
      } catch (error) {
        console.error(`Error in event handler for ${eventName}:`, error);
      }
    })
      .then((fn) => {
        if (mounted) {
          unlistenFn = fn;
        } else {
          // Component unmounted during registration - cleanup immediately
          try {
            fn();
          } catch {}
        }
      })
      .catch((error) => {
        console.error(`Failed to register listener for ${eventName}:`, error);
      });

    return () => {
      mounted = false;
      try {
        unlistenFn?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, ...deps]);
}

/**
 * Configuration for a single event handler
 */
export interface EventHandler<T = unknown> {
  /** The name of the Tauri event */
  event: string;
  /** The handler function to execute when the event is received */
  handler: (payload: T) => void | Promise<void>;
}

/**
 * Hook for listening to multiple Tauri events with a single effect.
 * More efficient than using multiple useTauriEventListener calls when
 * the handlers share similar dependencies.
 *
 * @param handlers - Array of event configurations with event names and handlers
 * @param deps - Dependency array for the effect (shared across all handlers)
 */
export function useTauriEventListeners(
  handlers: EventHandler[],
  deps: DependencyList = [],
): void {
  // Use ref to always have access to latest handlers without re-subscribing
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let mounted = true;
    const unlisteners: UnlistenFn[] = [];

    // Register all listeners
    handlersRef.current.forEach(({ event: eventName }) => {
      listen(eventName, async (event) => {
        if (!mounted) return;

        // Find the current handler for this event
        const currentHandler = handlersRef.current.find(
          (h) => h.event === eventName,
        );
        if (!currentHandler) return;

        try {
          await currentHandler.handler(event.payload);
        } catch (error) {
          console.error(`Error in event handler for ${eventName}:`, error);
        }
      })
        .then((fn) => {
          if (mounted) {
            unlisteners.push(fn);
          } else {
            try {
              fn();
            } catch {}
          }
        })
        .catch((error) => {
          console.error(`Failed to register listener for ${eventName}:`, error);
        });
    });

    return () => {
      mounted = false;
      unlisteners.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
