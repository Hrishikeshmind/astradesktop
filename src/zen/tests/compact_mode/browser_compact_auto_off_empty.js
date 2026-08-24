/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_hasContentTabs_counts_real_tabs() {
  const extra = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  Assert.ok(
    gZenCompactModeManager.hasContentTabs(),
    "A loaded content tab counts as a real tab"
  );
  BrowserTestUtils.removeTab(extra);
});

add_task(async function test_compact_auto_off_when_no_content_tabs() {
  if (!gZenCompactModeManager.preference) {
    gZenCompactModeManager.preference = true;
    await TestUtils.waitForCondition(
      () => document.documentElement.getAttribute("zen-compact-mode") === "true",
      "Compact Mode enabled"
    );
  }
  Assert.ok(gZenCompactModeManager.preference, "Compact Mode starts on");

  const orig = gZenCompactModeManager.hasContentTabs;
  gZenCompactModeManager.hasContentTabs = () => false;
  try {
    gZenCompactModeManager.maybeDisableCompactForEmptyBrowser();
    Assert.equal(
      gZenCompactModeManager.preference,
      false,
      "Compact Mode turns off when no content tabs remain"
    );
    Assert.notEqual(
      document.documentElement.getAttribute("zen-compact-mode"),
      "true",
      "zen-compact-mode attribute is cleared"
    );
  } finally {
    gZenCompactModeManager.hasContentTabs = orig;
  }
});

add_task(async function test_compact_stays_on_while_content_tabs_exist() {
  if (!gZenCompactModeManager.preference) {
    gZenCompactModeManager.preference = true;
    await TestUtils.waitForCondition(
      () => document.documentElement.getAttribute("zen-compact-mode") === "true",
      "Compact Mode enabled"
    );
  }
  Assert.ok(
    gZenCompactModeManager.hasContentTabs(),
    "Test window still has content tabs"
  );
  gZenCompactModeManager.maybeDisableCompactForEmptyBrowser();
  Assert.ok(
    gZenCompactModeManager.preference,
    "Compact Mode stays on while content tabs exist"
  );
  gZenCompactModeManager.preference = false;
});
