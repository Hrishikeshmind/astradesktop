/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF_ENABLED = "astra.boost.highlighter.enabled";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  gZenBoostHighlightsManager:
    "resource:///modules/zen/boosts/ZenBoostHighlightsManager.sys.mjs",
});

export class nsZenBoostHighlightsUI {
  #window;
  #document;
  #badge = null;
  #boundUpdate = null;

  constructor(win) {
    this.#window = win;
    this.#document = win.document;
    this.#boundUpdate = () => this.#refreshBadge();
    Services.obs.addObserver(this.#boundUpdate, "zen-boost-highlights-update");
    win.addEventListener(
      "unload",
      () => {
        Services.obs.removeObserver(this.#boundUpdate, "zen-boost-highlights-update");
      },
      { once: true }
    );
    this.#initContextMenu();
    this.#initBadge();
    this.#window.gBrowser.tabContainer.addEventListener("TabSelect", () =>
      this.#refreshBadge()
    );
    this.#window.gBrowser.tabContainer.addEventListener("TabBrowserUpdated", () =>
      this.#refreshBadge()
    );
  }

  static isEnabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  }

  #initContextMenu() {
    const menu = this.#document.getElementById("contentAreaContextMenu");
    if (!menu || this.#document.getElementById("zen-boost-highlight-menu")) {
      return;
    }
    const sep = this.#document.createXULElement("menuseparator");
    sep.id = "zen-boost-highlight-sep";
    const item = this.#document.createXULElement("menuitem");
    item.id = "zen-boost-highlight-menu";
    item.setAttribute(
      "label",
      this.#window.gBrowser?.selectedBrowser?.browsingContext?.window?.document?.l10n
        ? "Highlight with Boost"
        : "Highlight with Boost"
    );
    item.setAttribute("accesskey", "H");
    item.addEventListener("command", () => this.#highlightSelection());
    menu.addEventListener("popupshowing", () => {
      const enabled = nsZenBoostHighlightsUI.isEnabled();
      item.hidden = !enabled;
      sep.hidden = !enabled;
      if (!enabled) {
        return;
      }
      item.setAttribute("disabled", "true");
      try {
        const browser = this.#window.gBrowser.selectedBrowser;
        const sel = browser?.browsingContext?.window?.getSelection?.();
        item.removeAttribute("disabled");
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          item.setAttribute("disabled", "true");
        }
      } catch {
        item.setAttribute("disabled", "true");
      }
    });
    menu.appendChild(sep);
    menu.appendChild(item);
  }

  #initBadge() {
    if (this.#document.getElementById("zen-boost-highlight-badge")) {
      return;
    }
    const anchor =
      this.#document.getElementById("zen-site-data-icon-button") ||
      this.#document.getElementById("identity-icon-box");
    if (!anchor?.parentNode) {
      return;
    }
    const badge = this.#document.createXULElement("toolbarbutton");
    badge.id = "zen-boost-highlight-badge";
    badge.className = "zen-boost-highlight-badge subviewbutton";
    badge.setAttribute("tooltiptext", "Boost highlights on this page");
    badge.hidden = true;
    badge.addEventListener("command", () => this.#clearPageHighlights());
    anchor.parentNode.insertBefore(badge, anchor.nextSibling);
    this.#badge = badge;
    this.#refreshBadge();
  }

  async #refreshBadge() {
    if (!this.#badge || !nsZenBoostHighlightsUI.isEnabled()) {
      if (this.#badge) {
        this.#badge.hidden = true;
      }
      return;
    }
    try {
      const browser = this.#window.gBrowser.selectedBrowser;
      const url = browser?.currentURI?.spec;
      if (!url || url.startsWith("about:") || url.startsWith("chrome:")) {
        this.#badge.hidden = true;
        return;
      }
      const count = await lazy.gZenBoostHighlightsManager.countForURL(url);
      if (count > 0) {
        this.#badge.hidden = false;
        this.#badge.setAttribute("label", String(count));
        this.#badge.setAttribute(
          "tooltiptext",
          `${count} Boost highlight${count === 1 ? "" : "s"} on this page — click to clear`
        );
      } else {
        this.#badge.hidden = true;
      }
    } catch {
      this.#badge.hidden = true;
    }
  }

  #actorForSelectedTab() {
    const browser = this.#window.gBrowser.selectedBrowser;
    return browser?.browsingContext?.currentWindowGlobal?.getActor("ZenBoosts");
  }

  async #highlightSelection() {
    const actor = this.#actorForSelectedTab();
    if (!actor) {
      return;
    }
    await actor.sendQuery("ZenBoost:HighlightSelection");
    this.#refreshBadge();
  }

  async #clearPageHighlights() {
    const actor = this.#actorForSelectedTab();
    const browser = this.#window.gBrowser.selectedBrowser;
    const url = browser?.currentURI?.spec;
    if (!url) {
      return;
    }
    const count = await lazy.gZenBoostHighlightsManager.clearPageHighlights(url);
    if (actor) {
      await actor.sendQuery("ZenBoost:HighlightsReload");
    }
    this.#showToast(
      count
        ? `Cleared ${count} Boost highlight${count === 1 ? "" : "s"} on this page`
        : "No highlights to clear"
    );
    this.#refreshBadge();
  }

  #showToast(message) {
    const toast = this.#document.createElement("div");
    toast.className = "zen-boost-highlight-toast";
    toast.textContent = message;
    this.#document.body.appendChild(toast);
    this.#window.setTimeout(() => toast.remove(), 3200);
  }

  notifyOrphaned(count) {
    if (count > 0) {
      this.#showToast(
        `${count} saved highlight${count === 1 ? "" : "s"} could not be restored on this page`
      );
    }
  }
}

export function initZenBoostHighlightsUI(win) {
  if (!win.gZenBoostHighlightsUI) {
    win.gZenBoostHighlightsUI = new nsZenBoostHighlightsUI(win);
  }
  return win.gZenBoostHighlightsUI;
}
