/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function enableCompactMode() {
  if (!gZenCompactModeManager.preference) {
    gZenCompactModeManager.preference = true;
    await TestUtils.waitForCondition(
      () => document.documentElement.getAttribute("zen-compact-mode") === "true",
      "Compact Mode enabled"
    );
  }
  // Wait for zen-compact-animating to clear so hit-zones become active.
  await TestUtils.waitForCondition(
    () => !document.documentElement.hasAttribute("zen-compact-animating"),
    "Compact Mode animation finished"
  );
  gZenCompactModeManager._syncEdgeHitTargets();
}

function clearHover() {
  const toolbox = document.getElementById("navigator-toolbox");
  const toolbar = document.getElementById("zen-appcontent-navbar-wrapper");
  if (gZenCompactModeManager.usesUnifiedCompactChrome) {
    gZenCompactModeManager._setCompactChromeRevealed(false, {
      immediate: true,
    });
  } else {
    toolbox?.removeAttribute("zen-has-hover");
    toolbar?.removeAttribute("zen-has-hover");
    gZenCompactModeManager._edgeRevealActive = false;
    gZenCompactModeManager._topToolbarEdgeRevealActive = false;
  }
  toolbox?.removeAttribute("zen-has-empty-tab");
}

add_task(async function test_compact_hit_zones_exist_when_enabled() {
  await enableCompactMode();
  const sidebarHit = document.getElementById("zen-compact-hover-sidebar-edge");
  Assert.ok(sidebarHit, "Sidebar edge hit-zone is created");
  Assert.ok(
    !sidebarHit.hasAttribute("hidden"),
    "Sidebar edge hit-zone is visible while Compact Mode is on"
  );

  // Sidebar+Top / Collapsed hide the top toolbar; Only Sidebar does not.
  const toolbarHit = document.getElementById("zen-compact-hover-toolbar-edge");
  Assert.ok(toolbarHit, "Toolbar edge hit-zone element exists");
  if (gZenCompactModeManager.canHideToolbar) {
    Assert.ok(
      !toolbarHit.hasAttribute("hidden"),
      "Toolbar edge hit-zone is active when top toolbar auto-hides"
    );
  }

  gZenCompactModeManager.preference = false;
  await TestUtils.waitForCondition(
    () => document.documentElement.getAttribute("zen-compact-mode") !== "true",
    "Compact Mode disabled"
  );
  Assert.ok(
    sidebarHit.hasAttribute("hidden"),
    "Sidebar hit-zone hides when Compact Mode is off"
  );
});

add_task(async function test_compact_sidebar_edge_hit_reveals_immediately() {
  await enableCompactMode();
  clearHover();

  const sidebarHit = document.getElementById("zen-compact-hover-sidebar-edge");
  const toolbox = document.getElementById("navigator-toolbox");

  sidebarHit.dispatchEvent(
    new MouseEvent("mouseenter", { bubbles: true, cancelable: true })
  );

  Assert.ok(
    toolbox.hasAttribute("zen-has-hover"),
    "Sidebar reveals immediately on hit-zone mouseenter"
  );

  if (gZenCompactModeManager.usesUnifiedCompactChrome) {
    const toolbar = document.getElementById("zen-appcontent-navbar-wrapper");
    Assert.ok(
      toolbar.hasAttribute("zen-has-hover"),
      "Unified L-chrome also reveals the top toolbar"
    );
    Assert.equal(
      document.documentElement.getAttribute("zen-compact-chrome-revealed"),
      "true",
      "Unified chrome reveal attribute is set"
    );
  }

  clearHover();
  gZenCompactModeManager.preference = false;
});

add_task(async function test_compact_hide_timer_does_not_rearm() {
  await enableCompactMode();
  clearHover();

  const sidebarHit = document.getElementById("zen-compact-hover-sidebar-edge");
  const toolbox = document.getElementById("navigator-toolbox");
  sidebarHit.dispatchEvent(
    new MouseEvent("mouseenter", { bubbles: true, cancelable: true })
  );
  Assert.ok(toolbox.hasAttribute("zen-has-hover"), "Revealed for hide test");

  // Force a short hide delay for the test.
  gZenCompactModeManager._hideAfterHoverDuration = 120;

  if (gZenCompactModeManager.usesUnifiedCompactChrome) {
    gZenCompactModeManager._setCompactChromeRevealed(false);
    Assert.ok(
      gZenCompactModeManager._flashTimeouts[
        gZenCompactModeManager.COMPACT_CHROME_FLASH_ID
      ],
      "Hide timer armed"
    );
    // Re-calling must NOT push the deadline out (sticky-timer bug).
    const first =
      gZenCompactModeManager._flashTimeouts[
        gZenCompactModeManager.COMPACT_CHROME_FLASH_ID
      ];
    gZenCompactModeManager._setCompactChromeRevealed(false);
    Assert.equal(
      gZenCompactModeManager._flashTimeouts[
        gZenCompactModeManager.COMPACT_CHROME_FLASH_ID
      ],
      first,
      "Hide timer is not re-armed by repeated leave signals"
    );

    await TestUtils.waitForCondition(
      () => !toolbox.hasAttribute("zen-has-hover"),
      "Chrome hides after the short delay"
    );
  } else {
    gZenCompactModeManager._edgeRevealActive = false;
    gZenCompactModeManager.flashElement(
      toolbox,
      120,
      "has-hover" + toolbox.id,
      "zen-has-hover",
      { rearm: false }
    );
    const first =
      gZenCompactModeManager._flashTimeouts["has-hover" + toolbox.id];
    gZenCompactModeManager.flashElement(
      toolbox,
      120,
      "has-hover" + toolbox.id,
      "zen-has-hover",
      { rearm: false }
    );
    Assert.equal(
      gZenCompactModeManager._flashTimeouts["has-hover" + toolbox.id],
      first,
      "Non-unified hide timer is not re-armed"
    );
    await TestUtils.waitForCondition(
      () => !toolbox.hasAttribute("zen-has-hover"),
      "Sidebar hides after the short delay"
    );
  }

  delete gZenCompactModeManager._hideAfterHoverDuration;
  gZenCompactModeManager.preference = false;
});
