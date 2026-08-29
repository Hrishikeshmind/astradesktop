/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

const SAVE_FILENAME = "zen-boost-highlights.jsonlz4";
const CONTEXT_CHARS = 40;

export function canonicalPageURL(urlString) {
  try {
    const url = new URL(urlString);
    return `${url.origin}${url.pathname}`;
  } catch {
    return urlString;
  }
}

export function normalizeHighlightText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function buildHighlightRecord(selectionText, range) {
  const text = normalizeHighlightText(selectionText);
  if (!text) {
    return null;
  }

  const container = range?.commonAncestorContainer;
  const rootText = container?.textContent || "";
  const start = Math.max(0, range.startOffset - CONTEXT_CHARS);
  const end = Math.min(rootText.length, range.endOffset + CONTEXT_CHARS);
  const local = rootText.slice(start, end);
  const anchor = range.startOffset - start;
  const prefix = local.slice(Math.max(0, anchor - CONTEXT_CHARS), anchor);
  const suffix = local.slice(anchor + text.length, anchor + text.length + CONTEXT_CHARS);

  const bodyText = normalizeHighlightText(
    range?.startContainer?.ownerDocument?.body?.innerText || ""
  );
  let occurrenceIndex = 0;
  if (bodyText) {
    let pos = 0;
    let idx = bodyText.indexOf(text, pos);
    const targetPrefix = normalizeHighlightText(prefix);
    const targetSuffix = normalizeHighlightText(suffix);
    let bestIndex = 0;
    let bestScore = -1;
    while (idx !== -1) {
      const before = normalizeHighlightText(bodyText.slice(Math.max(0, idx - CONTEXT_CHARS), idx));
      const after = normalizeHighlightText(
        bodyText.slice(idx + text.length, idx + text.length + CONTEXT_CHARS)
      );
      let score = 0;
      if (targetPrefix && before.endsWith(targetPrefix.slice(-20))) {
        score += 2;
      }
      if (targetSuffix && after.startsWith(targetSuffix.slice(0, 20))) {
        score += 2;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = occurrenceIndex;
      }
      occurrenceIndex++;
      pos = idx + 1;
      idx = bodyText.indexOf(text, pos);
    }
    occurrenceIndex = bestIndex;
  }

  return {
    id: Services.uuid.generateUUID().toString(),
    text,
    prefix: normalizeHighlightText(prefix),
    suffix: normalizeHighlightText(suffix),
    occurrenceIndex,
    createdAt: new Date().toISOString(),
    color: "amber",
    status: "active",
  };
}

class nsZenBoostHighlightsManager {
  #file = null;
  #pages = new Map();

  constructor() {
    this.#load().catch(console.error);
  }

  get #storePath() {
    return PathUtils.join(PathUtils.profileDir, SAVE_FILENAME);
  }

  async #load() {
    this.#file = new JSONFile({
      path: this.#storePath,
      compression: "lz4",
    });
    await this.#file.load();
    const raw = this.#file.data ?? {};
    this.#pages = new Map(Object.entries(raw));
  }

  async #ensureLoaded() {
    if (!this.#file) {
      await this.#load();
    }
  }

  async #persist() {
    await this.#ensureLoaded();
    const obj = Object.fromEntries(this.#pages);
    this.#file.data = obj;
    await this.#file.write();
  }

  #notify() {
    Services.obs.notifyObservers(null, "zen-boost-highlights-update");
  }

  async getHighlightsForURL(urlString) {
    await this.#ensureLoaded();
    const key = canonicalPageURL(urlString);
    return [...(this.#pages.get(key)?.highlights ?? [])];
  }

  async addHighlight(urlString, record) {
    if (!record?.text) {
      return null;
    }
    await this.#ensureLoaded();
    const key = canonicalPageURL(urlString);
    const entry = this.#pages.get(key) ?? { highlights: [] };
    entry.highlights.push(record);
    this.#pages.set(key, entry);
    await this.#persist();
    this.#notify();
    return record;
  }

  async removeHighlight(urlString, highlightId) {
    await this.#ensureLoaded();
    const key = canonicalPageURL(urlString);
    const entry = this.#pages.get(key);
    if (!entry) {
      return false;
    }
    const before = entry.highlights.length;
    entry.highlights = entry.highlights.filter(h => h.id !== highlightId);
    if (!entry.highlights.length) {
      this.#pages.delete(key);
    } else {
      this.#pages.set(key, entry);
    }
    if (before === entry.highlights?.length) {
      return false;
    }
    await this.#persist();
    this.#notify();
    return true;
  }

  async clearPageHighlights(urlString) {
    await this.#ensureLoaded();
    const key = canonicalPageURL(urlString);
    if (!this.#pages.has(key)) {
      return 0;
    }
    const count = this.#pages.get(key).highlights.length;
    this.#pages.delete(key);
    await this.#persist();
    this.#notify();
    return count;
  }

  async markOrphaned(urlString, highlightId) {
    await this.#ensureLoaded();
    const key = canonicalPageURL(urlString);
    const entry = this.#pages.get(key);
    if (!entry) {
      return;
    }
    for (const h of entry.highlights) {
      if (h.id === highlightId) {
        h.status = "orphaned";
      }
    }
    this.#pages.set(key, entry);
    await this.#persist();
  }

  async countForURL(urlString) {
    const list = await this.getHighlightsForURL(urlString);
    return list.filter(h => h.status !== "orphaned").length;
  }
}

export const gZenBoostHighlightsManager = new nsZenBoostHighlightsManager();
