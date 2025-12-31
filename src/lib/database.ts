import Database from '@tauri-apps/plugin-sql';
import type {
  ViewMode,
  TabState,
  WindowState,
  BookmarkState,
  HistoryEntry,
  PdfSessionState,
} from '@/types';

// Re-export types for backward compatibility
export type { TabState, WindowState, BookmarkState, HistoryEntry, PdfSessionState };

// Constants
const LAST_OPENED_KEY = 'pedaru_last_opened_path';

// Database instance (singleton)
let dbInstance: Database | null = null;

// Get database instance
async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:pedaru.db');
  }
  return dbInstance;
}

// ============================================
// Helper Functions for Normalized Tables
// ============================================

/**
 * Save bookmarks to the normalized session_bookmarks table
 */
async function saveNormalizedBookmarks(
  db: Database,
  sessionId: number,
  bookmarks: BookmarkState[]
): Promise<void> {
  // Delete existing bookmarks for this session
  await db.execute('DELETE FROM session_bookmarks WHERE session_id = $1', [sessionId]);

  // Insert new bookmarks
  for (const bookmark of bookmarks) {
    await db.execute(
      `INSERT INTO session_bookmarks (session_id, page, label, created_at)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, bookmark.page, bookmark.label, bookmark.createdAt]
    );
  }
}

/**
 * Save tabs to the normalized session_tabs table
 */
async function saveNormalizedTabs(
  db: Database,
  sessionId: number,
  tabs: TabState[],
  activeTabIndex: number | null
): Promise<void> {
  // Delete existing tabs for this session
  await db.execute('DELETE FROM session_tabs WHERE session_id = $1', [sessionId]);

  // Insert new tabs
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const isActive = activeTabIndex === i ? 1 : 0;
    await db.execute(
      `INSERT INTO session_tabs (session_id, page, label, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, tab.page, tab.label, i, isActive]
    );
  }
}

/**
 * Save page history to the normalized session_page_history table
 */
async function saveNormalizedPageHistory(
  db: Database,
  sessionId: number,
  pageHistory: HistoryEntry[]
): Promise<void> {
  // Delete existing history for this session
  await db.execute('DELETE FROM session_page_history WHERE session_id = $1', [sessionId]);

  // Insert new history entries
  for (const entry of pageHistory) {
    const visitedAt = parseInt(entry.timestamp, 10) || Date.now();
    await db.execute(
      `INSERT INTO session_page_history (session_id, page, visited_at)
       VALUES ($1, $2, $3)`,
      [sessionId, entry.page, visitedAt]
    );
  }
}

/**
 * Load bookmarks from the normalized session_bookmarks table
 */
async function loadNormalizedBookmarks(
  db: Database,
  sessionId: number
): Promise<BookmarkState[]> {
  const result = await db.select<Array<{
    page: number;
    label: string | null;
    created_at: number;
  }>>(
    `SELECT page, label, created_at FROM session_bookmarks
     WHERE session_id = $1 ORDER BY created_at`,
    [sessionId]
  );

  return result.map(row => ({
    page: row.page,
    label: row.label || '',
    createdAt: row.created_at,
  }));
}

/**
 * Load tabs from the normalized session_tabs table
 */
async function loadNormalizedTabs(
  db: Database,
  sessionId: number
): Promise<{ tabs: TabState[]; activeTabIndex: number | null }> {
  const result = await db.select<Array<{
    page: number;
    label: string;
    sort_order: number;
    is_active: number;
  }>>(
    `SELECT page, label, sort_order, is_active FROM session_tabs
     WHERE session_id = $1 ORDER BY sort_order`,
    [sessionId]
  );

  let activeTabIndex: number | null = null;
  const tabs = result.map((row, index) => {
    if (row.is_active === 1) {
      activeTabIndex = index;
    }
    return {
      page: row.page,
      label: row.label,
    };
  });

  return { tabs, activeTabIndex };
}

/**
 * Load page history from the normalized session_page_history table
 */
async function loadNormalizedPageHistory(
  db: Database,
  sessionId: number
): Promise<HistoryEntry[]> {
  const result = await db.select<Array<{
    page: number;
    visited_at: number;
  }>>(
    `SELECT page, visited_at FROM session_page_history
     WHERE session_id = $1 ORDER BY id`,
    [sessionId]
  );

  return result.map(row => ({
    page: row.page,
    timestamp: row.visited_at.toString(),
  }));
}

// Save session state for a PDF
export async function saveSessionState(
  filePath: string,
  state: PdfSessionState
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  state.lastOpened = now;

  // Get name - use provided name or extract filename from path
  const name = state.name || filePath.split('/').pop() || filePath.split('\\').pop() || 'Unknown';

  // Serialize complex fields to JSON (kept for backward compatibility)
  const bookmarksJson = JSON.stringify(state.bookmarks);
  const pageHistoryJson = state.pageHistory ? JSON.stringify(state.pageHistory) : null;
  const tabsJson = JSON.stringify(state.tabs);
  const windowsJson = JSON.stringify(state.windows);

  // Insert or update session (path_hash is deprecated but kept for compatibility)
  await db.execute(
    `INSERT INTO sessions (
      file_path, path_hash, name, current_page, zoom, view_mode,
      bookmarks, page_history, history_index, tabs, active_tab_index,
      windows, last_opened, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT(file_path) DO UPDATE SET
      name = $3,
      current_page = $4,
      zoom = $5,
      view_mode = $6,
      bookmarks = $7,
      page_history = $8,
      history_index = $9,
      tabs = $10,
      active_tab_index = $11,
      windows = $12,
      last_opened = $13,
      updated_at = $15`,
    [
      filePath,
      '', // path_hash deprecated
      name,
      state.page,
      state.zoom,
      state.viewMode,
      bookmarksJson,
      pageHistoryJson,
      state.historyIndex ?? null,
      tabsJson,
      state.activeTabIndex ?? null,
      windowsJson,
      now,
      now,
      now,
    ]
  );

  // Get session ID for normalized tables
  const sessionResult = await db.select<Array<{ id: number }>>(
    'SELECT id FROM sessions WHERE file_path = $1',
    [filePath]
  );

  if (sessionResult.length > 0) {
    const sessionId = sessionResult[0].id;

    // Save to normalized tables (in parallel)
    await Promise.all([
      saveNormalizedBookmarks(db, sessionId, state.bookmarks),
      saveNormalizedTabs(db, sessionId, state.tabs, state.activeTabIndex),
      state.pageHistory
        ? saveNormalizedPageHistory(db, sessionId, state.pageHistory)
        : Promise.resolve(),
    ]);
  }

  // Update last opened path in localStorage (for quick access)
  localStorage.setItem(LAST_OPENED_KEY, filePath);

  // Cleanup old sessions
  await cleanupOldSessions();
}

// Load session state for a PDF
export async function loadSessionState(
  filePath: string
): Promise<PdfSessionState | null> {
  try {
    const db = await getDb();
    const result = await db.select<Array<{
      id: number;
      file_path: string;
      name: string;
      current_page: number;
      zoom: number;
      view_mode: string;
      bookmarks: string | null;
      page_history: string | null;
      history_index: number | null;
      tabs: string | null;
      active_tab_index: number | null;
      windows: string | null;
      last_opened: number;
    }>>(
      `SELECT id, file_path, name, current_page, zoom, view_mode,
              bookmarks, page_history, history_index, tabs, active_tab_index,
              windows, last_opened
       FROM sessions
       WHERE file_path = $1`,
      [filePath]
    );

    if (!result || result.length === 0) {
      return null;
    }

    const row = result[0];
    const sessionId = row.id;

    // Try to load from normalized tables first
    const [normalizedBookmarks, normalizedTabsResult, normalizedHistory] = await Promise.all([
      loadNormalizedBookmarks(db, sessionId),
      loadNormalizedTabs(db, sessionId),
      loadNormalizedPageHistory(db, sessionId),
    ]);

    // Use normalized data if available, otherwise fall back to JSON
    const bookmarks = normalizedBookmarks.length > 0
      ? normalizedBookmarks
      : (row.bookmarks ? JSON.parse(row.bookmarks) : []);

    const tabs = normalizedTabsResult.tabs.length > 0
      ? normalizedTabsResult.tabs
      : (row.tabs ? JSON.parse(row.tabs) : []);

    const activeTabIndex = normalizedTabsResult.tabs.length > 0
      ? normalizedTabsResult.activeTabIndex
      : (row.active_tab_index ?? null);

    const pageHistory = normalizedHistory.length > 0
      ? normalizedHistory
      : (row.page_history ? JSON.parse(row.page_history) : undefined);

    // Windows still use JSON (complex structure, not frequently queried)
    const windows = row.windows ? JSON.parse(row.windows) : [];

    return {
      name: row.name,
      lastOpened: row.last_opened,
      page: row.current_page,
      zoom: row.zoom,
      viewMode: row.view_mode as ViewMode,
      activeTabIndex,
      tabs,
      windows,
      bookmarks,
      pageHistory,
      historyIndex: row.history_index ?? undefined,
    };
  } catch (error) {
    console.error('Failed to load session state:', error);
    return null;
  }
}

// Get last opened PDF path
export function getLastOpenedPath(): string | null {
  return localStorage.getItem(LAST_OPENED_KEY);
}

// Cleanup old sessions (keep only 50 most recent)
async function cleanupOldSessions(): Promise<void> {
  try {
    const db = await getDb();
    const MAX_STORED_PDFS = 50;

    // Delete sessions older than the 50th most recent
    await db.execute(
      `DELETE FROM sessions
       WHERE id NOT IN (
         SELECT id FROM sessions
         ORDER BY last_opened DESC
         LIMIT $1
       )`,
      [MAX_STORED_PDFS]
    );
  } catch (error) {
    console.error('Failed to cleanup old sessions:', error);
  }
}

// Create default session state
export function createDefaultState(): PdfSessionState {
  return {
    lastOpened: Date.now(),
    page: 1,
    zoom: 1.0,
    viewMode: 'single',
    activeTabIndex: null,
    tabs: [],
    windows: [],
    bookmarks: [],
  };
}

// Delete session for a PDF
export async function deleteSession(filePath: string): Promise<void> {
  try {
    const db = await getDb();
    await db.execute('DELETE FROM sessions WHERE file_path = $1', [filePath]);
  } catch (error) {
    console.error('Failed to delete session:', error);
  }
}

// Get all sessions (for debugging or admin UI)
export async function getAllSessions(): Promise<PdfSessionState[]> {
  try {
    const db = await getDb();
    const result = await db.select<Array<{
      file_path: string;
      name: string;
      current_page: number;
      zoom: number;
      view_mode: string;
      bookmarks: string | null;
      page_history: string | null;
      history_index: number | null;
      tabs: string | null;
      active_tab_index: number | null;
      windows: string | null;
      last_opened: number;
    }>>(
      `SELECT file_path, name, current_page, zoom, view_mode,
              bookmarks, page_history, history_index, tabs, active_tab_index,
              windows, last_opened
       FROM sessions
       ORDER BY last_opened DESC`
    );

    return result.map((row: {
      file_path: string;
      name: string;
      current_page: number;
      zoom: number;
      view_mode: string;
      bookmarks: string | null;
      page_history: string | null;
      history_index: number | null;
      tabs: string | null;
      active_tab_index: number | null;
      windows: string | null;
      last_opened: number;
    }) => ({
      filePath: row.file_path,
      name: row.name,
      lastOpened: row.last_opened,
      page: row.current_page,
      zoom: row.zoom,
      viewMode: row.view_mode as ViewMode,
      activeTabIndex: row.active_tab_index ?? null,
      tabs: row.tabs ? JSON.parse(row.tabs) : [],
      windows: row.windows ? JSON.parse(row.windows) : [],
      bookmarks: row.bookmarks ? JSON.parse(row.bookmarks) : [],
      pageHistory: row.page_history ? JSON.parse(row.page_history) : undefined,
      historyIndex: row.history_index ?? undefined,
    }));
  } catch (error) {
    console.error('Failed to get all sessions:', error);
    return [];
  }
}

// Import sessions from exported data
export async function importSessions(sessions: PdfSessionState[]): Promise<number> {
  let importCount = 0;

  for (const session of sessions) {
    try {
      // Validate session has required fields
      if (!session.filePath || !session.lastOpened || session.page === undefined) {
        console.warn('Skipping invalid session:', session);
        continue;
      }

      // Use existing saveSessionState to insert/update
      await saveSessionState(session.filePath, session);
      importCount++;
    } catch (error) {
      console.error('Failed to import session:', session.filePath, error);
    }
  }

  return importCount;
}

// Get recent files for menu
export async function getRecentFiles(limit: number = 10): Promise<Array<{
  filePath: string;
  lastOpened: number;
}>> {
  try {
    const db = await getDb();
    const result = await db.select<Array<{
      file_path: string;
      last_opened: number;
    }>>(
      `SELECT file_path, last_opened
       FROM sessions
       ORDER BY last_opened DESC
       LIMIT $1`,
      [limit]
    );

    return result.map(row => ({
      filePath: row.file_path,
      lastOpened: row.last_opened
    }));
  } catch (error) {
    console.error('Failed to get recent files:', error);
    return [];
  }
}
