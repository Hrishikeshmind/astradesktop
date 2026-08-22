/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable consistent-return */

const lazy = {};

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "COMPACT_MODE_FLASH_DURATION",
  "zen.view.compact.toolbar-flash-popup.duration",
  800
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "COMPACT_MODE_FLASH_ENABLED",
  "zen.view.compact.toolbar-flash-popup",
  true
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "COMPACT_MODE_CAN_ANIMATE_SIDEBAR",
  "zen.view.compact.animate-sidebar",
  true
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "COMPACT_MODE_SHOW_SIDEBAR_AND_TOOLBAR_ON_HOVER",
  "zen.view.compact.show-sidebar-and-toolbar-on-hover",
  true
);

// Distance (in CSS pixels) the mouse can travel past the window bounds after
// leaving the window before the hovered element is collapsed
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "COMPACT_MODE_OUTSIDE_WINDOW_HORIZONTAL_OFFSET",
  "zen.view.compact.outside-window-edge-offset.horizontal",
  250
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "COMPACT_MODE_OUTSIDE_WINDOW_VERTICAL_OFFSET",
  "zen.view.compact.outside-window-edge-offset.vertical",
  150
);

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "zenMouseTracker",
  "@mozilla.org/zen/mouse-tracker;1",
  Ci.nsIZenMouseTracker
);

ChromeUtils.defineLazyGetter(lazy, "mainAppWrapper", () =>
  document.getElementById("zen-main-app-wrapper")
);

window.gZenCompactModeManager = {
  _flashTimeouts: {},
  _eventListeners: [],
  _removeHoverFrames: {},

  // Delay to avoid flickering when hovering over the sidebar
  HOVER_HACK_DELAY: Services.prefs.getIntPref(
    "zen.view.compact.hover-hack-delay",
    0
  ),

  // Physical edge proximity (CSS px). Matches _getCrossedEdge maxDistance.
  EDGE_REVEAL_THRESHOLD: 8,

  _edgePointerBound: false,
  _edgePointerListener: null,
  _edgeRevealRaf: null,
  _pendingEdgePointer: null,
  _edgeRevealActive: false,
  _topToolbarEdgeRevealActive: false,
  /**
   * Shared reveal flag for Sidebar+Top Toolbar + Compact: sidebar and toolbar
   * are one L-shaped chrome unit (never independently visible).
   */
  _compactChromeRevealed: false,
  COMPACT_CHROME_ATTR: "zen-compact-chrome-revealed",
  COMPACT_CHROME_FLASH_ID: "compact-chrome",
  _cachedSidebarVerticalBounds: null,
  _cachedSidebarHandoffExtent: null,
  /** @type {Set<string>|null} Tokens for Astra-owned overlay panels. */
  _panelLockTokens: null,
  /** True only while Astra itself set zen-has-hover for a panel lock. */
  _panelLockOwnedHover: false,
  PANEL_LOCK_ATTR: "astra-compact-panel-lock",

  preInit() {
    this._wasInCompactMode = Services.prefs.getBoolPref(
      "zen.view.compact.enable-at-startup",
      false
    );
    this._canDebugLog = Services.prefs.getBoolPref(
      "zen.view.compact.debug",
      false
    );

    this.addContextMenu();
  },

  init() {
    this.addMouseActions();
    this._ensureEdgeRevealListener();

    const tabIsRightObserver = this._updateSidebarIsOnRight.bind(this);
    Services.prefs.addObserver(
      "zen.tabs.vertical.right-side",
      tabIsRightObserver
    );

    const outsideMouseTrackerExitObserver =
      this._onOutsideMouseTrackerExit.bind(this);
    Services.obs.addObserver(
      outsideMouseTrackerExitObserver,
      "zen-mouse-tracker:exited"
    );

    window.addEventListener(
      "unload",
      () => {
        this._stopTrackingMouseOutsideWindow();
        Services.obs.removeObserver(
          outsideMouseTrackerExitObserver,
          "zen-mouse-tracker:exited"
        );
        Services.prefs.removeObserver(
          "zen.tabs.vertical.right-side",
          tabIsRightObserver
        );
        this._teardownEdgeRevealListener();
        this._clearAllPanelLocks();
      },
      { once: true }
    );

    gZenUIManager.addPopupTrackingAttribute(this.sidebar);
    gZenUIManager.addPopupTrackingAttribute(
      document.getElementById("zen-appcontent-navbar-wrapper")
    );

    this.addHasPolyfillObserver();

    // Clear hover states when window state changes (minimize, maximize, etc.)
    window.addEventListener("sizemodechange", () => {
      this._invalidateSidebarBoundsCache();
      this._clearAllHoverStates();
      this._clearEdgeRevealState();
    });
    window.addEventListener("resize", () =>
      this._invalidateSidebarBoundsCache()
    );
    window.addEventListener("fullscreen", () => {
      this._invalidateSidebarBoundsCache();
      this._clearEdgeRevealState();
    });

    // Hide any element kept open by the outside mouse tracking as soon as the
    // window loses focus
    window.addEventListener("deactivate", () => this._collapseTrackedElement());

    this._canShowBackgroundTabToast = Services.prefs.getBoolPref(
      "zen.view.compact.show-background-tab-toast",
      true
    );

    if (AppConstants.platform == "macosx") {
      window.addEventListener("mouseover", event => {
        const buttons = gZenVerticalTabsManager.actualWindowButtons;
        if (event.target.closest(".titlebar-buttonbox-container") === buttons) {
          return;
        }
        this._setElementExpandAttribute(buttons, false);
      });
    }

    SessionStore.promiseAllWindowsRestored.then(() => {
      this.preference = this._wasInCompactMode;
      this._syncAutohideSidebarAttribute();
    });
  },

  log(...args) {
    if (this._canDebugLog) {
      // eslint-disable-next-line no-console
      console.debug("[Zen Compact Mode]", ...args);
    }
  },

  get preference() {
    return document.documentElement.getAttribute("zen-compact-mode") === "true";
  },

  get shouldBeCompact() {
    return !document.documentElement
      .getAttribute("chromehidden")
      ?.includes("toolbar");
  },

  set preference(value) {
    if (!this.shouldBeCompact) {
      value = false;
    }
    this.log("Setting compact mode preference to", value);
    if (
      this.preference === value ||
      document.documentElement.hasAttribute("zen-compact-animating")
    ) {
      if (typeof this._wasInCompactMode !== "undefined") {
        // We wont do anything with it anyway, so we remove it
        delete this._wasInCompactMode;
      }
      delete this._ignoreNextHover;
      // We dont want the user to be able to spam the button
      return;
    }
    delete this._isTabBeingDragged;
    this._stopTrackingMouseOutsideWindow();
    this.sidebar.removeAttribute("zen-user-show");
    // Pair-hide (Sidebar+Top / Collapsed): mark animating BEFORE compact-mode
    // so the toolbar overlay does not snap to height:0 a frame before the
    // sidebar starts moving.
    const hideToolbarToo =
      value && !gZenVerticalTabsManager?._hasSetSingleToolbar;
    if (hideToolbarToo) {
      document.documentElement.setAttribute("zen-compact-animating", "true");
    }
    // We use this element in order to make it persis across restarts, by using the XULStore.
    // main-window can't store attributes other than window sizes, so we use this instead
    lazy.mainAppWrapper.setAttribute("zen-compact-mode", value);
    document.documentElement.setAttribute("zen-compact-mode", value);
    if (typeof this._wasInCompactMode === "undefined") {
      Services.prefs.setBoolPref("zen.view.compact.enable-at-startup", value);
    }
    this._invalidateSidebarBoundsCache();
    if (value) {
      // Compact Mode always auto-hides the sidebar; keep the CSS gate
      // (hide-tabbar OR single-toolbar) satisfied for every layout mode.
      Services.prefs.setBoolPref("zen.view.compact.hide-tabbar", true);
      // Sidebar+Top Toolbar / Collapsed: collapse the top bar too (unified
      // L-chrome). Context-menu "Just toolbar" / "Just sidebar" can still
      // override hide-toolbar afterward. Only Sidebar never hides a top bar.
      if (!gZenVerticalTabsManager?._hasSetSingleToolbar) {
        Services.prefs.setBoolPref("zen.view.compact.hide-toolbar", true);
      }
    } else {
      this._clearEdgeRevealState();
      this._clearAllPanelLocks();
    }
    this._syncAutohideSidebarAttribute();
    this._updateEvent();
  },

  /** Compact Mode: expose sidebar auto-hide for CSS/tests (all layouts). */
  _syncAutohideSidebarAttribute() {
    if (this.preference) {
      document.documentElement.setAttribute(
        "zen-compact-autohide-sidebar",
        "true"
      );
    } else {
      document.documentElement.removeAttribute("zen-compact-autohide-sidebar");
    }
  },

  /**
   * Keep compact empty-tab chrome in sync when tabs change outside TabSelect
   * (e.g. close-all then open AI sidebar). Mirrors ZenSpaceManager.#changeToEmptyTab.
   */
  syncEmptyTabSidebarState() {
    if (!this.sidebar) {
      return;
    }
    const tab = gBrowser?.selectedTab;
    const isEmpty = tab ? tab.hasAttribute("zen-empty-tab") : true;
    this.sidebar.toggleAttribute("zen-has-empty-tab", isEmpty);
    document.documentElement.setAttribute("zen-has-empty-tab", isEmpty);
  },

  /** Root flag consumed by zen-sidebar.css for revamp-panel z-index. */
  setRevampPanelOpen(open) {
    document.documentElement.toggleAttribute(
      "astra-compact-revamp-panel-open",
      !!open
    );
    this._invalidateSidebarBoundsCache();
  },

  /**
   * Re-run compact layout assumptions before showing Firefox revamp / AI panels.
   * Safe to call when tab count is zero.
   */
  ensureRevampPanelLayout() {
    if (!this.preference) {
      this.setRevampPanelOpen(false);
      return;
    }
    this.syncEmptyTabSidebarState();
    const sidebarBox = document.getElementById("sidebar-box");
    const aiBox = document.getElementById("ai-window-box");
    const revampOpen =
      (typeof SidebarController !== "undefined" && SidebarController.isOpen) ||
      (sidebarBox && !sidebarBox.hidden) ||
      (aiBox &&
        !aiBox.hidden &&
        aiBox.getBoundingClientRect().width > 1);
    this.setRevampPanelOpen(revampOpen);
    this.getAndApplySidebarWidth();
    window.dispatchEvent(new Event("resize"));
  },

  /**
   * Isolate Compact Mode from an Astra overlay panel (App Hub).
   * The panel must open without also revealing the sidebar / unified chrome.
   * Suppresses edge-hover and mouseenter reveal until unlockForPanel.
   * Does not read or write Firefox SidebarState / AI panel state.
   *
   * @param {string} token Stable id such as "PanelUI-zen-app-launcher".
   */
  lockForPanel(token) {
    if (!token) {
      return;
    }
    if (!this._panelLockTokens) {
      this._panelLockTokens = new Set();
    }
    this._panelLockTokens.add(String(token));
    // Isolation only applies when compact mode is actively hiding chrome.
    if (!this.preference || !this.canHideSidebar || !this.sidebar) {
      return;
    }
    this._hideCompactChromeForIsolatedPanel();
  },

  /**
   * Stable on-screen anchor so an overlay is not tied to the compact sidebar
   * button (which slides off-screen when chrome is hidden).
   */
  getIsolatedOverlayAnchor() {
    return (
      document.getElementById("zen-appcontent-wrapper") ||
      document.getElementById("browser") ||
      document.documentElement
    );
  },

  shouldIsolateOverlayPanels() {
    return !!(this.preference && this.canHideSidebar);
  },

  _hideCompactChromeForIsolatedPanel() {
    this._panelLockOwnedHover = false;
    this._edgeRevealActive = false;
    this._topToolbarEdgeRevealActive = false;
    this._compactChromeRevealed = false;
    document.documentElement.removeAttribute(this.COMPACT_CHROME_ATTR);
    this.clearFlashTimeout(this.COMPACT_CHROME_FLASH_ID);
    if (!this.sidebar) {
      return;
    }
    this.clearFlashTimeout("has-hover" + this.sidebar.id);
    if (this._removeHoverFrames?.[this.sidebar.id]) {
      window.cancelAnimationFrame(this._removeHoverFrames[this.sidebar.id]);
      this._removeHoverFrames[this.sidebar.id] = null;
    }
    this._edgeRevealActive = false;
    this._topToolbarEdgeRevealActive = false;
    this._compactChromeRevealed = false;
    document.documentElement.removeAttribute(this.COMPACT_CHROME_ATTR);
    this.sidebar.removeAttribute(this.PANEL_LOCK_ATTR);
    this._setElementExpandAttribute(this.sidebar, false, "zen-has-hover");
    this._setElementExpandAttribute(this.sidebar, false, "has-popup-menu");
    this._setElementExpandAttribute(
      this.sidebar,
      false,
      "zen-compact-mode-active"
    );
    const toolbar = this._getTopToolbarElement();
    if (toolbar) {
      this.clearFlashTimeout("has-hover" + toolbar.id);
      if (this._removeHoverFrames?.[toolbar.id]) {
        window.cancelAnimationFrame(this._removeHoverFrames[toolbar.id]);
        this._removeHoverFrames[toolbar.id] = null;
      }
      this._setElementExpandAttribute(toolbar, false, "zen-has-hover");
      this._setElementExpandAttribute(toolbar, false, "has-popup-menu");
      this._setElementExpandAttribute(
        toolbar,
        false,
        "zen-compact-mode-active"
      );
    }
  },

  /**
   * Release a panel lock. When no Astra tokens remain, compact hover/reveal
   * resumes. Does not re-open the sidebar.
   *
   * @param {string} token
   */
  unlockForPanel(token) {
    if (!token || !this._panelLockTokens) {
      return;
    }
    this._panelLockTokens.delete(String(token));
    if (this._panelLockTokens.size > 0) {
      return;
    }
    this._releasePanelLockVisualState();
  },

  isPanelLocked() {
    return !!(this._panelLockTokens && this._panelLockTokens.size > 0);
  },

  _releasePanelLockVisualState() {
    this._panelLockTokens = null;
    if (!this.sidebar) {
      this._panelLockOwnedHover = false;
      return;
    }
    this.sidebar.removeAttribute(this.PANEL_LOCK_ATTR);
    const ownedHover = this._panelLockOwnedHover;
    this._panelLockOwnedHover = false;
    if (!ownedHover) {
      return;
    }
    // Do not strip real pointer hover or native popup-tracking ownership.
    if (
      this.sidebar.matches(":hover") ||
      this.sidebar.hasAttribute("has-popup-menu") ||
      this.sidebar.hasAttribute("zen-user-show") ||
      this.sidebar.hasAttribute("zen-has-empty-tab")
    ) {
      return;
    }
    this._setElementExpandAttribute(this.sidebar, false, "zen-has-hover");
    if (this.usesUnifiedCompactChrome) {
      // Keep unified chrome in sync: releasing owned hover must not leave
      // the toolbar stranded alone.
      const toolbar = this._getTopToolbarElement();
      if (
        toolbar &&
        toolbar.hasAttribute("zen-has-hover") &&
        !toolbar.matches(":hover") &&
        !toolbar.hasAttribute("has-popup-menu") &&
        !toolbar.hasAttribute("zen-compact-mode-active")
      ) {
        this._setCompactChromeRevealed(false, { immediate: true });
      } else {
        this._compactChromeRevealed = false;
        document.documentElement.removeAttribute(this.COMPACT_CHROME_ATTR);
      }
    } else {
      this._edgeRevealActive = false;
    }
  },

  _clearAllPanelLocks() {
    if (!this._panelLockTokens?.size) {
      this._panelLockTokens = null;
      this._panelLockOwnedHover = false;
      if (this.sidebar) {
        this.sidebar.removeAttribute(this.PANEL_LOCK_ATTR);
      }
      return;
    }
    this._panelLockTokens.clear();
    this._releasePanelLockVisualState();
  },

  get sidebarIsOnRight() {
    if (typeof this._sidebarIsOnRight !== "undefined") {
      return this._sidebarIsOnRight;
    }
    this._sidebarIsOnRight = Services.prefs.getBoolPref(
      "zen.tabs.vertical.right-side"
    );
    return this._sidebarIsOnRight;
  },

  get sidebar() {
    return gNavToolbox;
  },

  addHasPolyfillObserver() {
    const attributes = [
      "panelopen",
      "open",
      "breakout-extend",
      "zen-floating-urlbar",
    ];
    this.sidebarObserverId = ZenHasPolyfill.observeSelectorExistence(
      this.sidebar,
      [
        {
          selector:
            ":where([panelopen], [open], [breakout-extend])" +
            ":not(#urlbar[zen-floating-urlbar='true']):not(tab):not(.zen-compact-mode-ignore)",
        },
      ],
      "zen-compact-mode-active",
      attributes
    );
    this.toolbarObserverId = ZenHasPolyfill.observeSelectorExistence(
      document.getElementById("zen-appcontent-navbar-wrapper"),
      [
        {
          selector:
            ":where([panelopen], [open], #urlbar:focus-within, [breakout-extend])" +
            ":not(.zen-compact-mode-ignore)",
        },
      ],
      "zen-compact-mode-active",
      attributes
    );
    // Always connect this observer, we need it even if compact mode is disabled
    ZenHasPolyfill.connectObserver(this.toolbarObserverId);
  },

  flashSidebarIfNecessary(aInstant = false) {
    // This function is called after exiting DOM fullscreen mode,
    // so we do a bit of a hack to re-calculate the URL height
    if (aInstant) {
      gZenVerticalTabsManager.recalculateURLBarHeight(true);
    }
    if (
      !aInstant &&
      this.preference &&
      lazy.COMPACT_MODE_FLASH_ENABLED &&
      !gZenGlanceManager._animating
    ) {
      this.flashSidebar();
    }
  },

  addContextMenu() {
    const fragment = window.MozXULElement.parseXULToFragment(`
      <menu id="zen-context-menu-compact-mode" data-l10n-id="zen-toolbar-context-compact-mode">
        <menupopup>
          <menuitem id="zen-context-menu-compact-mode-toggle" data-l10n-id="zen-toolbar-context-compact-mode-enable" type="checkbox" command="cmd_zenCompactModeToggle"/>
          <menuseparator/>
          <menuitem id="zen-context-menu-compact-mode-hide-sidebar" data-l10n-id="zen-toolbar-context-compact-mode-just-tabs" type="radio" />
          <menuitem id="zen-context-menu-compact-mode-hide-toolbar" data-l10n-id="zen-toolbar-context-compact-mode-just-toolbar" type="radio" />
          <menuitem id="zen-context-menu-compact-mode-hide-both" data-l10n-id="zen-toolbar-context-compact-mode-hide-both" type="radio" />
        </menupopup>
      </menu>
      <menuseparator />
    `);

    const idToAction = {
      "zen-context-menu-compact-mode-hide-sidebar": this.hideSidebar.bind(this),
      "zen-context-menu-compact-mode-hide-toolbar": this.hideToolbar.bind(this),
      "zen-context-menu-compact-mode-hide-both": this.hideBoth.bind(this),
    };

    for (let menuitem of fragment.querySelectorAll("menuitem")) {
      if (menuitem.id in idToAction) {
        menuitem.addEventListener("command", idToAction[menuitem.id]);
      }
    }

    document.getElementById("toolbar-context-menu").prepend(fragment);
    this.updateContextMenu();
  },

  updateCompactModeContext(isSingleToolbar) {
    this._syncAutohideSidebarAttribute();
    const isIllegalState = this.checkIfIllegalState();
    const menuitem = document.getElementById(
      "zen-context-menu-compact-mode-toggle"
    );
    const menu = document.getElementById("zen-context-menu-compact-mode");
    const toolbarToggle = document.getElementById("zen-toggle-compact-mode");
    const toolbarButton = toolbarToggle?.querySelector("toolbarbutton");
    // Keep the chrome toggle in sync with Compact (footer in Only Sidebar,
    // top strip otherwise). Never hide the control — Compact is a real mode
    // in every layout.
    if (toolbarToggle) {
      toolbarToggle.removeAttribute("hidden");
      toolbarToggle.removeAttribute("astra-only-sidebar-noop");
      toolbarToggle.toggleAttribute("checked", this.preference);
    }
    if (toolbarButton) {
      toolbarButton.toggleAttribute("checked", this.preference);
    }
    if (!menu) {
      return;
    }
    if (isSingleToolbar) {
      // Only Sidebar has no separate top bar, so the hide-toolbar submenu
      // is noise. Keep a single Compact on/off item.
      menu.setAttribute("hidden", "true");
      if (menuitem) {
        menuitem.removeAttribute("hidden");
        menu.before(menuitem);
      }
    } else {
      menu.removeAttribute("hidden");
      if (menuitem) {
        menuitem.removeAttribute("hidden");
        menu.querySelector("menupopup")?.prepend(menuitem);
      }
    }
    const hideToolbarMenuItem = document.getElementById(
      "zen-context-menu-compact-mode-hide-toolbar"
    );
    if (isIllegalState) {
      hideToolbarMenuItem.setAttribute("disabled", "true");
    } else {
      hideToolbarMenuItem.removeAttribute("disabled");
    }
  },

  hideSidebar() {
    Services.prefs.setBoolPref("zen.view.compact.hide-tabbar", true);
    Services.prefs.setBoolPref("zen.view.compact.hide-toolbar", false);
    this.callAllEventListeners();
  },

  hideToolbar() {
    Services.prefs.setBoolPref("zen.view.compact.hide-toolbar", true);
    // Compact Mode always keeps sidebar auto-hide across layouts.
    Services.prefs.setBoolPref("zen.view.compact.hide-tabbar", true);
    this.callAllEventListeners();
  },

  hideBoth() {
    Services.prefs.setBoolPref("zen.view.compact.hide-tabbar", true);
    Services.prefs.setBoolPref("zen.view.compact.hide-toolbar", true);
    this.callAllEventListeners();
  },

  /**
   * Check for illegal states and fix them
   *
   * @returns {boolean} If the context menu should just show the "toggle" item
   *    instead of a submenu with hide options
   */
  checkIfIllegalState() {
    // Due to how we layout the sidebar and toolbar, there are some states
    // that are not allowed mainly due to the caption buttons not being accessible
    // at the top left/right of the window.
    const isSidebarExpanded = gZenVerticalTabsManager._prefsSidebarExpanded;
    if (isSidebarExpanded) {
      // Fast exit if the sidebar is expanded, as we dont have illegal states then
      return false;
    }
    const canHideSidebar = this.canHideSidebar;
    const canHideToolbar = this.canHideToolbar;
    const isLeftSideButtons = !gZenVerticalTabsManager.isWindowsStyledButtons;
    const isRightSidebar = gZenVerticalTabsManager._prefsRightSide;
    // on macos: collapsed + left side + only toolbar
    // on windows: collapsed + right side + only toolbar
    const closelyIllegalState =
      (isLeftSideButtons && !isRightSidebar) ||
      (!isLeftSideButtons && isRightSidebar);
    if (closelyIllegalState && canHideToolbar && !canHideSidebar) {
      // This state is illegal
      Services.prefs.setBoolPref("zen.view.compact.hide-tabbar", true);
      Services.prefs.setBoolPref("zen.view.compact.hide-toolbar", false);
      this.callAllEventListeners();
      return true;
    }
    return closelyIllegalState;
  },

  callAllEventListeners() {
    this._eventListeners.forEach(callback => callback());
  },

  addEventListener(callback) {
    this._eventListeners.push(callback);
  },

  removeEventListener(callback) {
    const index = this._eventListeners.indexOf(callback);
    if (index !== -1) {
      this._eventListeners.splice(index, 1);
    }
  },

  async _updateEvent() {
    const isUrlbarFocused = gURLBar.focused;
    // IF we are animating IN, call the callbacks first so we can calculate the width
    // once the window buttons are shown
    this.updateContextMenu();
    gZenWorkspaces._processingResize = true;
    if (!this.preference) {
      this.callAllEventListeners();
      await this.animateCompactMode();
    } else {
      await this.animateCompactMode();
      this.callAllEventListeners();
    }
    gZenWorkspaces._processingResize = false;
    if (isUrlbarFocused) {
      gURLBar.focus();
    }
    if (this.preference) {
      ZenHasPolyfill.connectObserver(this.sidebarObserverId);
    } else {
      ZenHasPolyfill.disconnectObserver(this.sidebarObserverId);
    }
    window.dispatchEvent(
      new CustomEvent("ZenCompactMode:Toggled", { detail: this.preference })
    );
  },

  // NOTE: Dont actually use event, it's just so we make sure
  // the caller is from the ResizeObserver
  getAndApplySidebarWidth(event = undefined) {
    if (this._ignoreNextResize) {
      delete this._ignoreNextResize;
      return;
    }
    let sidebarWidth = this.sidebar.getBoundingClientRect().width;
    const shouldRecalculate =
      this.preference ||
      document.documentElement.hasAttribute("zen-creating-workspace");
    const sidebarExpanded = document.documentElement.hasAttribute(
      "zen-sidebar-expanded"
    );
    if (sidebarWidth > 1) {
      if (shouldRecalculate && sidebarExpanded) {
        sidebarWidth = Math.max(sidebarWidth, 150);
      }
      // Second variable to get the genuine width of the sidebar
      this.sidebar.style.setProperty(
        "--actual-zen-sidebar-width",
        `${sidebarWidth}px`
      );
      if (!gZenWorkspaces._processingResize) {
        window.dispatchEvent(new window.Event("resize")); // To recalculate the layout
      }
      if (
        event &&
        shouldRecalculate &&
        sidebarExpanded &&
        !gZenVerticalTabsManager._hadSidebarCollapse
      ) {
        return;
      }
      delete gZenVerticalTabsManager._hadSidebarCollapse;
      this.sidebar.style.setProperty(
        "--zen-sidebar-width",
        `${sidebarWidth}px`
      );
      this._invalidateSidebarBoundsCache();
    }
    return sidebarWidth;
  },

  get canHideSidebar() {
    // Compact Mode always auto-hides the sidebar (edge-hover reveal) in every
    // layout: Only Sidebar, Sidebar+Top Toolbar, and Collapsed. Max screen
    // space is the point of Compact Mode.
    return this.preference;
  },

  get canHideToolbar() {
    return (
      Services.prefs.getBoolPref("zen.view.compact.hide-toolbar") &&
      !gZenVerticalTabsManager._hasSetSingleToolbar
    );
  },

  /**
   * Sidebar+Top Toolbar + Compact with both chrome pieces auto-hiding:
   * one shared reveal/hide unit (L-zone), never independent.
   */
  get usesUnifiedCompactChrome() {
    return this.preference && this.canHideSidebar && this.canHideToolbar;
  },

  _clearIgnoreNextHover() {
    if (this._ignoreNextHover) {
      // Defer one turn so enabling compact does not immediately re-open from
      // residual hover / edge pointer events in the same frame.
      setTimeout(() => {
        delete this._ignoreNextHover;
      }, 0);
    }
  },

  animateCompactMode() {
    // Get the splitter width before hiding it (we need to hide it before animating on right)
    document.documentElement.setAttribute("zen-compact-animating", "true");
    return new Promise(resolve => {
      // We need to set the splitter width before hiding it
      let splitterWidth = document
        .getElementById("zen-sidebar-splitter")
        .getBoundingClientRect().width;
      const isCompactMode = this.preference;
      const canHideSidebar = this.canHideSidebar;
      const hideToolbarToo = this.canHideToolbar;
      let canAnimate =
        lazy.COMPACT_MODE_CAN_ANIMATE_SIDEBAR &&
        !this.isSidebarPotentiallyOpen();
      if (typeof this._wasInCompactMode !== "undefined") {
        canAnimate = false;
        delete this._wasInCompactMode;
      }
      // Unified pair-hide: do not JS-spring the sidebar alone. `left: auto`
      // cannot CSS-transition, so both pieces snap together instead of the
      // toolbar vanishing ~120ms before the sidebar.
      if (canAnimate && hideToolbarToo && isCompactMode) {
        canAnimate = false;
      }
      // Do this so we can get the correct width ONCE compact mode styled have been applied
      if (canAnimate) {
        this.sidebar.setAttribute("animate", "true");
      }
      if (this._ignoreNextHover) {
        this._setElementExpandAttribute(this.sidebar, false);
      }
      this.sidebar.style.removeProperty("margin-right");
      this.sidebar.style.removeProperty("margin-left");
      this.sidebar.style.removeProperty("transform");
      window.requestAnimationFrame(() => {
        delete this._ignoreNextResize;
        let sidebarWidth = this.getAndApplySidebarWidth();
        const elementSeparation = ZenThemeModifier.elementSeparation;
        if (!canAnimate) {
          this.sidebar.removeAttribute("animate");
          const finish = () => {
            document.documentElement.removeAttribute("zen-compact-animating");
            this.getAndApplySidebarWidth({});
            this._ignoreNextResize = true;
            this._clearIgnoreNextHover();
            resolve();
          };
          if (hideToolbarToo && isCompactMode) {
            window.setTimeout(finish, 200);
            return;
          }
          finish();
          return;
        }
        if (document.documentElement.hasAttribute("zen-sidebar-expanded")) {
          sidebarWidth -= 0.5 * splitterWidth;
          if (elementSeparation < splitterWidth) {
            // Subtract from the splitter width to end up with the correct element separation
            sidebarWidth += 1.5 * splitterWidth - elementSeparation;
          }
        } else {
          sidebarWidth -= elementSeparation;
        }
        if (canHideSidebar && isCompactMode) {
          this._setElementExpandAttribute(this.sidebar, false);
          gZenUIManager.motion
            .animate(
              this.sidebar,
              {
                marginRight: [
                  0,
                  this.sidebarIsOnRight ? `-${sidebarWidth}px` : 0,
                ],
                marginLeft: [
                  0,
                  this.sidebarIsOnRight ? 0 : `-${sidebarWidth}px`,
                ],
              },
              {
                ease: "easeIn",
                type: "spring",
                bounce: 0,
                duration: 0.12,
              }
            )
            .then(() => {
              this.sidebar.style.transition = "none";
              this.sidebar.style.pointEvents = "none";
              const titlebar = document.getElementById("titlebar");
              titlebar.style.visibility = "hidden";
              titlebar.style.transition = "none";
              this.sidebar.removeAttribute("animate");
              document.documentElement.removeAttribute("zen-compact-animating");

              this.getAndApplySidebarWidth({});
              this._ignoreNextResize = true;

              this.sidebar.style.removeProperty("margin-right");
              this.sidebar.style.removeProperty("margin-left");
              this.sidebar.style.removeProperty("transition");
              this.sidebar.style.removeProperty("transform");
              this.sidebar.style.removeProperty("point-events");

              titlebar.style.removeProperty("visibility");
              titlebar.style.removeProperty("transition");

              gURLBar.style.removeProperty("visibility");

              resolve();
            })
            .catch(() => {
              this.sidebar.removeAttribute("animate");
              document.documentElement.removeAttribute("zen-compact-animating");
              resolve();
            })
            .finally(() => {
              this._clearIgnoreNextHover();
            });
        } else if (canHideSidebar && !isCompactMode) {
          document.getElementById("browser").style.overflow = "clip";
          if (this.sidebarIsOnRight) {
            this.sidebar.style.marginRight = `-${sidebarWidth}px`;
          } else {
            this.sidebar.style.marginLeft = `-${sidebarWidth}px`;
          }
          gZenUIManager.motion
            .animate(
              this.sidebar,
              this.sidebarIsOnRight
                ? {
                    marginRight: [`-${sidebarWidth}px`, 0],
                    transform: ["translateX(100%)", "translateX(0)"],
                  }
                : { marginLeft: 0 },
              {
                ease: "easeOut",
                type: "spring",
                bounce: 0,
                duration: 0.12,
              }
            )
            .then(() => {
              this.sidebar.removeAttribute("animate");
              document
                .getElementById("browser")
                .style.removeProperty("overflow");
              this.sidebar.style.transition = "none";
              this.sidebar.style.removeProperty("margin-right");
              this.sidebar.style.removeProperty("margin-left");
              this.sidebar.style.removeProperty("transform");
              document.documentElement.removeAttribute("zen-compact-animating");
              setTimeout(() => {
                this.sidebar.style.removeProperty("transition");
                resolve();
              });
            })
            .catch(() => {
              this.sidebar.removeAttribute("animate");
              document
                .getElementById("browser")
                .style.removeProperty("overflow");
              document.documentElement.removeAttribute("zen-compact-animating");
              resolve();
            })
            .finally(() => {
              this._clearIgnoreNextHover();
            });
        } else {
          this.sidebar.removeAttribute("animate"); // remove the attribute if we are not animating
          document.documentElement.removeAttribute("zen-compact-animating");
          this._clearIgnoreNextHover();
          resolve();
        }
      });
    });
  },

  updateContextMenu() {
    const toggle = document.getElementById(
      "zen-context-menu-compact-mode-toggle"
    );
    if (toggle) {
      toggle.toggleAttribute("checked", this.preference);
    }
    const toolbarToggle = document.getElementById("zen-toggle-compact-mode");
    const toolbarButton = toolbarToggle?.querySelector("toolbarbutton");
    toolbarToggle?.toggleAttribute("checked", this.preference);
    toolbarButton?.toggleAttribute("checked", this.preference);

    const hideTabBar = this.canHideSidebar;
    const hideToolbar = this.canHideToolbar;
    const hideBoth = hideTabBar && hideToolbar;

    const idName = "zen-context-menu-compact-mode-hide-";
    const sidebarItem = document.getElementById(idName + "sidebar");
    const toolbarItem = document.getElementById(idName + "toolbar");
    const bothItem = document.getElementById(idName + "both");
    if (!sidebarItem || !toolbarItem || !bothItem) {
      return;
    }
    sidebarItem.toggleAttribute("checked", !hideBoth && hideTabBar);
    toolbarItem.toggleAttribute("checked", !hideBoth && hideToolbar);
    bothItem.toggleAttribute("checked", hideBoth);
  },

  _removeOpenStateOnUnifiedExtensions() {
    // Fix for bug https://github.com/zen-browser/desktop/issues/1925
    const buttons = document.querySelectorAll(
      "toolbarbutton:is(#unified-extensions-button, .webextension-browser-action)"
    );
    for (let button of buttons) {
      button.removeAttribute("open");
    }
  },

  toggle(ignoreHover = false) {
    // Only ignore the next hover when we are enabling compact mode
    this._ignoreNextHover = ignoreHover && !this.preference;
    return (this.preference = !this.preference);
  },

  _updateSidebarIsOnRight() {
    this._sidebarIsOnRight = Services.prefs.getBoolPref(
      "zen.tabs.vertical.right-side"
    );
    this._invalidateSidebarBoundsCache();
    this._clearEdgeRevealState();
  },

  toggleSidebar() {
    this.sidebar.toggleAttribute("zen-user-show");
  },

  get hideAfterHoverDuration() {
    if (this._hideAfterHoverDuration) {
      return this._hideAfterHoverDuration;
    }
    return Services.prefs.getIntPref(
      "zen.view.compact.toolbar-hide-after-hover.duration"
    );
  },

  get hoverableElements() {
    return [
      {
        element: this.sidebar,
        screenEdge: this.sidebarIsOnRight ? "right" : "left",
        keepHoverDuration: Services.prefs.getIntPref(
          "zen.view.compact.sidebar-keep-hover.duration"
        ),
      },
      {
        element: document.getElementById("zen-appcontent-navbar-wrapper"),
        screenEdge: "top",
      },
      {
        element: gZenVerticalTabsManager.actualWindowButtons,
      },
    ];
  },

  flashSidebar(duration = lazy.COMPACT_MODE_FLASH_DURATION) {
    let tabPanels = document.getElementById("tabbrowser-tabpanels");
    if (!tabPanels.matches("[zen-split-view='true']")) {
      this.flashElement(this.sidebar, duration, this.sidebar.id);
    }
  },

  flashElement(element, duration, id, attrName = "flash-popup") {
    if (this._flashTimeouts[id]) {
      clearTimeout(this._flashTimeouts[id]);
    } else {
      requestAnimationFrame(() =>
        this._setElementExpandAttribute(element, true, attrName)
      );
    }
    this._flashTimeouts[id] = setTimeout(() => {
      window.requestAnimationFrame(() => {
        this._setElementExpandAttribute(element, false, attrName);
        this._flashTimeouts[id] = null;
      });
    }, duration);
  },

  clearFlashTimeout(id) {
    clearTimeout(this._flashTimeouts[id]);
    this._flashTimeouts[id] = null;
  },

  _invalidateSidebarBoundsCache() {
    this._cachedSidebarVerticalBounds = null;
    this._cachedSidebarHandoffExtent = null;
  },

  _getSidebarVerticalBounds() {
    if (this._cachedSidebarVerticalBounds) {
      return this._cachedSidebarVerticalBounds;
    }
    const rect = this.sidebar.getBoundingClientRect();
    if (rect.height < 1) {
      this._cachedSidebarVerticalBounds = {
        top: 0,
        bottom: window.innerHeight,
      };
    } else {
      this._cachedSidebarVerticalBounds = {
        top: rect.top,
        bottom: rect.bottom,
      };
    }
    return this._cachedSidebarVerticalBounds;
  },

  _getSidebarHandoffExtent() {
    if (this._cachedSidebarHandoffExtent != null) {
      return this._cachedSidebarHandoffExtent;
    }
    let width = 0;
    const fromVar = parseFloat(
      getComputedStyle(this.sidebar).getPropertyValue(
        "--actual-zen-sidebar-width"
      )
    );
    if (Number.isFinite(fromVar) && fromVar > 1) {
      width = fromVar;
    } else {
      width = this.sidebar.getBoundingClientRect().width;
    }
    // Cap handoff to Zen sidebar width (+ small rail allowance). Do not treat
    // an expanded Firefox AI/history panel as permanent Zen hover territory.
    const railAllowance = 48;
    this._cachedSidebarHandoffExtent = Math.max(
      Math.min(width + railAllowance, width > 1 ? width + railAllowance : 56),
      this.EDGE_REVEAL_THRESHOLD
    );
    return this._cachedSidebarHandoffExtent;
  },

  _clearEdgeRevealState() {
    this._edgeRevealActive = false;
    this._topToolbarEdgeRevealActive = false;
    this._compactChromeRevealed = false;
    document.documentElement.removeAttribute(this.COMPACT_CHROME_ATTR);
    this.clearFlashTimeout(this.COMPACT_CHROME_FLASH_ID);
    this._pendingEdgePointer = null;
    if (this._edgeRevealRaf) {
      window.cancelAnimationFrame(this._edgeRevealRaf);
      this._edgeRevealRaf = null;
    }
  },

  _ensureEdgeRevealListener() {
    if (this._edgePointerBound) {
      return;
    }
    this._edgePointerListener = event => this._onEdgePointerMove(event);
    // Capture-phase so chrome at the physical edge (#sidebar-main, AI chrome,
    // compact toolbar hit zone) is observed regardless of event.target.
    window.addEventListener("pointermove", this._edgePointerListener, true);
    this._edgePointerBound = true;
  },

  _teardownEdgeRevealListener() {
    if (!this._edgePointerBound || !this._edgePointerListener) {
      this._clearEdgeRevealState();
      return;
    }
    window.removeEventListener("pointermove", this._edgePointerListener, true);
    this._edgePointerListener = null;
    this._edgePointerBound = false;
    this._clearEdgeRevealState();
  },

  _canProcessEdgeReveal(event) {
    if (
      !this.preference ||
      !this.canHideSidebar ||
      !this.shouldBeCompact ||
      this._ignoreNextHover ||
      this._isTabBeingDragged ||
      document.documentElement.hasAttribute("zen-compact-animating") ||
      this.isPanelLocked() ||
      !this.sidebar ||
      window.closed
    ) {
      return false;
    }
    if (event) {
      // Ignore non-primary pointers and any button-held drag/resize.
      if (event.isPrimary === false) {
        return false;
      }
      if (event.buttons !== 0) {
        return false;
      }
    }
    return true;
  },

  _onEdgePointerMove(event) {
    const unified = this.usesUnifiedCompactChrome;
    if (
      !unified &&
      !this._canProcessEdgeReveal(event) &&
      !this._canProcessTopToolbarEdgeReveal(event)
    ) {
      return;
    }
    if (unified && !this._canProcessEdgeReveal(event) && !this._canProcessTopToolbarEdgeReveal(event)) {
      return;
    }

    this._pendingEdgePointer = {
      x: event.clientX,
      y: event.clientY,
    };

    if (this._edgeRevealRaf) {
      return;
    }
    this._edgeRevealRaf = window.requestAnimationFrame(() => {
      this._edgeRevealRaf = null;
      if (this.usesUnifiedCompactChrome) {
        this._processUnifiedChromeReveal();
      } else {
        this._processEdgeReveal();
        this._processTopToolbarEdgeReveal();
      }
    });
  },

  _canProcessTopToolbarEdgeReveal(event) {
    if (
      !this.preference ||
      !this.canHideToolbar ||
      !this.shouldBeCompact ||
      this._ignoreNextHover ||
      document.documentElement.hasAttribute("zen-compact-animating") ||
      this.isPanelLocked() ||
      window.closed
    ) {
      return false;
    }
    if (event) {
      if (event.isPrimary === false || event.buttons !== 0) {
        return false;
      }
    }
    return true;
  },

  _getTopToolbarElement() {
    return document.getElementById("zen-appcontent-navbar-wrapper");
  },

  /**
   * Apply or clear the single shared compact-chrome visibility state.
   * Sidebar and top toolbar always move together in unified mode.
   */
  _setCompactChromeRevealed(revealed, { immediate = false } = {}) {
    const toolbar = this._getTopToolbarElement();
    this.clearFlashTimeout(this.COMPACT_CHROME_FLASH_ID);
    this.clearFlashTimeout("has-hover" + this.sidebar.id);
    if (toolbar) {
      this.clearFlashTimeout("has-hover" + toolbar.id);
      window.cancelAnimationFrame(this._removeHoverFrames[toolbar.id]);
    }
    window.cancelAnimationFrame(this._removeHoverFrames[this.sidebar.id]);

    if (revealed) {
      this._compactChromeRevealed = true;
      this._edgeRevealActive = true;
      this._topToolbarEdgeRevealActive = true;
      document.documentElement.setAttribute(this.COMPACT_CHROME_ATTR, "true");
      this._setElementExpandAttribute(this.sidebar, true, "zen-has-hover");
      if (toolbar) {
        this._setElementExpandAttribute(toolbar, true, "zen-has-hover");
      }
      return;
    }

    const sidebarMustStay =
      !!this.sidebar &&
      (this.sidebar.hasAttribute("zen-user-show") ||
        this.sidebar.hasAttribute("zen-has-empty-tab") ||
        this.sidebar.hasAttribute("has-popup-menu") ||
        this.sidebar.hasAttribute("zen-compact-mode-active"));
    const toolbarMustStay =
      !!toolbar &&
      (toolbar.hasAttribute("has-popup-menu") ||
        toolbar.hasAttribute("zen-compact-mode-active"));

    // Never leave a partial state: if either piece must stay, keep BOTH.
    if (sidebarMustStay || toolbarMustStay) {
      this._setCompactChromeRevealed(true);
      return;
    }

    const hideBoth = () => {
      this._compactChromeRevealed = false;
      this._edgeRevealActive = false;
      this._topToolbarEdgeRevealActive = false;
      document.documentElement.removeAttribute(this.COMPACT_CHROME_ATTR);
      if (this.sidebar) {
        this._setElementExpandAttribute(this.sidebar, false, "zen-has-hover");
      }
      if (toolbar) {
        this._setElementExpandAttribute(toolbar, false, "zen-has-hover");
      }
    };

    if (immediate) {
      hideBoth();
      return;
    }

    // Shared hide-delay: one timer, both pieces disappear together.
    this._compactChromeRevealed = true;
    document.documentElement.setAttribute(this.COMPACT_CHROME_ATTR, "true");
    this._flashTimeouts[this.COMPACT_CHROME_FLASH_ID] = setTimeout(() => {
      window.requestAnimationFrame(() => {
        // Re-check locks at fire time so we still never desync.
        if (
          this.sidebar?.hasAttribute("zen-user-show") ||
          this.sidebar?.hasAttribute("zen-has-empty-tab") ||
          this.sidebar?.hasAttribute("has-popup-menu") ||
          this.sidebar?.hasAttribute("zen-compact-mode-active") ||
          toolbar?.hasAttribute("has-popup-menu") ||
          toolbar?.hasAttribute("zen-compact-mode-active")
        ) {
          this._setCompactChromeRevealed(true);
          this._flashTimeouts[this.COMPACT_CHROME_FLASH_ID] = null;
          return;
        }
        hideBoth();
        this._flashTimeouts[this.COMPACT_CHROME_FLASH_ID] = null;
      });
    }, this.hideAfterHoverDuration);
  },

  _isPointerOnTopToolbarEdge(clientY) {
    return clientY <= this.EDGE_REVEAL_THRESHOLD;
  },

  _isPointerInTopToolbarHandoffZone(clientX, clientY) {
    const toolbar = this._getTopToolbarElement();
    if (!toolbar) {
      return false;
    }
    const threshold = this.EDGE_REVEAL_THRESHOLD;
    if (
      clientY >
      (toolbar.hasAttribute("zen-has-hover")
        ? toolbar.getBoundingClientRect().bottom + threshold
        : threshold * 5)
    ) {
      return false;
    }
    const rect = toolbar.getBoundingClientRect();
    return (
      clientX >= rect.left - threshold && clientX <= rect.right + threshold
    );
  },

  /**
   * L-shaped hover zone: top edge OR sidebar side edge (or handoff of either
   * while already revealed). Entering ANY arm reveals BOTH chrome pieces.
   */
  _isPointerInUnifiedChromeZone(clientX, clientY) {
    if (this._isPointerOnTopToolbarEdge(clientY)) {
      return true;
    }
    if (this._isPointerOnSidebarEdge(clientX, clientY)) {
      return true;
    }
    if (!this._compactChromeRevealed) {
      return false;
    }
    // Keep revealed while traversing the L handoff (toolbar strip or sidebar).
    if (this._isPointerInTopToolbarHandoffZone(clientX, clientY)) {
      return true;
    }
    if (this._isPointerInSidebarHandoffZone(clientX, clientY)) {
      return true;
    }
    if (this.sidebar?.matches(":hover")) {
      return true;
    }
    const toolbar = this._getTopToolbarElement();
    if (toolbar?.matches(":hover")) {
      return true;
    }
    return false;
  },

  _processUnifiedChromeReveal() {
    const pending = this._pendingEdgePointer;
    if (
      !pending ||
      (!this._canProcessEdgeReveal() && !this._canProcessTopToolbarEdgeReveal())
    ) {
      return;
    }

    const { x, y } = pending;
    const inZone = this._isPointerInUnifiedChromeZone(x, y);

    if (inZone) {
      if (
        this._compactChromeRevealed &&
        this.sidebar.hasAttribute("zen-has-hover") &&
        this._getTopToolbarElement()?.hasAttribute("zen-has-hover")
      ) {
        // Still in zone — cancel any pending shared hide.
        this.clearFlashTimeout(this.COMPACT_CHROME_FLASH_ID);
        this._compactChromeRevealed = true;
        document.documentElement.setAttribute(this.COMPACT_CHROME_ATTR, "true");
        return;
      }
      this._setCompactChromeRevealed(true);
      return;
    }

    if (!this._compactChromeRevealed && !this._edgeRevealActive) {
      return;
    }

    // Left the L-zone: schedule shared hide for both pieces together.
    this._setCompactChromeRevealed(false);
  },

  _processTopToolbarEdgeReveal() {
    // Independent toolbar path — Only used when unified chrome is OFF
    // (e.g. hide-toolbar without sidebar hide, which Compact no longer does).
    if (this.usesUnifiedCompactChrome) {
      return;
    }
    const pending = this._pendingEdgePointer;
    if (!pending || !this._canProcessTopToolbarEdgeReveal()) {
      return;
    }

    const toolbar = this._getTopToolbarElement();
    if (!toolbar) {
      return;
    }

    const { x, y } = pending;
    const onEdge = this._isPointerOnTopToolbarEdge(y);
    const toolbarHovered = toolbar.matches(":hover");

    if (onEdge) {
      if (toolbar.hasAttribute("zen-has-hover")) {
        this._topToolbarEdgeRevealActive = true;
        return;
      }

      window.cancelAnimationFrame(this._removeHoverFrames[toolbar.id]);
      this.clearFlashTimeout("has-hover" + toolbar.id);
      this._topToolbarEdgeRevealActive = true;
      this._setElementExpandAttribute(toolbar, true, "zen-has-hover");
      return;
    }

    if (this._topToolbarEdgeRevealActive) {
      if (toolbarHovered) {
        this._topToolbarEdgeRevealActive = false;
        return;
      }
      if (this._isPointerInTopToolbarHandoffZone(x, y)) {
        return;
      }
      this._topToolbarEdgeRevealActive = false;
      if (
        toolbar.hasAttribute("zen-has-hover") &&
        !toolbar.hasAttribute("has-popup-menu") &&
        !toolbar.hasAttribute("zen-compact-mode-active")
      ) {
        this.flashElement(
          toolbar,
          this.hideAfterHoverDuration,
          "has-hover" + toolbar.id,
          "zen-has-hover"
        );
      }
    }
  },

  _isPointerOnSidebarEdge(clientX, clientY) {
    const threshold = this.EDGE_REVEAL_THRESHOLD;
    const onEdgeX = this.sidebarIsOnRight
      ? window.innerWidth - clientX <= threshold
      : clientX <= threshold;
    if (!onEdgeX) {
      return false;
    }
    // Vertical range uses cached toolbox bounds (invalidated on resize /
    // compact toggle / side / width changes), not per-event layout reads.
    const bounds = this._getSidebarVerticalBounds();
    return (
      clientY >= bounds.top - threshold && clientY <= bounds.bottom + threshold
    );
  },

  _isPointerInSidebarHandoffZone(clientX, clientY) {
    const extent = this._getSidebarHandoffExtent();
    const onSide = this.sidebarIsOnRight
      ? window.innerWidth - clientX <= extent
      : clientX <= extent;
    if (!onSide) {
      return false;
    }
    const bounds = this._getSidebarVerticalBounds();
    const threshold = this.EDGE_REVEAL_THRESHOLD;
    return (
      clientY >= bounds.top - threshold && clientY <= bounds.bottom + threshold
    );
  },

  _processEdgeReveal() {
    // Sidebar-only path (Only Sidebar + Compact, or hide-toolbar off).
    if (this.usesUnifiedCompactChrome) {
      return;
    }
    const pending = this._pendingEdgePointer;
    if (!pending || !this._canProcessEdgeReveal()) {
      return;
    }

    const { x, y } = pending;
    const onEdge = this._isPointerOnSidebarEdge(x, y);
    const sidebarHovered = this.sidebar.matches(":hover");

    if (onEdge) {
      if (this.sidebar.hasAttribute("zen-has-hover")) {
        this._edgeRevealActive = true;
        return;
      }

      window.cancelAnimationFrame(this._removeHoverFrames[this.sidebar.id]);
      this.clearFlashTimeout("has-hover" + this.sidebar.id);

      this._edgeRevealActive = true;
      this._setElementExpandAttribute(this.sidebar, true, "zen-has-hover");
      return;
    }

    // Edge detector only initiates reveal. Leaving the 8px strip while still
    // inside the sidebar handoff zone (or over :hover toolbox) must not hide.
    if (this._edgeRevealActive) {
      if (sidebarHovered) {
        this._edgeRevealActive = false;
        return;
      }
      if (this._isPointerInSidebarHandoffZone(x, y)) {
        return;
      }
      this._edgeRevealActive = false;
      if (
        this.sidebar.hasAttribute("zen-has-hover") &&
        !this.sidebar.hasAttribute("zen-user-show") &&
        !this.sidebar.hasAttribute("zen-has-empty-tab") &&
        !this.sidebar.hasAttribute("has-popup-menu") &&
        !this.sidebar.hasAttribute("zen-compact-mode-active")
      ) {
        this.flashElement(
          this.sidebar,
          this.hideAfterHoverDuration,
          "has-hover" + this.sidebar.id,
          "zen-has-hover"
        );
      }
    }
  },

  _setElementExpandAttribute(element, value, attr = "zen-has-hover") {
    const kVerifiedAttributes = [
      "zen-has-hover",
      "has-popup-menu",
      "zen-compact-mode-active",
    ];
    const isToolbar = element.id === "zen-appcontent-navbar-wrapper";
    this.log("Setting", attr, "to", value, "on element", element?.id);
    if (value) {
      if (
        this.isPanelLocked() &&
        (element === this.sidebar ||
          element === this._getTopToolbarElement()) &&
        (attr === "zen-has-hover" ||
          attr === "has-popup-menu" ||
          attr === "zen-compact-mode-active")
      ) {
        return;
      }
      if (
        attr === "zen-has-hover" &&
        element !== gZenVerticalTabsManager.actualWindowButtons
      ) {
        element.setAttribute("zen-has-implicit-hover", "true");
        if (!lazy.COMPACT_MODE_SHOW_SIDEBAR_AND_TOOLBAR_ON_HOVER) {
          return;
        }
      }
      element.setAttribute(attr, "true");
      if (
        isToolbar &&
        ((gZenVerticalTabsManager._hasSetSingleToolbar &&
          (element.hasAttribute("should-hide") ||
            document.documentElement.hasAttribute("zen-has-bookmarks"))) ||
          (this.preference &&
            Services.prefs.getBoolPref("zen.view.compact.hide-toolbar") &&
            !gZenVerticalTabsManager._hasSetSingleToolbar))
      ) {
        gBrowser.tabpanels.setAttribute("has-toolbar-hovered", "true");
      }
    } else {
      if (attr === "zen-has-hover") {
        if (element === this._outsideTrackedElement) {
          this._stopTrackingMouseOutsideWindow();
        }
        element.removeAttribute("zen-has-implicit-hover");
        gURLBar.updateTextOverflow();
      }
      element.removeAttribute(attr);
      // Only remove if none of the verified attributes are present
      if (
        isToolbar &&
        !kVerifiedAttributes.some(verifiedAttr =>
          element.hasAttribute(verifiedAttr)
        )
      ) {
        gBrowser.tabpanels.removeAttribute("has-toolbar-hovered");
      }
    }
  },

  addMouseActions() {
    gURLBar.addEventListener("mouseenter", event => {
      this.log("Mouse entered URL bar:", event.target);
      if (event.target.closest("#urlbar[zen-floating-urlbar]")) {
        window.requestAnimationFrame(() => {
          this._setElementExpandAttribute(
            gZenVerticalTabsManager.actualWindowButtons,
            false
          );
        });
        this._hasHoveredUrlbar = true;
      }
    });

    for (let i = 0; i < this.hoverableElements.length; i++) {
      let target = this.hoverableElements[i].element;

      // Add the attribute on startup if the mouse is already over the element
      if (target.matches(":hover")) {
        this._setElementExpandAttribute(target, true);
      }

      const onEnter = event => {
        setTimeout(() => {
          if (event.type === "mouseenter" && !event.target.matches(":hover")) {
            return;
          }
          if (event.target.closest("panel")) {
            return;
          }
          // Dont register the hover if the urlbar is floating and we are hovering over it
          this.clearFlashTimeout("has-hover" + target.id);
          window.requestAnimationFrame(() => {
            if (
              document.documentElement.getAttribute(
                "supress-primary-adjustment"
              ) === "true" ||
              this._hasHoveredUrlbar ||
              this._ignoreNextHover ||
              (this.isPanelLocked() &&
                (target === this.sidebar ||
                  target === this._getTopToolbarElement()))
            ) {
              return;
            }
            if (target.hasAttribute("zen-has-hover")) {
              // Toolbox owns hover after edge-initiated reveal.
              if (
                target === this.sidebar &&
                target.hasAttribute("zen-has-hover")
              ) {
                if (this.usesUnifiedCompactChrome) {
                  this._compactChromeRevealed = true;
                  document.documentElement.setAttribute(
                    this.COMPACT_CHROME_ATTR,
                    "true"
                  );
                } else {
                  this._edgeRevealActive = false;
                }
              }
              return;
            }
            if (
              this.usesUnifiedCompactChrome &&
              (target === this.sidebar ||
                target === this._getTopToolbarElement())
            ) {
              this._setCompactChromeRevealed(true);
              return;
            }
            this._setElementExpandAttribute(target, true);
          });
        }, this.HOVER_HACK_DELAY);
      };

      const onLeave = event => {
        if (AppConstants.platform == "macosx") {
          const buttonRect =
            gZenVerticalTabsManager.actualWindowButtons.getBoundingClientRect();
          const MAC_WINDOW_BUTTONS_X_BORDER = buttonRect.width + buttonRect.x;
          const MAC_WINDOW_BUTTONS_Y_BORDER = buttonRect.height + buttonRect.y;
          if (
            event.clientX < MAC_WINDOW_BUTTONS_X_BORDER &&
            event.clientY < MAC_WINDOW_BUTTONS_Y_BORDER &&
            event.clientX > buttonRect.x &&
            event.clientY > buttonRect.y
          ) {
            return;
          }
        }

        // See bug https://bugzilla.mozilla.org/show_bug.cgi?id=1979340 and issue https://github.com/zen-browser/desktop/issues/7746.
        // If we want the toolbars to be draggable, we need to make sure to check the hover state after a short delay.
        // This is because the mouse is left to be handled natively so firefox thinks the mouse left the window for a split second.
        setTimeout(() => {
          // Let's double check if the mouse is still hovering over the element, see the bug above.
          if (event.target.matches(":hover")) {
            return;
          }

          if (
            event.explicitOriginalTarget?.closest?.(
              "#urlbar[zen-floating-urlbar]"
            ) ||
            (document.documentElement.getAttribute(
              "supress-primary-adjustment"
            ) === "true" &&
              gZenVerticalTabsManager._hasSetSingleToolbar) ||
            this._hasHoveredUrlbar ||
            this._ignoreNextHover ||
            (event.type === "dragleave" &&
              event.explicitOriginalTarget !== target &&
              target.contains?.(event.explicitOriginalTarget))
          ) {
            return;
          }

          if (this._isTabBeingDragged) {
            return;
          }

          if (
            this.usesUnifiedCompactChrome &&
            (target === this.sidebar ||
              target === this._getTopToolbarElement())
          ) {
            // Only hide when the pointer has left the entire L-chrome unit.
            const other =
              target === this.sidebar
                ? this._getTopToolbarElement()
                : this.sidebar;
            if (other?.matches(":hover")) {
              return;
            }
            this._setCompactChromeRevealed(false);
            return;
          }

          if (target === this.sidebar) {
            this._edgeRevealActive = false;
          }

          if (target === this._getTopToolbarElement()) {
            this._topToolbarEdgeRevealActive = false;
          }

          if (this.hoverableElements[i].keepHoverDuration) {
            this.flashElement(
              target,
              this.hoverableElements[i].keepHoverDuration,
              "has-hover" + target.id,
              "zen-has-hover"
            );
          } else {
            this._removeHoverFrames[target.id] = window.requestAnimationFrame(
              () => this._setElementExpandAttribute(target, false)
            );
          }
        }, this.HOVER_HACK_DELAY);
      };

      target.addEventListener("mouseover", onEnter);
      target.addEventListener("dragover", onEnter);

      target.addEventListener("mouseleave", onLeave);
      target.addEventListener("dragleave", onLeave);
    }

    document.documentElement.addEventListener("mouseleave", event => {
      setTimeout(() => {
        const screenEdgeCrossed = this._getCrossedEdge(
          event.pageX,
          event.pageY
        );
        if (!screenEdgeCrossed) {
          return;
        }
        for (let entry of this.hoverableElements) {
          if (screenEdgeCrossed !== entry.screenEdge) {
            continue;
          }
          const target = entry.element;
          const boundAxis =
            entry.screenEdge === "right" || entry.screenEdge === "left"
              ? "y"
              : "x";
          if (
            !this._positionInBounds(
              boundAxis,
              target,
              event.pageX,
              event.pageY,
              7
            )
          ) {
            continue;
          }
          if (this.isPanelLocked()) {
            continue;
          }
          window.cancelAnimationFrame(this._removeHoverFrames[target.id]);

          if (!this._trackMouseOutsideWindow(entry.screenEdge, target)) {
            // We can't track the mouse position outside of the window on
            // this platform, fall back to hiding after a fixed duration
            this.flashElement(
              target,
              this.hideAfterHoverDuration,
              "has-hover" + target.id,
              "zen-has-hover"
            );
          }
          document.addEventListener(
            "mousemove",
            () => {
              if (target.matches(":hover")) {
                return;
              }
              // Closing the element also stops the outside mouse tracking
              this._setElementExpandAttribute(target, false);
              this.clearFlashTimeout("has-hover" + target.id);
            },
            { once: true }
          );
        }
      }, this.HOVER_HACK_DELAY);
    });

    gURLBar.addEventListener("mouseleave", () => {
      setTimeout(() => {
        setTimeout(() => {
          requestAnimationFrame(() => {
            delete this._hasHoveredUrlbar;
          });
        }, 10);
      }, 0);
    });
  },

  _getCrossedEdge(
    posX,
    posY,
    element = document.documentElement,
    maxDistance = 10
  ) {
    const targetBox = element.getBoundingClientRect();
    posX = Math.max(targetBox.left, Math.min(posX, targetBox.right));
    posY = Math.max(targetBox.top, Math.min(posY, targetBox.bottom));
    return ["top", "bottom", "left", "right"].find((edge, i) => {
      const distance = Math.abs((i < 2 ? posY : posX) - targetBox[edge]);
      return distance <= maxDistance;
    });
  },

  _positionInBounds(axis = "x", element, x, y, error = 0) {
    const bBox = element.getBoundingClientRect();
    if (axis === "y") {
      return bBox.top - error < y && y < bBox.bottom + error;
    }
    return bBox.left - error < x && x < bBox.right + error;
  },

  _trackMouseOutsideWindow(screenEdge, target) {
    this._stopTrackingMouseOutsideWindow();
    const maxEdgeOffset =
      screenEdge === "left" || screenEdge === "right"
        ? lazy.COMPACT_MODE_OUTSIDE_WINDOW_HORIZONTAL_OFFSET
        : lazy.COMPACT_MODE_OUTSIDE_WINDOW_VERTICAL_OFFSET;
    try {
      lazy.zenMouseTracker.registerWindow(window, screenEdge, maxEdgeOffset);
    } catch (e) {
      // The platform can't track the global mouse position (e.g. Linux)
      return false;
    }
    this._outsideTrackedElement = target;
    this.clearFlashTimeout("has-hover" + target.id);
    window.requestAnimationFrame(() => {
      if (this._outsideTrackedElement === target) {
        this._setElementExpandAttribute(target, true);
      }
    });
    return true;
  },

  _stopTrackingMouseOutsideWindow() {
    const target = this._outsideTrackedElement;
    if (!target) {
      return;
    }
    this._outsideTrackedElement = null;
    lazy.zenMouseTracker.unregisterWindow(window);
  },

  _collapseTrackedElement() {
    const target = this._outsideTrackedElement;
    if (!target) {
      return;
    }
    // Closing the element also unregisters us from the mouse tracker
    this._setElementExpandAttribute(target, false);
    this.clearFlashTimeout("has-hover" + target.id);
  },

  _onOutsideMouseTrackerExit(subject) {
    if (subject === window) {
      this._collapseTrackedElement();
    }
  },

  _clearAllHoverStates() {
    this._stopTrackingMouseOutsideWindow();
    // Isolated overlay panels suppress compact reveal; never re-open chrome.
    if (this.isPanelLocked()) {
      this._hideCompactChromeForIsolatedPanel();
      return;
    }
    for (let entry of this.hoverableElements) {
      const target = entry.element;
      if (
        target &&
        !target.matches(":hover") &&
        target.hasAttribute("zen-has-hover")
      ) {
        this._setElementExpandAttribute(target, false);
        this.clearFlashTimeout("has-hover" + target.id);
      }
    }
    this._edgeRevealActive = false;
    this._topToolbarEdgeRevealActive = false;
    this._compactChromeRevealed = false;
    document.documentElement.removeAttribute(this.COMPACT_CHROME_ATTR);
    this.clearFlashTimeout(this.COMPACT_CHROME_FLASH_ID);
  },

  isSidebarPotentiallyOpen() {
    if (this._ignoreNextHover) {
      this._setElementExpandAttribute(this.sidebar, false);
    }
    return (
      this.sidebar.hasAttribute("zen-user-show") ||
      this.sidebar.hasAttribute("zen-has-hover") ||
      this.sidebar.hasAttribute("zen-has-empty-tab") ||
      this.sidebar.hasAttribute("has-popup-menu")
    );
  },

  async _onTabOpen(tab, inBackground, beforeRouteResult = {}) {
    const isSidebarHidden = this.preference && !this.isSidebarPotentiallyOpen();

    if (
      inBackground &&
      (isSidebarHidden || beforeRouteResult.isRouteFound) &&
      this._canShowBackgroundTabToast &&
      !gZenGlanceManager._animating &&
      !this._nextTimeWillBeActive
    ) {
      const isTabRoutedToCurrentSpace =
        beforeRouteResult.targetRoute === gZenWorkspaces.activeWorkspace;
      // Do not show the toast if the sidebar is not hidden and
      // the tab is being routed to the current space
      if (!isSidebarHidden && isTabRoutedToCurrentSpace) {
        return;
      }

      let messageId = "zen-background-tab-opened-toast";
      let toastOptions = {
        button: {
          id: "zen-open-background-tab-button",
          command: () => {
            const targetWindow = window.parent || window;
            targetWindow.gBrowser.selectedTab = tab;
          },
        },
      };

      if (beforeRouteResult.isRouteFound && !isTabRoutedToCurrentSpace) {
        messageId = "zen-space-routing-tab-routed-toast";
        toastOptions = {
          l10nArgs: { targetWorkspace: beforeRouteResult.targetWorkspaceName },
        };
      }

      gZenUIManager.showToast(messageId, toastOptions);
    }
    delete this._nextTimeWillBeActive;
  },
};

document.addEventListener(
  "MozBeforeInitialXULLayout",
  () => {
    gZenCompactModeManager.preInit();
  },
  { once: true }
);
