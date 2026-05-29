# Chrome Web Store Listing — Markdown Clipper

> Last Updated: 2026-05-27

## Store Listing

**Extension Name**
Markdown Clipper

**Short Description**
Save web page content and selections to Markdown files with customizable YAML front matter metadata.

**Detailed Description**
Markdown Clipper is a clean, offline-first tool designed to easily capture web page articles and convert them into local Markdown files (.md), complete with structured YAML front matter metadata. Perfect for developers, researchers, and writers who build personal knowledge bases in Obsidian, Logseq, Notion, or Hugo.

Key Features:
- Complete Offline Parsing: All HTML-to-Markdown conversions happen entirely on your machine.
- Interactive Preview: See the exact Markdown and front matter structure update in real-time as you type.
- Clean DOM Mode: Automatically strip distracting headers, footers, sidebars, and navigation links.
- Selection Support: Highlight a paragraph or section to clip only what matters.
- Custom YAML Templates: Define and edit your own YAML schema placeholders right from the settings tab.
- Multiple Filename Patterns: Format downloaded files by Title, Date, Domain, or combinations.

How to Use:
1. Navigate to any article or webpage.
2. Click the extension icon in your toolbar, or right-click the page and select "Clip Page to Markdown".
3. Add custom tags or modify the auto-extracted title and description in the popup.
4. Click "Download Markdown". The file will download immediately.
5. Alternatively, select text on the page, right-click, and select "Clip Selection to Markdown".

Privacy & Local Safety:
Your data is yours. This extension operates 100% locally in your browser. It does not send any page content, URLs, metadata, or user inputs to external servers.

Support & Feedback:
Please report bugs or suggest enhancements on our GitHub Issues page.

**Category**
Developer Tools

**Single Purpose**
Saves web page content and user selections as formatted Markdown files with customizable front matter.

**Primary Language**
English


## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 | 1280×800 | ⬜ Not created | |
| Screenshot 2 | 1280×800 | ⬜ Not created | |


## Permissions Justification

Every permission in `manifest.json` is strictly required to facilitate the local capture and download of webpage content:

| Permission | Type | Justification |
|------------|------|---------------|
| `activeTab` | permissions | Required to temporarily access the active webpage to retrieve the title, URL, description, and DOM contents when the user initiates a clip. |
| `scripting` | permissions | Required to run the extraction script in the active tab context to read page metadata and select body HTML. |
| `storage` | permissions | Required to save user preferences, including the custom YAML front matter template and filename formats. |
| `downloads` | permissions | Required to initiate the download of the generated `.md` file onto the user's local disk. |
| `contextMenus` | permissions | Required to add "Clip Page" and "Clip Selection" items to the right-click menu. |
| `notifications` | permissions | Required to display a success notification when clipping via context menu in the background service worker. |
| `tabs` | permissions | Required to read sensitive tab properties (specifically URL and title) to populate metadata schemas and structure download names. |


## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

*This extension performs all operations entirely on the user's device and does not collect, store, or transmit any personally identifiable information, browsing history, or page content to any remote server.*

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes


## Privacy Policy

**Privacy Policy URL**
https://github.com/your-username/markdown-clipper/blob/main/PRIVACY.md


## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free


## Developer Info

**Publisher Name**
Your Name / Organization

**Contact Email**
your-email@example.com

**Support URL / Email**
https://github.com/your-username/markdown-clipper/issues


## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-05-27 | Initial release with full Markdown clipping, front matter settings, and context menu support. | Draft |


## Review Notes

### Known Issues / Limitations
- Cannot run on browser internal configuration pages (`chrome://*`, `edge://*`) due to security restrictions enforced by the browser.
