// Service Worker for Markdown Clipper with AI Summarization

// Default Settings
const DEFAULT_SETTINGS = {
  filenameFormat: "title-date",
  yamlTemplate: `---\ntitle: "{title}"\nurl: "{url}"\ndate: "{date}"\nauthor: "{author}"\ndescription: "{description}"\ntags:\n{tags}\n---`,
  summaryEngine: "local",
  geminiApiKey: "",
  summaryPrompt: "Summarize this web page content in 3-5 concise bullet points focusing on the key arguments and facts. Do not include markdown code blocks.",
  fields: {
    title: true,
    url: true,
    date: true,
    description: true,
    author: true,
    tags: true
  }
};

// Create Context Menus on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "clip-page",
    title: "Clip Summary of Page",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "clip-selection",
    title: "Clip Summary of Selection",
    contexts: ["selection"]
  });
  
  console.log("Markdown Clipper context menus registered.");
});

// Listen for Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "clip-page" || info.menuItemId === "clip-selection") {
    const isSelectionOnly = info.menuItemId === "clip-selection";
    await handleBackgroundClip(tab, isSelectionOnly);
  }
});

// Background Clip Orchestration
async function handleBackgroundClip(tab, isSelectionOnly) {
  if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("https://chrome.google.com")) {
    showNotification("Error", "Cannot clip content on internal browser pages.", true);
    return;
  }

  showNotification("Summarizing Page...", "Extracting content and contacting AI model...", false);

  try {
    // 1. Fetch settings from storage
    const storage = await chrome.storage.local.get("settings");
    const settings = storage.settings || DEFAULT_SETTINGS;

    // 2. Inject Turndown library first
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["libs/turndown.js"]
    });

    // 3. Inject extraction and fallback logic to execute on the tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runInTabExtractor,
      args: [isSelectionOnly]
    });

    if (results && results[0] && results[0].result) {
      const pageDetails = results[0].result;
      let summaryResult = "";
      const engine = settings.summaryEngine || "local";

      // Cap source text to ~8,000 characters to keep it within context windows
      let contextText = pageDetails.sourceMarkdown;
      if (contextText.length > 8000) {
        contextText = contextText.substring(0, 8000) + "\n\n[Content truncated...]";
      }

      const promptGuideline = settings.summaryPrompt || DEFAULT_SETTINGS.summaryPrompt;

      try {
        if (engine === "local") {
          summaryResult = await runLocalAIService(promptGuideline, pageDetails.title, pageDetails.url, contextText);
        } else if (engine === "gemini-api" && settings.geminiApiKey) {
          summaryResult = await runCloudGeminiService(promptGuideline, pageDetails.title, pageDetails.url, contextText, settings.geminiApiKey);
        } else {
          // Fallback
          summaryResult = pageDetails.fallbackSummary;
        }
      } catch (aiErr) {
        console.warn("AI generation failed, using extractive fallback:", aiErr);
        summaryResult = `Failed to generate AI Summary: ${aiErr.message}\n\n*Using Extractive Fallback:*\n\n${pageDetails.fallbackSummary}`;
      }

      // 4. Create YAML Front Matter
      const template = settings.yamlTemplate || DEFAULT_SETTINGS.yamlTemplate;
      const escapeYaml = (str) => (str ? str.replace(/"/g, '\\"') : "");
      
      const tagsList = pageDetails.tags;
      const formattedTags = tagsList.length > 0
        ? tagsList.map(t => `  - "${t}"`).join("\n")
        : "  - web";

      let yamlFrontMatter = template
        .replace(/{title}/g, escapeYaml(pageDetails.title))
        .replace(/{url}/g, pageDetails.url)
        .replace(/{date}/g, pageDetails.date)
        .replace(/{author}/g, escapeYaml(pageDetails.author || "Unknown"))
        .replace(/{description}/g, escapeYaml(pageDetails.description))
        .replace(/{tags}/g, formattedTags);

      // Filter keys according to active choices
      const lines = yamlFrontMatter.split("\n");
      const filteredLines = lines.filter(line => {
        if (!settings.fields.title && line.startsWith("title:")) return false;
        if (!settings.fields.url && line.startsWith("url:")) return false;
        if (!settings.fields.date && line.startsWith("date:")) return false;
        if (!settings.fields.description && line.startsWith("description:")) return false;
        if (!settings.fields.author && line.startsWith("author:")) return false;
        if (!settings.fields.tags && (line.startsWith("tags:") || line.startsWith("  -"))) return false;
        return true;
      });
      
      yamlFrontMatter = filteredLines.join("\n");

      // Keep original page link in body
      const bodyHeader = `# ${pageDetails.title}\n\n**Original URL:** [${pageDetails.title}](${pageDetails.url})\n\n## Summary\n\n${summaryResult}`;
      const markdownContent = `${yamlFrontMatter}\n\n${bodyHeader}`;

      // 5. Format Filename
      const sanitizedTitle = pageDetails.title
        .toLowerCase()
        .replace(/[\\/*?:"<>|]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-_]|[-_]$/g, "")
        .substring(0, 50);

      const datePart = pageDetails.date.split("T")[0];
      let domainPart = "webpage";
      try {
        domainPart = new URL(pageDetails.url).hostname.replace("www.", "").replace(/\./g, "-");
      } catch {}

      let filename = `${sanitizedTitle}-summary-${datePart}`;
      if (settings.filenameFormat === "title") {
        filename = `${sanitizedTitle}-summary`;
      } else if (settings.filenameFormat === "domain-title") {
        filename = `${domainPart}-${sanitizedTitle}-summary`;
      } else if (settings.filenameFormat === "date-title") {
        filename = `${datePart}-${sanitizedTitle}-summary`;
      }

      // 6. Save directly to folder if configured and permission is active, otherwise download
      const fullFilename = `${filename}.md`;
      if (settings.saveDirectly !== false) {
        try {
          const folderHandle = await getFolderHandle();
          if (folderHandle) {
            const hasPermission = await verifyFolderPermission(folderHandle, true);
            if (hasPermission === "granted") {
              await writeFileToFolder(folderHandle, fullFilename, markdownContent);
              showNotification("Summary Saved!", `Saved directly to folder: ${fullFilename}`, false);
              return;
            }
          }
        } catch (fsErr) {
          console.warn("Direct folder save failed in background, falling back to downloads API:", fsErr);
        }
      }

      // Fallback: Download file using data URI
      const base64Data = btoa(unescape(encodeURIComponent(markdownContent)));
      const dataUri = `data:text/markdown;charset=utf-8;base64,${base64Data}`;

      await chrome.downloads.download({
        url: dataUri,
        filename: fullFilename,
        saveAs: false
      });

      showNotification("Summary Saved!", `${fullFilename} downloaded.`, false);
    } else {
      showNotification("Error", "Failed to extract page content.", true);
    }
  } catch (err) {
    console.error("Background clip failed:", err);
    showNotification("Error", "Could not clip this page. Try reloading it.", true);
  }
}

// Extraction logic running in tab context
function runInTabExtractor(isSelectionOnly) {
  function getMeta(namesAndProperties) {
    for (const key of namesAndProperties) {
      const element = document.querySelector(`meta[name="${key}"], meta[property="${key}"], meta[name="twitter:${key}"]`);
      if (element && element.content) {
        return element.content.trim();
      }
    }
    return "";
  }

  function getSelectionHtml() {
    let html = "";
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const container = document.createElement("div");
      for (let i = 0; i < sel.rangeCount; ++i) {
        container.appendChild(sel.getRangeAt(i).cloneContents());
      }
      html = container.innerHTML;
    }
    return html.trim();
  }

  function getAuthor() {
    let author = getMeta(["author", "article:author", "creator"]);
    if (!author) {
      const authorEl = document.querySelector('[rel="author"], .author, [itemprop="author"]');
      if (authorEl) {
        author = authorEl.innerText || authorEl.textContent;
      }
    }
    return author ? author.trim() : "";
  }

  function getCleanedHtml() {
    const bodyClone = document.body.cloneNode(true);
    const selectorsToRemove = [
      "script", "style", "noscript", "iframe", "svg", "canvas", "video", "audio",
      "select", "input", "textarea", "button", "dialog", "header", "footer", "nav",
      "aside", ".nav", ".navigation", ".footer", ".header", ".sidebar", ".menu"
    ];
    selectorsToRemove.forEach(selector => {
      bodyClone.querySelectorAll(selector).forEach(el => el.remove());
    });
    const article = bodyClone.querySelector("article, main, .main, #main, .content, #content, [role='main']");
    return article ? article.innerHTML : bodyClone.innerHTML;
  }

  // Extractive fallback summary built directly in tab where DOM is accessible
  function buildFallbackSummary(htmlContent) {
    let summary = "";
    const desc = getMeta(["description", "og:description"]) || "";
    summary += `### Description\n> ${desc || "No description meta tag found."}\n\n`;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");

    const headings = Array.from(doc.querySelectorAll("h1, h2, h3"))
      .map(h => h.textContent.trim())
      .filter(t => t.length > 5 && !t.includes(document.title))
      .slice(0, 6);

    if (headings.length > 0) {
      summary += `### Structural Topics & Key Sections\n`;
      headings.forEach(h => { summary += `- **${h}**\n`; });
      summary += `\n`;
    }

    const paragraphs = Array.from(doc.querySelectorAll("p"))
      .map(p => p.textContent.trim())
      .filter(t => t.length > 40 && !t.startsWith("Copyright"))
      .slice(0, 4);

    if (paragraphs.length > 0) {
      summary += `### Extracted Intro Highlights\n`;
      paragraphs.forEach(p => {
        const clean = p.length > 150 ? p.substring(0, 150) + "..." : p;
        summary += `- ${clean}\n`;
      });
    }
    return summary;
  }

  const title = document.title || "Untitled";
  const url = window.location.href;
  const description = getMeta(["description", "og:description"]) || "";
  const author = getAuthor();
  
  const keywords = getMeta(["keywords", "article:tag"]);
  let tags = [];
  if (keywords) {
    tags = keywords.split(",").map(t => t.trim()).filter(t => t.length > 0);
  }

  // Get active source HTML
  let sourceHtml = document.body.innerHTML;
  if (isSelectionOnly) {
    const selHtml = getSelectionHtml();
    if (selHtml) sourceHtml = selHtml;
  } else {
    sourceHtml = getCleanedHtml();
  }

  // Run Turndown on active tab
  let sourceMarkdown = "";
  if (typeof TurndownService !== "undefined") {
    const turndownService = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-"
    });
    sourceMarkdown = turndownService.turndown(sourceHtml);
  } else {
    sourceMarkdown = sourceHtml.replace(/<[^>]*>/g, "");
  }

  const fallbackSummary = buildFallbackSummary(sourceHtml);

  return {
    title,
    url,
    description,
    author,
    tags,
    sourceMarkdown,
    fallbackSummary,
    date: new Date().toISOString()
  };
}

// Local Gemini Nano background service
async function runLocalAIService(promptGuideline, title, url, sourceMarkdown) {
  let localAI = null;
  if (typeof LanguageModel !== "undefined") {
    localAI = LanguageModel;
  } else if (typeof ai !== "undefined" && ai.languageModel) {
    localAI = ai.languageModel;
  }

  if (!localAI) {
    throw new Error("Chrome Built-in AI not supported in background service worker.");
  }

  const availability = await localAI.availability();
  if (availability === "unavailable") {
    throw new Error("Built-in model is not available.");
  }

  const session = await localAI.create({
    systemPrompt: "You are a helpful reading assistant. " + promptGuideline,
    initialPrompts: [
      { role: "system", content: "You are a helpful reading assistant. " + promptGuideline }
    ]
  });

  const promptInput = `Summarize the following content:\n\nPage Title: ${title}\nPage URL: ${url}\n\nContent:\n${sourceMarkdown}`;
  const summary = await session.prompt(promptInput);
  
  session.destroy();
  return summary;
}

// Cloud Gemini API REST service
async function runCloudGeminiService(promptGuideline, title, url, sourceMarkdown, apiKey) {
  const payload = {
    contents: [{
      parts: [{
        text: `${promptGuideline}\n\nPage Title: ${title}\nPage URL: ${url}\n\nContent:\n${sourceMarkdown}`
      }]
    }]
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`API returned error status ${response.status}`);
  }

  const json = await response.json();
  
  if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0]) {
    return json.candidates[0].content.parts[0].text;
  } else {
    throw new Error("Invalid API response format.");
  }
}

// Notification Helper
function showNotification(title, message, isError = false) {
  const iconUrl = chrome.runtime.getURL("icons/icon-128.png");
  chrome.notifications.create({
    type: "basic",
    iconUrl: iconUrl,
    title: title,
    message: message
  });
}

// ==========================================
// FILE SYSTEM ACCESS & INDEXEDDB FOR BACKGROUND
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
    console.warn("IndexedDB load handle failed in service worker:", err);
    return null;
  }
}

// Query folder handle permission
async function verifyFolderPermission(handle, isWriteRequired) {
  const opts = { mode: isWriteRequired ? "readwrite" : "read" };
  return await handle.queryPermission(opts);
}

// Write file content directly to local folder
async function writeFileToFolder(dirHandle, filename, content) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
