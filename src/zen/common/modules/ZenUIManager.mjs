// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { nsZenMultiWindowFeature } from "chrome://browser/content/zen-components/ZenCommonUtils.mjs";
import { nsZenMenuBar } from "chrome://browser/content/zen-components/ZenMenubar.mjs";

window.gZenUIManager = {
  _popupTrackingElements: [],
  _hoverPausedForExpand: false,
  _hasLoadedDOM: false,
  testingEnabled: Services.prefs.getBoolPref("zen.testing.enabled", false),
  profilingEnabled: Services.prefs.getBoolPref(
    "zen.testing.profiling.enabled",
    false
  ),

  _lastClickPosition: null,

  _toastTimeouts: [],

  init() {
    window.gZenMenubar = new nsZenMenuBar();

    document.addEventListener("popupshowing", this.onPopupShowing.bind(this));
    document.addEventListener("popuphidden", this.onPopupHidden.bind(this));

    document.addEventListener(
      "mousedown",
      this.handleMouseDown.bind(this),
      true
    );

    ChromeUtils.defineLazyGetter(this, "motion", () => {
      Services.scriptloader.loadSubScript(
        "chrome://browser/content/zen-vendor/motion.min.mjs",
        window
      );
      const motion = window.Motion;
      delete window.Motion;
      return motion;
    });

    ChromeUtils.defineLazyGetter(this, "_toastContainer", () => {
      return document.getElementById("zen-toast-container");
    });

    new ResizeObserver(
      gZenCommonActions.throttle(
        gZenCompactModeManager.getAndApplySidebarWidth.bind(
          gZenCompactModeManager
        ),
        Services.prefs.getIntPref("zen.view.sidebar-height-throttle", 500)
      )
    ).observe(gNavToolbox);

    gZenWorkspaces.promiseInitialized.finally(() => {
      this._hasLoadedDOM = true;
      this.updateTabsToolbar();
    });

    window.addEventListener("TabClose", this.onTabClose.bind(this));
    window.addEventListener(
      "Zen:UrlbarSearchModeChanged",
      this.onUrlbarSearchModeChanged.bind(this)
    );

    gZenMediaController.init();
    gZenVerticalTabsManager.init();
    gZenLiveFoldersUI.init();

    this._initCreateNewPopup();
    this._debloatContextMenus();
    this._addNewCustomizableButtonsIfNeeded();
    this._initFeaturePrefGates();
    this._initOmnibox();
    this._initBookmarkCollapseListener();

    gURLBar._setPlaceholder(null);

    document
      .getElementById("PersonalToolbar")
      .setAttribute("fullscreentoolbar", "true");
  },

  /**
   * Animate an element using Element.animate API.
   * This is not using gZenUIManager.motion, because motion library has some issues
   * with certain properties and we want to have a simple wrapper for that.
   *
   * @param {Element} element
   * @param {object} rawKeyframes
   * @param {...any} args
   */
  async elementAnimate(element, rawKeyframes, ...args) {
    rawKeyframes = { ...rawKeyframes };
    // Convert 'y' property to 'transform' with translateY and 'x' to translateX,
    // and 'scale' to 'transform' with scale.
    if (
      (rawKeyframes.y || rawKeyframes.x || rawKeyframes.scale) &&
      !rawKeyframes.transform
    ) {
      const yValues = rawKeyframes.y || [];
      const xValues = rawKeyframes.x || [];
      const scaleYValues = rawKeyframes.scaleY || [];
      const scaleXValues = rawKeyframes.scaleX || [];
      delete rawKeyframes.y;
      delete rawKeyframes.x;
      delete rawKeyframes.scaleY;
      delete rawKeyframes.scaleX;
      rawKeyframes.transform = [];
      if (
        yValues.length !== 0 &&
        xValues.length !== 0 &&
        yValues.length !== xValues.length
      ) {
        console.error("y and x keyframes must have the same length");
      }
      const keyframeLength = Math.max(
        yValues.length,
        xValues.length,
        scaleYValues.length,
        scaleXValues.length
      );
      for (let i = 0; i < keyframeLength; i++) {
        const y = yValues[i] !== undefined ? `translateY(${yValues[i]}px)` : "";
        const x = xValues[i] !== undefined ? `translateX(${xValues[i]}px)` : "";
        const scaleY =
          scaleYValues[i] !== undefined ? `scaleY(${scaleYValues[i]})` : "";
        const scaleX =
          scaleXValues[i] !== undefined ? `scaleX(${scaleXValues[i]})` : "";
        rawKeyframes.transform.push(`${x} ${y} ${scaleX} ${scaleY}`.trim());
      }
    }
    let keyframes = [];
    for (let i = 0; i < Object.values(rawKeyframes)[0].length; i++) {
      let frame = {};
      for (const [property, values] of Object.entries(rawKeyframes)) {
        frame[property] = values[i];
      }
      keyframes.push(frame);
    }
    return await new Promise(resolve => {
      const animation = element.animate(keyframes, ...args);
      animation.onfinish = () => resolve();
    });
  },

  _addNewCustomizableButtonsIfNeeded() {
    const kPref = "zen.ui.migration.compact-mode-button-added";
    let navbarPlacements = CustomizableUI.getWidgetIdsInArea(
      "zen-sidebar-top-buttons"
    );
    try {
      if (
        !navbarPlacements.length &&
        !Services.prefs.getBoolPref(kPref, false)
      ) {
        CustomizableUI.addWidgetToArea(
          "zen-toggle-compact-mode",
          "zen-sidebar-top-buttons",
          0
        );
        gZenVerticalTabsManager._topButtonsSeparatorElement.before(
          document.getElementById("zen-toggle-compact-mode")
        );
      }
    } catch (e) {
      console.error("Error adding compact mode button to sidebar:", e);
    }
    Services.prefs.setBoolPref(kPref, true);

    // Additive Suraksha toolbar placement for existing profiles (independent of App Hub).
    // Do not consume the migration flag while the feature is disabled or the widget
    // DOM is not ready yet — otherwise re-enabling never places the button.
    const kSurakshaPref = "astra.ui.migration.suraksha-button-added";
    try {
      if (!Services.prefs.getBoolPref(kSurakshaPref, false)) {
        if (!Services.prefs.getBoolPref("astra.suraksha.enabled", false)) {
          // Defer until Suraksha is enabled.
        } else if (!document.getElementById("astra-suraksha-button")) {
          // Widget markup not ready in this window yet — retry later.
        } else {
          const placements = CustomizableUI.getWidgetIdsInArea(
            "zen-sidebar-top-buttons"
          );
          if (placements.includes("astra-suraksha-button")) {
            Services.prefs.setBoolPref(kSurakshaPref, true);
          } else if (placements.includes("zen-app-launcher-button")) {
            const hubIndex = placements.indexOf("zen-app-launcher-button");
            CustomizableUI.addWidgetToArea(
              "astra-suraksha-button",
              "zen-sidebar-top-buttons",
              hubIndex + 1
            );
            Services.prefs.setBoolPref(kSurakshaPref, true);
          } else {
            // Feature enabled and widget exists, but current layout has no hub
            // anchor — stop retrying without forcing a layout reset.
            Services.prefs.setBoolPref(kSurakshaPref, true);
          }
        }
      }
    } catch (e) {
      console.error("Error adding Suraksha button to sidebar:", e);
    }
  },

  /**
   * Pref-off for App Hub / Suraksha must remove chrome from the strip AND keep
   * CustomizableUI from parking the widgets in the nav-bar ••• overflow
   * (#widget-overflow-list). CSS display:none alone is not enough — overflow
   * panel styles can still surface the items. Mirror the Only Sidebar pattern:
   * pull from overflow, set hidden + overflows=false while the pref is off.
   */
  _initFeaturePrefGates() {
    this._applyFeaturePrefGates();
    // Services.prefs.addObserver requires an nsIObserver (observe method),
    // not a bare function.
    this._featurePrefGateObserver = {
      observe: () => {
        this._applyFeaturePrefGates();
      },
    };
    for (const pref of ["astra.suraksha.enabled", "astra.apphub.enabled"]) {
      try {
        Services.prefs.addObserver(pref, this._featurePrefGateObserver);
      } catch (e) {
        console.warn("[Astra] feature pref gate observer failed:", pref, e);
      }
    }
    window.addEventListener(
      "unload",
      () => {
        for (const pref of ["astra.suraksha.enabled", "astra.apphub.enabled"]) {
          try {
            Services.prefs.removeObserver(pref, this._featurePrefGateObserver);
          } catch {
            // ignore
          }
        }
      },
      { once: true }
    );
  },

  _applyFeaturePrefGates() {
    const gates = [
      {
        id: "astra-suraksha-button",
        pref: "astra.suraksha.enabled",
        appMenuId: "appMenu-astra-suraksha-button",
      },
      {
        id: "zen-app-launcher-button",
        pref: "astra.apphub.enabled",
      },
    ];
    for (const gate of gates) {
      const enabled = Services.prefs.getBoolPref(gate.pref, false);
      const el = document.getElementById(gate.id);
      if (el) {
        if (!enabled) {
          // Pull out of » first so the overflow list does not keep a live entry.
          // _restoreWidgetToSidebarStrip lives on gZenVerticalTabsManager
          // (same file, later object), not on gZenUIManager.
          try {
            gZenVerticalTabsManager._restoreWidgetToSidebarStrip(el);
          } catch (e) {
            console.warn("[Astra] feature gate restore from overflow failed:", e);
          }
          el.setAttribute("hidden", "true");
          el.setAttribute("overflows", "false");
          el.setAttribute("astra-feature-pref-disabled", "true");
        } else if (el.getAttribute("astra-feature-pref-disabled") === "true") {
          el.removeAttribute("astra-feature-pref-disabled");
          // Only Sidebar shortcut-only mode still owns visibility when set.
          if (el.getAttribute("astra-only-sidebar-shortcut-only") !== "true") {
            el.removeAttribute("hidden");
            el.removeAttribute("overflows");
          }
        }
      }
      if (gate.appMenuId) {
        const menu = document.getElementById(gate.appMenuId);
        if (menu) {
          if (!enabled) {
            menu.setAttribute("hidden", "true");
          } else {
            menu.removeAttribute("hidden");
          }
        }
      }
    }
  },

  _initBookmarkCollapseListener() {
    const bookmarkToolbar = document.getElementById("PersonalToolbar");
    if (!bookmarkToolbar.hasAttribute("collapsed")) {
      // Set it initially if bookmarks toolbar is visible, customizable UI
      // is ran before this function.
      document.documentElement.setAttribute("zen-has-bookmarks", "true");
    }
    bookmarkToolbar.addEventListener("toolbarvisibilitychange", event => {
      const visible = event.detail.visible;
      if (visible) {
        document.documentElement.setAttribute("zen-has-bookmarks", "true");
      } else {
        document.documentElement.removeAttribute("zen-has-bookmarks");
      }
    });
  },

  _initOmnibox() {
    const { registerZenUrlbarProviders } = ChromeUtils.importESModule(
      "resource:///modules/ZenUBProvider.sys.mjs"
    );
    const { nsZenSiteDataPanel: ZenSiteDataPanel } = ChromeUtils.importESModule(
      "resource:///modules/ZenSiteDataPanel.sys.mjs"
    );
    registerZenUrlbarProviders();
    window.gZenSiteDataPanel = new ZenSiteDataPanel(window);
    gURLBar._zenTrimURL = this.urlbarTrim.bind(this);
  },

  _debloatContextMenus() {
    if (!Services.prefs.getBoolPref("zen.view.context-menu.refresh", false)) {
      return;
    }
    const contextMenusToClean = [
      // Remove the 'new tab below' context menu.
      // reason: It doesn't properly work with zen and it's philosophy of not having
      //   new tabs. It's also semi-not working as it doesn't create a new tab below
      //   the current one.
      "context_openANewTab",
    ];
    for (const id of contextMenusToClean) {
      const menu = document.getElementById(id);
      if (!menu) {
        continue;
      }
      menu.setAttribute("hidden", "true");
    }
  },

  _initCreateNewPopup() {
    const popup = document.getElementById("zenCreateNewPopup");

    popup.addEventListener("popupshowing", () => {
      const button = document.getElementById("zen-create-new-button");
      if (!button) {
        return;
      }
      const image = button.querySelector("image");
      button.setAttribute("open", "true");
      gZenUIManager.motion.animate(
        image,
        { transform: ["rotate(0deg)", "rotate(45deg)"] },
        { duration: 0.2 }
      );
      popup.addEventListener(
        "popuphidden",
        () => {
          button.removeAttribute("open");
          gZenUIManager.motion.animate(
            image,
            { transform: ["rotate(45deg)", "rotate(0deg)"] },
            { duration: 0.2 }
          );
        },
        { once: true }
      );
    });
  },

  handleMouseDown(event) {
    this._lastClickPosition = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  },

  updateTabsToolbar() {
    const kUrlbarHeight = 333;
    gURLBar.style.setProperty(
      "--zen-urlbar-top",
      `${window.innerHeight / 2 - Math.max(kUrlbarHeight, window.windowUtils.getBoundsWithoutFlushing(gURLBar).height) / 2}px`
    );
    gURLBar.style.setProperty(
      "--zen-urlbar-width",
      `${Math.min(window.innerWidth / 1.5, 750)}px`
    );
    gZenVerticalTabsManager.actualWindowButtons.removeAttribute(
      "zen-has-hover"
    );
    gZenVerticalTabsManager.recalculateURLBarHeight(true);
    if (!this._preventToolbarRebuild) {
      setTimeout(() => {
        gZenWorkspaces.updateTabsContainers();
      }, 0);
    }
    delete this._preventToolbarRebuild;
  },

  /**
   * Re-settle toolbar overflow after early / zero-width layout (welcome
   * chrome hide, or cold start before single-toolbar widths stabilize).
   *
   * Widgets parked in #widget-overflow-list against zero width stay parked
   * because OverflowableToolbar only re-checks on window resize. Dispatch a
   * synthetic resize so every overflowable toolbar re-measures with real
   * widths. Compact Mode is pinned (overflows="false"). In Only Sidebar it
   * lives in the sidebar footer; App Hub / Suraksha are shortcut-only so
   * Back/Forward/Reload + AI keep a dedicated non-overlapping spot. Other
   * layouts keep Compact / App Hub / Suraksha in the top strip. If Compact
   * was already parked from an older profile, pull it back onto chrome.
   */
  async settleToolbarOverflow() {
    document.getElementById("navigator-toolbox")?.getBoundingClientRect();

    const compact = document.getElementById("zen-toggle-compact-mode");
    if (compact) {
      compact.setAttribute("overflows", "false");
      compact.removeAttribute("hidden");
      const parked =
        compact.parentElement?.id === "widget-overflow-list" ||
        compact.getAttribute("overflowedItem") === "true";
      if (parked) {
        compact.removeAttribute("overflowedItem");
        compact.removeAttribute("cui-anchorid");
      }
    }

    gZenVerticalTabsManager._applyOnlySidebarIconAllocation(
      !!gZenVerticalTabsManager._hasSetSingleToolbar
    );

    window.dispatchEvent(new Event("resize"));
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  },

  get tabsWrapper() {
    if (this._tabsWrapper) {
      return this._tabsWrapper;
    }
    this._tabsWrapper = document.getElementById("zen-tabs-wrapper");
    return this._tabsWrapper;
  },

  onTabClose(event = undefined) {
    if (!event?.target?._closedInMultiselection) {
      this.updateTabsToolbar();
    }
  },

  onFloatingURLBarOpen() {
    requestAnimationFrame(() => {
      this.updateTabsToolbar();
    });
  },

  openAndChangeToTab(url, options) {
    if (window.parent) {
      const tab = window.parent.gBrowser.addTrustedTab(url, options);
      window.parent.gBrowser.selectedTab = tab;
      return tab;
    }
    const tab = window.gBrowser.addTrustedTab(url, options);
    window.gBrowser.selectedTab = tab;
    return tab;
  },

  generateUuidv4() {
    return Services.uuid.generateUUID().toString();
  },

  createValidXULText(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  /**
   * Adds the 'has-popup-menu' attribute to the element when popup is opened on it.
   *
   * @param {Element} element element to track
   */
  addPopupTrackingAttribute(element) {
    this._popupTrackingElements.push(element);
  },

  removePopupTrackingAttribute(element) {
    this._popupTrackingElements.remove(element);
  },

  // On macOS, the app menu panel is displayed as a native NSPopover which
  // silently clips content beyond the screen without informing Firefox's
  // layout engine. This makes bottom menu items unreachable by scrolling.
  // Setting max-height based on available screen space lets Firefox's layout
  // handle the constraint, enabling proper overflow scrolling.
  // See gh-12782
  _constrainNativePopoverHeight(panel) {
    const panelIds = [
      "appMenu-popup",
      "customizationui-widget-panel",
      "widget-overflow",
    ];
    if (!panelIds.includes(panel.id)) {
      return;
    }
    // NSPopover adds 13px of chrome on all sides (26px vertical total),
    // measured via Accessibility Inspector on macOS 26 (Tahoe).
    // Previous macOS versions have similar or smaller values, so this is a
    // conservative upper bound.
    const popoverChrome = 26;
    const maxHeight = window.screen.availHeight - popoverChrome;
    panel.style.maxHeight = `${maxHeight}px`;
  },

  onPopupShowing(showEvent) {
    if (
      AppConstants.platform === "macosx" &&
      Services.prefs.getBoolPref("widget.macos.native-context-menus", false)
    ) {
      this._constrainNativePopoverHeight(showEvent.target);
    }
    // App Hub (and similar overlays) must not attribute popup-open to compact
    // chrome — that would slide the sidebar out behind the panel.
    if (
      showEvent.target?.getAttribute?.("data-astra-compact-isolated") ===
        "true" ||
      showEvent.target?.id === "PanelUI-zen-app-launcher"
    ) {
      return;
    }
    for (const el of this._popupTrackingElements) {
      // target may be inside a shadow root, not directly under the element
      // we also ignore menus inside panels
      if (
        !el.contains(showEvent.explicitOriginalTarget) ||
        (Element.isInstance(showEvent.explicitOriginalTarget) &&
          showEvent.explicitOriginalTarget?.closest("panel")) ||
        // See bug #7590: Ignore menupopup elements opening.
        // Also see #10612 for the exclusion of the zen-appcontent-navbar-wrapper
        (showEvent.explicitOriginalTarget.tagName === "menupopup" &&
          el.id !== "zen-appcontent-navbar-wrapper")
      ) {
        continue;
      }
      document.removeEventListener("mousemove", this.__removeHasPopupAttribute);
      gZenCompactModeManager._setElementExpandAttribute(
        el,
        true,
        "has-popup-menu"
      );
      this.__currentPopup = showEvent.target;
      this.__currentPopupTrackElement = el;
      break;
    }
  },

  onPopupHidden(hideEvent) {
    if (!this.__currentPopup || this.__currentPopup !== hideEvent.target) {
      return;
    }
    const element = this.__currentPopupTrackElement;
    if (document.getElementById("main-window").matches(":hover")) {
      gZenCompactModeManager._setElementExpandAttribute(
        element,
        false,
        "has-popup-menu"
      );
    } else {
      this.__removeHasPopupAttribute = () =>
        gZenCompactModeManager._setElementExpandAttribute(
          element,
          false,
          "has-popup-menu"
        );
      document.addEventListener("mousemove", this.__removeHasPopupAttribute, {
        once: true,
      });
    }
    this.__currentPopup = null;
    this.__currentPopupTrackElement = null;
  },

  // Section: URL bar

  onUrlbarOpen() {
    setTimeout(() => {
      const hadValid = gURLBar.getAttribute("pageproxystate") === "valid";
      gURLBar.setPageProxyState("invalid", false);
      gURLBar.setAttribute("had-proxystate", hadValid);
    }, 0);
  },

  onUrlbarClose() {
    if (gURLBar.getAttribute("had-proxystate") == "true") {
      gURLBar.setPageProxyState("valid", false);
    }
    gURLBar.removeAttribute("had-proxystate");
  },

  onUrlbarSearchModeChanged(event) {
    if (gReduceMotion) {
      return;
    }
    const { searchMode } = event.detail;
    const input = gURLBar;
    if (gURLBar.hasAttribute("breakout-extend") && !this._animatingSearchMode) {
      this._animatingSearchMode = true;
      this.motion
        .animate(input, { scale: [1, 0.98, 1] }, { duration: 0.25 })
        .then(() => {
          delete this._animatingSearchMode;
        });
      if (searchMode) {
        gURLBar.setAttribute("animate-searchmode", "true");
        this._animatingSearchModeTimeout = setTimeout(() => {
          requestAnimationFrame(() => {
            gURLBar.removeAttribute("animate-searchmode");
            delete this._animatingSearchModeTimeout;
          });
        }, 1000);
      }
    }
  },

  enableCommandsMode(event) {
    event.preventDefault();
    if (!gURLBar.hasAttribute("breakout-extend") || this._animatingSearchMode) {
      return;
    }
    const currentSearchMode = gURLBar.getSearchMode(gBrowser.selectedBrowser);
    let searchMode = null;
    if (!currentSearchMode) {
      searchMode = {
        source: UrlbarUtils.RESULT_SOURCE.ZEN_ACTIONS,
        isPreview: true,
      };
    }
    gURLBar.removeAttribute("animate-searchmode");
    if (this._animatingSearchModeTimeout) {
      clearTimeout(this._animatingSearchModeTimeout);
      delete this._animatingSearchModeTimeout;
    }
    gURLBar.searchMode = searchMode;
    gURLBar.startQuery({
      allowAutofill: false,
      event,
    });
  },

  get newtabButtons() {
    return document.querySelectorAll("#tabs-newtab-button");
  },

  _prevUrlbarLabel: null,
  _lastSearch: "",
  _clearTimeout: null,
  _lastTab: null,
  _overlayTab: null,

  // Check if browser elements are in a valid state for tab operations
  _validateBrowserState() {
    // Check if browser window is still open
    if (window.closed) {
      return false;
    }

    // Check if gBrowser is available
    if (!gBrowser || !gBrowser.tabContainer) {
      return false;
    }

    // Check if URL bar is available
    if (!gURLBar) {
      return false;
    }

    return true;
  },

  handleNewTab(
    werePassedURL,
    searchClipboard,
    where,
    overridePreferance = false
  ) {
    // Validate browser state first
    if (!this._validateBrowserState()) {
      console.warn("Browser state invalid for new tab operation");
      return false;
    }

    if (this.testingEnabled && !overridePreferance) {
      return false;
    }

    // Search Hub is a real New Tab page; do not intercept it as the URL-bar overlay.
    // Callers that pass overridePreferance (Glance / split view) still get the overlay.
    try {
      if (
        !overridePreferance &&
        Services.prefs.getStringPref("astra.newtab.layout", "minimal") ===
          "search-hub"
      ) {
        return false;
      }
    } catch {
      // Missing pref → keep the existing minimal New Tab behavior.
    }

    const shouldOpenURLBar =
      overridePreferance ||
      (gZenVerticalTabsManager._canReplaceNewTab &&
        !werePassedURL &&
        !searchClipboard &&
        where === "tab");

    if (!shouldOpenURLBar) {
      return false;
    }

    // Close the new tab popup on cmd/ctrl + t
    if (!overridePreferance && gURLBar.hasAttribute("zen-newtab")) {
      this.handleUrlbarClose();
      return true;
    }

    // Clear any existing timeout
    if (this._clearTimeout) {
      clearTimeout(this._clearTimeout);
      this._clearTimeout = null;
    }

    // Store the current tab
    this._lastTab = gBrowser.selectedTab;
    if (!this._lastTab) {
      console.warn("No selected tab found when creating new tab");
      return false;
    }

    // Set visual state with proper validation
    if (this._lastTab && !this._lastTab.closing) {
      this._lastTab._visuallySelected = false;
    }

    // Create and focus a real tab BEFORE wiring the overlay close handler.
    // TabSelect would otherwise call _zenHandleUrlbarClose and tear the
    // overlay down. Suggestion clicks must target this tab, not _lastTab.
    // Skip for Glance / split-view (overridePreferance): those wait on the
    // next TabSelect after a result is picked.
    this._overlayTab = overridePreferance ? null : this._ensureOverlayTab();

    // Store URL bar state
    this._prevUrlbarLabel = gURLBar._untrimmedValue || "";

    // Set up URL bar for new tab
    gURLBar._zenHandleUrlbarClose = this.handleUrlbarClose.bind(this);
    gURLBar.setAttribute("zen-newtab", true);

    // Update newtab buttons
    for (const button of this.newtabButtons) {
      button.setAttribute("in-urlbar", true);
    }

    // Open location command
    try {
      gURLBar.search(this._lastSearch || "");
      document.getElementById("Browser:OpenLocation").doCommand();
    } catch (e) {
      console.error("Error opening location in new tab:", e);
      this.handleUrlbarClose(false);
      return false;
    }
    return true;
  },

  clearUrlbarData() {
    this._prevUrlbarLabel = null;
    this._lastSearch = "";
  },

  _ensureOverlayTab() {
    try {
      const tab = gBrowser.addTrustedTab("about:blank", {
        skipAnimation: true,
      });
      if (tab) {
        gBrowser.selectedTab = tab;
        return tab;
      }
    } catch (e) {
      console.error("Error creating overlay new tab:", e);
    }
    return gBrowser.selectedTab;
  },

  _discardUnusedOverlayTab(overlayTab, onElementPicked) {
    if (!overlayTab || overlayTab.closing) {
      return;
    }
    // A picked result that loaded into this tab must be kept even while
    // currentURI is still about:blank. Cancel / open-elsewhere leaves a
    // leftover blank tab that should be removed.
    if (onElementPicked && gBrowser.selectedTab === overlayTab) {
      return;
    }
    const spec = overlayTab.linkedBrowser?.currentURI?.spec;
    const stillBlank =
      overlayTab.isEmpty || spec === "about:blank" || spec === "about:newtab";
    if (!stillBlank) {
      return;
    }
    if (
      gBrowser.selectedTab === overlayTab &&
      this._lastTab &&
      !this._lastTab.closing
    ) {
      gBrowser.selectedTab = this._lastTab;
    }
    gBrowser.removeTab(overlayTab, { animate: false });
  },

  handleUrlbarClose(onSwitch = false, onElementPicked = false) {
    // Validate browser state first
    if (!this._validateBrowserState()) {
      console.warn("Browser state invalid for URL bar close operation");
      return;
    }

    // Reset URL bar state
    if (gURLBar._zenHandleUrlbarClose) {
      gURLBar._zenHandleUrlbarClose = null;
    }

    const overlayTab = this._overlayTab;
    this._overlayTab = null;
    this._discardUnusedOverlayTab(overlayTab, onElementPicked);

    const isFocusedBefore = gURLBar.focused;
    setTimeout(() => {
      // We use this attribute on Tabbrowser::addTab
      gURLBar.removeAttribute("zen-newtab");

      // Safely restore tab visual state with proper validation
      if (
        this._lastTab &&
        !this._lastTab.closing &&
        this._lastTab.documentGlobal &&
        !this._lastTab.documentGlobal.closed &&
        gBrowser.selectedTab === this._lastTab
      ) {
        this._lastTab._visuallySelected = true;
        this._lastTab = null;
      }

      // Reset newtab buttons
      for (const button of this.newtabButtons) {
        button.removeAttribute("in-urlbar");
      }

      // Handle search data
      if (onSwitch) {
        this.clearUrlbarData();
      } else {
        this._lastSearch = gURLBar._untrimmedValue || "";

        if (this._clearTimeout) {
          clearTimeout(this._clearTimeout);
        }

        this._clearTimeout = setTimeout(() => {
          this.clearUrlbarData();
        }, this.urlbarWaitToClear);
      }

      // Safely restore URL bar state with proper validation
      if (this._prevUrlbarLabel) {
        gURLBar.setURI({
          uri: this._prevUrlbarLabel,
          dueToTabSwitch: onSwitch,
          isSameDocument: !onSwitch,
        });
      }

      gURLBar.handleRevert();

      if (isFocusedBefore) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("ZenURLBarClosed", {
              detail: { onSwitch, onElementPicked },
            })
          );
          gURLBar.view.close({ elementPicked: onElementPicked });
          gURLBar.updateTextOverflow();

          if (onElementPicked && onSwitch) {
            gURLBar.setURI({ dueToTabSwitch: onSwitch });
          }

          // Ensure tab and browser are valid before updating state
          const selectedTab = gBrowser.selectedTab;
          if (
            selectedTab &&
            selectedTab.linkedBrowser &&
            !selectedTab.closing &&
            onSwitch
          ) {
            const browserState = gURLBar.getBrowserState(
              selectedTab.linkedBrowser
            );
            if (browserState) {
              browserState.urlbarFocused = false;
            }
          }
        }, 0);
      }
    }, 0);
  },

  urlbarTrim(aURL) {
    if (gURLBar.hasAttribute("breakout-extend")) {
      return aURL;
    }
    if (
      gZenVerticalTabsManager._hasSetSingleToolbar &&
      this.urlbarShowDomainOnly
    ) {
      let url = BrowserUIUtils.removeSingleTrailingSlashFromURL(aURL);
      let stripped = url.startsWith("https://") ? url.split("/")[2] : url;
      if (stripped.startsWith("www.")) {
        stripped = stripped.substring(4);
      }
      return stripped;
    }
    return BrowserUIUtils.trimURL(aURL);
  },

  // Section: Notification messages
  _createToastElement(messageId, options) {
    const createButton = () => {
      const button = document.createXULElement("button");
      button.id = options.button.id;
      button.classList.add("footer-button");
      button.classList.add("primary");
      button.addEventListener("command", options.button.command);
      return button;
    };

    // Check if this message ID already exists
    for (const child of this._toastContainer.children) {
      if (child._messageId === messageId) {
        child.removeAttribute("button");
        if (options.button) {
          const button = createButton();
          const existingButton = child.querySelector("button");
          if (existingButton) {
            existingButton.remove();
          }
          child.appendChild(button);
          child.setAttribute("button", true);
        }
        return [child, true];
      }
    }
    const wrapper = document.createXULElement("hbox");
    const element = document.createXULElement("vbox");
    const label = document.createXULElement("label");
    document.l10n.setAttributes(label, messageId, options.l10nArgs);
    element.appendChild(label);
    if (options.descriptionId) {
      const description = document.createXULElement("label");
      description.classList.add("description");
      document.l10n.setAttributes(description, options.descriptionId, options);
      element.appendChild(description);
    }
    wrapper.appendChild(element);
    if (options.button) {
      const button = createButton();
      wrapper.appendChild(button);
      wrapper.setAttribute("button", true);
    }
    wrapper.classList.add("zen-toast");
    wrapper._messageId = messageId;
    return [wrapper, false];
  },

  async showToast(messageId, options = {}) {
    const [toast, reused] = this._createToastElement(messageId, options);
    this._toastContainer.removeAttribute("hidden");
    this._toastContainer.appendChild(toast);
    const timeoutFunction = () => {
      if (Services.prefs.getBoolPref("ui.popup.disable_autohide")) {
        return;
      }
      this.motion
        .animate(
          toast,
          { opacity: [1, 0], scale: [1, 0.5] },
          { duration: 0.2, bounce: 0 }
        )
        .then(() => {
          toast.remove();
          if (this._toastContainer.children.length === 0) {
            this._toastContainer.setAttribute("hidden", true);
          }
        });
    };
    if (reused) {
      await this.motion.animate(
        toast,
        { scale: 0.2 },
        { duration: 0.1, bounce: 0 }
      );
    } else {
      toast.addEventListener("mouseover", () => {
        if (this._toastTimeouts[messageId]) {
          clearTimeout(this._toastTimeouts[messageId]);
        }
      });
      toast.addEventListener("mouseout", () => {
        if (this._toastTimeouts[messageId]) {
          clearTimeout(this._toastTimeouts[messageId]);
        }
        this._toastTimeouts[messageId] = setTimeout(
          timeoutFunction,
          options.timeout || 2000
        );
      });
    }
    if (!toast.style.transform) {
      toast.style.transform = "scale(0)";
    }
    await this.motion.animate(
      toast,
      { scale: 1 },
      { type: "spring", bounce: 0.2, duration: 0.5 }
    );
    if (this._toastTimeouts[messageId]) {
      clearTimeout(this._toastTimeouts[messageId]);
    }
    this._toastTimeouts[messageId] = setTimeout(
      timeoutFunction,
      options.timeout || 2000
    );
  },

  panelUIPosition(panel, anchor) {
    void panel;
    // The alignment position of the panel is determined during the "popuppositioned" event
    // when the panel opens. The alignment positions help us determine in which orientation
    // the panel is anchored to the screen space.
    //
    // *  "after_start": The panel is anchored at the top-left     corner in LTR locales, top-right    in RTL locales.
    // *    "after_end": The panel is anchored at the top-right    corner in LTR locales, top-left     in RTL locales.
    // * "before_start": The panel is anchored at the bottom-left  corner in LTR locales, bottom-right in RTL locales.
    // *   "before_end": The panel is anchored at the bottom-right corner in LTR locales, bottom-left  in RTL locales.
    //
    //   ┌─Anchor(LTR)          ┌─Anchor(RTL)
    //   │       Anchor(RTL)─┐  │       Anchor(LTR)─┐
    //   │                   │  │                   │
    //   x───────────────────x  x───────────────────x
    //   │                   │  │                   │
    //   │       Panel       │  │       Panel       │
    //   │   "after_start"   │  │    "after_end"    │
    //   │                   │  │                   │
    //   └───────────────────┘  └───────────────────┘
    //
    //   ┌───────────────────┐  ┌───────────────────┐
    //   │                   │  │                   │
    //   │       Panel       │  │       Panel       │
    //   │   "before_start"  │  │    "before_end"   │
    //   │                   │  │                   │
    //   x───────────────────x  x───────────────────x
    //   │                   │  │                   │
    //   │       Anchor(RTL)─┘  │       Anchor(LTR)─┘
    //   └─Anchor(LTR)          └─Anchor(RTL)
    //
    // The default choice for the panel is "after_start", to match the content context menu's alignment. However, it is
    // possible to end up with any of the four combinations. Before the panel is opened, the XUL popup manager needs to
    // make a determination about the size of the panel and whether or not it will fit within the visible screen area with
    // the intended alignment. The manager may change the panel's alignment before opening to ensure the panel is fully visible.
    //
    // For example, if the panel is opened such that the bottom edge would be rendered off screen, then the XUL popup manager
    // will change the alignment from "after_start" to "before_start", anchoring the panel's bottom corner to the target screen
    // location instead of its top corner. This transformation ensures that the whole of the panel is visible on the screen.
    //
    // When the panel is anchored by one of its bottom corners (the "before_..." options), then it causes unintentionally odd
    // behavior where dragging the text-area resizer downward with the mouse actually grows the panel's top edge upward, since
    // the bottom of the panel is anchored in place. We want to disable the resizer if the panel was positioned to be anchored
    // from one of its bottom corners.
    let block = "bottomleft";
    let inline = "topleft";
    if (anchor?.closest("#zen-sidebar-top-buttons")) {
      block = "topleft";
    }
    if (
      (gZenVerticalTabsManager._hasSetSingleToolbar &&
        gZenVerticalTabsManager._prefsRightSide) ||
      (panel?.id === "zen-unified-site-data-panel" &&
        !gZenVerticalTabsManager._hasSetSingleToolbar) ||
      (panel?.id === "unified-extensions-panel" &&
        gZenVerticalTabsManager._hasSetSingleToolbar)
    ) {
      block = "bottomright";
      inline = "topright";
    }
    return `${block} ${inline}`;
  },

  urlStringsDomainMatch(url1, url2) {
    if (!url1.startsWith("http") || !url2?.startsWith("http")) {
      return false;
    }
    return Services.io.newURI(url1).host === Services.io.newURI(url2).host;
  },

  getOpenUILinkWhere(url, browser, openUILinkWhere) {
    try {
      let tab = gBrowser.getTabForBrowser(browser);
      if (
        openUILinkWhere === "current" &&
        !this.urlStringsDomainMatch(url, browser.currentURI.spec) &&
        tab.pinned &&
        Services.prefs.getBoolPref("zen.tabs.open-pinned-in-new-tab")
      ) {
        return "tab";
      }
    } catch (e) {
      console.error("Error in getOpenUILinkWhere:", e);
    }
    return openUILinkWhere;
  },
};

XPCOMUtils.defineLazyPreferenceGetter(
  gZenUIManager,
  "contentElementSeparation",
  "zen.theme.content-element-separation",
  0
);

XPCOMUtils.defineLazyPreferenceGetter(
  gZenUIManager,
  "urlbarWaitToClear",
  "zen.urlbar.wait-to-clear",
  0
);
XPCOMUtils.defineLazyPreferenceGetter(
  gZenUIManager,
  "urlbarShowDomainOnly",
  "zen.urlbar.show-domain-only-in-sidebar",
  true
);

window.gZenVerticalTabsManager = {
  init() {
    this._multiWindowFeature = new nsZenMultiWindowFeature();
    this._initWaitPromise();

    ChromeUtils.defineLazyGetter(this, "isWindowsStyledButtons", () => {
      return !(
        window.AppConstants.platform === "macosx" ||
        window.matchMedia("(-moz-gtk-csd-reversed-placement)").matches ||
        Services.prefs.getBoolPref(
          "zen.view.experimental-force-window-controls-left"
        )
      );
    });

    ChromeUtils.defineLazyGetter(this, "hidesTabsToolbar", () => {
      return (
        document.documentElement
          .getAttribute("chromehidden")
          ?.includes("toolbar") ||
        document.documentElement
          .getAttribute("chromehidden")
          ?.includes("menubar")
      );
    });

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_canReplaceNewTab",
      "zen.urlbar.replace-newtab",
      true
    );
    var updateEvent = this._updateEvent.bind(this);
    var onPrefChange = this._onPrefChange.bind(this);

    this.initializePreferences(onPrefChange);
    this._toolbarOriginalParent =
      document.getElementById("nav-bar").parentElement;

    gZenCompactModeManager.addEventListener(updateEvent);
    this.initRightSideOrderContextMenu();

    window.addEventListener(
      "customizationstarting",
      this._preCustomize.bind(this)
    );
    window.addEventListener(
      "aftercustomization",
      this._postCustomize.bind(this)
    );

    this._updateEvent();
    this._initOnlySidebarAiButton();

    if (!this.isWindowsStyledButtons) {
      document.documentElement.setAttribute(
        "zen-window-buttons-reversed",
        true
      );
    }

    this._renameTabHalt = this.renameTabHalt.bind(this);
    gBrowser.tabContainer.addEventListener(
      "dblclick",
      this.renameTabStart.bind(this)
    );
  },

  toggleExpand() {
    const newVal = !Services.prefs.getBoolPref("zen.view.sidebar-expanded");
    Services.prefs.setBoolPref("zen.view.sidebar-expanded", newVal);
    Services.prefs.setBoolPref("zen.view.use-single-toolbar", false);
  },

  get navigatorToolbox() {
    return gNavToolbox;
  },

  initRightSideOrderContextMenu() {
    const kConfigKey = "zen.tabs.vertical.right-side";
    const fragment = window.MozXULElement.parseXULToFragment(`
      <menuitem id="zen-toolbar-context-tabs-right"
                type="checkbox"
                ${Services.prefs.getBoolPref(kConfigKey) ? 'checked="true"' : ""}
                data-lazy-l10n-id="zen-toolbar-context-tabs-right"
                command="cmd_zenToggleTabsOnRight"
        />
    `);
    document.getElementById("toolbar-context-customize").before(fragment);
  },

  get _topButtonsSeparatorElement() {
    if (this.__topButtonsSeparatorElement) {
      return this.__topButtonsSeparatorElement;
    }
    this.__topButtonsSeparatorElement = document.getElementById(
      "zen-sidebar-top-buttons-separator"
    );
    return this.__topButtonsSeparatorElement;
  },

  /**
   * Only Sidebar (zen-single-toolbar) is too narrow for Compact + App Hub +
   * Suraksha + Back/Forward/Reload + AI in one 186px row. Prefer navigation:
   * hide App Hub / Suraksha dedicated strip buttons (Ctrl+Shift+U /
   * Ctrl+Shift+I still open them), move Compact to the sidebar footer next
   * to the theme toggle, and pin Back/Forward/Reload + AI so they cannot
   * park under ». Sidebar+Top Toolbar and Collapsed keep Compact in the top
   * strip and place the same AI toggle after Compact / hub icons (adapted
   * DOM: no Back/Forward/Reload in this strip).
   */
  _restoreWidgetToSidebarStrip(el) {
    if (!el) {
      return;
    }
    const target = document.getElementById(
      "zen-sidebar-top-buttons-customization-target"
    );
    if (!target) {
      return;
    }
    const parked =
      el.parentElement?.id === "widget-overflow-list" ||
      el.getAttribute("overflowedItem") === "true";
    if (!parked && target.contains(el)) {
      return;
    }
    el.removeAttribute("overflowedItem");
    el.removeAttribute("cui-anchorid");
    const separator = this._topButtonsSeparatorElement;
    try {
      if (separator && target.contains(separator)) {
        target.insertBefore(el, separator);
      } else if (!target.contains(el)) {
        target.append(el);
      }
    } catch (e) {
      console.warn("[Astra] Failed to restore sidebar widget from overflow:", e);
    }
  },

  _applyOnlySidebarIconAllocation(enable) {
    const hubIds = ["zen-app-launcher-button", "astra-suraksha-button"];
    const navIds = ["back-button", "forward-button", "stop-reload-button"];
    const target = document.getElementById(
      "zen-sidebar-top-buttons-customization-target"
    );

    if (enable) {
      for (const id of hubIds) {
        const el = document.getElementById(id);
        if (!el) {
          continue;
        }
        // Pull out of » first so hiding them actually empties the overflow list.
        this._restoreWidgetToSidebarStrip(el);
        el.setAttribute("overflows", "false");
        el.setAttribute("hidden", "true");
        el.setAttribute("astra-only-sidebar-shortcut-only", "true");
      }
      for (const id of navIds) {
        const el = document.getElementById(id);
        if (!el) {
          continue;
        }
        el.setAttribute("overflows", "false");
        el.setAttribute("astra-only-sidebar-nav-pinned", "true");
        this._restoreWidgetToSidebarStrip(el);
        // Ensure nav sits after the separator with the swept toolbar icons.
        const separator = this._topButtonsSeparatorElement;
        if (separator && target?.contains(separator) && target.contains(el)) {
          // Keep relative order: back → forward → reload after separator.
          if (id === "back-button") {
            separator.after(el);
          } else if (id === "forward-button") {
            const back = document.getElementById("back-button");
            (back?.parentElement === target ? back : separator).after(el);
          } else if (id === "stop-reload-button") {
            const forward = document.getElementById("forward-button");
            (forward?.parentElement === target ? forward : separator).after(el);
          }
        }
      }
      this._placeOnlySidebarAiButton(target);
      this._placeOnlySidebarCompactToggle(true);
    } else {
      this._placeOnlySidebarCompactToggle(false);
      for (const id of hubIds) {
        const el = document.getElementById(id);
        if (!el?.hasAttribute("astra-only-sidebar-shortcut-only")) {
          continue;
        }
        el.removeAttribute("astra-only-sidebar-shortcut-only");
        // Do not force-show if the feature pref is off — _applyFeaturePrefGates
        // owns pref-disabled visibility (prevents a flash into the ••• menu).
        const pref =
          id === "astra-suraksha-button"
            ? "astra.suraksha.enabled"
            : "astra.apphub.enabled";
        if (Services.prefs.getBoolPref(pref, false)) {
          el.removeAttribute("hidden");
          el.removeAttribute("overflows");
        } else {
          el.setAttribute("hidden", "true");
          el.setAttribute("overflows", "false");
          el.setAttribute("astra-feature-pref-disabled", "true");
        }
      }
      for (const id of navIds) {
        const el = document.getElementById(id);
        if (!el?.hasAttribute("astra-only-sidebar-nav-pinned")) {
          continue;
        }
        el.removeAttribute("astra-only-sidebar-nav-pinned");
        // stop-reload is overflow-eligible outside Only Sidebar (more room on
        // the top toolbar). Back/Forward stay Firefox-default non-overflowing.
        if (id === "stop-reload-button") {
          el.removeAttribute("overflows");
        }
      }
      // Not Only Sidebar: AI stays in the strip for Sidebar+Top Toolbar and
      // the collapsed icon rail (same customization target).
      this._placeAiButtonForNonOnlySidebar(target);
    }
    // Re-assert pref gates after layout allocation so Only Sidebar toggles
    // cannot resurrect a disabled Suraksha/App Hub entry into ••• overflow.
    // Gates live on gZenUIManager (this method is on gZenVerticalTabsManager).
    gZenUIManager._applyFeaturePrefGates();
  },

  _placeOnlySidebarAiButton(target) {
    const ai = document.getElementById("astra-ai-sidebar-button");
    if (!ai || !target) {
      return;
    }
    ai.removeAttribute("hidden");
    ai.setAttribute("overflows", "false");
    const reload = document.getElementById("stop-reload-button");
    if (reload && target.contains(reload)) {
      reload.after(ai);
    } else if (!target.contains(ai)) {
      target.append(ai);
    }
    this._syncAiSidebarButton();
  },

  /**
   * Sidebar+Top Toolbar and Collapsed: AI lives in the sidebar strip after
   * Compact (and App Hub / Suraksha when those prefs are on). Unlike Only
   * Sidebar, Back / Forward / Reload stay on the top toolbar — do not
   * anchor after Reload. Collapsed stacks this control in the same column
   * as Compact via vertical-tabs.css (48px, gap 5px).
   */
  _placeAiButtonForNonOnlySidebar(target) {
    this._placeMultiToolbarAiButton(target);
  },

  _placeMultiToolbarAiButton(target) {
    const ai = document.getElementById("astra-ai-sidebar-button");
    if (!ai || !target) {
      return;
    }
    ai.removeAttribute("hidden");
    ai.setAttribute("overflows", "false");
    // Compact can sit in the overflow list on a 60px collapsed rail until
    // OverflowableToolbar settles. Pull it back so AI anchors after it.
    const compact = document.getElementById("zen-toggle-compact-mode");
    if (compact) {
      this._restoreWidgetToSidebarStrip(compact);
    }
    // Anchor after the last visible strip control we own (Compact → App Hub →
    // Suraksha). Fall back to prepend so AI sits with the strip icons.
    const anchorIds = [
      "zen-toggle-compact-mode",
      "zen-app-launcher-button",
      "astra-suraksha-button",
    ];
    let anchor = null;
    for (const id of anchorIds) {
      const el = document.getElementById(id);
      if (
        el &&
        target.contains(el) &&
        el.getAttribute("hidden") !== "true" &&
        el.getAttribute("astra-feature-pref-disabled") !== "true"
      ) {
        anchor = el;
      }
    }
    if (anchor) {
      anchor.after(ai);
    } else if (compact && target.contains(compact)) {
      compact.after(ai);
    } else if (!target.contains(ai)) {
      target.prepend(ai);
    }
    // Collapsed rail: Compact then AI, even if overflow later reorders
    // hub / Suraksha around the pair.
    if (
      !this._prefsSidebarExpanded &&
      compact &&
      target.contains(compact) &&
      target.contains(ai)
    ) {
      compact.after(ai);
    }
    this._syncAiSidebarButton();
  },

  _hideOnlySidebarAiButton() {
    const ai = document.getElementById("astra-ai-sidebar-button");
    if (!ai) {
      return;
    }
    ai.setAttribute("hidden", "true");
    ai.removeAttribute("open");
    const strip = document.getElementById(
      "zen-sidebar-top-buttons-customization-target"
    );
    if (strip && !strip.contains(ai)) {
      strip.append(ai);
    }
    const btn = document.getElementById("astra-ai-sidebar-toolbarbutton");
    btn?.removeAttribute("checked");
  },

  /**
   * Only Sidebar: Compact sits in the footer next to the theme toggle so the
   * 186px nav strip is Back / Forward / Reload / AI only. Other layouts keep
   * Compact as the first icon in the top strip.
   */
  _placeOnlySidebarCompactToggle(enable) {
    const compact = document.getElementById("zen-toggle-compact-mode");
    if (!compact) {
      return;
    }
    compact.setAttribute("overflows", "false");
    compact.removeAttribute("hidden");
    compact.removeAttribute("astra-only-sidebar-noop");
    compact.removeAttribute("overflowedItem");
    compact.removeAttribute("cui-anchorid");
    if (enable) {
      compact.setAttribute("astra-only-sidebar-footer", "true");
      const foot = document.getElementById("zen-sidebar-foot-buttons");
      if (!foot) {
        return;
      }
      const scheme = document.getElementById("zen-toggle-window-scheme");
      try {
        if (scheme && foot.contains(scheme)) {
          foot.insertBefore(compact, scheme);
        } else if (!foot.contains(compact)) {
          foot.prepend(compact);
        }
      } catch (e) {
        console.warn(
          "[Astra] Failed to move Compact Mode to sidebar footer:",
          e
        );
      }
    } else {
      compact.removeAttribute("astra-only-sidebar-footer");
      this._restoreWidgetToSidebarStrip(compact);
      const target = document.getElementById(
        "zen-sidebar-top-buttons-customization-target"
      );
      const separator = this._topButtonsSeparatorElement;
      if (
        target?.contains(compact) &&
        separator &&
        target.contains(separator)
      ) {
        try {
          target.insertBefore(compact, separator);
        } catch (e) {
          console.warn(
            "[Astra] Failed to restore Compact Mode to top strip:",
            e
          );
        }
      }
    }
  },

  _initOnlySidebarAiButton() {
    const btn = document.getElementById("astra-ai-sidebar-toolbarbutton");
    if (!btn || btn.hasAttribute("astra-ai-bound")) {
      return;
    }
    btn.setAttribute("astra-ai-bound", "true");
    btn.addEventListener("command", event => {
      event.preventDefault();
      this._toggleAiChatSidebar();
    });
    const box = document.getElementById("sidebar-box");
    const sync = () => this._syncAiSidebarButton();
    box?.addEventListener("sidebar-show", sync);
    box?.addEventListener("sidebar-hide", sync);
    sync();
  },

  _toggleAiChatSidebar() {
    const sc = window.SidebarController;
    if (!sc) {
      return;
    }
    const id = "viewGenaiChatSidebar";
    try {
      const command = document
        .getElementById("sidebar-box")
        ?.getAttribute("sidebarcommand");
      const open = sc.isOpen && (sc.currentID === id || command === id);
      if (open) {
        sc.hide();
      } else {
        sc.show(id);
      }
    } catch (e) {
      console.warn("[Astra] Failed to toggle AI sidebar", e);
    }
  },

  _syncAiSidebarButton() {
    const item = document.getElementById("astra-ai-sidebar-button");
    const btn = document.getElementById("astra-ai-sidebar-toolbarbutton");
    if (!btn) {
      return;
    }
    const sc = window.SidebarController;
    const id = "viewGenaiChatSidebar";
    const command = document
      .getElementById("sidebar-box")
      ?.getAttribute("sidebarcommand");
    const open = !!(
      sc?.isOpen &&
      (sc.currentID === id || command === id)
    );
    btn.toggleAttribute("checked", open);
    item?.toggleAttribute("open", open);
  },

  animateItemOpen(aItem) {
    if (
      gReduceMotion ||
      !gZenUIManager.motion ||
      !aItem ||
      !gZenUIManager._hasLoadedDOM ||
      !aItem.isConnected ||
      // We do want to do some animations during testing with profiling enabled
      // so we can capture and improve them.
      (gZenUIManager.testingEnabled && !gZenUIManager.profilingEnabled) ||
      !gZenStartup.isReady ||
      aItem.group?.hasAttribute("split-view-group")
    ) {
      return;
    }
    // get next visible tab
    const isLastItem = () => {
      const visibleItems = gBrowser.tabContainer.ariaFocusableItems;
      return visibleItems[visibleItems.length - 1] === aItem;
    };

    try {
      const itemSize =
        window.windowUtils.getBoundsWithoutFlushing(aItem).height;
      const transform = `-${itemSize}px`;
      gZenUIManager.motion
        .animate(
          aItem,
          {
            opacity: [0, 1],
            transform: ["scale(0.95)", "scale(1)"],
            marginBottom: isLastItem() ? ["0px", "0px"] : [transform, "0px"],
          },
          {
            duration: 0.12,
            easing: "easeOut",
          }
        )
        .then(() => {})
        .catch(err => {
          console.error(err);
        })
        .finally(() => {
          aItem.style.removeProperty("margin-bottom");
          aItem.style.removeProperty("transform");
          aItem.style.removeProperty("opacity");
        });
      const itemLabel =
        aItem.querySelector(".tab-group-label-container") ||
        aItem.querySelector(".tab-content");
      gZenUIManager.motion
        .animate(
          itemLabel,
          {
            filter: ["blur(1px)", "blur(0px)"],
          },
          {
            duration: 0.1,
            easing: "easeOut",
          }
        )
        .then(() => {})
        .catch(err => {
          console.error(err);
        })
        .finally(() => {
          itemLabel.style.removeProperty("filter");
        });
    } catch (e) {
      console.error(e);
    }
  },

  animateItemClose(aItem) {
    if (
      aItem.hasAttribute("zen-essential") ||
      aItem.group?.hasAttribute("split-view-group") ||
      !gZenUIManager.motion ||
      gReduceMotion
    ) {
      return Promise.resolve();
    }
    const height = window.windowUtils.getBoundsWithoutFlushing(aItem).height;
    const visibleItems = gBrowser.tabContainer.ariaFocusableItems;
    const isLastItem = visibleItems[visibleItems.length - 1] === aItem;
    return gZenUIManager.motion.animate(
      aItem,
      {
        opacity: [1, 0],
        transform: ["scale(1)", "scale(0.95)"],
        ...(isLastItem
          ? {}
          : {
              marginBottom: [`0px`, `-${height}px`],
            }),
      },
      {
        duration: 0.1,
        easing: "easeOut",
      }
    );
  },

  get actualWindowButtons() {
    // we have multiple ".titlebar-buttonbox-container" in the DOM, because of the titlebar
    if (!this.__actualWindowButtons) {
      this.__actualWindowButtons = !this.isWindowsStyledButtons
        ? document.querySelector(".titlebar-buttonbox-container") // TODO: test if it works 100% of the time
        : document.querySelector("#nav-bar .titlebar-buttonbox-container");
      this.__actualWindowButtons.setAttribute("overflows", "false");
    }
    return this.__actualWindowButtons;
  },

  /**
   * Keep toolbox, <html>, and #tabbrowser-tabs expanded attrs in lockstep.
   * Zen CSS keys off zen-sidebar-expanded; Firefox tab close-button layout
   * keys off #tabbrowser-tabs[expanded]. Diverging them yields an absolute
   * left-clipped close button while labels still render in the wide sidebar.
   *
   * zen-sidebar-expanded must use value "true" because selectors are
   * [zen-sidebar-expanded="true"] (toggleAttribute would set an empty value).
   *
   * @param {boolean} expanded
   */
  _applySidebarExpandedState(expanded) {
    // navigatorToolbox is gNavToolbox for this window.
    if (expanded) {
      this.navigatorToolbox?.setAttribute("zen-sidebar-expanded", "true");
      document.documentElement.setAttribute("zen-sidebar-expanded", "true");
      gBrowser?.tabContainer?.toggleAttribute("expanded", true);
    } else {
      this.navigatorToolbox?.removeAttribute("zen-sidebar-expanded");
      document.documentElement.removeAttribute("zen-sidebar-expanded");
      gBrowser?.tabContainer?.toggleAttribute("expanded", false);
    }
  },

  async _preCustomize() {
    await this._multiWindowFeature.foreachWindowAsActive(async browser => {
      browser.gZenVerticalTabsManager._updateEvent({
        forCustomizableMode: true,
        dontRebuildAreas: true,
      });
    });
    this.rebuildAreas();
    // Force expanded chrome during customize; keep tabContainer in sync.
    this._applySidebarExpandedState(true);
  },

  _postCustomize() {
    // No need to use `await` here, because the customization is already done
    this._multiWindowFeature.foreachWindowAsActive(async browser => {
      browser.gZenVerticalTabsManager._updateEvent({ dontRebuildAreas: true });
    });
  },

  initializePreferences(updateEvent) {
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsVerticalTabs",
      "zen.tabs.vertical",
      true,
      updateEvent
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsRightSide",
      "zen.tabs.vertical.right-side",
      false,
      updateEvent
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsUseSingleToolbar",
      "zen.view.use-single-toolbar",
      false,
      updateEvent
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsSidebarExpanded",
      "zen.view.sidebar-expanded",
      false,
      updateEvent
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_prefsSidebarExpandedMaxWidth",
      "zen.view.sidebar-expanded.max-width",
      300,
      updateEvent
    );
  },

  _initWaitPromise() {
    this._waitPromise = new Promise(resolve => {
      this._resolveWaitPromise = resolve;
    });
  },

  async _onPrefChange() {
    this._resolveWaitPromise();

    // only run if we are in the active window
    await this._multiWindowFeature.foreachWindowAsActive(async browser => {
      if (
        browser.gZenVerticalTabsManager._multiWindowFeature.windowIsActive(
          browser
        )
      ) {
        return;
      }
      await browser.gZenVerticalTabsManager._waitPromise;
      browser.gZenVerticalTabsManager._updateEvent({ dontRebuildAreas: true });
      browser.gZenVerticalTabsManager._initWaitPromise();
    });

    if (nsZenMultiWindowFeature.isActiveWindow) {
      this._updateEvent();
      this._initWaitPromise();
    }
  },

  recalculateURLBarHeight(updateFormat = false) {
    if (gZenWorkspaces._processingResize) {
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gURLBar.removeAttribute("--urlbar-height");
        let height;
        if (!this._hasSetSingleToolbar) {
          height = AppConstants.platform == "macosx" ? 34 : 32;
        } else if (!gURLBar.hasAttribute("breakout-extend")) {
          height = 38;
        }
        if (typeof height !== "undefined") {
          gURLBar.style.setProperty("--urlbar-height", `${height}px`);
        }
        if (updateFormat) {
          gURLBar.zenFormatURLValue();
        }
      });
    });
  },

  // eslint-disable-next-line complexity
  _updateEvent({ forCustomizableMode = false, dontRebuildAreas = false } = {}) {
    if (this._isUpdating) {
      return;
    }
    this._isUpdating = true;
    try {
      this._updateMaxWidth();

      if (window.docShell) {
        window.docShell.treeOwner
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIAppWindow)
          .rollupAllPopups();
      }

      const topButtons = document.getElementById("zen-sidebar-top-buttons");
      const isCompactMode =
        gZenCompactModeManager.preference && !forCustomizableMode;
      const isVerticalTabs = this._prefsVerticalTabs || forCustomizableMode;
      const isSidebarExpanded = this._prefsSidebarExpanded || !isVerticalTabs;
      const isRightSide = this._prefsRightSide && isVerticalTabs;
      const isSingleToolbar =
        ((this._prefsUseSingleToolbar && isVerticalTabs && isSidebarExpanded) ||
          !isVerticalTabs) &&
        !forCustomizableMode &&
        !this.hidesTabsToolbar;
      const titlebar = document.getElementById("titlebar");

      gBrowser.tabContainer.setAttribute(
        "orient",
        isVerticalTabs ? "vertical" : "horizontal"
      );
      gBrowser.tabContainer.arrowScrollbox.setAttribute(
        "orient",
        isVerticalTabs ? "vertical" : "horizontal"
      );
      // on purpose, we set the orient to horizontal, because the arrowScrollbox is vertical
      gBrowser.tabContainer.arrowScrollbox.scrollbox.setAttribute(
        "orient",
        isVerticalTabs ? "vertical" : "horizontal"
      );

      const buttonsTarget = document.getElementById(
        "zen-sidebar-top-buttons-customization-target"
      );
      if (isRightSide) {
        this.navigatorToolbox.setAttribute("zen-right-side", "true");
        document.documentElement.setAttribute("zen-right-side", "true");
      } else {
        this.navigatorToolbox.removeAttribute("zen-right-side");
        document.documentElement.removeAttribute("zen-right-side");
      }

      delete this._hadSidebarCollapse;
      if (isSidebarExpanded) {
        this._hadSidebarCollapse = !document.documentElement.hasAttribute(
          "zen-sidebar-expanded"
        );
      }
      this._applySidebarExpandedState(isSidebarExpanded);

      const appContentNavbarContaienr = document.getElementById(
        "zen-appcontent-navbar-container"
      );
      const appContentNavbarWrapper = document.getElementById(
        "zen-appcontent-navbar-wrapper"
      );
      appContentNavbarWrapper.style.transition = "none";
      let shouldHide = false;
      if (
        ((!isRightSide && this.isWindowsStyledButtons) ||
          (isRightSide && !this.isWindowsStyledButtons) ||
          (isCompactMode && isSingleToolbar && this.isWindowsStyledButtons)) &&
        isSingleToolbar
      ) {
        appContentNavbarWrapper.setAttribute("should-hide", true);
        shouldHide = true;
      } else {
        appContentNavbarWrapper.removeAttribute("should-hide");
      }

      // Check if the sidebar is in hover mode
      if (
        !this.navigatorToolbox.hasAttribute("zen-right-side") &&
        !isCompactMode
      ) {
        this.navigatorToolbox.prepend(topButtons);
      }

      let windowButtons = this.actualWindowButtons;
      let doNotChangeWindowButtons =
        !isCompactMode && isRightSide && this.isWindowsStyledButtons;
      const navBar = document.getElementById("nav-bar");

      if (isSingleToolbar) {
        this._navbarParent = navBar.parentElement;
        let elements = document.querySelectorAll(
          '#nav-bar-customization-target > :is([cui-areatype="toolbar"], .chromeclass-toolbar-additional):not(#urlbar-container):not(toolbarspring)'
        );
        elements = Array.from(elements).reverse();
        // Add separator if it doesn't exist
        if (!this._hasSetSingleToolbar) {
          buttonsTarget.append(this._topButtonsSeparatorElement);
        }
        this._hasSetSingleToolbar = true;
        for (const button of elements) {
          this.appendCustomizableItem(this._topButtonsSeparatorElement, button);
        }
        buttonsTarget.prepend(
          document.getElementById("unified-extensions-button")
        );
        const panelUIButton = document.getElementById("PanelUI-button");
        buttonsTarget.prepend(panelUIButton);
        panelUIButton.setAttribute("overflows", "false");
        // Compact Mode lives in the sidebar footer in Only Sidebar so the
        // 186px nav strip can hold Back / Forward / Reload / AI.
        document
          .getElementById("zen-toggle-compact-mode")
          ?.setAttribute("overflows", "false");
        buttonsTarget.parentElement.append(
          document.getElementById("nav-bar-overflow-button")
        );
        if (this.isWindowsStyledButtons && !doNotChangeWindowButtons) {
          appContentNavbarContaienr.append(windowButtons);
        }
        if (isCompactMode) {
          titlebar.moveBefore(navBar, titlebar.firstChild);
          titlebar.moveBefore(topButtons, titlebar.firstChild);
        } else {
          titlebar.parentNode.moveBefore(topButtons, titlebar);
          titlebar.parentNode.moveBefore(navBar, titlebar);
        }
        document.documentElement.setAttribute("zen-single-toolbar", true);
        this._hasSetSingleToolbar = true;
        this._applyOnlySidebarIconAllocation(true);
      } else if (this._hasSetSingleToolbar) {
        this._hasSetSingleToolbar = false;
        this._applyOnlySidebarIconAllocation(false);
        // Do the opposite
        this._navbarParent.prepend(navBar);
        const elements = document.querySelectorAll(
          '#zen-sidebar-top-buttons-customization-target > :is([cui-areatype="toolbar"], .chromeclass-toolbar-additional)'
        );
        for (const button of elements) {
          document
            .getElementById("nav-bar-customization-target")
            .append(button);
        }
        this._topButtonsSeparatorElement.remove();
        document.documentElement.removeAttribute("zen-single-toolbar");
        const panelUIButton = document.getElementById("PanelUI-button");
        navBar.appendChild(panelUIButton);
        panelUIButton.removeAttribute("overflows");
        navBar.appendChild(document.getElementById("nav-bar-overflow-button"));
        this._toolbarOriginalParent.prepend(navBar);
        if (!dontRebuildAreas) {
          this.rebuildAreas();
        }
      }

      if (isCompactMode) {
        titlebar.prepend(topButtons);
      } else if (isSidebarExpanded) {
        titlebar.before(topButtons);
      } else {
        titlebar.prepend(topButtons);
      }

      // Case: single toolbar, not compact mode, not right side and macos styled buttons
      if (
        !doNotChangeWindowButtons &&
        isSingleToolbar &&
        !isCompactMode &&
        !isRightSide &&
        !this.isWindowsStyledButtons
      ) {
        topButtons.prepend(windowButtons);
      }

      const canHideTabBarPref = Services.prefs.getBoolPref(
        "zen.view.compact.hide-tabbar"
      );
      const captionsShouldStayOnSidebar =
        !canHideTabBarPref &&
        ((!this.isWindowsStyledButtons && !isRightSide) ||
          (this.isWindowsStyledButtons && isRightSide));
      // Compact Mode still parks the strip on #nav-bar. Collapsed (non-compact)
      // keeps it in the toolbox rail so vertical-tabs.css can stack the icons
      // in a column — moving it to #nav-bar left the 38px row locked in the
      // top-left corner over the narrow rail.
      if (!isSingleToolbar && isCompactMode && !captionsShouldStayOnSidebar) {
        navBar.prepend(topButtons);
      }

      // Case: single toolbar, compact mode, right side and windows styled buttons
      if (
        isSingleToolbar &&
        isCompactMode &&
        isRightSide &&
        this.isWindowsStyledButtons
      ) {
        topButtons.prepend(windowButtons);
      }

      if (doNotChangeWindowButtons) {
        if (isRightSide && !isSidebarExpanded) {
          navBar.appendChild(windowButtons);
        } else {
          topButtons.appendChild(windowButtons);
        }
      } else if (!isSingleToolbar && !isCompactMode) {
        if (this.isWindowsStyledButtons) {
          if (isRightSide) {
            appContentNavbarContaienr.append(windowButtons);
          } else {
            navBar.append(windowButtons);
          }
        } else {
          // not windows styled buttons
          // eslint-disable-next-line no-lonely-if
          if (isRightSide || !isSidebarExpanded) {
            navBar.prepend(windowButtons);
          } else {
            topButtons.prepend(windowButtons);
          }
        }
      } else if (!isSingleToolbar && isCompactMode) {
        if (captionsShouldStayOnSidebar) {
          topButtons.prepend(windowButtons);
        } else {
          navBar.appendChild(windowButtons);
        }
      } else if (isSingleToolbar && isCompactMode) {
        if (!isRightSide && !this.isWindowsStyledButtons) {
          topButtons.prepend(windowButtons);
        }
      }

      if (shouldHide) {
        appContentNavbarContaienr.append(windowButtons);
      }

      if (
        this._hasSetSingleToolbar &&
        Services.prefs.getBoolPref("zen.view.overflow-webext-toolbar", true)
      ) {
        topButtons.setAttribute(
          "addon-webext-overflowtarget",
          "zen-overflow-extensions-list"
        );
      } else {
        topButtons.setAttribute(
          "addon-webext-overflowtarget",
          "overflowed-extensions-list"
        );
      }

      gZenCompactModeManager.updateCompactModeContext(isSingleToolbar);

      // Always move the splitter next to the sidebar
      const splitter = document.getElementById("zen-sidebar-splitter");
      splitter.addEventListener("dragover", gBrowser.tabContainer);
      this.navigatorToolbox.after(splitter);
      window.dispatchEvent(new Event("resize"));
      if (!isCompactMode) {
        gZenCompactModeManager.getAndApplySidebarWidth({});
      }
      gZenUIManager.updateTabsToolbar();

      // Re-assert AI after toolbox / nav-bar / overflow settle. Only Sidebar
      // teardown sweeps cui-areatype widgets out of the strip; keep AI on
      // the rail for Sidebar+Top Toolbar and the collapsed icon column.
      const aiTarget = document.getElementById(
        "zen-sidebar-top-buttons-customization-target"
      );
      if (isSingleToolbar) {
        this._placeOnlySidebarAiButton(aiTarget);
      } else {
        this._placeAiButtonForNonOnlySidebar(aiTarget);
      }

      this.rebuildURLBarMenus();
      appContentNavbarWrapper.style.transition = "";
    } catch (e) {
      console.error(e);
    }
    this._isUpdating = false;
  },

  rebuildURLBarMenus() {
    if (document.getElementById("paste-and-go")) {
      return;
    }
    gURLBar._initCopyCutController();
    gURLBar._initPasteAndGo();
    gURLBar._initStripOnShare();
    gURLBar._updatePlaceholderFromDefaultEngine();
  },

  rebuildAreas() {
    CustomizableUI.zenInternalCU._rebuildRegisteredAreas(
      /* zenDontRebuildCollapsed */ true
    );
  },

  _updateMaxWidth() {
    const maxWidth = Services.prefs.getIntPref(
      "zen.view.sidebar-expanded.max-width"
    );
    const toolbox = gNavToolbox;
    if (!this._prefsCompactMode) {
      toolbox.style.maxWidth = `${maxWidth}px`;
    } else {
      toolbox.style.removeProperty("maxWidth");
    }
  },

  get expandButton() {
    if (this._expandButton) {
      return this._expandButton;
    }
    this._expandButton = document.getElementById("zen-expand-sidebar-button");
    return this._expandButton;
  },

  toggleTabsOnRight() {
    const newVal = !Services.prefs.getBoolPref("zen.tabs.vertical.right-side");
    Services.prefs.setBoolPref("zen.tabs.vertical.right-side", newVal);
  },

  appendCustomizableItem(target, child, placements = []) {
    if (
      this._hasSetSingleToolbar &&
      (target.id === "zen-sidebar-top-buttons-customization-target" ||
        target === this._topButtonsSeparatorElement)
    ) {
      if (placements.includes(child.id)) {
        this._topButtonsSeparatorElement.before(child);
        return;
      } else if (
        child.hasAttribute("data-extensionid") &&
        Services.prefs.getBoolPref("zen.view.overflow-webext-toolbar", true)
      ) {
        if (gURLBar._isOverflowingItems) {
          const overflowElements = document.getElementById(
            "zen-overflow-extensions-list"
          );
          overflowElements.appendChild(child);
        } else {
          const element = document.getElementById("page-action-buttons");
          child.setAttribute("context", "toolbar-context-menu");
          element.before(child);
        }
        return;
      }
    }
    if (target === this._topButtonsSeparatorElement) {
      this._topButtonsSeparatorElement.after(child);
    } else {
      target.appendChild(child);
    }
  },

  async renameTabKeydown(event) {
    event.stopPropagation();
    if (event.key === "Enter") {
      const isTab = !!event.target.closest(".tabbrowser-tab");
      let label = isTab
        ? this._tabEdited.querySelector(".tab-label-container-editing")
        : this._tabEdited;
      let input = document.getElementById("tab-label-input");
      let newName = input.value.replace(/\s+/g, " ").trim();
      const hasChanged = input.value !== input._originalValue && newName;

      document.documentElement.removeAttribute("zen-renaming-tab");
      input.remove();
      if (!isTab) {
        await this._tabEdited.onRenameFinished(newName);
      } else {
        // Check if name is blank, reset if so
        // Always remove, so we can always rename and if it's empty,
        // it will reset to the original name anyway
        if (hasChanged || (this._tabEdited.zenStaticLabel && newName)) {
          this._tabEdited.zenStaticLabel = newName;
          gBrowser._setTabLabel(this._tabEdited, newName, {
            _zenChangeLabelFlag: true,
          });
          gZenUIManager.showToast("zen-tabs-renamed");
        } else {
          delete this._tabEdited.zenStaticLabel;
          gBrowser.setTabTitle(this._tabEdited);
        }

        gZenUIManager.motion.animate(
          this._tabEdited,
          {
            scale: [1, 0.98, 1],
          },
          {
            duration: 0.25,
          }
        );
      }

      const editorContainer = this._tabEdited.querySelector(
        ".tab-editor-container"
      );
      if (editorContainer) {
        editorContainer.remove();
      }
      label.classList.remove("tab-label-container-editing");

      this._tabEdited = null;
    } else if (event.key === "Escape") {
      event.target.blur();
    }
  },

  renameTabStart(event) {
    let target = event.target;
    if (event.target.id === "context_zen-edit-tab-title") {
      target = TabContextMenu.contextTab;
    }
    const isTab = !!target.closest(".tabbrowser-tab");
    if (
      this._tabEdited ||
      ((!Services.prefs.getBoolPref("zen.tabs.rename-tabs") ||
        (Services.prefs.getBoolPref("browser.tabs.closeTabByDblclick") &&
          event.type === "dblclick")) &&
        isTab) ||
      !gZenVerticalTabsManager._prefsSidebarExpanded
    ) {
      return;
    }
    if (
      isTab &&
      !target.closest(".tab-label-container") &&
      event.type === "dblclick"
    ) {
      return;
    }
    this._tabEdited =
      target.closest(".tabbrowser-tab") ||
      target.closest(".zen-current-workspace-indicator-name") ||
      (event.explicit && target.closest(".tab-group-label"));
    if (
      !this._tabEdited ||
      (this._tabEdited.hasAttribute("zen-essential") && isTab)
    ) {
      this._tabEdited = null;
      return;
    }
    gZenFolders.cancelPopupTimer();
    event.stopPropagation?.();
    document.documentElement.setAttribute("zen-renaming-tab", "true");
    const label = isTab
      ? this._tabEdited.querySelector(".tab-label-container")
      : this._tabEdited;
    label.classList.add("tab-label-container-editing");

    if (isTab) {
      const container = window.MozXULElement.parseXULToFragment(`
        <vbox class="tab-label-container tab-editor-container" flex="1" align="start" pack="center"></vbox>
      `);
      label.after(container);
    }
    const input = document.createElement("input");
    const content = isTab ? this._tabEdited.label : this._tabEdited.textContent;
    input.id = "tab-label-input";
    input._originalValue = content;
    input.value = content;
    input.addEventListener("keydown", this.renameTabKeydown.bind(this));

    if (isTab) {
      const containerHtml = this._tabEdited.querySelector(
        ".tab-editor-container"
      );
      containerHtml.appendChild(input);
    } else {
      this._tabEdited.after(input);
    }
    input.focus();
    input.setSelectionRange(0, input.value.length, "backward");
    input.scrollLeft = 0;

    input.addEventListener("blur", this._renameTabHalt);
  },

  renameTabHalt(event) {
    if (document.activeElement === event.target || !this._tabEdited) {
      return;
    }
    document.documentElement.removeAttribute("zen-renaming-tab");
    const editorContainer = this._tabEdited.querySelector(
      ".tab-editor-container"
    );
    let input = document.getElementById("tab-label-input");
    input.remove();
    if (editorContainer) {
      editorContainer.remove();
    }
    const isTab = !!this._tabEdited.closest(".tabbrowser-tab");
    const label = isTab
      ? this._tabEdited.querySelector(".tab-label-container-editing")
      : this._tabEdited;
    label.classList.remove("tab-label-container-editing");

    this._tabEdited = null;
  },
};
