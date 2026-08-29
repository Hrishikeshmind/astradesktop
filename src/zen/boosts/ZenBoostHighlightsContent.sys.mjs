/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  normalizeHighlightText,
} from "resource:///modules/zen/boosts/ZenBoostHighlightsManager.sys.mjs";

const HIGHLIGHT_CLASS = "zen-boost-highlight";
const HIGHLIGHT_SHEET_URI =
  "data:text/css," +
  encodeURIComponent(`
mark.${HIGHLIGHT_CLASS} {
  background: color-mix(in srgb, #ffb020 55%, transparent);
  color: inherit;
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0 1px;
  cursor: pointer;
  transition: background 0.15s ease;
}
mark.${HIGHLIGHT_CLASS}:hover,
mark.${HIGHLIGHT_CLASS}[data-zen-highlight-active="true"] {
  background: color-mix(in srgb, #ffb020 75%, transparent);
  outline: 1px solid color-mix(in srgb, #ffb020 40%, transparent);
}
mark.${HIGHLIGHT_CLASS}[data-zen-highlight-orphaned="true"] {
  background: color-mix(in srgb, #727272 35%, transparent);
  outline: 1px dashed color-mix(in srgb, #727272 50%, transparent);
}
.zen-boost-highlight-popover {
  position: absolute;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  background: light-dark(#fcfcfe, #171717);
  border: 1px solid light-dark(#ededef, #3a3a3a);
  box-shadow: 0 8px 24px light-dark(rgba(0,0,0,0.12), rgba(0,0,0,0.45));
  font: 600 12px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: light-dark(#3a3a3b, #f3f3f3);
}
.zen-boost-highlight-popover-label {
  opacity: 0.85;
}
.zen-boost-highlight-popover-remove {
  border: none;
  border-radius: 8px;
  padding: 4px 10px;
  background: light-dark(#ebebed, #262626);
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.zen-boost-highlight-popover-remove:hover {
  background: light-dark(#3a3a3a, #cccccc);
  color: light-dark(#fcfcfe, #1c1c1e);
}
`);

export class ZenBoostHighlightsContent {
  #doc;
  #win;
  #sheetLoaded = false;
  #removePopover = null;

  constructor(doc) {
    this.#doc = doc;
    this.#win = doc.defaultView;
  }

  #ensureSheet() {
    if (this.#sheetLoaded || !this.#win?.windowUtils) {
      return;
    }
    const uri = Services.io.newURI(HIGHLIGHT_SHEET_URI);
    this.#win.windowUtils.loadSheet(uri, Ci.nsIStyleSheetService.AGENT_SHEET);
    this.#sheetLoaded = true;
  }

  getSelectionRange() {
    const sel = this.#win.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      return null;
    }
    const range = sel.getRangeAt(0);
    const text = normalizeHighlightText(sel.toString());
    if (!text || text.length < 2) {
      return null;
    }
    if (!this.#doc.body?.contains(range.commonAncestorContainer)) {
      return null;
    }
    return { range: range.cloneRange(), text };
  }

  wrapCurrentSelection(highlightId) {
    const picked = this.getSelectionRange();
    if (!picked) {
      return false;
    }
    return this.#wrapRange(picked.range, highlightId);
  }

  #wrapRange(range, highlightId) {
    try {
      const mark = this.#doc.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      mark.setAttribute("data-highlight-id", highlightId);
      range.surroundContents(mark);
      return true;
    } catch {
      try {
        const mark = this.#doc.createElement("mark");
        mark.className = HIGHLIGHT_CLASS;
        mark.setAttribute("data-highlight-id", highlightId);
        const extracted = range.extractContents();
        mark.appendChild(extracted);
        range.insertNode(mark);
        return true;
      } catch {
        return false;
      }
    }
  }

  #scoreMatch(bodyText, highlight, index) {
    const text = highlight.text;
    let score = 0;
    const before = normalizeHighlightText(bodyText.slice(Math.max(0, index - 40), index));
    const after = normalizeHighlightText(
      bodyText.slice(index + text.length, index + text.length + 40)
    );
    if (highlight.prefix && before.endsWith(highlight.prefix.slice(-20))) {
      score += 3;
    }
    if (highlight.suffix && after.startsWith(highlight.suffix.slice(0, 20))) {
      score += 3;
    }
    return score;
  }

  #findTextNodeMatches(text, needle) {
    const matches = [];
    const walker = this.#doc.createTreeWalker(
      this.#doc.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (parent?.closest(`mark.${HIGHLIGHT_CLASS}`)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = node.nodeValue;
      let pos = 0;
      let idx = value.indexOf(needle, pos);
      while (idx !== -1) {
        matches.push({ node, start: idx, end: idx + needle.length });
        pos = idx + 1;
        idx = value.indexOf(needle, pos);
      }
    }
    return matches;
  }

  applyHighlights(highlights) {
    this.#ensureSheet();
    if (!this.#doc.body || !highlights?.length) {
      return { applied: 0, orphaned: [] };
    }

    const bodyText = normalizeHighlightText(this.#doc.body.innerText || "");
    let applied = 0;
    const orphaned = [];

    for (const highlight of highlights) {
      if (this.#doc.querySelector(`mark.${HIGHLIGHT_CLASS}[data-highlight-id="${highlight.id}"]`)) {
        applied++;
        continue;
      }

      const needle = highlight.text;
      const textMatches = this.#findTextNodeMatches(bodyText, needle);
      if (!textMatches.length) {
        orphaned.push(highlight.id);
        continue;
      }

      let best = textMatches[0];
      let bestScore = -1;
      let occurrence = 0;
      for (const match of textMatches) {
        const indexInBody = this.#indexOfTextNodeMatch(match);
        const score = this.#scoreMatch(bodyText, highlight, indexInBody);
        if (score > bestScore) {
          bestScore = score;
          best = match;
        }
        if (occurrence === highlight.occurrenceIndex && bestScore < 0) {
          best = match;
        }
        occurrence++;
      }

      const range = this.#doc.createRange();
      range.setStart(best.node, best.start);
      range.setEnd(best.node, best.end);
      if (this.#wrapRange(range, highlight.id)) {
        applied++;
        if (highlight.status === "orphaned") {
          const mark = this.#doc.querySelector(
            `mark.${HIGHLIGHT_CLASS}[data-highlight-id="${highlight.id}"]`
          );
          mark?.setAttribute("data-zen-highlight-orphaned", "true");
        }
      } else {
        orphaned.push(highlight.id);
      }
    }

    return { applied, orphaned };
  }

  #indexOfTextNodeMatch(match) {
    const walker = this.#doc.createTreeWalker(this.#doc.body, NodeFilter.SHOW_TEXT);
    let offset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node === match.node) {
        return offset + match.start;
      }
      offset += node.nodeValue?.length ?? 0;
    }
    return match.start;
  }

  removeHighlightFromDOM(highlightId) {
    const mark = this.#doc.querySelector(
      `mark.${HIGHLIGHT_CLASS}[data-highlight-id="${highlightId}"]`
    );
    if (!mark) {
      return false;
    }
    const parent = mark.parentNode;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
    return true;
  }

  clearAllFromDOM() {
    for (const mark of [...this.#doc.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`)]) {
      const id = mark.getAttribute("data-highlight-id");
      if (id) {
        this.removeHighlightFromDOM(id);
      }
    }
  }

  bindInteractions({ onRemove }) {
    this.#doc.addEventListener("click", event => {
      const mark = event.target.closest?.(`mark.${HIGHLIGHT_CLASS}`);
      if (!mark) {
        this.#hideRemovePopover();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.#showRemovePopover(mark, onRemove);
    });
  }

  #showRemovePopover(mark, onRemove) {
    this.#hideRemovePopover();
    for (const el of this.#doc.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`)) {
      el.removeAttribute("data-zen-highlight-active");
    }
    mark.setAttribute("data-zen-highlight-active", "true");

    const pop = this.#doc.createElement("div");
    pop.className = "zen-boost-highlight-popover";
    pop.setAttribute("role", "toolbar");

    const label = this.#doc.createElement("span");
    label.className = "zen-boost-highlight-popover-label";
    label.textContent = "Boost highlight";

    const btn = this.#doc.createElement("button");
    btn.type = "button";
    btn.className = "zen-boost-highlight-popover-remove";
    btn.textContent = "Remove";
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const id = mark.getAttribute("data-highlight-id");
      onRemove?.(id);
      this.#hideRemovePopover();
    });

    pop.appendChild(label);
    pop.appendChild(btn);
    this.#doc.documentElement.appendChild(pop);

    const rect = mark.getBoundingClientRect();
    pop.style.top = `${Math.max(8, rect.top + this.#win.scrollY - pop.offsetHeight - 8)}px`;
    pop.style.left = `${Math.max(8, rect.left + this.#win.scrollX)}px`;
    this.#removePopover = pop;
  }

  #hideRemovePopover() {
    this.#removePopover?.remove();
    this.#removePopover = null;
    for (const el of this.#doc.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`)) {
      el.removeAttribute("data-zen-highlight-active");
    }
  }
}
