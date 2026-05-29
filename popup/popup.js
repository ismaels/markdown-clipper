// Main Popup Controller
import { escapeYamlString, formatFilename, parseBookmarkContent } from './utils.js';

// Store page metadata retrieved from content script
let pageData = {
  title: "",
  url: "",
  description: "",
  author: "",
  tags: [],
  selectionHtml: "",
  rawHtml: "",
  cleanedHtml: "",
  date: ""
};

// Default Settings
const DEFAULT_SETTINGS = {
  filenameFormat: "title-date",
  yamlTemplate: `---\ntitle: "{title}"\nurl: "{url}"\ndate: "{date}"\nauthor: "{author}"\ndescription: "{description}"\ntags:\n{tags}\n---`,
  summaryEngine: "local",
  geminiApiKey: "",
  summaryPrompt: "Summarize this web page content in 3-5 concise bullet points focusing on the key arguments and facts. Do not include markdown code blocks.",
  saveDirectly: true,
  fields: {
    title: true,
    url: true,
    date: true,
    description: true,
    author: true,
    tags: true
  }
};

// DOM Elements
const elements = {
  // Tabs
  tabClip: document.getElementById("tab-clip"),
  tabSearch: document.getElementById("tab-search"),
  tabSettings: document.getElementById("tab-settings"),
  tabBtns: document.querySelectorAll(".tab-btn"),
  tabIndicator: document.querySelector(".tab-indicator"),
  
  // Forms & Inputs
  clipTitle: document.getElementById("clip-title"),
  clipTags: document.getElementById("clip-tags"),
  clipMode: document.getElementById("clip-mode"),
  optionSelection: document.getElementById("option-selection"),
  clipDescription: document.getElementById("clip-description"),
  toggleClean: document.getElementById("toggle-clean"),
  
  // Preview
  previewToggle: document.getElementById("preview-toggle"),
  previewPanel: document.getElementById("preview-panel"),
  previewAccordion: document.querySelector(".preview-accordion"),
  markdownPreview: document.getElementById("markdown-preview"),
  
  // Settings Tab Inputs
  settingFilename: document.getElementById("setting-filename"),
  settingTemplate: document.getElementById("setting-template"),
  settingProvider: document.getElementById("setting-provider"),
  settingApiKey: document.getElementById("setting-api-key"),
  settingPrompt: document.getElementById("setting-prompt"),
  apiKeyContainer: document.getElementById("api-key-container"),
  fieldTitle: document.getElementById("field-title"),
  fieldUrl: document.getElementById("field-url"),
  fieldDate: document.getElementById("field-date"),
  fieldDescription: document.getElementById("field-description"),
  fieldAuthor: document.getElementById("field-author"),
  fieldTags: document.getElementById("field-tags"),
  folderPathText: document.getElementById("folder-path-text"),
  btnSelectFolder: document.getElementById("btn-select-folder"),
  toggleDirectSave: document.getElementById("toggle-direct-save"),
  
  // Search Elements
  searchInput: document.getElementById("search-input"),
  btnClearSearch: document.getElementById("btn-clear-search"),
  btnSyncFolder: document.getElementById("btn-sync-folder"),
  searchFolderWarning: document.getElementById("search-folder-warning"),
  folderPermissionCard: document.getElementById("folder-permission-card"),
  btnGrantPermission: document.getElementById("btn-grant-permission"),
  searchResults: document.getElementById("search-results"),
  
  // Status Elements
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("summary-status-text"),
  btnRegenerate: document.getElementById("btn-regenerate"),
  
  // Actions
  btnDownload: document.getElementById("btn-download"),
  btnReset: document.getElementById("btn-reset"),
  btnSaveSettings: document.getElementById("btn-save-settings"),
  
  // Toast
  toast: document.getElementById("toast-notification"),
  toastMessage: document.getElementById("toast-message"),
  connectionWarning: document.getElementById("connection-warning")
};

// State Variables
let currentSettings = { ...DEFAULT_SETTINGS };
let isPreviewOpen = false;
let summaryText = ""; // Cache generated summary text
let summaryAbortController = null;

// Search & Directory State
let bookmarkFiles = []; // Array of parsed bookmarks from directory
let selectedFolderHandle = null;
let folderPermissionState = "none"; // "none" | "prompt" | "granted"


// Initialize Popup
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Setup Tab Clicking
  setupTabs();

  // 2. Load settings from storage
  await loadSettings();

  // Initialize Folder handle from IndexedDB
  await initializeFolder();

  // 3. Request page data by injecting content script
  await fetchPageContent();

  // 4. Register event listeners for live updates
  registerInputListeners();

  // 5. Setup preview accordion toggle
  setupAccordion();
  
  // 6. Setup reset and settings save buttons
  setupActionButtons();
});

// Setup Tab Navigation
function setupTabs() {
  elements.tabBtns.forEach((btn, idx) => {
    btn.addEventListener("click", async () => {
      // Remove active from all buttons & contents
      elements.tabBtns.forEach(b => b.classList.remove("active"));
      elements.tabClip.classList.remove("active");
      elements.tabSearch.classList.remove("active");
      elements.tabSettings.classList.remove("active");
      
      // Add active to current
      btn.classList.add("active");
      const targetId = btn.dataset.tab;
      document.getElementById(targetId).classList.add("active");
      
      // Move slide indicator
      elements.tabIndicator.style.transform = `translateX(${idx * 100}%)`;

      // Scan bookmarks if user switches to bookmarks tab and permission is granted
      if (targetId === "tab-search") {
        if (selectedFolderHandle) {
          const perm = await verifyFolderPermission(selectedFolderHandle, false);
          if (perm === "granted") {
            await scanSavedBookmarks();
          } else {
            updateFolderUI();
          }
        } else {
          updateFolderUI();
        }
      }
    });
  });
}

// Load settings from storage
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get("settings");
    if (data && data.settings) {
      currentSettings = {
        ...DEFAULT_SETTINGS,
        ...data.settings,
        fields: { ...DEFAULT_SETTINGS.fields, ...data.settings.fields }
      };
    } else {
      currentSettings = { ...DEFAULT_SETTINGS };
    }
  } catch (err) {
    console.error("Error loading settings from storage:", err);
    currentSettings = { ...DEFAULT_SETTINGS };
  }

  // Populate settings fields in UI
  elements.settingFilename.value = currentSettings.filenameFormat;
  elements.settingTemplate.value = currentSettings.yamlTemplate;
  elements.settingProvider.value = currentSettings.summaryEngine || "local";
  elements.settingApiKey.value = currentSettings.geminiApiKey || "";
  elements.settingPrompt.value = currentSettings.summaryPrompt || DEFAULT_SETTINGS.summaryPrompt;
  elements.toggleDirectSave.checked = currentSettings.saveDirectly !== false; // default true
  
  elements.fieldTitle.checked = currentSettings.fields.title;
  elements.fieldUrl.checked = currentSettings.fields.url;
  elements.fieldDate.checked = currentSettings.fields.date;
  elements.fieldDescription.checked = currentSettings.fields.description;
  elements.fieldAuthor.checked = currentSettings.fields.author;
  elements.fieldTags.checked = currentSettings.fields.tags;

  // Toggle API Key input visibility
  toggleApiKeyVisibility();
}

// Toggle Gemini API Key Visibility in Settings
function toggleApiKeyVisibility() {
  const provider = elements.settingProvider.value;
  if (provider === "gemini-api") {
    elements.apiKeyContainer.classList.remove("hidden");
  } else {
    elements.apiKeyContainer.classList.add("hidden");
  }
}

// Save settings to storage
async function saveSettings(showToast = true) {
  currentSettings.filenameFormat = elements.settingFilename.value;
  currentSettings.yamlTemplate = elements.settingTemplate.value;
  currentSettings.summaryEngine = elements.settingProvider.value;
  currentSettings.geminiApiKey = elements.settingApiKey.value;
  currentSettings.summaryPrompt = elements.settingPrompt.value;
  currentSettings.saveDirectly = elements.toggleDirectSave.checked;
  currentSettings.fields = {
    title: elements.fieldTitle.checked,
    url: elements.fieldUrl.checked,
    date: elements.fieldDate.checked,
    description: elements.fieldDescription.checked,
    author: elements.fieldAuthor.checked,
    tags: elements.fieldTags.checked
  };

  try {
    await chrome.storage.local.set({ settings: currentSettings });
    updateMarkdownPreview();
    if (showToast) {
      triggerToast("Preferences saved!");
    }
  } catch (err) {
    console.error("Failed to save settings:", err);
    triggerToast("Error saving preferences!", true);
  }
}

// Fetch content from active tab
async function fetchPageContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we can inject script into this tab
    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("https://chrome.google.com")) {
      showError("Cannot access internal browser pages. Navigate to a web article.");
      return;
    }

    // Inject content/content.js
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/content.js"]
    });

    if (results && results[0] && results[0].result) {
      pageData = results[0].result;
      
      // Auto-fill popup fields
      elements.clipTitle.value = pageData.title;
      elements.clipTags.value = pageData.tags.join(", ");
      elements.clipDescription.value = pageData.description;
      
      // Enable selection mode if active selection is present
      if (pageData.selectionHtml && pageData.selectionHtml.length > 0) {
        elements.optionSelection.disabled = false;
        elements.clipMode.value = "selection"; // Autofocus selection
      } else {
        elements.optionSelection.disabled = true;
        elements.clipMode.value = "entire";
      }

      // Hide warnings and start AI summarization
      elements.connectionWarning.classList.add("hidden");
      
      // Check if we already have a cached summary for this URL
      const sessionCache = await chrome.storage.session.get("cached_summary");
      if (sessionCache && sessionCache.cached_summary && sessionCache.cached_summary.url === pageData.url) {
        summaryText = sessionCache.cached_summary.text;
        updateUIStatus("ready", "Summary loaded from cache");
        elements.btnDownload.disabled = false;
        updateMarkdownPreview();
      } else {
        // Run AI Summary
        generateAISummary();
      }
    } else {
      showError("Failed to retrieve content from the active tab.");
    }
  } catch (err) {
    console.error("Content injection failed:", err);
    showError("Could not connect to page. Reload page and try again.");
  }
}

// Error handling helper
function showError(message) {
  elements.connectionWarning.textContent = message;
  elements.connectionWarning.classList.remove("hidden");
  elements.btnDownload.disabled = true;
  elements.clipTitle.disabled = true;
  elements.clipTags.disabled = true;
  elements.clipDescription.disabled = true;
  elements.clipMode.disabled = true;
  elements.toggleClean.disabled = true;
  elements.markdownPreview.textContent = "# Error\nUnable to fetch page contents.";
  updateUIStatus("error", "Error connecting to tab");
}

// Register listeners on elements that affect the markdown file preview
function registerInputListeners() {
  const previewAffectingInputs = [
    elements.clipTitle,
    elements.clipTags,
    elements.clipDescription,
    elements.clipMode,
    elements.toggleClean
  ];

  previewAffectingInputs.forEach(input => {
    input.addEventListener("input", () => {
      updateMarkdownPreview();
    });
    input.addEventListener("change", () => {
      // Re-trigger summary if mode or clean toggles change
      if (input === elements.clipMode || input === elements.toggleClean) {
        generateAISummary();
      } else {
        updateMarkdownPreview();
      }
    });
  });

  // Summary provider dropdown change
  elements.settingProvider.addEventListener("change", () => {
    toggleApiKeyVisibility();
  });
}

// Setup Collapsible Accordion Preview
function setupAccordion() {
  elements.previewToggle.addEventListener("click", () => {
    isPreviewOpen = !isPreviewOpen;
    if (isPreviewOpen) {
      elements.previewAccordion.classList.add("open");
      elements.previewPanel.style.maxHeight = "180px";
      elements.previewToggle.querySelector(".accordion-arrow").textContent = "▲";
      updateMarkdownPreview();
    } else {
      elements.previewAccordion.classList.remove("open");
      elements.previewPanel.style.maxHeight = "0px";
      elements.previewToggle.querySelector(".accordion-arrow").textContent = "▼";
    }
  });
}

// Update UI Status Bar
function updateUIStatus(status, text) {
  elements.statusDot.className = "status-indicator-dot";
  elements.statusText.textContent = text;
  
  if (status === "loading") {
    elements.statusDot.classList.add("loading");
    elements.btnRegenerate.classList.add("hidden");
  } else if (status === "ready") {
    elements.statusDot.classList.add("ready");
    elements.btnRegenerate.classList.remove("hidden");
  } else if (status === "error") {
    elements.statusDot.classList.add("error");
    elements.btnRegenerate.classList.remove("hidden");
  }
}

// Main AI Summarization Orchestrator
async function generateAISummary() {
  // Abort any in-progress summaries
  if (summaryAbortController) {
    summaryAbortController.abort();
  }
  summaryAbortController = new AbortController();
  const signal = summaryAbortController.signal;

  updateUIStatus("loading", "Extracting and cleaning DOM...");
  summaryText = "";
  elements.btnDownload.disabled = true;

  // Automatically expand preview panel for streaming wow-factor
  if (!isPreviewOpen) {
    isPreviewOpen = true;
    elements.previewAccordion.classList.add("open");
    elements.previewPanel.style.maxHeight = "180px";
    elements.previewToggle.querySelector(".accordion-arrow").textContent = "▲";
  }
  updateMarkdownPreview();

  // 1. Get raw HTML to clean and convert
  const mode = elements.clipMode.value;
  let sourceHtml = pageData.rawHtml;
  if (mode === "selection" && pageData.selectionHtml) {
    sourceHtml = pageData.selectionHtml;
  } else if (elements.toggleClean.checked) {
    sourceHtml = pageData.cleanedHtml || pageData.rawHtml;
  }

  // 2. Convert source HTML to Markdown to reduce token usage and clean structure
  let sourceMarkdown = "";
  try {
    if (typeof TurndownService !== "undefined") {
      const turndownService = new TurndownService({
        headingStyle: "atx",
        hr: "---",
        bulletListMarker: "-",
        codeBlockStyle: "```"
      });
      sourceMarkdown = turndownService.turndown(sourceHtml);
    } else {
      // Fallback
      sourceMarkdown = sourceHtml.replace(/<[^>]*>/g, "");
    }
  } catch (err) {
    console.error("DOM Turndown conversion error:", err);
    sourceMarkdown = sourceHtml.substring(0, 4000);
  }

  // Cap source text to ~8,000 characters to keep local context models fast and responsive
  if (sourceMarkdown.length > 8000) {
    sourceMarkdown = sourceMarkdown.substring(0, 8000) + "\n\n[Content truncated for length...]";
  }

  const promptGuideline = currentSettings.summaryPrompt || DEFAULT_SETTINGS.summaryPrompt;
  const engine = currentSettings.summaryEngine || "local";

  try {
    if (engine === "local") {
      updateUIStatus("loading", "Initializing Chrome Built-in AI...");
      await runLocalAISummarizer(promptGuideline, sourceMarkdown, signal);
    } else if (engine === "gemini-api") {
      const apiKey = currentSettings.geminiApiKey;
      if (!apiKey) {
        throw new Error("Missing Gemini API Key. Open Settings to configure it.");
      }
      updateUIStatus("loading", "Calling Cloud Gemini API...");
      await runCloudGeminiSummarizer(promptGuideline, sourceMarkdown, apiKey, signal);
    } else {
      // Fallback or offline extractive summarizer
      updateUIStatus("loading", "Running Extractive Summary...");
      summaryText = runExtractiveFallback(sourceHtml);
      updateMarkdownPreview();
    }

    // Generation Complete
    updateUIStatus("ready", "Summary complete!");
    elements.btnDownload.disabled = false;
    
    // Save to ephemeral session storage cache
    await chrome.storage.session.set({
      cached_summary: {
        url: pageData.url,
        text: summaryText
      }
    });

  } catch (err) {
    if (err.name === "AbortError") {
      console.log("Summary generation aborted.");
      return;
    }
    console.error("AI Summarizer Error:", err);
    summaryText = `Failed to generate AI Summary:\n${err.message}\n\n*Using Extractive Fallback:*\n\n${runExtractiveFallback(sourceHtml)}`;
    updateUIStatus("error", err.message.substring(0, 35) + "...");
    elements.btnDownload.disabled = false;
    updateMarkdownPreview();
  }
}

// Local Gemini Nano Prompt Engine
async function runLocalAISummarizer(promptGuideline, sourceMarkdown, signal) {
  // Find appropriate namespace
  let localAI = null;
  if (typeof LanguageModel !== "undefined") {
    localAI = LanguageModel;
  } else if (typeof ai !== "undefined" && ai.languageModel) {
    localAI = ai.languageModel;
  }

  if (!localAI) {
    throw new Error("Chrome Built-in AI (Prompt API) not supported in this browser.");
  }

  const availability = await localAI.availability();
  if (availability === "unavailable") {
    throw new Error("Chrome Built-in AI is currently unavailable or model is missing.");
  }

  updateUIStatus("loading", "Creating model session...");
  const session = await localAI.create({
    systemPrompt: "You are a helpful reading assistant. " + promptGuideline,
    initialPrompts: [
      { role: "system", content: "You are a helpful reading assistant. " + promptGuideline }
    ],
    signal
  });

  updateUIStatus("loading", "Generating local AI summary...");
  const promptInput = `Summarize the following content:\n\nPage Title: ${pageData.title}\nPage URL: ${pageData.url}\n\nContent:\n${sourceMarkdown}`;
  
  const stream = session.promptStreaming(promptInput);
  
  if (stream[Symbol.asyncIterator]) {
    for await (const chunk of stream) {
      if (signal.aborted) break;
      summaryText = chunk; // In Chrome Prompt API, chunk is the accumulated output
      updateMarkdownPreview();
    }
  } else {
    // Non-streaming fallback
    summaryText = await session.prompt(promptInput);
    updateMarkdownPreview();
  }
  
  session.destroy();
}

// Cloud Gemini API REST Client
async function runCloudGeminiSummarizer(promptGuideline, sourceMarkdown, apiKey, signal) {
  const payload = {
    contents: [{
      parts: [{
        text: `${promptGuideline}\n\nPage Title: ${pageData.title}\nPage URL: ${pageData.url}\n\nContent:\n${sourceMarkdown}`
      }]
    }]
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errMessage = `API returned error status ${response.status}`;
    try {
      const errJson = JSON.parse(errorText);
      errMessage = errJson.error.message || errMessage;
    } catch {}
    throw new Error(errMessage);
  }

  updateUIStatus("loading", "Streaming cloud AI summary...");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  
  let buffer = "";
  let lastParsedIndex = 0;
  let accumulatedText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (signal.aborted) {
      reader.cancel();
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Stream parser (regex based to handle incomplete chunks)
    const regex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    regex.lastIndex = lastParsedIndex;

    let match;
    while ((match = regex.exec(buffer)) !== null) {
      const rawVal = match[1];
      try {
        const decoded = JSON.parse(`"${rawVal}"`);
        accumulatedText += decoded;
      } catch {
        accumulatedText += rawVal.replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
      lastParsedIndex = regex.lastIndex;

      summaryText = accumulatedText;
      updateMarkdownPreview();
    }
  }
}

// Extractive fallback summarizer
function runExtractiveFallback(htmlContent) {
  let summary = "";
  
  // Format nice header
  summary += `### Description\n> ${pageData.description || "No description meta tag found."}\n\n`;

  // Parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");

  // Extract key headings
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3"))
    .map(h => h.textContent.trim())
    .filter(t => t.length > 5 && !t.includes(pageData.title))
    .slice(0, 6);

  if (headings.length > 0) {
    summary += `### Structural Topics & Key Sections\n`;
    headings.forEach(heading => {
      summary += `- **${heading}**\n`;
    });
    summary += `\n`;
  }

  // Extract top paragraphs
  const paragraphs = Array.from(doc.querySelectorAll("p"))
    .map(p => p.textContent.trim())
    .filter(t => t.length > 40 && !t.startsWith("Copyright"))
    .slice(0, 4);

  if (paragraphs.length > 0) {
    summary += `### Extracted Intro Highlights\n`;
    paragraphs.forEach(p => {
      // Shorten paragraphs slightly if they are huge
      const cleanP = p.length > 150 ? p.substring(0, 150) + "..." : p;
      summary += `- ${cleanP}\n`;
    });
  }

  if (summary === "") {
    summary = "No text content could be parsed from the page to generate a summary.";
  }

  return summary;
}

// Generate complete Markdown containing front matter and summary
function generateMarkdown() {
  if (!pageData.url) return "";

  // 1. Get current values from input
  const currentTitle = elements.clipTitle.value || pageData.title || "Untitled";
  const currentTagsText = elements.clipTags.value || "";
  const currentDescription = elements.clipDescription.value || "";
  
  // Format tags for front matter
  const tagsList = currentTagsText.split(",")
    .map(t => t.trim())
    .filter(t => t.length > 0);
  
  let formattedTags = "";
  if (tagsList.length > 0) {
    formattedTags = tagsList.map(t => `  - "${t}"`).join("\n");
  } else {
    formattedTags = "  - web";
  }

  // 2. Construct YAML Front Matter
  let yamlFrontMatter = "";
  try {
    let template = currentSettings.yamlTemplate || DEFAULT_SETTINGS.yamlTemplate;
    
    // Replace standard placeholders
    yamlFrontMatter = template
      .replace(/{title}/g, escapeYamlString(currentTitle))
      .replace(/{url}/g, pageData.url)
      .replace(/{date}/g, pageData.date || new Date().toISOString())
      .replace(/{author}/g, escapeYamlString(pageData.author || "Unknown"))
      .replace(/{description}/g, escapeYamlString(currentDescription))
      .replace(/{tags}/g, formattedTags);

    // Clean up empty lines or non-selected fields if required
    const lines = yamlFrontMatter.split("\n");
    const filteredLines = lines.filter(line => {
      if (!currentSettings.fields.title && line.startsWith("title:")) return false;
      if (!currentSettings.fields.url && line.startsWith("url:")) return false;
      if (!currentSettings.fields.date && line.startsWith("date:")) return false;
      if (!currentSettings.fields.description && line.startsWith("description:")) return false;
      if (!currentSettings.fields.author && line.startsWith("author:")) return false;
      if (!currentSettings.fields.tags && (line.startsWith("tags:") || line.startsWith("  -"))) return false;
      return true;
    });
    
    yamlFrontMatter = filteredLines.join("\n");
  } catch (err) {
    console.error("YAML creation error:", err);
    yamlFrontMatter = "---\nerror: Failed to parse YAML front matter\n---";
  }

  // 3. Assemble document keeping link to original page (as requested)
  const bodyHeader = `# ${currentTitle}\n\n**Original URL:** [${pageData.title || 'Source Link'}](${pageData.url})\n\n## AI Summary\n\n${summaryText || "Generating summary..."}`;

  return `${yamlFrontMatter}\n\n${bodyHeader}`;
}


// Update live preview block
function updateMarkdownPreview() {
  if (isPreviewOpen) {
    const fullContent = generateMarkdown();
    elements.markdownPreview.textContent = fullContent;
  }
}

// Setup Download & Settings Actions
function setupActionButtons() {
  // Download button handler
  elements.btnDownload.addEventListener("click", async () => {
    try {
      const fullContent = generateMarkdown();
      const currentTitle = elements.clipTitle.value || pageData.title || "Untitled";
      const filename = formatFilename(currentTitle, pageData.date, pageData.url, currentSettings.filenameFormat);
      
      // Save directly to folder if enabled and folder handle exists
      if (elements.toggleDirectSave.checked && selectedFolderHandle) {
        const perm = await verifyFolderPermission(selectedFolderHandle, true);
        if (perm !== "granted") {
          const reqPerm = await requestFolderPermission(selectedFolderHandle, true);
          if (reqPerm !== "granted") {
            throw new Error("Write permission to save folder was denied.");
          }
        }
        
        await writeFileToFolder(selectedFolderHandle, filename, fullContent);
        triggerToast("Summary saved directly to folder!");
        
        // Auto-refresh search index
        await scanSavedBookmarks();
        return;
      }
      
      // Fallback to downloads API
      const blob = new Blob([fullContent], { type: "text/markdown;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      
      await chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        saveAs: true
      });
      
      triggerToast("Summary downloaded successfully!");
    } catch (err) {
      console.error("Download/Save failed:", err);
      triggerToast(err.message || "Failed to save summary.", true);
    }
  });

  // Folder selection trigger
  elements.btnSelectFolder.addEventListener("click", async () => {
    try {
      // Pick a directory (requires user gesture)
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      selectedFolderHandle = handle;
      await saveFolderHandle(handle);
      await verifyFolderPermission(handle, true);
      updateFolderUI();
      triggerToast("Save directory configured!");
      
      // Trigger scan
      await scanSavedBookmarks();
    } catch (err) {
      console.error("Folder picker error:", err);
      triggerToast("Folder configuration canceled.", true);
    }
  });

  // Grant Permission trigger
  elements.btnGrantPermission.addEventListener("click", async () => {
    if (selectedFolderHandle) {
      const perm = await requestFolderPermission(selectedFolderHandle, true);
      if (perm === "granted") {
        updateFolderUI();
        triggerToast("Access granted!");
        await scanSavedBookmarks();
      }
    }
  });

  // Re-scan bookmarks folder trigger
  elements.btnSyncFolder.addEventListener("click", async () => {
    if (selectedFolderHandle) {
      const perm = await verifyFolderPermission(selectedFolderHandle, false);
      if (perm === "granted") {
        await scanSavedBookmarks();
      } else {
        await requestFolderPermission(selectedFolderHandle, false);
      }
    } else {
      triggerToast("Configure a bookmarks folder in Settings first.", true);
    }
  });

  // Search input typing listener
  elements.searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query) {
      elements.btnClearSearch.classList.remove("hidden");
    } else {
      elements.btnClearSearch.classList.add("hidden");
    }
    renderSearchResults(query);
  });

  // Search input clear trigger
  elements.btnClearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.btnClearSearch.classList.add("hidden");
    renderSearchResults("");
  });

  // Regenerate Button Click
  elements.btnRegenerate.addEventListener("click", () => {
    generateAISummary();
  });

  // Settings Save Button
  elements.btnSaveSettings.addEventListener("click", async () => {
    await saveSettings(true);
  });

  // Reset Button
  elements.btnReset.addEventListener("click", async () => {
    // Reset form elements in settings view
    elements.settingFilename.value = DEFAULT_SETTINGS.filenameFormat;
    elements.settingTemplate.value = DEFAULT_SETTINGS.yamlTemplate;
    elements.settingProvider.value = DEFAULT_SETTINGS.summaryEngine;
    elements.settingApiKey.value = DEFAULT_SETTINGS.geminiApiKey;
    elements.settingPrompt.value = DEFAULT_SETTINGS.summaryPrompt;
    elements.toggleDirectSave.checked = DEFAULT_SETTINGS.saveDirectly;
    
    elements.fieldTitle.checked = DEFAULT_SETTINGS.fields.title;
    elements.fieldUrl.checked = DEFAULT_SETTINGS.fields.url;
    elements.fieldDate.checked = DEFAULT_SETTINGS.fields.date;
    elements.fieldDescription.checked = DEFAULT_SETTINGS.fields.description;
    elements.fieldAuthor.checked = DEFAULT_SETTINGS.fields.author;
    elements.fieldTags.checked = DEFAULT_SETTINGS.fields.tags;

    toggleApiKeyVisibility();

    // Save defaults to storage
    await saveSettings(false);
    triggerToast("Settings reset to defaults!");
    generateAISummary();
  });
}

// Toast helper
let toastTimeout;
function triggerToast(message, isError = false) {
  clearTimeout(toastTimeout);
  
  elements.toastMessage.textContent = message;
  
  if (isError) {
    elements.toast.style.background = "rgba(239, 68, 68, 0.9)";
    elements.toast.querySelector(".toast-icon").textContent = "✕";
    elements.toast.querySelector(".toast-icon").style.color = "var(--warning-color)";
  } else {
    elements.toast.style.background = "rgba(16, 185, 129, 0.9)";
    elements.toast.querySelector(".toast-icon").textContent = "✓";
    elements.toast.querySelector(".toast-icon").style.color = "var(--success-color)";
  }

  elements.toast.classList.remove("hidden");
  setTimeout(() => elements.toast.classList.add("show"), 10);

  toastTimeout = setTimeout(() => {
    elements.toast.classList.remove("show");
    setTimeout(() => elements.toast.classList.add("hidden"), 350);
  }, 2500);
}

// ==========================================
// FILE SYSTEM ACCESS & INDEXEDDB ENGINE
// ==========================================

const DB_NAME = "MarkdownClipperDB";
const STORE_NAME = "handles";

// Open IndexedDB instance
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Save DirectoryHandle to IndexedDB
async function saveFolderHandle(handle) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(handle, "folderHandle");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Load DirectoryHandle from IndexedDB
async function getFolderHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get("folderHandle");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("IndexedDB load handle failed:", err);
    return null;
  }
}

// Query folder handle permission
async function verifyFolderPermission(handle, isWriteRequired) {
  const opts = { mode: isWriteRequired ? "readwrite" : "read" };
  const perm = await handle.queryPermission(opts);
  if (perm === "granted") {
    folderPermissionState = "granted";
  } else {
    folderPermissionState = "prompt";
  }
  return perm;
}

// Request folder permission (requires user gesture)
async function requestFolderPermission(handle, isWriteRequired) {
  const opts = { mode: isWriteRequired ? "readwrite" : "read" };
  const perm = await handle.requestPermission(opts);
  if (perm === "granted") {
    folderPermissionState = "granted";
  } else {
    folderPermissionState = "prompt";
  }
  return perm;
}

// Initialize directory state on popup load
async function initializeFolder() {
  const handle = await getFolderHandle();
  if (handle) {
    selectedFolderHandle = handle;
    await verifyFolderPermission(handle, false);
  } else {
    folderPermissionState = "none";
  }
  updateFolderUI();
}

// Update directory status in settings & search views
function updateFolderUI() {
  if (folderPermissionState === "none") {
    elements.folderPathText.textContent = "Downloads API (Default Folder)";
    elements.searchFolderWarning.classList.remove("hidden");
    elements.folderPermissionCard.classList.add("hidden");
    elements.searchResults.classList.add("hidden");
  } else {
    const folderName = selectedFolderHandle ? selectedFolderHandle.name : "Bookmarks Folder";
    elements.folderPathText.textContent = `📁 Direct Save: /${folderName}`;
    elements.searchFolderWarning.classList.add("hidden");
    
    if (folderPermissionState === "prompt") {
      elements.folderPermissionCard.classList.remove("hidden");
      elements.searchResults.classList.add("hidden");
    } else if (folderPermissionState === "granted") {
      elements.folderPermissionCard.classList.add("hidden");
      elements.searchResults.classList.remove("hidden");
    }
  }
}

// Write file content directly to local folder
async function writeFileToFolder(dirHandle, filename, content) {
  // Get/create file handle
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  // Create writeable stream
  const writable = await fileHandle.createWritable();
  // Write content
  await writable.write(content);
  // Close stream
  await writable.close();
}

// ==========================================
// BOOKMARK SEARCH & SCAN ENGINE
// ==========================================

// Scan directory for markdown files and parse them
async function scanSavedBookmarks() {
  if (!selectedFolderHandle) return;

  updateUIStatus("loading", "Scanning folder bookmarks...");
  
  try {
    const list = [];
    const opts = { mode: "read" };
    if ((await selectedFolderHandle.queryPermission(opts)) !== "granted") {
      folderPermissionState = "prompt";
      updateFolderUI();
      return;
    }

    folderPermissionState = "granted";
    updateFolderUI();

    // Iterate directory values flatly
    for await (const entry of selectedFolderHandle.values()) {
      if (entry.kind === "file" && entry.name.endsWith(".md")) {
        const file = await entry.getFile();
        const text = await file.text();
        const parsed = parseBookmarkContent(entry.name, text);
        list.push(parsed);
      }
    }

    // Sort by file creation date (extracted from front matter or default sort by filename)
    list.sort((a, b) => b.filename.localeCompare(a.filename));
    bookmarkFiles = list;

    // Render results
    const currentQuery = elements.searchInput.value.toLowerCase().trim();
    renderSearchResults(currentQuery);
    
    if (currentQuery) {
      updateUIStatus("ready", `Scanned ${list.length} files`);
    } else {
      updateUIStatus("ready", "Sync complete");
    }

  } catch (err) {
    console.error("Scanning folder failed:", err);
    triggerToast("Failed to scan directory.", true);
    updateUIStatus("error", "Scan folder failed");
  }
}


// Render filtered search results in Bookmarks panel
function renderSearchResults(query) {
  elements.searchResults.innerHTML = "";
  
  if (bookmarkFiles.length === 0) {
    elements.searchResults.innerHTML = `
      <div class="search-empty-state">
        No bookmarks found in this folder. Start clipping articles to save summaries!
      </div>
    `;
    return;
  }

  // Filter bookmark files based on query
  const filtered = bookmarkFiles.filter(item => {
    if (!query) return true;
    const titleMatch = item.title.toLowerCase().includes(query);
    const descMatch = item.description.toLowerCase().includes(query);
    const tagMatch = item.tags.some(tag => tag.toLowerCase().includes(query));
    const summaryMatch = item.summaryText.toLowerCase().includes(query);
    return titleMatch || descMatch || tagMatch || summaryMatch;
  });

  if (filtered.length === 0) {
    elements.searchResults.innerHTML = `
      <div class="search-empty-state">
        No bookmarks match "${query}".
      </div>
    `;
    return;
  }

  // Render cards
  filtered.forEach(item => {
    const card = document.createElement("div");
    card.className = "bookmark-card";
    
    // Construct tag HTML
    let tagsHtml = "";
    if (item.tags.length > 0) {
      tagsHtml = `<div class="bookmark-tags">` + 
        item.tags.map(t => `<span class="tag-badge">${t}</span>`).join("") + 
        `</div>`;
    }

    // Snippet HTML
    const snippetHtml = item.snippetText ? `<p class="bookmark-desc">${item.snippetText}</p>` : "";

    card.innerHTML = `
      <div class="bookmark-header">
        <h4 class="bookmark-title">${item.title}</h4>
        <div class="bookmark-actions">
          ${item.url ? `
            <button class="btn-card-action btn-link" data-url="${item.url}" title="Visit Original Link">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </button>
          ` : ""}
          <button class="btn-card-action btn-delete" data-filename="${item.filename}" title="Delete Bookmark">
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      ${snippetHtml}
      <div class="bookmark-meta">
        ${tagsHtml}
        <span class="bookmark-date">${item.filename.match(/\d{4}-\d{2}-\d{2}/)?.[0] || ""}</span>
      </div>
    `;

    // Bind original link click
    if (item.url) {
      card.querySelector(".btn-link").addEventListener("click", () => {
        chrome.tabs.create({ url: item.url });
      });
    }

    // Bind delete click
    card.querySelector(".btn-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      const confirmDelete = confirm(`Are you sure you want to delete the file "${item.filename}"?`);
      if (confirmDelete) {
        await deleteBookmarkFile(item.filename);
      }
    });

    elements.searchResults.appendChild(card);
  });
}

// Delete file from local folder
async function deleteBookmarkFile(filename) {
  if (!selectedFolderHandle) return;
  
  try {
    const opts = { mode: "readwrite" };
    if ((await selectedFolderHandle.queryPermission(opts)) !== "granted") {
      throw new Error("Folder write permission is required to delete.");
    }

    // Delete file
    await selectedFolderHandle.removeEntry(filename);
    triggerToast("Bookmark deleted!");
    
    // Refresh list
    await scanSavedBookmarks();
  } catch (err) {
    console.error("Failed to delete bookmark file:", err);
    triggerToast("Failed to delete bookmark.", true);
  }
}
