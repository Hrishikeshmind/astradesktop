#!/usr/bin/env node
/*
 * Source-level contract test for the Astra sidebar cleanup migration.
 *
 * Verifies the versioned, one-shot cleanup that repairs profiles which inherited
 * the affected Astra sidebar layout (App Hub + Suraksha default-placed in
 * zen-sidebar-top-buttons, content-driven ~289px width):
 *   - sidebar-top defaultPlacements are compact-mode only
 *   - migration removes App Hub + Suraksha from sidebar-top
 *   - one-time width reset to the upstream 186px (230px on macOS)
 *   - the version pref is recorded only AFTER a successful cleanup
 *   - valid user width persistence logic is preserved in ZenCustomizableUI
 *     (#isValidSidebarWidth accepts positive px; migration is one-shot via the
 *     version pref)
 *   - uBlock / extension widgets are never in the removal list
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

const cui = read("src/zen/common/sys/ZenCustomizableUI.sys.mjs");
const uim = read("src/zen/common/modules/ZenUIManager.mjs");

// —— 1. Default placements: compact-mode only ————————————————————————————————
const topDefaults = cui.match(
  /registerArea\(\s*"zen-sidebar-top-buttons"[\s\S]*?defaultPlacements:\s*\[([\s\S]*?)\]/
);
if (
  topDefaults &&
  topDefaults[1].includes("zen-toggle-compact-mode") &&
  !topDefaults[1].includes("zen-app-launcher-button") &&
  !topDefaults[1].includes("astra-suraksha-button")
) {
  ok("sidebar-top defaultPlacements are compact-mode only");
} else {
  fail("sidebar-top defaultPlacements are not compact-only");
}

// —— 2. Migration function exists and is versioned ————————————————————————————
const kCleanupPref = "astra.ui.sidebar-cleanup.version";
if (
  uim.includes("_migrateAstraSidebarCleanupIfNeeded") &&
  uim.includes(kCleanupPref)
) {
  ok("versioned cleanup migration present");
} else {
  fail("versioned cleanup migration missing");
}

// Isolate the migration function body for order-sensitive assertions.
const fnStart = uim.indexOf("_migrateAstraSidebarCleanupIfNeeded() {");
const fnBody = fnStart >= 0 ? uim.slice(fnStart, fnStart + 2400) : "";

// —— 3. One-shot guard: early return when version already satisfied ————————————
if (
  /getIntPref\(\s*kCleanupPref\s*,\s*0\s*\)\s*>=\s*kCleanupVersion/.test(fnBody) &&
  /return;/.test(
    fnBody.slice(
      0,
      fnBody.indexOf("removeWidgetFromArea") > 0
        ? fnBody.indexOf("removeWidgetFromArea")
        : fnBody.length
    )
  )
) {
  ok("migration is one-shot (returns early when version pref already recorded)");
} else {
  fail("migration one-shot version guard missing");
}

// —— 4. Removes App Hub + Suraksha from sidebar-top ————————————————————————————
const removeIdsMatch = fnBody.match(/removeIds\s*=\s*\[([\s\S]*?)\]/);
if (
  removeIdsMatch &&
  removeIdsMatch[1].includes("zen-app-launcher-button") &&
  removeIdsMatch[1].includes("astra-suraksha-button") &&
  fnBody.includes("CustomizableUI.removeWidgetFromArea") &&
  /getPlacementOfWidget/.test(fnBody)
) {
  ok("migration removes App Hub + Suraksha from sidebar-top (area-scoped)");
} else {
  fail("migration removal of App Hub/Suraksha incomplete");
}

// —— 5. Removal list never targets extension / uBlock ——————————————————————————
if (
  removeIdsMatch &&
  !/uBlock|ublock0|extension|webext/i.test(removeIdsMatch[1])
) {
  ok("cleanup removal list is Astra-only (no uBlock/extension widgets)");
} else {
  fail("cleanup removal list references uBlock/extension widgets");
}

// —— 6. One-time width reset to upstream default (186px / 230px macOS) ————————
if (
  fnBody.includes('"230px" : "186px"') &&
  /removeValue\(\s*uri,\s*"navigator-toolbox",\s*"width"\s*\)/.test(fnBody) &&
  /removeValue\(\s*uri,\s*"navigator-toolbox",\s*"style"\s*\)/.test(fnBody) &&
  /toolbox\.setAttribute\(\s*"width"/.test(fnBody)
) {
  ok("migration performs a one-time width reset to the upstream default");
} else {
  fail("migration one-time width reset missing/incorrect");
}

// —— 7. Version pref recorded only AFTER successful cleanup ————————————————————
const setPrefIdx = fnBody.indexOf(
  "setIntPref(kCleanupPref, kCleanupVersion)"
);
const removeIdx = fnBody.indexOf("removeWidgetFromArea");
const widthIdx = fnBody.indexOf('setAttribute("width"');
if (
  setPrefIdx > 0 &&
  removeIdx > 0 &&
  widthIdx > 0 &&
  setPrefIdx > removeIdx &&
  setPrefIdx > widthIdx
) {
  ok("version pref recorded only after removal + width reset succeed");
} else {
  fail("version pref not recorded strictly after successful cleanup");
}

// Early failure paths must return WITHOUT recording the version pref, so a later
// run can retry the cleanup.
if (
  /catch[\s\S]{0,120}return;/.test(fnBody) &&
  setPrefIdx > fnBody.indexOf("return;")
) {
  ok("cleanup bails out (no version bump) when a step fails");
} else {
  fail("cleanup may record version even when a step failed");
}

// —— 8. Valid user width persistence preserved in ZenCustomizableUI ————————————
if (
  cui.includes("#isValidSidebarWidth") &&
  /\^\\d\+\(\?:\\\.\\d\+\)\?px\$/.test(cui) &&
  cui.includes("px > 0") &&
  cui.includes("#clearPersistedSidebarWidth")
) {
  ok("valid positive-px user widths are preserved (#isValidSidebarWidth)");
} else {
  fail("#isValidSidebarWidth valid-width persistence logic missing");
}

// The native splitter must remain the sole resize owner (no second drag system).
if (
  cui.includes('createXULElement("splitter")') &&
  cui.includes('"zen-sidebar-splitter"') &&
  !/addEventListener\("mousemove"/.test(cui)
) {
  ok("native splitter is the sole resize owner (no custom drag system)");
} else {
  fail("sidebar splitter ownership missing or a second drag system exists");
}

// —— Summary ——————————————————————————————————————————————————————————————————
console.log("");
if (errors.length) {
  console.error(`${errors.length} check(s) FAILED`);
  process.exit(1);
}
console.log("All Astra sidebar cleanup checks passed.");
process.exit(0);
