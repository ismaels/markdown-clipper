(() => {
  // Helper to extract meta tag content
  function getMeta(namesAndProperties) {
    for (const key of namesAndProperties) {
      const element = document.querySelector(`meta[name="${key}"], meta[property="${key}"], meta[name="twitter:${key}"]`);
      if (element && element.content) {
        return element.content.trim();
      }
    }
    return "";
  }

  // Helper to extract selection HTML
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

  // Extract author using various selectors
  function getAuthor() {
    let author = getMeta(["author", "article:author", "creator"]);
    if (!author) {
      // Look for common class names or attributes
      const authorEl = document.querySelector('[rel="author"], .author, [itemprop="author"]');
      if (authorEl) {
        author = authorEl.innerText || authorEl.textContent;
      }
    }
    return author ? author.trim() : "";
  }

  // Extract tags / keywords
  function getTags() {
    const keywords = getMeta(["keywords", "article:tag"]);
    if (keywords) {
      return keywords.split(",").map(t => t.trim()).filter(t => t.length > 0);
    }
    
    // Fallback: look for common tag elements
    const tagElements = document.querySelectorAll('.tags a, .tag, [itemprop="keywords"]');
    if (tagElements.length > 0) {
      return Array.from(tagElements).map(el => (el.innerText || el.textContent).trim()).filter(t => t.length > 0);
    }
    return [];
  }

  // Helper to clean HTML
  function getCleanedHtml() {
    // Clone body to avoid messing up the active page
    const bodyClone = document.body.cloneNode(true);
    
    // Selectors for elements we usually don't want in markdown
    const selectorsToRemove = [
      "script", "style", "noscript", "iframe", "svg", "canvas", "video", "audio",
      "select", "input", "textarea", "button", "dialog", "header", "footer", "nav",
      "aside", ".nav", ".navigation", ".footer", ".header", ".sidebar", ".menu",
      "[role='banner']", "[role='navigation']", "[role='contentinfo']", "[role='menubar']"
    ];
    
    selectorsToRemove.forEach(selector => {
      bodyClone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Check if there is an article element which might hold the core content
    const article = bodyClone.querySelector("article, main, .main, #main, .content, #content, [role='main']");
    if (article) {
      return article.innerHTML;
    }
    
    return bodyClone.innerHTML;
  }

  // Gather details
  const title = document.title || "Untitled";
  const url = window.location.href;
  const description = getMeta(["description", "og:description"]) || "";
  const author = getAuthor();
  const tags = getTags();
  const selectionHtml = getSelectionHtml();
  const rawHtml = document.body.innerHTML;
  const cleanedHtml = getCleanedHtml();
  
  // Format current date
  const dateString = new Date().toISOString();

  // Return the data object (will be returned as execution result)
  return {
    title,
    url,
    description,
    author,
    tags,
    selectionHtml,
    rawHtml,
    cleanedHtml,
    date: dateString
  };
})();
