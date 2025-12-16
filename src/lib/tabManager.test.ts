import { describe, it, expect } from 'vitest';
import {
  addTab,
  removeTab,
  setActiveTab,
  goToNextTab,
  goToPreviousTab,
  updateTab,
  getActiveTab,
  type TabManagerState,
  type TabState,
} from './tabManager';

function createMockTab(id: string, fileName: string): TabState {
  return {
    id,
    pdfPath: `/path/to/${fileName}`,
    fileName,
    currentPage: 1,
    totalPages: 10,
    zoom: 1.0,
    viewMode: 'single',
    history: [1],
    historyIndex: 0,
    bookmarks: [],
  };
}

describe('TabManager', () => {
  describe('addTab', () => {
    it('should add a new tab and make it active', () => {
      const initialState: TabManagerState = {
        tabs: [],
        activeTabId: null,
      };

      const newTab = createMockTab('tab-1', 'test.pdf');
      const result = addTab(initialState, newTab);

      expect(result.tabs).toHaveLength(1);
      expect(result.tabs[0]).toBe(newTab);
      expect(result.activeTabId).toBe('tab-1');
    });

    it('should add multiple tabs', () => {
      let state: TabManagerState = {
        tabs: [],
        activeTabId: null,
      };

      state = addTab(state, createMockTab('tab-1', 'first.pdf'));
      state = addTab(state, createMockTab('tab-2', 'second.pdf'));

      expect(state.tabs).toHaveLength(2);
      expect(state.activeTabId).toBe('tab-2'); // 最後に追加したタブがアクティブ
    });
  });

  describe('removeTab', () => {
    it('should remove the specified tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
        ],
        activeTabId: 'tab-1',
      };

      const result = removeTab(state, 'tab-2');

      expect(result.tabs).toHaveLength(1);
      expect(result.tabs[0].id).toBe('tab-1');
      expect(result.activeTabId).toBe('tab-1');
    });

    it('should activate next tab when removing active tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
          createMockTab('tab-3', 'third.pdf'),
        ],
        activeTabId: 'tab-2',
      };

      const result = removeTab(state, 'tab-2');

      expect(result.tabs).toHaveLength(2);
      expect(result.activeTabId).toBe('tab-3'); // 右のタブがアクティブに
    });

    it('should activate previous tab when removing last active tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
        ],
        activeTabId: 'tab-2',
      };

      const result = removeTab(state, 'tab-2');

      expect(result.tabs).toHaveLength(1);
      expect(result.activeTabId).toBe('tab-1'); // 左のタブがアクティブに
    });

    it('should set activeTabId to null when removing last tab', () => {
      const state: TabManagerState = {
        tabs: [createMockTab('tab-1', 'only.pdf')],
        activeTabId: 'tab-1',
      };

      const result = removeTab(state, 'tab-1');

      expect(result.tabs).toHaveLength(0);
      expect(result.activeTabId).toBeNull();
    });

    it('should not change state when removing non-existent tab', () => {
      const state: TabManagerState = {
        tabs: [createMockTab('tab-1', 'first.pdf')],
        activeTabId: 'tab-1',
      };

      const result = removeTab(state, 'non-existent');

      expect(result).toEqual(state);
    });
  });

  describe('setActiveTab', () => {
    it('should set the active tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
        ],
        activeTabId: 'tab-1',
      };

      const result = setActiveTab(state, 'tab-2');

      expect(result.activeTabId).toBe('tab-2');
    });

    it('should not change state when setting non-existent tab as active', () => {
      const state: TabManagerState = {
        tabs: [createMockTab('tab-1', 'first.pdf')],
        activeTabId: 'tab-1',
      };

      const result = setActiveTab(state, 'non-existent');

      expect(result).toEqual(state);
    });
  });

  describe('goToNextTab', () => {
    it('should go to next tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
          createMockTab('tab-3', 'third.pdf'),
        ],
        activeTabId: 'tab-1',
      };

      const result = goToNextTab(state);

      expect(result.activeTabId).toBe('tab-2');
    });

    it('should wrap around to first tab from last tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
        ],
        activeTabId: 'tab-2',
      };

      const result = goToNextTab(state);

      expect(result.activeTabId).toBe('tab-1');
    });

    it('should not change state when no tabs exist', () => {
      const state: TabManagerState = {
        tabs: [],
        activeTabId: null,
      };

      const result = goToNextTab(state);

      expect(result).toEqual(state);
    });
  });

  describe('goToPreviousTab', () => {
    it('should go to previous tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
          createMockTab('tab-3', 'third.pdf'),
        ],
        activeTabId: 'tab-3',
      };

      const result = goToPreviousTab(state);

      expect(result.activeTabId).toBe('tab-2');
    });

    it('should wrap around to last tab from first tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
        ],
        activeTabId: 'tab-1',
      };

      const result = goToPreviousTab(state);

      expect(result.activeTabId).toBe('tab-2');
    });

    it('should not change state when no tabs exist', () => {
      const state: TabManagerState = {
        tabs: [],
        activeTabId: null,
      };

      const result = goToPreviousTab(state);

      expect(result).toEqual(state);
    });
  });

  describe('updateTab', () => {
    it('should update specified tab properties', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
        ],
        activeTabId: 'tab-1',
      };

      const result = updateTab(state, 'tab-2', {
        currentPage: 5,
        zoom: 1.5,
      });

      expect(result.tabs[1].currentPage).toBe(5);
      expect(result.tabs[1].zoom).toBe(1.5);
      expect(result.tabs[0]).toEqual(state.tabs[0]); // 他のタブは変更なし
    });

    it('should not change state when updating non-existent tab', () => {
      const state: TabManagerState = {
        tabs: [createMockTab('tab-1', 'first.pdf')],
        activeTabId: 'tab-1',
      };

      const result = updateTab(state, 'non-existent', { currentPage: 10 });

      expect(result).toEqual(state);
    });
  });

  describe('getActiveTab', () => {
    it('should return the active tab', () => {
      const state: TabManagerState = {
        tabs: [
          createMockTab('tab-1', 'first.pdf'),
          createMockTab('tab-2', 'second.pdf'),
        ],
        activeTabId: 'tab-2',
      };

      const result = getActiveTab(state);

      expect(result).toBe(state.tabs[1]);
    });

    it('should return null when no active tab', () => {
      const state: TabManagerState = {
        tabs: [createMockTab('tab-1', 'first.pdf')],
        activeTabId: null,
      };

      const result = getActiveTab(state);

      expect(result).toBeNull();
    });

    it('should return null when active tab does not exist', () => {
      const state: TabManagerState = {
        tabs: [createMockTab('tab-1', 'first.pdf')],
        activeTabId: 'non-existent',
      };

      const result = getActiveTab(state);

      expect(result).toBeNull();
    });
  });

  // 複雑なシナリオのテスト
  describe('Complex scenarios', () => {
    it('should handle multiple tab operations correctly', () => {
      let state: TabManagerState = {
        tabs: [],
        activeTabId: null,
      };

      // 3つのタブを追加
      state = addTab(state, createMockTab('tab-1', 'first.pdf'));
      state = addTab(state, createMockTab('tab-2', 'second.pdf'));
      state = addTab(state, createMockTab('tab-3', 'third.pdf'));

      expect(state.tabs).toHaveLength(3);
      expect(state.activeTabId).toBe('tab-3');

      // 最初のタブに移動
      state = setActiveTab(state, 'tab-1');
      expect(state.activeTabId).toBe('tab-1');

      // 次のタブへ
      state = goToNextTab(state);
      expect(state.activeTabId).toBe('tab-2');

      // タブを更新
      state = updateTab(state, 'tab-2', { currentPage: 7 });
      expect(getActiveTab(state)?.currentPage).toBe(7);

      // アクティブタブを削除
      state = removeTab(state, 'tab-2');
      expect(state.tabs).toHaveLength(2);
      expect(state.activeTabId).toBe('tab-3'); // 右のタブがアクティブに

      // 全てのタブを削除
      state = removeTab(state, 'tab-1');
      state = removeTab(state, 'tab-3');
      expect(state.tabs).toHaveLength(0);
      expect(state.activeTabId).toBeNull();
    });
  });
});
