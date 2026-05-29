# Developer Guide for AI Agents — Markdown Clipper 🤖🚀

Welcome! This document provides all the essential context, architectural diagrams, API constraints, and developer flows required to start modifying and developing **Markdown Clipper** immediately.

---

## 🎯 Project Overview
**Markdown Clipper** is a Manifest V3 Google Chrome extension tailored for personal knowledge management (PKM) tools like Obsidian, Logseq, and Notion. It captures webpage text or user selections, generates AI summaries, and writes them directly into a user-selected local directory as Markdown files containing YAML front matter metadata.

---

## 📂 Codebase Map

| File Path | Description |
| :--- | :--- |
| [manifest.json](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/manifest.json) | MV3 Extension configuration, script registers, and API permissions. |
| [content/content.js](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/content/content.js) | Content script injected into active tabs to scrape titles, URLs, metadata, and HTML selections. |
| [popup/popup.html](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/popup/popup.html) | Popup UI layout with three panels: Clip Page, Bookmarks, and Settings. |
| [popup/popup.css](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/popup/popup.css) | Custom styling implementing the glassmorphic dark-slate design system. |
| [popup/popup.js](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/popup/popup.js) | Popup controller managing UI state, tabs, IndexedDB queries, and search indexing. |
| [popup/utils.js](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/popup/utils.js) | Pure state-free utility functions (YAML escaping, filename formatting, front matter parsing). |
| [popup/utils.test.js](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/popup/utils.test.js) | Unit test suite targeting pure utility functions. |
| [background/service-worker.js](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/background/service-worker.js) | Background script handling context menus, background summarization, and direct-save fallbacks. |
| [libs/turndown.js](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/libs/turndown.js) | Local copy of Turndown library for offline HTML-to-Markdown parsing. |
| [package.json](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/package.json) | Node configurations, Vitest runner, and jsdom dependencies. |
| [vitest.config.js](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/vitest.config.js) | Vitest testing configuration. |
| [docs/](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/docs/) | Directory containing the promotional single-page website served by GitHub Pages. |
| [assets/](file:///Users/ish/.gemini/antigravity/scratch/markdown-clipper/assets/) | Web Store graphics assets (128x128 store logo and 1280x800 JPEG screenshots). |

---

## 🛠️ Core Systems & APIs

### 1. Direct Directory Saving
*   Uses the **File System Access API** (`showDirectoryPicker`) in the popup context to select directories.
*   **Handle Caching**: Stored in a custom IndexedDB database named `MarkdownClipperDB` with the object store `handles` under key `folderHandle`.
*   **Write Flow**:
    ```js
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    ```
*   **Permission Expiry**: Browsers require active user gestures to re-verify directory write permissions after browser restarts. If verification fails, the popup shows a warning banner to trigger re-authentication. In the background service worker, if a write fails, the worker falls back gracefully to `chrome.downloads.download`.

### 2. AI Summarization
*   **Engine 1 (Local Chrome Prompt API)**: Interacts with the browser's built-in Gemini Nano using `LanguageModel` (or `ai.languageModel`).
*   **Engine 2 (Cloud Gemini REST API)**: Performs streaming `POST` requests to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=...`.
*   **Engine 3 (Heuristic Fallback)**: Scrapes headings (`h1`, `h2`, `h3`), meta-description tags, and lead paragraphs to build an extractive summary outline without network dependency.

### 3. Bookmarks Parser & Search Indexer
*   Scans all `.md` files in the selected directory.
*   YAML Front Matter is extracted via regex `/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/`.
*   Filters search queries in real-time across titles, tags lists, descriptions, and summary texts.

---

## 🧪 Development Workflow

### Running Unit Tests
The test runner is **Vitest** configured with the **jsdom** browser sandbox. 
Run unit tests with:
```bash
npm run test
```

### Building & Packaging
To build a production-ready package zip file for upload to the Chrome Web Store, exclude node modules, tests, and configurations:
```bash
zip -r markdown-clipper-release.zip . -x "node_modules/*" ".git/*" ".github/*" ".gitignore" "package.json" "package-lock.json" "vitest.config.js" "popup/utils.test.js" "README.md" "CHROMEWEBSTORE.md" "generate_icons.py"
```

### Continuous Integration (CI/CD)
The project utilizes GitHub Actions defined in `.github/workflows/release.yml`. 
*   **Pull Requests / Manual Dispatches**: Runs tests and compiles packages to verify build health (skips publishing).
*   **Releases**: Triggered by pushing tags matching `v*` (e.g. `v1.0.0`). Runs unit tests, compiles the production zip file, generates SHA-256 checksums, and uploads the zip asset to the GitHub Release.

---

## ⚠️ Important Rules & Constraints for Future Agents

1.  **Do Not Poll or Loop**: The messaging system handles reactive notifications. When launching async tasks or scripts, complete your turn without looping.
2.  **Service Worker Ephemerality**: Do not store state in global variables in `background/service-worker.js`. Use `chrome.storage.local` or `chrome.storage.session`.
3.  **Modular Popup Script**: Keep pure logic inside `popup/utils.js` (for testing compatibility) and DOM-binding elements inside `popup/popup.js`. Load `popup.js` in `popup.html` using `<script type="module" src="popup.js"></script>`.
4.  **No Alpha Channels on Listing Images**: Web Store screenshots must be exactly `1280x800` or `640x400` JPEGs or 24-bit PNGs without an alpha channel. If generating icons or screenshots, convert them to JPG using `sips` or Python's Pillow to strip the transparency layer.
5.  **Website Isolation**: Never place website files in the root folder. All promotional web assets and pages must reside strictly inside the `docs/` folder (published via GitHub Pages).
