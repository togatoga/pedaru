# <img src="./app-icon.png" alt="Pedaru Icon" height="32" align="center"/> Pedaru

AI-enhanced PDF reader with Gemini translation

![Pedaru PDF Viewer](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

### 📖 PDF Viewing
- **Single & Two-Column View**: Switch between single page and two-column (spread) view modes with `Cmd+\` / `Ctrl+\`
- **Manual Zoom**: Zoom in/out with 25% increments (keyboard shortcuts or UI controls)
- **Smooth Navigation**: Navigate pages with keyboard arrows, page input, or scroll
- **Hide Header**: Toggle header visibility with `Cmd+H` / `Ctrl+H` for distraction-free reading

### 🗂️ Tab Management
- **Multiple Tabs**: Open multiple pages in separate tabs
- **Tab Navigation**: Switch between tabs with `Cmd+[` / `Cmd+]` (macOS) or `Ctrl+[` / `Ctrl+]` (Windows/Linux)
- **Tab Sync**: Tab page numbers update when navigating
- **Close Tabs**: Use `Cmd+W` (macOS) / `Ctrl+W` (Windows/Linux) to close current tab

### 🪟 Standalone Windows
- **Drag & Drop**: Drag a page to open it in a standalone window
- **New Window**: Open current page in standalone window with `Cmd+N` / `Ctrl+N`
- **Window Sync**: Standalone windows sync with main viewer page changes
- **Chapter Display**: Windows show current chapter from TOC
- **Window Sidebar**: Manage all open windows from sidebar

### 📑 Table of Contents
- **TOC Sidebar**: View and navigate document structure
- **Chapter Navigation**: Click TOC items to jump to sections

### 🔍 Search
- **Full-Text Search**: Search across all pages with `Cmd+F` / `Ctrl+F`
- **Non-Blocking**: Search runs in background without freezing UI
- **Result Navigation**: Use `↑`/`↓` to preview results, `Enter` to confirm
- **Highlight Matches**: Search terms highlighted in document

### 📜 Navigation History
- **Back/Forward**: Navigate through page history with `Ctrl+,` / `Ctrl+.`
- **History Sidebar**: View and jump to previous pages

### 🔗 PDF Links
- **Internal Links**: Click TOC/index links to navigate within document
- **External Links**: URLs open in system web browser

### 💾 Session Persistence
- **SQLite Database**: All session data stored in local SQLite database
- **Auto-Save**: Page position, zoom, bookmarks, tabs, and windows saved automatically
- **Cross-Session**: Resume exactly where you left off when reopening PDFs
- **Open Recent**: Quick access to recently opened PDFs from File → Open Recent menu

### 🔖 Bookmarks
- **Add Bookmarks**: Use `Cmd+B` (macOS) / `Ctrl+B` (Windows/Linux) to bookmark current page
- **Bookmark Sidebar**: View and manage all bookmarks
- **Cross-Window Sync**: Bookmarks sync across all windows

### 🌐 Gemini Translation
- **Text Translation**: Select text and press `Cmd+J` / `Ctrl+J` to translate
- **Auto-Explanation**: Use `Cmd+E` / `Ctrl+E` for translation with grammar explanations
- **Context-Aware**: Translation includes surrounding context for better accuracy
- **Draggable Popup**: Move translation popup anywhere on screen

### 📚 Google Drive Bookshelf
- **Cloud Sync**: Connect Google Drive folders to access your PDF library
- **Background Download**: PDFs download in background with progress tracking
- **Thumbnail Preview**: Visual bookshelf with document thumbnails

## Keyboard Shortcuts

### Navigation

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Previous Page | `←` or `PageUp` | `←` or `PageUp` |
| Next Page | `→` or `PageDown` | `→` or `PageDown` |
| First Page | `Home` | `Home` |
| Last Page | `End` | `End` |
| Navigate Back | `Ctrl + ,` | `Ctrl + ,` |
| Navigate Forward | `Ctrl + .` | `Ctrl + .` |

### Zoom

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Zoom In | `Cmd + =` | `Ctrl + =` |
| Zoom Out | `Cmd + -` | `Ctrl + -` |
| Reset Zoom | `Cmd + 0` | `Ctrl + 0` |

### Tabs & Windows

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| New Tab | `Cmd + T` | `Ctrl + T` |
| Close Tab | `Cmd + W` | `Ctrl + W` |
| Previous Tab | `Cmd + [` | `Ctrl + [` |
| Next Tab | `Cmd + ]` | `Ctrl + ]` |
| New Window | `Cmd + N` | `Ctrl + N` |

### View

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Toggle Two-Column | `Cmd + \` | `Ctrl + \` |
| Toggle Header | `Cmd + H` | `Ctrl + H` |

### Tools

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Search | `Cmd + F` | `Ctrl + F` |
| Toggle Bookmark | `Cmd + B` | `Ctrl + B` |
| Translate | `Cmd + J` | `Ctrl + J` |
| Translate with Explanation | `Cmd + E` | `Ctrl + E` |

### Search (when active)

| Action | Key |
|--------|-----|
| Preview Previous Result | `↑` |
| Preview Next Result | `↓` |
| Confirm Result | `Enter` |
| Clear Search | `Escape` |

## Tech Stack

- **Frontend**: React, Next.js, TypeScript, Tailwind CSS
- **Desktop**: Tauri 2.x (Rust)
- **PDF Rendering**: react-pdf (PDF.js)
- **Database**: SQLite (via tauri-plugin-sql)

## Development

### Prerequisites

- Node.js >= 18.17.0
- Rust >= 1.85
- Tauri CLI

### Setup

```bash
# Install dependencies
npm install

# Run development server
npm run tauri dev

# Build for production
npm run tauri build
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

## License

MIT
