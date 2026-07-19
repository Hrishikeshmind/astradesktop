#!/usr/bin/env node
/*
 * Browser-chrome-style SOURCE contract test for the Astra Suraksha entrypoint.
 *
 * This is a static (no-runtime) approximation of the browser-chrome flow that a
 * real head.js test would drive. It asserts the invariants the entry path must
 * uphold:
 *   - App Menu is the primary built-in entry (appMenu-astra-suraksha-button)
 *   - panel open path opens the shell BEFORE requesting the lazy manager, and
 *     kicks the manager only after popupshown
 *   - the static fallback shell is initially visible (fallback-first)
 *   - the manager is requested once, after popupshown
 *   - close/reopen clears the popup transition + retry state
 *   - the optional toolbar widget is a direct toolbarbutton id=astra-suraksha-button
 *   - the command handler forwards the REAL event into the facade
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const errors = [];
const ok = msg => console.log(`OK   ${msg}`);
const fail = msg => {
  errors.push(msg);
  console.error(`FAIL ${msg}`);
};

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    fail(`missing file ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const boot = read("src/zen/common/modules/AstraSurakshaBootstrap.mjs");
const menubar = read("src/zen/common/modules/ZenMenubar.mjs");
const popups = read("src/browser/base/content/zen-panels/popups.inc");
const cui = read("src/zen/common/sys/ZenCustomizableUI.sys.mjs");
const sets = read("src/zen/common/zen-sets.js");

function slice(src, startNeedle, endNeedle) {
  const s = src.indexOf(startNeedle);
  if (s < 0) {
    return "";
  }
  const e = endNeedle ? src.indexOf(endNeedle, s + startNeedle.length) : -1;
  return src.slice(s, e > s ? e : s + 4000);
}

// —— 1. App Menu Suraksha entry wiring —————————————————————————————————————————
if (
  menubar.includes('id="appMenu-astra-suraksha-button"') &&
  menubar.includes("cmd_astraOpenSurakshaCenter")
) {
  ok("App Menu owns a Suraksha entry bound to cmd_astraOpenSurakshaCenter");
} else {
  fail("App Menu Suraksha entry wiring missing");
}

// The bootstrap anchors an App Menu invocation to the hamburger button, not a
// detached menuitem, and otherwise falls back to the toolbar button / navbar.
if (
  boot.includes("APPMENU_ID") &&
  boot.includes("PanelUI-menu-button") &&
  boot.includes("#toolbarButtonFromEvent")
) {
  ok("bootstrap resolves App Menu vs toolbar anchors correctly");
} else {
  fail("bootstrap App Menu/toolbar anchor resolution incomplete");
}

// —— 2. Open path: shell BEFORE manager ————————————————————————————————————————
const openBody = slice(boot, "async open(", "#kickManagerAfterShellOpen(options)");
if (
  openBody.includes("#openShell(") &&
  !openBody.includes("#requestManager")
) {
  ok("open() opens the shell and never requests the manager inline");
} else {
  fail("open() requests the manager before the shell is proven open");
}

// #openShell must call openPopup and never import the manager itself.
const openShellBody = slice(boot, "#openShell(options = {})", "#scheduleOpenPostcondition() {");
if (
  openShellBody.includes("panel.openPopup(") &&
  !openShellBody.includes("#requestManager") &&
  !openShellBody.includes("importESModule")
) {
  ok("#openShell only opens the popup (no manager import)");
} else {
  fail("#openShell imports/kicks the manager instead of just opening the shell");
}

// —— 3. Manager kicked only AFTER popupshown ———————————————————————————————————
const shownBody = slice(
  boot,
  "this.#boundPopupShown = () => {",
  "this.#boundPopupHidden"
);
if (
  shownBody.includes("#kickManagerAfterShellOpen") &&
  boot.includes("#kickManagerAfterShellOpen(this.#pendingManagerOptions)")
) {
  ok("manager is kicked from the popupshown handler (after the shell opens)");
} else {
  fail("manager is not gated behind popupshown");
}

// #kickManagerAfterShellOpen requests the (self-deduping) lazy manager once.
const kickBody = slice(
  boot,
  "#kickManagerAfterShellOpen(options) {",
  "#openShell(options = {})"
);
if (
  kickBody.includes("this.#requestManager()") &&
  (kickBody.includes("onShellOpened") || kickBody.includes("refresh"))
) {
  ok("#kickManagerAfterShellOpen requests the manager once after shell open");
} else {
  fail("#kickManagerAfterShellOpen does not request the manager post-shell");
}

// The importer is self-deduping so repeated popupshown events cannot double-load.
const reqBody = slice(boot, "#requestManager() {", "async toggle(");
if (
  /this\.#manager\s*\|\|\s*this\.#managerImportPromise/.test(reqBody) &&
  reqBody.includes("importESModule") &&
  reqBody.includes("global: \"current\"")
) {
  ok("#requestManager is self-deduping (single lazy import, current global)");
} else {
  fail("#requestManager is not self-deduping / wrong import options");
}

// —— 4. Fallback-first: static fallback shell present and initially visible ————
if (
  popups.includes('id="PanelUI-astra-suraksha-fallback"') &&
  /astra-suraksha-mode="fallback"/.test(popups)
) {
  ok("Suraksha panel ships a static fallback shell, mode defaults to fallback");
} else {
  fail("Suraksha static fallback shell / default fallback mode missing");
}

// Emergency label= text survives even if Fluent fails to load.
const fallbackBlock = slice(
  popups,
  'id="PanelUI-astra-suraksha-fallback"',
  'id="PanelUI-astra-suraksha-advanced"'
);
if (
  fallbackBlock.includes('data-suraksha-action="protections-panel"') &&
  fallbackBlock.includes('label="Open Firefox protection panel"')
) {
  ok("fallback exposes emergency actions with static labels");
} else {
  fail("fallback emergency action labels missing");
}

// #applyMode keeps the fallback visible until advanced is genuinely ready.
const applyModeBody = slice(boot, "#applyMode() {", "#ensureUnload() {");
if (
  applyModeBody.includes('this.#advancedReady ? "advanced" : "fallback"') &&
  /fallback\.hidden\s*=\s*mode === "advanced"/.test(applyModeBody) &&
  /advanced\.hidden\s*=\s*mode !== "advanced"/.test(applyModeBody)
) {
  ok("#applyMode keeps fallback visible until advanced is ready");
} else {
  fail("#applyMode fallback/advanced visibility gating incomplete");
}

// setAdvancedReady only flips to advanced when a manager is actually attached.
if (
  /setAdvancedReady\(ready\)\s*{[\s\S]*?this\.#advancedReady\s*=\s*!!ready\s*&&\s*!!this\.#manager/.test(
    boot
  )
) {
  ok("setAdvancedReady requires an attached manager (no premature advanced flip)");
} else {
  fail("setAdvancedReady may flip to advanced without a manager");
}

// —— 5. Close / reopen transition + retry state cleared ————————————————————————
if (
  /this\.#boundPopupShown = \(\) => {\s*this\.#popupTransition = false;\s*this\.#openRetried = false;/.test(
    boot
  ) &&
  /this\.#boundPopupHidden = \(\) => {\s*this\.#popupTransition = false;\s*this\.#openRetried = false;/.test(
    boot
  )
) {
  ok("popupshown/popuphidden clear popupTransition + openRetried (clean reopen)");
} else {
  fail("popupshown/popuphidden do not clear transition/retry state");
}

// destroy() must also clear the transition so a torn-down window cannot wedge.
const destroyBody = slice(boot, "destroy() {", "attachManager(");
if (
  /this\.#popupTransition = false/.test(destroyBody) &&
  /this\.#openRetried = false/.test(destroyBody)
) {
  ok("destroy() clears popupTransition + openRetried");
} else {
  fail("destroy() does not clear transition/retry state");
}

// Bounded one-shot open postcondition retries once via a proven navbar anchor.
if (
  boot.includes("#scheduleOpenPostcondition") &&
  boot.includes("openPopup-retry") &&
  /nav-bar/.test(boot) &&
  boot.includes("#openRetried")
) {
  ok("bounded one-shot open postcondition retries via a navbar anchor");
} else {
  fail("open postcondition / one-shot retry missing");
}

// —— 6. Optional toolbar widget is a DIRECT toolbarbutton —————————————————————
if (
  !/<toolbaritem\s+id="astra-suraksha-button"/.test(cui) &&
  /<toolbarbutton\s+id="astra-suraksha-button"[\s\S]*?command="cmd_astraOpenSurakshaCenter"/.test(
    cui
  ) &&
  !cui.includes('id="astra-suraksha-toolbarbutton"')
) {
  ok("optional toolbar widget is a direct toolbarbutton id=astra-suraksha-button");
} else {
  fail("optional toolbar widget is not a direct toolbarbutton (nested/renamed)");
}

// —— 7. Command handler forwards the REAL event ————————————————————————————————
if (
  /case "cmd_astraOpenSurakshaCenter"[\s\S]*?window\.gAstraSuraksha[\s\S]*?toggle\(\{\s*event/.test(
    sets
  )
) {
  ok("command handler forwards the real event into gAstraSuraksha.toggle");
} else {
  fail("command handler does not forward the real event");
}

// The facade exposes the expected entry surface used by the command + menus.
for (const method of ["open", "close", "toggle", "openFallbackAction"]) {
  if (boot.includes(`${method}:`)) {
    ok(`facade exposes ${method}`);
  } else {
    fail(`facade missing ${method}`);
  }
}

// —— Summary ——————————————————————————————————————————————————————————————————
console.log("");
if (errors.length) {
  console.error(`${errors.length} check(s) FAILED`);
  process.exit(1);
}
console.log("All Astra Suraksha entrypoint checks passed.");
process.exit(0);
