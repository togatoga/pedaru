// タブ管理ロジックを純粋関数として分離

export interface TabState {
  id: string;
  pdfPath: string;
  fileName: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  viewMode: 'single' | 'double';
  history: number[];
  historyIndex: number;
  bookmarks: Array<{ page: number; timestamp: number }>;
}

export interface TabManagerState {
  tabs: TabState[];
  activeTabId: string | null;
}

/**
 * 新しいタブを追加
 */
export function addTab(
  state: TabManagerState,
  newTab: TabState
): TabManagerState {
  return {
    tabs: [...state.tabs, newTab],
    activeTabId: newTab.id,
  };
}

/**
 * タブを削除
 */
export function removeTab(
  state: TabManagerState,
  tabId: string
): TabManagerState {
  const newTabs = state.tabs.filter((tab) => tab.id !== tabId);

  // 削除したのがアクティブタブの場合
  let newActiveTabId = state.activeTabId;
  if (state.activeTabId === tabId) {
    // 右のタブがあればそれを、なければ左のタブをアクティブに
    const removedIndex = state.tabs.findIndex((tab) => tab.id === tabId);
    if (newTabs.length > 0) {
      const nextIndex = Math.min(removedIndex, newTabs.length - 1);
      newActiveTabId = newTabs[nextIndex].id;
    } else {
      newActiveTabId = null;
    }
  }

  return {
    tabs: newTabs,
    activeTabId: newActiveTabId,
  };
}

/**
 * アクティブタブを変更
 */
export function setActiveTab(
  state: TabManagerState,
  tabId: string
): TabManagerState {
  // タブが存在するか確認
  const tabExists = state.tabs.some((tab) => tab.id === tabId);
  if (!tabExists) {
    return state;
  }

  return {
    ...state,
    activeTabId: tabId,
  };
}

/**
 * 次のタブに移動（Cmd+Shift+]）
 */
export function goToNextTab(state: TabManagerState): TabManagerState {
  if (state.tabs.length === 0 || !state.activeTabId) {
    return state;
  }

  const currentIndex = state.tabs.findIndex(
    (tab) => tab.id === state.activeTabId
  );
  const nextIndex = (currentIndex + 1) % state.tabs.length;

  return {
    ...state,
    activeTabId: state.tabs[nextIndex].id,
  };
}

/**
 * 前のタブに移動（Cmd+Shift+[）
 */
export function goToPreviousTab(state: TabManagerState): TabManagerState {
  if (state.tabs.length === 0 || !state.activeTabId) {
    return state;
  }

  const currentIndex = state.tabs.findIndex(
    (tab) => tab.id === state.activeTabId
  );
  const prevIndex =
    currentIndex === 0 ? state.tabs.length - 1 : currentIndex - 1;

  return {
    ...state,
    activeTabId: state.tabs[prevIndex].id,
  };
}

/**
 * タブの状態を更新
 */
export function updateTab(
  state: TabManagerState,
  tabId: string,
  updates: Partial<TabState>
): TabManagerState {
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, ...updates } : tab
    ),
  };
}

/**
 * アクティブタブを取得
 */
export function getActiveTab(
  state: TabManagerState
): TabState | null {
  if (!state.activeTabId) {
    return null;
  }
  return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
}
