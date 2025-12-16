import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Dispatch, SetStateAction } from 'react';
import { useBookmarks } from './useBookmarks';
import type { Bookmark } from './types';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({ label: 'test-window' })),
}));

describe('useBookmarks', () => {
  let mockBookmarks: Bookmark[];
  let mockSetBookmarks: Mock<Dispatch<SetStateAction<Bookmark[]>>>;
  let mockGetChapterForPage: (page: number) => string | undefined;

  beforeEach(() => {
    mockBookmarks = [
      { page: 1, label: 'Page 1', createdAt: 1000 },
      { page: 5, label: 'P5: Chapter 1', createdAt: 2000 },
    ];
    mockSetBookmarks = vi.fn();
    mockGetChapterForPage = vi.fn((page: number) =>
      page === 5 ? 'Chapter 1' : undefined
    );
  });

  it('should calculate isCurrentPageBookmarked correctly', () => {
    const { result } = renderHook(() =>
      useBookmarks(mockBookmarks, mockSetBookmarks, 1, mockGetChapterForPage, false)
    );

    expect(result.current.isCurrentPageBookmarked).toBe(true);
  });

  it('should add bookmark when toggling on unbookmarked page', () => {
    const { result } = renderHook(() =>
      useBookmarks(mockBookmarks, mockSetBookmarks, 3, mockGetChapterForPage, false)
    );

    act(() => {
      result.current.toggleBookmark();
    });

    expect(mockSetBookmarks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ page: 3, label: 'Page 3' }),
      ])
    );
  });

  it('should remove bookmark when toggling on bookmarked page', () => {
    const { result } = renderHook(() =>
      useBookmarks(mockBookmarks, mockSetBookmarks, 1, mockGetChapterForPage, false)
    );

    act(() => {
      result.current.toggleBookmark();
    });

    const newBookmarks = mockSetBookmarks.mock.calls[0][0];
    expect(newBookmarks).not.toContainEqual(
      expect.objectContaining({ page: 1 })
    );
  });

  it('should include chapter name in bookmark label when available', () => {
    const { result } = renderHook(() =>
      useBookmarks(mockBookmarks, mockSetBookmarks, 5, mockGetChapterForPage, false)
    );

    act(() => {
      // Remove existing bookmark first
      result.current.toggleBookmark();
    });

    // Re-render with no bookmark on page 5
    const { result: result2 } = renderHook(() =>
      useBookmarks([], mockSetBookmarks, 5, mockGetChapterForPage, false)
    );

    act(() => {
      result2.current.toggleBookmark();
    });

    expect(mockSetBookmarks).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ page: 5, label: 'P5: Chapter 1' }),
      ])
    );
  });

  it('should remove specific bookmark', () => {
    const { result } = renderHook(() =>
      useBookmarks(mockBookmarks, mockSetBookmarks, 1, mockGetChapterForPage, false)
    );

    act(() => {
      result.current.removeBookmark(5);
    });

    const newBookmarks = mockSetBookmarks.mock.calls[0][0];
    expect(newBookmarks).toHaveLength(1);
    expect(newBookmarks).toContainEqual(
      expect.objectContaining({ page: 1 })
    );
  });

  it('should clear all bookmarks', () => {
    const { result } = renderHook(() =>
      useBookmarks(mockBookmarks, mockSetBookmarks, 1, mockGetChapterForPage, false)
    );

    act(() => {
      result.current.clearBookmarks();
    });

    expect(mockSetBookmarks).toHaveBeenCalledWith([]);
  });
});
