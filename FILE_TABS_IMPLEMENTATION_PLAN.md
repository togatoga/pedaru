# File Tabs Implementation Plan

## Overview

This document outlines the plan to convert Pedaru's current page-based tab system to a file-based tab system, allowing users to open multiple PDF files in separate tabs (similar to web browsers).

## Current Architecture

### Page-Based Tabs (Current)
- **What**: Tabs show different pages of the same PDF file
- **Example**: Tab 1 (Page 5), Tab 2 (Page 20) of document.pdf
- **Storage**: Per-PDF sessions in SQLite with tabs array containing page numbers
- **Use Case**: Quick access to different sections of one document

### File-Based Tabs (Proposed)
- **What**: Tabs show different PDF files
- **Example**: Tab 1 (doc1.pdf), Tab 2 (doc2.pdf), Tab 3 (doc3.pdf)
- **Storage**: Workspace sessions containing multiple file paths
- **Use Case**: Working with multiple documents simultaneously (research, comparison, etc.)

## Why This Change?

1. **Industry Standard**: Most PDF viewers and document apps use file-based tabs
2. **Better Workflow**: Users commonly need multiple PDFs open at once
3. **Consistency**: Aligns with browser/IDE tab behavior users expect
4. **Existing Solutions**: Bookmarks and history already solve within-PDF navigation

## Implementation Approaches

### Approach A: Full State Management Refactoring

**Description**: Comprehensive rewrite to support true multi-file state management.

**Features**:
- Multiple PDFs loaded simultaneously in memory
- Each tab has complete independent state
- Instant tab switching (no reload)
- Real-time sync across tabs for same file

**Pros**:
- Best user experience
- Most feature-complete
- Future-proof architecture

**Cons**:
- Major refactoring (2000+ lines)
- High memory usage (multiple PDFs in RAM)
- Complex state management
- Long development time (2-3 weeks)

**Files Modified**: 20+ files including core state management, all hooks, all components

### Approach B: Simplified File Tabs (Recommended MVP)

**Description**: Minimal implementation reusing existing single-PDF architecture.

**Features**:
- Tabs store file paths
- Only active tab has PDF loaded
- Tab switch = save current state + load new PDF
- Reuse existing per-file session system

**Pros**:
- Minimal code changes
- Memory efficient
- Reuses proven session logic
- Quick to implement (1 week)

**Cons**:
- Tab switching requires reload (1-2 seconds)
- Can't view multiple PDFs simultaneously
- Simpler feature set

**Files Modified**: ~10 files (tab management, UI components, database)

### Approach C: Multi-Window Alternative

**Description**: Enhance existing standalone windows for multi-file support.

**Features**:
- "Open in New Window" menu option
- Each window is independent
- Multiple PDFs via multiple windows

**Pros**:
- Almost no code changes
- Already partially implemented
- OS-native window management

**Cons**:
- Not "tabs" (different UX)
- Doesn't match user expectations
- Less integrated experience

**Files Modified**: ~3 files (menu, window management)

## Recommended Implementation: Approach B (MVP)

### Phase 1: Type System ✅ (COMPLETE)

Files: `src/types/index.ts`

Added types:
```typescript
// File tab state for persistence
interface FileTabState {
  filePath: string;
  fileName: string;
  page: number;
  zoom: number;
  viewMode: ViewMode;
  bookmarks: Bookmark[];
  pageHistory: HistoryEntry[];
  historyIndex: number;
}

// Runtime file tab
interface FileTab extends FileTabState {
  id: number;
  fileData: Uint8Array | null;
  pdfInfo: PdfInfo | null;
  isLoading: boolean;
}

// Workspace for multiple files
interface WorkspaceState {
  lastOpened: number;
  activeTabIndex: number;
  tabs: FileTabState[];
}
```

### Phase 2: Tab Management Logic

Files: `src/hooks/useTabManagement.ts`, `src/hooks/useFileTabManagement.ts` (new)

Changes:
1. Create `useFileTabManagement` hook
2. Store file paths in tabs instead of page numbers
3. Tab switching calls `loadPdfFromPath(tab.filePath)`
4. Save current PDF state before switching

New hook API:
```typescript
const {
  tabs,           // FileTab[]
  activeTab,      // FileTab | null
  addFileTab,     // (filePath: string) => void
  closeTab,       // (tabId: number) => void
  switchToTab,    // (tabId: number) => void
} = useFileTabManagement(...);
```

### Phase 3: UI Updates

Files: `src/components/TabBar.tsx`, `src/components/MainWindowHeader.tsx`

Changes:
1. Display file names instead of "Page X"
2. Add close button per tab (already exists)
3. Show active file indicator
4. Truncate long file names with tooltip

Before: `Page 5` `Page 20` `Page 100`
After: `document.pdf` `slides.pdf` `manual.pdf`

### Phase 4: PDF Loading Integration

Files: `src/hooks/usePdfLoader.ts`, `src/app/page.tsx`

Changes:
1. Modify `loadPdfFromPath` to work with tab context
2. Save current tab state before loading new PDF
3. Update "Open File" to add new tab (not replace)
4. Handle tab closure with PDF cleanup

### Phase 5: Database Schema

Files: `src-tauri/src/migrations/`, `src-tauri/src/session.rs`

New table:
```sql
CREATE TABLE workspace (
  id INTEGER PRIMARY KEY,
  last_opened INTEGER NOT NULL,
  active_tab_index INTEGER NOT NULL,
  tabs TEXT NOT NULL -- JSON array of FileTabState
);
```

Migration:
- Convert existing single-file sessions to single-tab workspace
- Keep old sessions table for backward compat
- Add workspace_id foreign key

### Phase 6: Rust Backend Commands

Files: `src-tauri/src/lib.rs`, `src-tauri/src/workspace.rs` (new)

New commands:
```rust
#[tauri::command]
fn save_workspace(state: WorkspaceState) -> Result<(), String>

#[tauri::command]
fn load_workspace() -> Result<WorkspaceState, String>

#[tauri::command]
fn delete_workspace() -> Result<(), String>
```

### Phase 7: Menu Integration

Files: `src-tauri/src/menu.rs`

New menu items:
- File → Open in New Tab (Cmd+Shift+O)
- File → Close Tab (Cmd+W)
- Window → Next Tab (Cmd+])
- Window → Previous Tab (Cmd+[)

## Testing Strategy

### Unit Tests
- `useFileTabManagement`: Tab CRUD operations
- Database: Workspace save/load/migration
- Tab switching state transitions

### Integration Tests
1. Open 3 PDFs in separate tabs
2. Switch between tabs (verify state preservation)
3. Close middle tab (verify active tab handling)
4. Restart app (verify workspace restoration)

### Manual Testing
1. Open multiple PDFs via File → Open
2. Test keyboard shortcuts (Cmd+1-9)
3. Close tabs with Cmd+W
4. Verify session persistence across restarts
5. Test with large PDFs (memory usage)

## Migration Strategy

### Backward Compatibility

1. **Session Format**:
   - Keep old `sessions` table for single-file sessions
   - Add new `workspace` table for multi-file
   - Auto-migrate on first run

2. **User Data**:
   - Existing bookmarks preserved per file
   - History maintained per file
   - Settings unchanged

3. **Feature Flags** (Optional):
   - `ENABLE_FILE_TABS` environment variable
   - Gradual rollout to users
   - Fallback to old behavior if issues

## Performance Considerations

### Memory Usage
- Current: One PDF in memory (~10-50 MB)
- New (MVP): One PDF in memory (~10-50 MB) ✅
- Approach A: Multiple PDFs in memory (~50-200 MB) ⚠️

### Tab Switching Performance
- Save current state: <10ms
- Unload PDF bytes: <50ms
- Load new PDF: 100-500ms (depends on file size)
- Total: 200-600ms (acceptable UX)

### Optimizations
- Lazy load tab metadata (only when needed)
- Cache recently used PDFs (optional enhancement)
- Preload adjacent tabs (optional enhancement)

## User Experience

### Expected Workflows

**Research Mode**:
1. Open 5 research papers in tabs
2. Quickly switch between papers (Cmd+1-5)
3. Add bookmarks across papers
4. Compare content side-by-side (use standalone windows)

**Reference Mode**:
1. Main document in Tab 1
2. Reference manual in Tab 2
3. Style guide in Tab 3
4. Cmd+] to cycle through

**Comparison Mode**:
1. Document v1 in Tab 1
2. Document v2 in Tab 2
3. Drag Tab 2 out to standalone window
4. View side-by-side

## Known Limitations (MVP)

1. **Tab Switch Delay**: 200-600ms reload time (vs instant in Approach A)
2. **No Multi-PDF View**: Can't see multiple PDFs in tabs simultaneously (use standalone windows)
3. **Memory Per Tab**: Only active tab loaded (can't preload)
4. **No Tab Synchronization**: Same PDF in multiple tabs = independent states

## Future Enhancements

After MVP:
1. **Tab Preloading**: Load adjacent tabs in background
2. **PDF Caching**: Keep recently used PDFs in memory
3. **Tab Groups**: Organize related PDFs
4. **Split View**: View two tabs side-by-side
5. **Tab Search**: Quick find across open tabs
6. **Saved Workspaces**: Name and restore tab collections

## Dependencies

### External Libraries
- None (uses existing Tauri, React, PDF.js)

### Breaking Changes
- Legacy page-based tabs deprecated
- Session format changes (with migration)

## Rollback Plan

If major issues occur:
1. Disable file tabs via feature flag
2. Fall back to single-file mode
3. Keep workspace data for future fix
4. User data never lost (backward compat maintained)

## Success Criteria

MVP is successful if:
- ✅ Users can open multiple PDFs in tabs
- ✅ Tab switching preserves all state (page, zoom, bookmarks)
- ✅ Session persistence works across restarts
- ✅ No memory leaks with 10+ tabs
- ✅ Tab switching feels responsive (<1 second)
- ✅ All existing features still work
- ✅ No data loss during migration

## Timeline Estimate

Based on MVP approach:

- Phase 1: Types ✅ (COMPLETE)
- Phase 2: Tab Management (2 days)
- Phase 3: UI Updates (1 day)
- Phase 4: PDF Loading (2 days)
- Phase 5: Database (1 day)
- Phase 6: Rust Backend (1 day)
- Phase 7: Menu Integration (0.5 days)
- Testing & Polish (1.5 days)

**Total: ~9 working days (~2 weeks with buffer)**

## Next Steps

1. Review this plan with stakeholders
2. Confirm MVP approach is acceptable
3. Begin Phase 2 implementation
4. Create draft PR for early feedback
5. Iterate based on testing

---

*Document created during issue analysis for "Support PDF/File Tabs"*
*Last updated: 2026-01-10*
