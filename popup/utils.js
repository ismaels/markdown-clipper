// Pure utility functions for Markdown Clipper

/**
 * Escapes double quotes in strings to ensure valid YAML structure.
 * @param {string} str 
 * @returns {string}
 */
export function escapeYamlString(str) {
  if (!str) return "";
  return str.replace(/"/g, '\\"');
}

/**
 * Formats the filename based on user preferences.
 * @param {string} title 
 * @param {string} dateStr 
 * @param {string} urlStr 
 * @param {string} filenameFormat 
 * @returns {string}
 */
export function formatFilename(title, dateStr, urlStr, filenameFormat = "title-date") {
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[\\/*?:"<>|]/g, "") // Remove illegal filename chars
    .replace(/\s+/g, "-")        // Replace spaces with hyphens
    .replace(/-+/g, "-")         // Collapse multiple hyphens
    .replace(/^[-_]|[-_]$/g, "") // Trim leading/trailing symbols
    .substring(0, 50);           // Max length

  let datePart = "";
  if (dateStr) {
    datePart = dateStr.split("T")[0];
  } else {
    datePart = new Date().toISOString().split("T")[0];
  }

  let domainPart = "";
  try {
    domainPart = new URL(urlStr).hostname.replace("www.", "").replace(/\./g, "-");
  } catch {
    domainPart = "webpage";
  }

  let filename = "clipped-page";

  switch (filenameFormat) {
    case "title":
      filename = `${sanitizedTitle}-summary`;
      break;
    case "title-date":
      filename = `${sanitizedTitle}-summary-${datePart}`;
      break;
    case "domain-title":
      filename = `${domainPart}-${sanitizedTitle}-summary`;
      break;
    case "date-title":
      filename = `${datePart}-${sanitizedTitle}-summary`;
      break;
    default:
      filename = `${sanitizedTitle}-summary-${datePart}`;
  }

  return `${filename}.md`;
}

/**
 * Extracts YAML front matter and body content from Markdown file contents.
 * @param {string} filename 
 * @param {string} text 
 * @returns {object}
 */
export function parseBookmarkContent(filename, text) {
  // Regex to match YAML front matter
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  
  let title = filename.replace("-summary", "").replace(".md", "").replace(/-/g, " ");
  let url = "";
  let description = "";
  let author = "";
  let tags = [];
  let summaryBody = text;

  if (match) {
    const fm = match[1];
    summaryBody = match[2];

    // Simple YAML parser
    const titleMatch = fm.match(/title:\s*"(.*?)"/) || fm.match(/title:\s*(.*)/);
    const urlMatch = fm.match(/url:\s*"(.*?)"/) || fm.match(/url:\s*(.*)/);
    const descMatch = fm.match(/description:\s*"(.*?)"/) || fm.match(/description:\s*(.*)/);
    const authorMatch = fm.match(/author:\s*"(.*?)"/) || fm.match(/author:\s*(.*)/);

    if (titleMatch) title = titleMatch[1].replace(/\\"/g, '"');
    if (urlMatch) url = urlMatch[1].trim();
    if (descMatch) description = descMatch[1].replace(/\\"/g, '"');
    if (authorMatch) author = authorMatch[1].replace(/\\"/g, '"');

    // Parse tag items
    const tagsBlock = fm.match(/tags:\s*\r?\n([\s\S]*?)(?=\r?\n\w+:|$)/);
    if (tagsBlock) {
      const tagLines = tagsBlock[1].split("\n");
      tagLines.forEach(line => {
        const tm = line.match(/-\s*"(.*?)"/) || line.match(/-\s*(.*)/);
        if (tm) {
          tags.push(tm[1].trim());
        }
      });
    }
  }

  // Extract clean summary from body by stripping header elements
  const cleanSummary = summaryBody
    .replace(/^#\s+.*$/m, "") // remove Title header
    .replace(/^\*\*Original URL:\*\*.*$/m, "") // remove Source Link
    .replace(/^##\s+AI\s+Summary.*$/mi, "") // remove Summary header
    .replace(/^##\s+Summary.*$/mi, "") // remove Summary header
    .trim();

  // Snip summary if extremely long for search result cards
  const snippet = cleanSummary.length > 120 ? cleanSummary.substring(0, 120) + "..." : cleanSummary;

  return {
    filename,
    title,
    url,
    description,
    author,
    tags,
    summaryText: cleanSummary,
    snippetText: snippet
  };
}
