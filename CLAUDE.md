# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pedaru is a cross-platform desktop PDF viewer built with Tauri 2.x and React/Next.js. It provides advanced features like tab management, standalone windows, full-text search, bookmarks, and navigation history with persistent session storage.

## Development Commands

### Prerequisites

- Node.js >= 18.17.0
- Rust >= 1.85
- Tauri CLI

### Setup

```bash
# Development
npm install                      # Install dependencies
npm run tauri dev                # Run app with hot reload
npm run tauri dev -- -- /path    # Open specific PDF file

# Build
npm run build                    # Build Next.js frontend
npm run tauri build              # Create platform bundles (.dmg, .deb, .msi)
npm run tauri build -- --debug   # Build with debug symbols

# Testing
cargo test --verbose             # Run Rust tests (in src-tauri/)
npm test                         # Run frontend unit tests (Vitest)
npm run test:ui                  # Run tests with Vitest UI
npm run test:coverage            # Run tests with coverage report
npm run typecheck                # TypeScript type checking
cargo clippy -- -D warnings      # Rust linting (in src-tauri/)
cargo fmt -- --check             # Rust formatting check (in src-tauri/)

# Linting & Formatting (Frontend)
npm run lint                     # Run Biome linter
npm run lint:fix                 # Run Biome linter with auto-fix
npm run format                   # Format code with Biome/Prettier
npm run format:check             # Check formatting without changes
```

### Debugging

#### Testing PDF File Opening

To test opening a PDF file via command line (simulating double-click behavior):

```bash
# Use absolute path (relative paths won't work)
npm run tauri dev -- -- /absolute/path/to/file.pdf

# Example
npm run tauri dev -- -- /Users/username/Documents/sample.pdf
```

To test without opening a PDF (restores last opened file):

```bash
npm run tauri dev
```

#### Viewing Logs

**Development mode (`npm run tauri dev`):**
- Rust logs (`eprintln!`) appear in the terminal
- Frontend logs (`console.log`) appear in the WebView DevTools (right-click → Inspect Element)

**Production build:**

```bash
# Build with debug symbols
npm run tauri build -- --debug

# Run the app and view logs in Console.app (macOS)
# Filter by "Pedaru" to see app-specific logs
open /Applications/Utilities/Console.app
```

Or run the built app from terminal to see logs:

```bash
# After building
./src-tauri/target/release/bundle/macos/Pedaru.app/Contents/MacOS/Pedaru
```

#### Testing File Associations (macOS)

File associations only work with the built app:

```bash
# Build the app
npm run tauri build

# The app is created at:
# src-tauri/target/release/bundle/macos/Pedaru.app

# Test by:
# 1. Right-click a PDF in Finder → Open With → Pedaru
# 2. Or drag a PDF onto Pedaru.app icon
# 3. Or double-click a PDF after setting Pedaru as default PDF app
```

**Test Framework:**
- Frontend tests use Vitest with jsdom environment
- Test files are colocated next to source files: `src/lib/*.test.ts` and `src/hooks/*.test.ts`
- Coverage includes all files in `src/lib/` and `src/hooks/`

## Architecture

### Frontend-Backend Communication

The app uses Tauri's IPC system for frontend-backend communication:

**Rust Commands (src-tauri/src/lib.rs):**
- `get_pdf_info(path)` - Extracts metadata, TOC, author info with multi-encoding support (UTF-8, UTF-16BE, Shift-JIS, EUC-JP, ISO-2022-JP)
- `read_pdf_file(path)` - Returns raw PDF bytes for rendering
- `get_opened_file()` - Retrieves CLI-provided or "Open With" file path
- `was_opened_via_event()` - Checks if app was launched by opening a file

**Frontend Invocation (TypeScript):**
```typescript
import { invoke } from '@tauri-apps/api/core';
const pdfInfo = await invoke<PdfInfo>('get_pdf_info', { path });
```

### Multi-Window Architecture

The app supports two window types:

1. **Main Window** - Primary viewer with tabs, sidebars, search, and full controls
2. **Standalone Windows** - Independent page viewers (like macOS Preview)

**Window Coordination** via Tauri events:
- `window-page-changed` - Notifies when a window navigates to a different page
- `window-state-changed` - Syncs zoom level and view mode changes
- `bookmark-sync` - Synchronizes bookmarks across all windows
- `move-window-to-tab` - Converts standalone window back to tab in main window

When editing multi-window features, ensure events are emitted and handled properly in both main and standalone windows.

### Session Persistence

Session state is stored in SQLite database with per-PDF granularity:

**Database Location:**
- macOS: `~/Library/Application Support/pedaru/pedaru.db`
- Linux: `~/.config/pedaru/pedaru.db`
- Windows: `C:\Users\<username>\AppData\Roaming\pedaru\pedaru.db`

**Database Schema:**
- `sessions` table - Per-PDF session data:
  - Current page, zoom level, view mode
  - Open tabs and their states (JSON)
  - Standalone windows configuration (JSON)
  - Bookmarks (JSON array of {page, label, timestamp})
  - Navigation history (JSON array, max 100 entries)
  - File path and path hash for quick lookup
  - Timestamps (created_at, updated_at, last_opened)

**Additional Storage:**
- `pedaru_last_opened_path` in localStorage - Quick access to most recently opened file

Session saves are debounced (500ms) to avoid excessive database writes. The session restoration logic is in `page.tsx` using refs to avoid circular dependencies.

**IMPORTANT: Database operations must be implemented in Rust, not in the frontend.**
- All DB operations are exposed as Tauri commands (`save_session`, `load_session`, `delete_session`, `get_recent_files`)
- Frontend uses `invoke()` to call these commands - see `src/lib/database.ts`
- Rust backend uses `rusqlite` directly - see `src-tauri/src/session.rs` and `src-tauri/src/db.rs`
- Migrations are managed by `tauri-plugin-sql` (Rust side only, no frontend access)
- Frontend does NOT have SQL capabilities - `sql:*` permissions are removed from capabilities

### Component Structure

**Main Application Logic** - `src/app/page.tsx` (~700 lines):
- All state management (page, zoom, bookmarks, history, tabs, windows)
- Event handlers for keyboard shortcuts and menu events
- Session persistence with auto-save
- Window lifecycle management

**UI Components** - `src/components/`:
- `Header.tsx` - Navigation bar with all controls
- `PdfViewer.tsx` - PDF rendering using react-pdf
- `TocSidebar.tsx` - Table of contents navigation
- `HistorySidebar.tsx` - Page history list
- `BookmarkSidebar.tsx` - Bookmark management
- `BookshelfSidebar.tsx` - Google Drive bookshelf
- `WindowSidebar.tsx` - Standalone window list
- `SearchResultsSidebar.tsx` - Full-text search results
- `MainSidebar.tsx` - Main sidebar container with resize
- `MainWindowHeader.tsx` - Header and tab bar combination
- `ViewerContent.tsx` - PDF viewer and bookshelf content
- `OverlayContainer.tsx` - Popups, modals, and context menus
- `CustomTextLayer.tsx` - Custom text layer for PDF.js
- `TranslationPopup.tsx` - Gemini translation popup
- `Settings.tsx` - View mode and Gemini settings panel

**Custom Hooks** - `src/hooks/`:
- `useBookmarks.ts` - Bookmark CRUD operations and cross-window sync
- `useNavigation.ts` - Page navigation and history management
- `useSearch.ts` - Full-text search with incremental results
- `useTabManagement.ts` - Tab creation, deletion, and switching
- `useWindowManagement.ts` - Standalone window lifecycle management
- `usePdfLoader.ts` - PDF loading and session restoration logic
- `useKeyboardShortcuts.ts` - Centralized keyboard shortcut handling
- `useTextSelection.ts` - PDF text selection for translation (Cmd+J trigger)
- `useBookshelf.ts` - Google Drive bookshelf management
- `useGoogleAuth.ts` - Google OAuth authentication flow
- `types.ts` - Shared TypeScript types for hooks

**Utility Libraries** - `src/lib/`:
- `database.ts` - SQLite-based session persistence (wrapper for Rust backend via Tauri commands)
- `pdfUtils.ts` - PDF-specific utilities (chapter extraction, etc.)
- `formatUtils.ts` - Label and title formatting utilities
- `tabManager.ts` - Tab state management utilities
- `settings.ts` - Gemini API settings management

**Type Definitions** - `src/types/`:
- `index.ts` - Core types (ViewMode, Bookmark, Tab, etc.)
- `components.ts` - Component Props interfaces (17 interfaces)
- `pdf.ts` - PDF-related types (PdfInfo, TocEntry)

### PDF Processing (Rust Backend)

The Rust backend in `src-tauri/src/lib.rs` handles:

1. **Multi-encoding support** - PDFs can use various text encodings in metadata. The `decode_pdf_string()` function tries UTF-8 → UTF-16BE → Japanese encodings (Shift-JIS, EUC-JP, ISO-2022-JP).

2. **TOC Extraction** - Parses PDF outline structure recursively, resolving named destinations and explicit destinations to page numbers.

3. **Reference Resolution** - PDF objects are often referenced indirectly. The code resolves `Object::Reference(id, gen)` to actual objects using `doc.get_object()`.

When working with PDF metadata or TOC parsing, be aware of encoding issues, especially with Japanese characters.

### Database Structure (Rust Backend)

The SQLite database is initialized in `src-tauri/src/lib.rs` using `tauri-plugin-sql` for migrations only.
**Frontend does NOT have direct database access** - all operations go through Tauri commands.

**Schema Definition:**
- `src-tauri/src/db_schema.rs` - Migration loader using `include_str!`
- `src-tauri/src/migrations/001_initial_schema.sql` - Consolidated initial schema

**Session Operations (`src-tauri/src/session.rs`):**
- `save_session()` - Save session state (exposed as Tauri command)
- `load_session()` - Load session state (exposed as Tauri command)
- `delete_session()` - Delete session (exposed as Tauri command)
- `get_recent_files()` - Get recent files list (exposed as Tauri command)

**Tables:**
- `sessions` - Per-PDF session state (page, zoom, view mode, etc.)
- `session_bookmarks` - Normalized bookmarks (FK to sessions)
- `session_tabs` - Normalized tabs (FK to sessions)
- `session_page_history` - Normalized page history (FK to sessions)
- `settings` - Application configuration (key-value store)
- `drive_folders` - Google Drive folder configuration
- `bookshelf_cloud` - PDFs from Google Drive
- `bookshelf_local` - Locally imported PDFs

**Key Features:**
- Automatic migration on app startup via `tauri-plugin-sql`
- JSON fields for backward compatibility (tabs, windows, bookmarks in sessions)
- Indexed queries on file_path for fast lookups
- LRU cleanup keeps only 50 most recent sessions

**Database Operations:**
All database operations are performed through Tauri commands implemented in Rust. The frontend calls `invoke()` with command names like `save_session`, `load_session`, etc. See `src/lib/database.ts` for the frontend wrapper and `src-tauri/src/session.rs` for the Rust implementation.

### Open Recent Files

Users can quickly reopen recently accessed PDFs via the menu bar:

**Menu Location:** File → Open Recent

**Implementation:**
- Recent files are loaded from the SQLite database (`sessions` table) based on `last_opened` timestamp
- Menu is built dynamically at app startup from the database (up to 10 most recent files)
- Each menu item's ID contains the base64-encoded file path: `open-recent-{base64(file_path)}`
- When clicked, the file path is decoded from the menu ID and sent directly to the frontend
- Frontend receives the file path and loads the PDF via `loadPdfFromPath()`
- If the selected file is already open, the frontend skips reloading to avoid unnecessary work

**Key Design Decision:**
The menu item ID includes the base64-encoded file path rather than an index. This ensures stability even if the database is updated after the menu is created.

**Automatic Updates:**
Recent files list is automatically updated whenever a PDF session is saved (via `saveSessionState()` in `database.ts`). The `last_opened` timestamp is updated on every session save, keeping the list current without explicit "recent files" management.

**Code Locations:**
- Menu creation: `src-tauri/src/lib.rs` (`load_recent_files()` function, menu setup in `run()`)
- Menu click handler: `src-tauri/src/lib.rs` (menu event handling)
- Frontend handler: `src/app/page.tsx` (`menu-open-recent-selected` event listener)
- Database queries: Uses `rusqlite` directly in Rust backend for menu creation

### Search Implementation

Full-text search in `page.tsx` uses `requestIdleCallback` for non-blocking incremental search:

```typescript
// Search runs in background, updating results every 5 pages
requestIdleCallback(() => {
  // Process pages in chunks
  // Update results incrementally
});
```

Search can be cancelled by updating `searchIdRef.current`. Results include page context (surrounding text) and support navigation to found pages.

### Keyboard Shortcuts

All shortcuts are handled in `page.tsx` via `useEffect` listeners. macOS uses Cmd, Windows/Linux use Ctrl:

**Navigation:**
- `←` / `PageUp` - Previous page
- `→` / `PageDown` - Next page
- `Home` - First page (main window only)
- `End` - Last page (main window only)

**Tabs:**
- `Cmd/Ctrl+T` - New tab from current page
- `Cmd/Ctrl+W` - Close current tab
- `Cmd/Ctrl+[` - Previous tab (wraps around)
- `Cmd/Ctrl+]` - Next tab (wraps around)

**Windows:**
- `Cmd/Ctrl+N` - Open standalone window (main window only)

**Zoom:**
- `Cmd/Ctrl++` or `Cmd/Ctrl+=` - Zoom in
- `Cmd/Ctrl+-` - Zoom out
- `Cmd/Ctrl+0` - Reset zoom

**View:**
- `Cmd/Ctrl+\` - Toggle two-column mode (main window only)
- `Cmd/Ctrl+Shift+H` - Toggle header visibility (main window only)

**Tools:**
- `Cmd/Ctrl+F` - Focus search
- `Cmd/Ctrl+B` - Toggle bookmark
- `Cmd/Ctrl+J` - Translate selected text (opens translation popup)
- `Cmd/Ctrl+E` - Translate with auto-explanation
- `Ctrl+,` - Navigate back in history
- `Ctrl+.` - Navigate forward in history

**Search:**
- `↑` - Preview previous search result (when search active, does not add to history)
- `↓` - Preview next search result (when search active, does not add to history)
- `Enter` - Confirm current search result and add to history
- `Escape` - Clear search and close results

When adding new shortcuts, register them in the keyboard event handler and ensure they don't conflict with existing ones.

### Gemini Translation Feature

The app integrates with Google's Gemini API for PDF text translation:

**Architecture:**
- `src-tauri/src/gemini.rs` - Rust backend for Gemini API calls with JSON output mode
- `src-tauri/src/settings.rs` - Settings storage (API key, model selection)
- `src/lib/settings.ts` - Frontend settings API
- `src/hooks/useTextSelection.ts` - Text selection detection and context extraction
- `src/components/TranslationPopup.tsx` - Translation UI with collapsible sections

**Translation Flow:**
1. User selects text in PDF and presses `Cmd+J` (or `Cmd+E` for auto-explanation)
2. `useTextSelection` extracts selected text and surrounding context from adjacent pages
3. Frontend calls `translate_with_gemini` Tauri command
4. Backend sends prompt to Gemini API with `response_mime_type: "application/json"`
5. Response is parsed into `TranslationResponse { translation, points }`
6. `TranslationPopup` displays results with ReactMarkdown rendering

**Prompt Behavior:**
- Single words/phrases: Returns word meaning + original sentence with `***highlighted***` word + translated sentence
- Full sentences: Returns translation + grammar/structure points

**Model Configuration:**
- Separate models for translation and explanation (can use faster model for translation, smarter for explanation)
- Settings stored in SQLite `settings` table

### Google Drive Bookshelf

The bookshelf feature syncs PDFs from Google Drive folders:

**Backend Modules:**
- `src-tauri/src/oauth.rs` - OAuth 2.0 flow with PKCE
- `src-tauri/src/google_drive.rs` - Google Drive API client
- `src-tauri/src/bookshelf.rs` - Bookshelf database and download management

**Frontend:**
- `src/hooks/useGoogleAuth.ts` - Authentication state management
- `src/hooks/useBookshelf.ts` - Bookshelf items and sync operations
- `src/components/BookshelfSidebar.tsx` - Bookshelf UI

**Key Features:**
- OAuth authentication with device code flow
- Folder selection and sync tracking
- Background PDF downloads with progress events
- Download cancellation support via `AtomicBool` flags
- Thumbnail generation for bookshelf items

## Code Patterns

### Error Handling

**Rust:** Use `Result<T, String>` for Tauri commands. Convert errors to strings for JSON serialization:
```rust
#[tauri::command]
fn my_command() -> Result<Data, String> {
    do_something().map_err(|e| e.to_string())
}
```

**TypeScript:** Wrap Tauri invokes in try-catch and show user-friendly error messages.

### State Management

All application state lives in `page.tsx` using React hooks. State is lifted to the top level rather than distributed across components to simplify session serialization.

**Architecture Pattern:**
- State is defined in `page.tsx` with `useState`
- Business logic is encapsulated in custom hooks (`src/hooks/`)
- Custom hooks receive state and setters, return computed values and handlers
- Components remain presentational, receiving props from `page.tsx`

When adding new stateful features:
1. Add state to `page.tsx`
2. Create or update a custom hook in `src/hooks/` for business logic
3. Pass as props to presentational components
4. Add to session persistence in `src/lib/database.ts`
5. Include in debounced save logic in `page.tsx`

## Platform-Specific Considerations

### macOS
- File associations configured in `src-tauri/tauri.conf.json` (Info.plist CFBundleDocumentTypes)
- `RunEvent::Opened` handles "Open With" and drag-drop onto dock icon
- Keyboard shortcuts use Cmd modifier

### Windows/Linux
- Keyboard shortcuts use Ctrl modifier
- File associations configured in Tauri bundle settings

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs:
1. **test-rust** - Cargo tests, clippy, rustfmt
2. **test-frontend** - TypeScript checks, Vitest tests, Next.js build

Both must pass before merge. Build artifacts are created locally via `npm run tauri build`.

## Important Notes

- **Next.js App Router:** All components use `'use client'` directive for client-side rendering
- **Dynamic Import:** PdfViewer uses dynamic import to avoid SSR issues with pdfjs-dist
- **PDF.js Worker:** Worker file must be accessible from public directory
- **Tauri Permissions:** File system access and window creation require capabilities in `src-tauri/capabilities/default.json`
- **Japanese Character Support:** The PDF metadata decoder handles multiple Japanese encodings specifically
- **Session Restore Timing:** Session restoration uses `restoreInProgressRef` to avoid race conditions with multiple async loads

## Development Guidelines

### Dependency Versions

When adding or updating dependencies, always use the latest stable version:

- **Check latest versions** before adding new dependencies (crates.io for Rust, npmjs.com for Node.js)
- **Specify minor version** at minimum (e.g., `"1.8"` not `"1"`) to ensure reproducible builds
- **Avoid outdated versions** - if a major version exists (e.g., v2.x), don't use v1.x unless there's a specific reason

### Secure String Handling

Sensitive data (API keys, tokens, secrets) must use `SecureString` type (`src-tauri/src/secure_string.rs`):

- `SecureString` hides values in `Debug`/`Display` output (shows `SecureString(****)`)
- Use `.expose()` only when the actual value is needed (e.g., sending to an API)
- Memory is zeroed on drop via `zeroize` crate

```rust
// Good: Value hidden in logs
eprintln!("{:?}", settings);  // GeminiSettings { api_key: SecureString(****), ... }

// When you need the actual value
let key = settings.api_key.expose();
```
