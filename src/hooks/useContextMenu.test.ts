import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContextMenu } from "./useContextMenu";

describe("useContextMenu", () => {
  let mockTriggerTranslation: (autoExplain?: boolean) => void;
  let mockTriggerExplanation: () => void;
  let originalGetSelection: typeof window.getSelection;
  let originalClipboard: typeof navigator.clipboard;

  beforeEach(() => {
    mockTriggerTranslation = vi.fn() as unknown as (
      autoExplain?: boolean,
    ) => void;
    mockTriggerExplanation = vi.fn() as unknown as () => void;
    originalGetSelection = window.getSelection;
    originalClipboard = navigator.clipboard;

    // Mock clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
    });
  });

  afterEach(() => {
    window.getSelection = originalGetSelection;
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
    });
  });

  it("should initialize with null position", () => {
    const { result } = renderHook(() =>
      useContextMenu(mockTriggerTranslation, mockTriggerExplanation),
    );

    expect(result.current.contextMenuPosition).toBeNull();
  });

  it("should not show menu when no text is selected", () => {
    // Mock empty selection
    window.getSelection = vi.fn(() => ({
      isCollapsed: true,
      toString: () => "",
      getRangeAt: vi.fn(),
    })) as unknown as typeof window.getSelection;

    const { result } = renderHook(() =>
      useContextMenu(mockTriggerTranslation, mockTriggerExplanation),
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(mockEvent);
    });

    expect(result.current.contextMenuPosition).toBeNull();
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("should not show menu when selection is outside PDF viewer", () => {
    const container = document.createElement("div");

    // Mock selection outside PDF viewer
    window.getSelection = vi.fn(() => ({
      isCollapsed: false,
      toString: () => "selected text",
      getRangeAt: () => ({
        commonAncestorContainer: container,
      }),
    })) as unknown as typeof window.getSelection;

    const { result } = renderHook(() =>
      useContextMenu(mockTriggerTranslation, mockTriggerExplanation),
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(mockEvent);
    });

    expect(result.current.contextMenuPosition).toBeNull();
  });

  it("should show menu when text is selected in PDF viewer", () => {
    // Create and add PDF viewer container
    const pdfViewer = document.createElement("div");
    pdfViewer.id = "pdf-viewer-container";
    const textNode = document.createTextNode("selected text");
    pdfViewer.appendChild(textNode);
    document.body.appendChild(pdfViewer);

    // Mock selection inside PDF viewer
    window.getSelection = vi.fn(() => ({
      isCollapsed: false,
      toString: () => "selected text",
      getRangeAt: () => ({
        commonAncestorContainer: textNode,
      }),
    })) as unknown as typeof window.getSelection;

    const { result } = renderHook(() =>
      useContextMenu(mockTriggerTranslation, mockTriggerExplanation),
    );

    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(mockEvent);
    });

    expect(result.current.contextMenuPosition).toEqual({ x: 100, y: 200 });
    expect(mockEvent.preventDefault).toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(pdfViewer);
  });

  it("should copy text to clipboard", () => {
    window.getSelection = vi.fn(() => ({
      toString: () => "text to copy",
    })) as unknown as typeof window.getSelection;

    const { result } = renderHook(() =>
      useContextMenu(mockTriggerTranslation, mockTriggerExplanation),
    );

    act(() => {
      result.current.handleContextMenuCopy();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("text to copy");
  });

  it("should trigger translation without auto-explain", () => {
    const { result } = renderHook(() =>
      useContextMenu(mockTriggerTranslation, mockTriggerExplanation),
    );

    act(() => {
      result.current.handleContextMenuTranslate();
    });

    expect(mockTriggerTranslation).toHaveBeenCalledWith(false);
  });

  it("should trigger explanation", () => {
    const { result } = renderHook(() =>
      useContextMenu(mockTriggerTranslation, mockTriggerExplanation),
    );

    act(() => {
      result.current.handleContextMenuExplain();
    });

    expect(mockTriggerExplanation).toHaveBeenCalled();
  });

  it("should close context menu", () => {
    // Create and add PDF viewer container
    const pdfViewer = document.createElement("div");
    pdfViewer.id = "pdf-viewer-container";
    const textNode = document.createTextNode("selected text");
    pdfViewer.appendChild(textNode);
    document.body.appendChild(pdfViewer);

    window.getSelection = vi.fn(() => ({
      isCollapsed: false,
      toString: () => "selected text",
      getRangeAt: () => ({
        commonAncestorContainer: textNode,
      }),
    })) as unknown as typeof window.getSelection;

    const { result } = renderHook(() =>
      useContextMenu(mockTriggerTranslation, mockTriggerExplanation),
    );

    // Open menu
    const mockEvent = {
      clientX: 100,
      clientY: 200,
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleContextMenu(mockEvent);
    });

    expect(result.current.contextMenuPosition).not.toBeNull();

    // Close menu
    act(() => {
      result.current.closeContextMenu();
    });

    expect(result.current.contextMenuPosition).toBeNull();

    // Cleanup
    document.body.removeChild(pdfViewer);
  });
});
