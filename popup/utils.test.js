import { describe, it, expect } from 'vitest';
import { escapeYamlString, formatFilename, parseBookmarkContent } from './utils.js';

describe('escapeYamlString', () => {
  it('should return empty string if input is falsy', () => {
    expect(escapeYamlString(null)).toBe('');
    expect(escapeYamlString(undefined)).toBe('');
    expect(escapeYamlString('')).toBe('');
  });

  it('should escape double quotes correctly', () => {
    expect(escapeYamlString('Hello "World"')).toBe('Hello \\"World\\"');
    expect(escapeYamlString('"Double Quotes" at start/end')).toBe('\\"Double Quotes\\" at start/end');
  });

  it('should leave strings without double quotes unchanged', () => {
    expect(escapeYamlString('Hello World!')).toBe('Hello World!');
    expect(escapeYamlString('Single \'quotes\' are fine')).toBe('Single \'quotes\' are fine');
  });
});

describe('formatFilename', () => {
  const title = 'A Quick & Easy Guide to MV3!';
  const dateStr = '2026-05-28T15:32:00.000Z';
  const urlStr = 'https://developer.chrome.com/docs/extensions/mv3/intro/';

  it('should format correctly with "title" option', () => {
    const filename = formatFilename(title, dateStr, urlStr, 'title');
    // Sanitized title: 'a-quick-&-easy-guide-to-mv3!'
    expect(filename).toBe('a-quick-&-easy-guide-to-mv3!-summary.md');
  });

  it('should format correctly with "title-date" option', () => {
    const filename = formatFilename(title, dateStr, urlStr, 'title-date');
    expect(filename).toBe('a-quick-&-easy-guide-to-mv3!-summary-2026-05-28.md');
  });

  it('should format correctly with "domain-title" option', () => {
    const filename = formatFilename(title, dateStr, urlStr, 'domain-title');
    expect(filename).toBe('developer-chrome-com-a-quick-&-easy-guide-to-mv3!-summary.md');
  });

  it('should format correctly with "date-title" option', () => {
    const filename = formatFilename(title, dateStr, urlStr, 'date-title');
    expect(filename).toBe('2026-05-28-a-quick-&-easy-guide-to-mv3!-summary.md');
  });

  it('should sanitize illegal characters, collapse spaces, and convert to lowercase', () => {
    const messyTitle = 'Test: File/Name\\With?*Illegal"Chars<>And|Trailing- ';
    const filename = formatFilename(messyTitle, dateStr, urlStr, 'title');
    expect(filename).toBe('test-filenamewithillegalcharsandtrailing-summary.md');
  });

  it('should handle invalid date string gracefully', () => {
    const filename = formatFilename('Sample Title', '', urlStr, 'title-date');
    const today = new Date().toISOString().split('T')[0];
    expect(filename).toBe(`sample-title-summary-${today}.md`);
  });

  it('should handle malformed URL string gracefully', () => {
    const filename = formatFilename('Sample Title', dateStr, 'not-a-valid-url', 'domain-title');
    expect(filename).toBe('webpage-sample-title-summary.md');
  });
});

describe('parseBookmarkContent', () => {
  it('should successfully parse markdown files containing YAML front matter', () => {
    const filename = 'mv3-extensions-summary-2026-05-28.md';
    const markdownContent = `---
title: "Manifest V3 Extensions Guide"
url: "https://developer.chrome.com/docs/extensions/mv3/"
date: "2026-05-28T15:30:00Z"
author: "Google Developer"
description: "Everything you need to know about MV3"
tags:
  - "mv3"
  - "chrome"
  - "extension"
---

# Manifest V3 Extensions Guide

**Original URL:** [Manifest V3 Extensions Guide](https://developer.chrome.com/docs/extensions/mv3/)

## AI Summary

This is the summary content of the article.
- First key point.
- Second key point.`;

    const parsed = parseBookmarkContent(filename, markdownContent);

    expect(parsed.filename).toBe(filename);
    expect(parsed.title).toBe('Manifest V3 Extensions Guide');
    expect(parsed.url).toBe('https://developer.chrome.com/docs/extensions/mv3/');
    expect(parsed.author).toBe('Google Developer');
    expect(parsed.description).toBe('Everything you need to know about MV3');
    expect(parsed.tags).toEqual(['mv3', 'chrome', 'extension']);
    expect(parsed.summaryText).toBe('This is the summary content of the article.\n- First key point.\n- Second key point.');
    expect(parsed.snippetText).toBe('This is the summary content of the article.\n- First key point.\n- Second key point.');
  });

  it('should fall back gracefully for markdown files without YAML front matter', () => {
    const filename = 'simple-note.md';
    const rawContent = 'Just some simple summary notes without front matter headers.';
    const parsed = parseBookmarkContent(filename, rawContent);

    expect(parsed.filename).toBe(filename);
    expect(parsed.title).toBe('simple note'); // derived from filename
    expect(parsed.url).toBe('');
    expect(parsed.description).toBe('');
    expect(parsed.tags).toEqual([]);
    expect(parsed.summaryText).toBe(rawContent);
  });
});
