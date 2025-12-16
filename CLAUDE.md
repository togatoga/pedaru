# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pedaru is a cross-platform desktop PDF viewer built with Tauri 2.x and React/Next.js. It provides advanced features like tab management, standalone windows, full-text search, bookmarks, and navigation history with persistent session storage.

## Development Commands

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
cargo test --verbose             # Run Rust tests
npx tsc --noEmit                 # TypeScript type checking
cargo clippy -- -D warnings      # Rust linting
cargo fmt -- --check             # Rust formatting check
```

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

Session state is stored in localStorage with per-PDF granularity:

**Storage Keys:**
- `pedaru_last_opened_path` - Most recently opened file
- `pedaru_session_[path_hash]` - Per-PDF session containing:
  - Current page, zoom level, view mode
  - Open tabs and their states
  - Standalone windows configuration
  - Bookmarks (array of {page, timestamp})
  - Navigation history (max 100 entries)

Session saves are debounced (500ms) to avoid excessive writes. The session restoration logic is in `page.tsx` using refs to avoid circular dependencies.

### Component Structure

**Main Application Logic** - `src/app/page.tsx` (~2000 lines):
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
- `WindowSidebar.tsx` - Standalone window list
- `SearchResultsSidebar.tsx` - Full-text search results
- `CustomTextLayer.tsx` - Custom text layer for PDF.js
- `Settings.tsx` - View mode and settings panel

### PDF Processing (Rust Backend)

The Rust backend in `src-tauri/src/lib.rs` handles:

1. **Multi-encoding support** - PDFs can use various text encodings in metadata. The `decode_pdf_string()` function tries UTF-8 → UTF-16BE → Japanese encodings (Shift-JIS, EUC-JP, ISO-2022-JP).

2. **TOC Extraction** - Parses PDF outline structure recursively, resolving named destinations and explicit destinations to page numbers.

3. **Reference Resolution** - PDF objects are often referenced indirectly. The code resolves `Object::Reference(id, gen)` to actual objects using `doc.get_object()`.

When working with PDF metadata or TOC parsing, be aware of encoding issues, especially with Japanese characters.

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

Shortcuts are handled in `page.tsx` via `useEffect` listeners:

- Navigation: Arrow keys, PageUp/PageDown
- Tabs: Cmd+Shift+[ / Cmd+Shift+]
- Windows: Cmd+N (new), Cmd+W (close)
- Tools: Cmd+F (search), Cmd+B (bookmark), Ctrl+, / Ctrl+. (history)
- Zoom: Cmd/Ctrl +/- and 0

When adding new shortcuts, register them in the keyboard event handler and ensure they don't conflict with existing ones.

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

When adding new stateful features:
1. Add state to `page.tsx`
2. Pass as props to components
3. Add to session storage schema
4. Include in debounced save logic

### Logging

- **Rust:** Use `eprintln!()` for console output (appears in terminal during development)
- **Frontend:** Use `console.log()` (appears in WebView DevTools - right-click → Inspect)

### Testing File Opening

To test "Open With" or double-click behavior:
```bash
npm run tauri dev -- -- /absolute/path/to/file.pdf
```

Note: Relative paths don't work. File associations only work with built apps, not dev mode.

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
2. **test-frontend** - TypeScript checks, Next.js build
3. **build-tauri** - Matrix builds for macOS, Ubuntu, Windows

All three must pass before merge. Build artifacts are created in `src-tauri/target/release/bundle/`.

## Important Notes

- **Next.js App Router:** All components use `'use client'` directive for client-side rendering
- **Dynamic Import:** PdfViewer uses dynamic import to avoid SSR issues with pdfjs-dist
- **PDF.js Worker:** Worker file must be accessible from public directory
- **Tauri Permissions:** File system access and window creation require capabilities in `src-tauri/capabilities/default.json`
- **Japanese Character Support:** The PDF metadata decoder handles multiple Japanese encodings specifically
- **Session Restore Timing:** Session restoration uses `restoreInProgressRef` to avoid race conditions with multiple async loads
