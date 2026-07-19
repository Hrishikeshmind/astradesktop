/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Stable per-window App Hub entry point — App Hub V3 (one shell / one controller).
 *
 * Startup only evaluates this bootstrap. It owns the stable public facade
 * (window.gZenAppLauncher) that is never replaced, schedules an idle prewarm of
 * the advanced manager after delayed startup, and opens the SINGLE packaged
 * shell. There is no static fallback catalog and no fallback/advanced mode swap:
 * open() shows the one shell immediately and the manager fills it in place.
 *
 * A fatal init failure (manager module cannot be imported/instantiated) leaves a
 * small Retry banner in the same shell; already-rendered tiles, if any, remain
 * usable.
 */

const PANEL_ID = "PanelUI-zen-app-launcher";
const CONTAINER_ID = "PanelUI-zen-app-launcher-container";
const MANAGER_MODULE_URL =
  "chrome://browser/content/zen-components/AstraAppHubManager.mjs";
const PERF_PREF = "astra.diagnostics.performance";
const MAX_INIT_ATTEMPTS = 4;
const LOG_PREFIX = "[AstraAppHub]";

function isHttpsUrl(url) {
  try {
    const parsed = Services.io.newURI(url);
    return parsed?.scheme?.toLowerCase() === "https";
  } catch {
    return false;
  }
}

function openTrustedHttps(url) {
  if (!isHttpsUrl(url)) {
    console.error(`${LOG_PREFIX} blocked invalid URL`);
    return false;
  }
  const win = Services.wm.getMostRecentWindow("navigator:browser") || window;
  if (!win) {
    console.error(`${LOG_PREFIX} no browser window found`);
    return false;
  }
  try {
    if (typeof win.openTrustedLinkIn === "function") {
      win.openTrustedLinkIn(url, "tab", {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        inBackground: false,
      });
      win.focus();
      return true;
    }
    if (win.gBrowser) {
      win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(url, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        inBackground: false,
      });
      win.focus();
      return true;
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} open failed`, error);
    return false;
  }
  console.error(`${LOG_PREFIX} could not open URL`);
  return false;
}

class AstraAppHubBootstrap {
  #manager = null;
  /** True only once the single shell + catalog have rendered. */
  #ready = false;
  #popupTransition = false;
  #boundPopupShown = null;
  #boundPopupHidden = null;
  #boundCommand = null;
  #boundUnload = null;
  #listenersBound = false;
  #lastErrorStage = null;
  #lastOpenAttempt = null;
  #loggedReady = false;
  /** Single init flight per window; cleared in finally so retry is possible. */
  #initFlight = null;
  #initAttempts = 0;
  #prewarmScheduled = false;
  #idleDispatched = false;
  #initStart = 0;
  #initDuration = null;

  constructor() {
    window.gAstraAppHubBootstrap = this;
    // Stable public facade — never replaced by the advanced manager.
    window.gZenAppLauncher = {
      open: (eventOrOptions, win = window) => this.open(eventOrOptions, win),
      close: options => this.close(options),
      toggle: (eventOrOptions, win = window) =>
        this.toggle(eventOrOptions, win),
      openApp: (appOrUrl, options) => this.openApp(appOrUrl, options),
    };
    window.gAstraAppHubDiagnostics = this.#createDiagnostics();
    console.log(`${LOG_PREFIX} bootstrap loaded`);
    this.#ensureListeners();
    this.#schedulePrewarm();
  }

  #createDiagnostics() {
    const self = this;
    // Sanitized only: never expose URLs, search text, profile paths, history,
    // or tab titles. Booleans / counts / durations / stage names only.
    return {
      get bootstrapReady() {
        return true;
      },
      get ready() {
        return self.#ready;
      },
      get rendered() {
        try {
          return !!window.gAstraAppHubManager?.advancedDiagnostics?.rendered;
        } catch {
          return false;
        }
      },
      get stage() {
        try {
          return (
            window.gAstraAppHubManager?.advancedDiagnostics?.stage ||
            self.#lastErrorStage ||
            null
          );
        } catch {
          return self.#lastErrorStage;
        }
      },
      get lastErrorStage() {
        return self.#lastErrorStage;
      },
      get initDuration() {
        return self.#initDuration;
      },
      get iconSuccessCount() {
        try {
          return document.querySelectorAll(
            `#${CONTAINER_ID} .astra-app-hub-item-icon-stack[data-icon-loaded="true"]`
          ).length;
        } catch {
          return 0;
        }
      },
      get iconFailureCount() {
        try {
          return document.querySelectorAll(
            `#${CONTAINER_ID} .astra-app-hub-item-icon-stack[data-icon-error="true"]`
          ).length;
        } catch {
          return 0;
        }
      },
      get managerStage() {
        try {
          return window.gAstraAppHubManager?.advancedDiagnostics ?? null;
        } catch {
          return null;
        }
      },
      get panelFound() {
        return !!document.getElementById(PANEL_ID);
      },
      get lastOpenAttempt() {
        return self.#lastOpenAttempt;
      },
    };
  }

  get panel() {
    return document.getElementById(PANEL_ID);
  }

  get container() {
    return document.getElementById(CONTAINER_ID);
  }

  get isOpen() {
    const panel = this.panel;
    if (!panel) {
      return false;
    }
    const state = panel.state;
    return state === "open" || state === "showing";
  }

  get #isHiding() {
    return this.panel?.state === "hiding";
  }

  #perfEnabled() {
    try {
      return Services.prefs.getBoolPref(PERF_PREF, false);
    } catch {
      return false;
    }
  }

  // —— Manager coordination (called by the manager) ——

  /**
   * Advanced manager registers here. Does not replace gZenAppLauncher.
   */
  attachManager(manager) {
    if (!manager) {
      return;
    }
    this.#manager = manager;
    this.#lastErrorStage = null;
  }

  /**
   * "Ready" means the single shell + catalog have rendered — NOT a dual-mode
   * handoff. The bootstrap never hides/shows a second catalog.
   */
  setAdvancedReady(ready) {
    this.#ready = !!ready && !!this.#manager;
    if (this.#ready) {
      this.#lastErrorStage = null;
      if (!this.#loggedReady) {
        this.#loggedReady = true;
        console.log(`${LOG_PREFIX} App Hub ready`);
      }
    }
  }

  /**
   * Record a fatal init/render stage. The manager keeps any known-good tiles it
   * already rendered; the shell stays open. Never nulls the manager so Retry can
   * reuse it.
   */
  markManagerFailed(error, stage = "manager") {
    this.#ready = false;
    this.#lastErrorStage = stage;
    this.#loggedReady = false;
    console.error(`${LOG_PREFIX} App Hub init failed`, error || stage);
  }

  #markFailed(error, stage) {
    this.#ready = false;
    this.#lastErrorStage = stage;
    console.error(`${LOG_PREFIX} init failed at ${stage}`, error || stage);
  }

  // —— Idle prewarm ——

  #schedulePrewarm() {
    if (this.#prewarmScheduled) {
      return;
    }
    this.#prewarmScheduled = true;
    let started = false;
    const startIdle = () => {
      if (started) {
        return;
      }
      started = true;
      this.#dispatchIdlePrewarm();
    };

    try {
      // Already past delayed startup — prewarm on the next idle slice.
      if (window.gBrowserInit?.delayedStartupFinished) {
        startIdle();
        return;
      }
    } catch {
      // fall through to observer
    }

    try {
      const observe = subject => {
        try {
          if (subject === window) {
            Services.obs.removeObserver(
              observe,
              "browser-delayed-startup-finished"
            );
            startIdle();
          }
        } catch {
          // ignore
        }
      };
      Services.obs.addObserver(observe, "browser-delayed-startup-finished");
      // Safety net if the notification already fired or is missed.
      window.setTimeout(startIdle, 5000);
    } catch {
      startIdle();
    }
  }

  /**
   * Schedule the actual prewarm on the main-thread idle queue. Uses
   * Services.tm.idleDispatchToMainThread when available, else requestIdleCallback,
   * else a short timer. Never blocks first navigation / session restore.
   */
  #dispatchIdlePrewarm() {
    if (this.#idleDispatched) {
      return;
    }
    this.#idleDispatched = true;
    const run = () => {
      void this.#ensureInit("prewarm");
    };
    try {
      if (Services.tm?.idleDispatchToMainThread) {
        Services.tm.idleDispatchToMainThread(run);
        return;
      }
    } catch {
      // fall through
    }
    try {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 4000 });
        return;
      }
    } catch {
      // fall through
    }
    try {
      window.setTimeout(run, 1200);
    } catch {
      run();
    }
  }

  // —— Init (single flight, bounded, idempotent) ——

  /**
   * Import the manager (module eval is synchronous) and drive manager.init().
   * init() loads state, catalog, and builds/renders the single shell; it reports
   * readiness back through setAdvancedReady / markManagerFailed.
   */
  async #ensureInit(reason = "open") {
    if (this.#ready && this.#manager) {
      return true;
    }
    if (this.#initFlight) {
      return this.#initFlight;
    }
    if (!this.#manager && this.#initAttempts >= MAX_INIT_ATTEMPTS) {
      // Bounded: stop hammering a module that cannot be imported.
      return false;
    }
    this.#initAttempts++;
    this.#initFlight = this.#runInit(reason);
    try {
      return await this.#initFlight;
    } finally {
      this.#initFlight = null;
    }
  }

  async #runInit(reason) {
    const start = Date.now();
    this.#initStart = start;
    if (!window.gAstraAppHubManager) {
      try {
        // Synchronous module eval — window.gAstraAppHubManager is set on return.
        ChromeUtils.importESModule(MANAGER_MODULE_URL, { global: "current" });
      } catch (error) {
        this.#markFailed(error, "manager-import");
        return false;
      }
    }
    const manager = window.gAstraAppHubManager;
    if (!manager) {
      this.#markFailed(
        new Error("manager instance missing after import"),
        "manager-create"
      );
      return false;
    }
    this.#manager = manager;
    this.#lastErrorStage = null;
    if (typeof manager.init === "function") {
      try {
        // init() has its own single-flight (#initPromise) so the constructor's
        // auto-init and this call share one flight — no double init.
        await manager.init();
      } catch (error) {
        this.#markFailed(error, "manager-init");
        return false;
      }
    }
    this.#initDuration = Date.now() - start;
    if (this.#perfEnabled()) {
      // Timing only — no URLs, queries, or profile data.
      console.log(
        `${LOG_PREFIX} App Hub init ${this.#initDuration}ms [${reason}]`
      );
    }
    return this.#ready;
  }

  // —— Public facade ——

  #normalizeArgs(eventOrOptions) {
    if (
      eventOrOptions &&
      typeof eventOrOptions === "object" &&
      Object.getPrototypeOf(eventOrOptions) === Object.prototype &&
      (Object.prototype.hasOwnProperty.call(eventOrOptions, "event") ||
        Object.prototype.hasOwnProperty.call(eventOrOptions, "source") ||
        Object.prototype.hasOwnProperty.call(eventOrOptions, "restoreFocus"))
    ) {
      return eventOrOptions;
    }
    return { event: eventOrOptions || null, source: "compat" };
  }

  #isUsableAnchor(node) {
    if (
      !node ||
      !node.isConnected ||
      typeof node.getBoundingClientRect !== "function"
    ) {
      return false;
    }
    try {
      if (node.ownerGlobal && node.ownerGlobal !== window) {
        return false;
      }
    } catch {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  #resolveAnchor(event) {
    const doc = document;
    const src = event?.sourceEvent || event;
    const direct = src?.currentTarget || src?.target || event?.target;
    const closestBtn =
      typeof direct?.closest === "function"
        ? direct.closest("toolbarbutton")
        : null;
    const candidates = [
      this.#isUsableAnchor(closestBtn) ? closestBtn : null,
      this.#isUsableAnchor(direct) ? direct : null,
      doc.getElementById("zen-app-launcher-button"),
      doc.getElementById("zen-sidebar-top-buttons-separator"),
      doc.getElementById("zen-sidebar-top-buttons"),
      doc.getElementById("nav-bar"),
      doc.getElementById("PersonalToolbar"),
      doc.getElementById("browser"),
      doc.documentElement,
    ];
    for (const node of candidates) {
      if (this.#isUsableAnchor(node)) {
        return node;
      }
    }
    return doc.documentElement;
  }

  async toggle(eventOrOptions, win = window) {
    if (win && win !== window && win.gAstraAppHubBootstrap) {
      return win.gAstraAppHubBootstrap.toggle(eventOrOptions, win);
    }
    this.#ensureListeners();
    if (this.#popupTransition || this.#isHiding) {
      if (this.#popupTransition && !this.isOpen && !this.#isHiding) {
        this.#popupTransition = false;
      } else {
        return;
      }
    }
    if (this.isOpen) {
      this.close({ restoreFocus: true });
      return;
    }
    await this.open(eventOrOptions, win);
  }

  /**
   * Open the ONE shell immediately. If prewarm is still running the manager
   * completes init in this same open shell — never a mode swap. If the manager
   * module cannot be imported at all, open the empty shell with a Retry banner.
   */
  async open(eventOrOptions, win = window) {
    if (win && win !== window && win.gAstraAppHubBootstrap) {
      return win.gAstraAppHubBootstrap.open(eventOrOptions, win);
    }
    const options = this.#normalizeArgs(eventOrOptions);
    this.#lastOpenAttempt = Date.now();
    this.#ensureListeners();

    // Kick the single init flight. importESModule is synchronous, so on success
    // this.#manager is populated before the next line runs.
    if (!this.#manager) {
      void this.#ensureInit("open");
    }

    const manager = this.#manager;
    if (manager && typeof manager.open === "function") {
      try {
        // The manager opens the SAME shell (unhides container + openPopup) and
        // renders now / after its own init resolves.
        const opened = await manager.open(options);
        if (opened !== false) {
          return;
        }
      } catch (error) {
        this.#markFailed(error, "open");
      }
    }

    // Fatal: manager module unavailable. Open the empty shell + Retry banner.
    this.#openShellFatal(options);
  }

  #openShellFatal(options = {}) {
    const panel = this.panel;
    if (!panel) {
      this.#lastErrorStage = "panel-missing";
      console.error(`${LOG_PREFIX} panel missing`);
      return;
    }
    const container = this.container;
    if (container) {
      container.hidden = false;
    }
    this.#ensureFatalBanner();

    if (this.isOpen || this.#popupTransition || this.#isHiding) {
      if (this.#popupTransition && !this.isOpen && !this.#isHiding) {
        this.#popupTransition = false;
      } else {
        return;
      }
    }

    const anchor = this.#resolveAnchor(options.event);
    this.#popupTransition = true;
    try {
      panel.openPopup(anchor, "after_start", 0, 0, false, false);
    } catch (error) {
      this.#popupTransition = false;
      this.#lastErrorStage = "openPopup";
      console.error(`${LOG_PREFIX} openPopup failed`, error);
      try {
        if (typeof panel.openPopupAtScreen === "function") {
          const x =
            options.event?.screenX ?? options.event?.sourceEvent?.screenX;
          const y =
            options.event?.screenY ?? options.event?.sourceEvent?.screenY;
          if (Number.isFinite(x) && Number.isFinite(y)) {
            this.#popupTransition = true;
            panel.openPopupAtScreen(x, y, false);
          }
        }
      } catch (retryError) {
        this.#popupTransition = false;
        console.error(`${LOG_PREFIX} openPopup failed`, retryError);
      }
    }
  }

  #ensureFatalBanner() {
    const container = this.container;
    if (!container) {
      return;
    }
    let banner = document.getElementById("astra-app-hub-bootstrap-banner");
    if (!banner) {
      banner = document.createXULElement("hbox");
      banner.id = "astra-app-hub-bootstrap-banner";
      banner.classList.add("astra-app-hub-fallback-banner");
      banner.setAttribute("role", "status");
      banner.setAttribute("align", "center");

      const msg = document.createXULElement("label");
      msg.classList.add("astra-app-hub-fallback-banner-msg");
      msg.setAttribute("flex", "1");
      msg.setAttribute("value", "App Hub could not finish loading.");
      if (document.l10n) {
        try {
          document.l10n.setAttributes(msg, "astra-app-hub-load-failed");
        } catch {
          // keep static text
        }
      }

      const retry = document.createXULElement("toolbarbutton");
      retry.id = "astra-app-hub-bootstrap-retry";
      retry.classList.add("astra-app-hub-retry-btn");
      retry.setAttribute("data-action", "bootstrap-retry");
      retry.setAttribute("label", "Retry");
      if (document.l10n) {
        try {
          document.l10n.setAttributes(retry, "astra-app-hub-retry");
        } catch {
          // keep static label
        }
      }

      banner.appendChild(msg);
      banner.appendChild(retry);
      container.insertBefore(banner, container.firstChild);
    }
    banner.hidden = false;
  }

  #retryFromBanner() {
    const banner = document.getElementById("astra-app-hub-bootstrap-banner");
    void this.#ensureInit("retry").then(okReady => {
      try {
        if (this.#manager && this.isOpen && typeof this.#manager.open === "function") {
          void this.#manager.open({ event: null, source: "retry" });
        }
      } catch {
        // ignore
      }
      if (okReady && banner) {
        banner.hidden = true;
      }
    });
  }

  close(options = {}) {
    if (this.#manager?.close) {
      try {
        this.#manager.close(options);
        return;
      } catch (error) {
        console.error(`${LOG_PREFIX} manager close failed`, error);
      }
    }
    const panel = this.panel;
    if (!panel) {
      return;
    }
    if (this.isOpen) {
      this.#popupTransition = true;
      try {
        panel.hidePopup();
      } catch (error) {
        this.#popupTransition = false;
        console.error(`${LOG_PREFIX} hidePopup failed`, error);
      }
    }
  }

  openApp(appOrUrl, options = {}) {
    if (this.#manager?.openApp) {
      try {
        return this.#manager.openApp(appOrUrl, options);
      } catch (error) {
        this.#markFailed(error, "openApp");
      }
    }
    const url = typeof appOrUrl === "string" ? appOrUrl : appOrUrl?.url;
    if (!url) {
      return;
    }
    const ok = openTrustedHttps(url);
    if (ok) {
      try {
        this.panel?.hidePopup();
      } catch {
        // ignore
      }
    }
  }

  // —— Listeners ——

  #ensureListeners() {
    const panel = this.panel;
    if (!panel || this.#listenersBound) {
      return;
    }
    this.#boundPopupShown = () => {
      this.#popupTransition = false;
    };
    this.#boundPopupHidden = () => {
      this.#popupTransition = false;
    };
    this.#boundCommand = event => {
      try {
        const target = event.target;
        if (
          target?.getAttribute?.("data-action") === "bootstrap-retry"
        ) {
          this.#retryFromBanner();
        }
      } catch {
        // ignore
      }
    };
    this.#boundUnload = () => {
      this.#destroyListeners();
    };
    panel.addEventListener("popupshown", this.#boundPopupShown);
    panel.addEventListener("popuphidden", this.#boundPopupHidden);
    panel.addEventListener("command", this.#boundCommand);
    window.addEventListener("unload", this.#boundUnload, { once: true });
    this.#listenersBound = true;
  }

  #destroyListeners() {
    const panel = this.panel;
    if (panel && this.#listenersBound) {
      if (this.#boundPopupShown) {
        panel.removeEventListener("popupshown", this.#boundPopupShown);
      }
      if (this.#boundPopupHidden) {
        panel.removeEventListener("popuphidden", this.#boundPopupHidden);
      }
      if (this.#boundCommand) {
        panel.removeEventListener("command", this.#boundCommand);
      }
    }
    this.#listenersBound = false;
    this.#boundPopupShown = null;
    this.#boundPopupHidden = null;
    this.#boundCommand = null;
    this.#boundUnload = null;
  }
}

new AstraAppHubBootstrap();
