import Database from '@tauri-apps/plugin-sql';
import { ViewMode } from '@/components/Settings';

// Types (matching sessionStorage.ts)
export interface TabState {
  page: number;
  label: string;
}

export interface WindowState {
  page: number;
  zoom: number;
  viewMode: ViewMode;
}

export interface BookmarkState {
  page: number;
  label: string;
  createdAt: number;
}

export interface HistoryEntry {
  page: number;
  timestamp: string;
}

export interface PdfSessionState {
  filePath?: string;
  name?: string;
  lastOpened: number;
  page: number;
  zoom: number;
  viewMode: ViewMode;
  activeTabIndex: number | null;
  tabs: TabState[];
  windows: WindowState[];
  bookmarks: BookmarkState[];
  pageHistory?: HistoryEntry[];
  historyIndex?: number;
}

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

// Simple hash function for file paths (same as sessionStorage)
function hashPath(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Save session state for a PDF
export async function saveSessionState(
  filePath: string,
  state: PdfSessionState
): Promise<void> {
  const db = await getDb();
  const pathHash = hashPath(filePath);
  const now = Date.now();
  state.lastOpened = now;

  // Get name - use provided name or extract filename from path
  const name = state.name || filePath.split('/').pop() || filePath.split('\\').pop() || 'Unknown';

  // Serialize complex fields to JSON
  const bookmarksJson = JSON.stringify(state.bookmarks);
  const pageHistoryJson = state.pageHistory ? JSON.stringify(state.pageHistory) : null;
  const tabsJson = JSON.stringify(state.tabs);
  const windowsJson = JSON.stringify(state.windows);

  // Insert or update session
  await db.execute(
    `INSERT INTO sessions (
      file_path, path_hash, name, current_page, zoom, view_mode,
      bookmarks, page_history, history_index, tabs, active_tab_index,
      windows, last_opened, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT(file_path) DO UPDATE SET
      path_hash = $2,
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
      pathHash,
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
      file_path: string;
      path_hash: string;
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
      `SELECT file_path, path_hash, name, current_page, zoom, view_mode,
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

    // Deserialize JSON fields
    const bookmarks = row.bookmarks ? JSON.parse(row.bookmarks) : [];
    const pageHistory = row.page_history ? JSON.parse(row.page_history) : undefined;
    const tabs = row.tabs ? JSON.parse(row.tabs) : [];
    const windows = row.windows ? JSON.parse(row.windows) : [];

    return {
      name: row.name,
      lastOpened: row.last_opened,
      page: row.current_page,
      zoom: row.zoom,
      viewMode: row.view_mode as ViewMode,
      activeTabIndex: row.active_tab_index ?? null,
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
