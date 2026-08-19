/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PANEL_ID = "PanelUI-zen-app-launcher";
const PANEL_TOKEN = PANEL_ID;

function getAppHubButton() {
  return (
    document.getElementById("zen-app-launcher-button")?.querySelector(
      "toolbarbutton"
    ) || document.querySelector('toolbarbutton[command="cmd_zenOpenAppLauncher"]')
  );
}

async function enableCompactMode() {
  if (!gZenCompactModeManager.preference) {
    gZenCompactModeManager.preference = true;
    await TestUtils.waitForCondition(
      () => document.documentElement.getAttribute("zen-compact-mode") === "true",
      "Compact Mode enabled"
    );
  }
}

async function openAppHubFromButton() {
  const button = getAppHubButton();
  Assert.ok(button, "App Hub button exists in sidebar chrome");
  EventUtils.synthesizeMouseAtCenter(button, {}, window);
  await TestUtils.waitForCondition(
    () => document.getElementById(PANEL_ID)?.state === "open",
    "App Hub panel opened"
  );
}

async function closeAppHub() {
  const panel = document.getElementById(PANEL_ID);
  if (panel?.state === "open") {
    panel.hidePopup();
    await TestUtils.waitForCondition(
      () => panel.state !== "open",
      "App Hub panel closed"
    );
  }
}

add_task(async function test_compact_app_hub_does_not_reveal_sidebar() {
  await SpecialPowers.pushPrefEnv({
    set: [["astra.apphub.enabled", true]],
  });

  await enableCompactMode();
  gNavToolbox.removeAttribute("zen-has-hover");
  gNavToolbox.removeAttribute("has-popup-menu");
  gNavToolbox.removeAttribute("zen-compact-mode-active");
  gNavToolbox.removeAttribute("astra-compact-panel-lock");

  await openAppHubFromButton();

  Assert.ok(
    gZenCompactModeManager.isPanelLocked(),
    "Compact isolation lock is active while App Hub is open"
  );
  Assert.ok(
    !gNavToolbox.hasAttribute("zen-has-hover"),
    "Sidebar must stay hidden while App Hub is open"
  );
  Assert.ok(
    !gNavToolbox.hasAttribute("has-popup-menu"),
    "Popup tracking must not reveal compact sidebar for App Hub"
  );
  Assert.ok(
    !gNavToolbox.hasAttribute("astra-compact-panel-lock"),
    "Legacy compact panel lock must not pin sidebar open"
  );

  await closeAppHub();

  await TestUtils.waitForCondition(
    () => !gZenCompactModeManager.isPanelLocked(),
    "Compact isolation lock released after App Hub closes"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_compact_lockForPanel_keeps_sidebar_hidden() {
  await enableCompactMode();
  gNavToolbox.setAttribute("zen-has-hover", "true");

  gZenCompactModeManager.lockForPanel(PANEL_TOKEN);

  Assert.ok(
    !gNavToolbox.hasAttribute("zen-has-hover"),
    "lockForPanel must hide sidebar instead of revealing it"
  );

  gZenCompactModeManager.unlockForPanel(PANEL_TOKEN);
});
