/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  UrlbarTestUtils: "resource://testing-common/UrlbarTestUtils.sys.mjs",
});

const PREV_URL = "https://example.com/";
const NEXT_URL = "https://example.org/";

function tabId(tab) {
  return tab?.linkedPanel || tab?.permanentKey || String(tab);
}

async function withOverlayNewTab(testFn) {
  const originalTesting = gZenUIManager.testingEnabled;
  gZenUIManager.testingEnabled = false;
  await SpecialPowers.pushPrefEnv({
    set: [
      ["astra.newtab.layout", "minimal"],
      ["zen.urlbar.replace-newtab", true],
    ],
  });
  const prevTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    PREV_URL
  );
  const prevId = tabId(prevTab);
  try {
    Assert.ok(
      gZenUIManager.handleNewTab(false, false, "tab"),
      "New Tab opens the URL-bar overlay"
    );
    Assert.ok(
      gURLBar.hasAttribute("zen-newtab"),
      "Overlay is marked zen-newtab"
    );
    const overlayTab = gBrowser.selectedTab;
    Assert.notEqual(
      tabId(overlayTab),
      prevId,
      "Overlay focuses a newly created tab, not the previous tab"
    );
    Assert.ok(
      !overlayTab.hasAttribute("zen-empty-tab"),
      "Overlay tab is a real tab, not the workspace empty-tab placeholder"
    );
    Assert.equal(
      prevTab.linkedBrowser.currentURI.spec,
      PREV_URL,
      "Previous tab is unchanged after opening the overlay"
    );
    await testFn({ prevTab, prevId, overlayTab });
  } finally {
    if (gURLBar.hasAttribute("zen-newtab")) {
      gZenUIManager.handleUrlbarClose(false, false);
    }
    gZenUIManager.testingEnabled = originalTesting;
    await SpecialPowers.popPrefEnv();
    if (prevTab && !prevTab.closing) {
      BrowserTestUtils.removeTab(prevTab);
    }
  }
}

add_task(async function test_overlay_enter_does_not_navigate_previous_tab() {
  await withOverlayNewTab(async ({ prevTab, prevId, overlayTab }) => {
    const loaded = BrowserTestUtils.browserLoaded(
      overlayTab.linkedBrowser,
      false,
      url => url.startsWith(NEXT_URL)
    );
    gURLBar.value = NEXT_URL;
    gURLBar.handleCommand(new KeyboardEvent("keydown", { key: "Enter" }));
    await loaded;

    Assert.equal(
      tabId(gBrowser.selectedTab),
      tabId(overlayTab),
      "Enter loads into the overlay tab"
    );
    Assert.ok(
      gBrowser.selectedTab.linkedBrowser.currentURI.spec.startsWith(NEXT_URL),
      "The new tab shows the submitted URL"
    );
    Assert.equal(
      tabId(prevTab),
      prevId,
      "Previous tab identity is unchanged"
    );
    Assert.equal(
      prevTab.linkedBrowser.currentURI.spec,
      PREV_URL,
      "Previous tab still shows its original URL"
    );
  });
});

add_task(async function test_overlay_click_result_does_not_navigate_previous_tab() {
  await withOverlayNewTab(async ({ prevTab, overlayTab }) => {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: NEXT_URL,
      fireInputEvent: true,
    });
    const loaded = BrowserTestUtils.browserLoaded(
      overlayTab.linkedBrowser,
      false,
      url => url.startsWith(NEXT_URL)
    );
    await UrlbarTestUtils.promisePopupClose(window, () => {
      EventUtils.synthesizeKey("KEY_Enter");
    });
    await loaded;

    Assert.equal(
      prevTab.linkedBrowser.currentURI.spec,
      PREV_URL,
      "Mouse/keyboard result selection must not navigate the previous tab"
    );
    Assert.ok(
      gBrowser.selectedTab.linkedBrowser.currentURI.spec.startsWith(NEXT_URL),
      "The selected tab shows the result URL"
    );
    Assert.notEqual(
      gBrowser.selectedTab,
      prevTab,
      "Result opened in a different tab than the previous one"
    );
  });
});

add_task(async function test_overlay_cancel_restores_previous_tab() {
  await withOverlayNewTab(async ({ prevTab, overlayTab }) => {
    gZenUIManager.handleUrlbarClose(false, false);
    await TestUtils.waitForCondition(
      () => gBrowser.selectedTab === prevTab,
      "Cancel restores the previously active tab"
    );
    Assert.ok(
      overlayTab.closing || !overlayTab.isConnected,
      "Unused overlay tab is discarded on cancel"
    );
    Assert.equal(
      prevTab.linkedBrowser.currentURI.spec,
      PREV_URL,
      "Restored tab is still on its original URL"
    );
  });
});

add_task(async function test_overlay_in_compact_mode_leaves_previous_tab() {
  const origCompact = gZenCompactModeManager.preference;
  gZenCompactModeManager.preference = true;
  await TestUtils.waitForCondition(
    () => document.documentElement.getAttribute("zen-compact-mode") === "true",
    "Compact Mode enabled"
  );
  try {
    await withOverlayNewTab(async ({ prevTab, overlayTab }) => {
      const loaded = BrowserTestUtils.browserLoaded(
        overlayTab.linkedBrowser,
        false,
        url => url.startsWith(NEXT_URL)
      );
      gURLBar.value = NEXT_URL;
      gURLBar.handleCommand(new KeyboardEvent("keydown", { key: "Enter" }));
      await loaded;
      Assert.equal(
        prevTab.linkedBrowser.currentURI.spec,
        PREV_URL,
        "Compact Mode: previous tab stays on its original URL"
      );
      Assert.notEqual(
        gBrowser.selectedTab,
        prevTab,
        "Compact Mode: result is not in the previous tab"
      );
    });
  } finally {
    gZenCompactModeManager.preference = origCompact;
  }
});

add_task(async function test_overlay_compact_click_result_navigates() {
  const origCompact = gZenCompactModeManager.preference;
  gZenCompactModeManager.preference = true;
  await TestUtils.waitForCondition(
    () => document.documentElement.getAttribute("zen-compact-mode") === "true",
    "Compact Mode enabled"
  );
  try {
    await withOverlayNewTab(async ({ prevTab, overlayTab }) => {
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        waitForFocus: true,
      });
      const row = document.querySelector("#urlbar-results .urlbarView-row");
      Assert.ok(row, "Compact overlay shows at least one suggestion row");

      const loaded = BrowserTestUtils.browserLoaded(
        overlayTab.linkedBrowser,
        false,
        url => url && url !== "about:blank" && url !== "about:newtab"
      );
      EventUtils.synthesizeMouseAtCenter(row, {}, window);
      await loaded;

      Assert.equal(
        prevTab.linkedBrowser.currentURI.spec,
        PREV_URL,
        "Compact mouse click must not navigate the previous tab"
      );
      Assert.notEqual(
        gBrowser.selectedTab.linkedBrowser.currentURI.spec,
        "about:blank",
        "Compact mouse click navigates the overlay tab"
      );
    });
  } finally {
    gZenCompactModeManager.preference = origCompact;
  }
});

add_task(async function test_overlay_survives_blur_before_uri_updates() {
  // Regression: handleCommand → _loadURL blurs the urlbar and endLayoutExtend
  // called handleUrlbarClose(false, false) while currentURI was still
  // about:blank, which discarded the overlay tab and aborted the load.
  await withOverlayNewTab(async ({ prevTab, overlayTab }) => {
    const loaded = BrowserTestUtils.browserLoaded(
      overlayTab.linkedBrowser,
      false,
      url => url.startsWith(NEXT_URL)
    );
    gURLBar.value = NEXT_URL;
    gURLBar.handleCommand(new KeyboardEvent("keydown", { key: "Enter" }));

    // Simulate the blur/endLayoutExtend close racing ahead of the URI update.
    if (gURLBar.hasAttribute("zen-newtab")) {
      Assert.ok(
        gZenUIManager._overlayLoadPending ||
          overlayTab.linkedBrowser.busy ||
          overlayTab.linkedBrowser.isLoadingDocument ||
          overlayTab.linkedBrowser.currentURI.spec.startsWith(NEXT_URL),
        "Overlay load was marked pending (or already committed) before discard"
      );
      gZenUIManager.handleUrlbarClose(false, false);
    }

    await loaded;
    Assert.ok(
      !overlayTab.closing && overlayTab.isConnected,
      "Overlay tab is not discarded by the blur-before-URI race"
    );
    Assert.equal(
      prevTab.linkedBrowser.currentURI.spec,
      PREV_URL,
      "Previous tab is unchanged after the blur race"
    );
    Assert.ok(
      gBrowser.selectedTab.linkedBrowser.currentURI.spec.startsWith(NEXT_URL),
      "Navigation still lands in the overlay tab"
    );
  });
});
