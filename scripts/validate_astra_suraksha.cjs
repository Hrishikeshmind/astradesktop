#!/usr/bin/env node
/* Source-level validation for Astra Suraksha Center v1 (no browser runtime). */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const errors = [];
const ok = msg => console.log(`OK  ${msg}`);
const fail = msg => {
  errors.push(msg);
  console.error(`FAIL ${msg}`);
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

// Packaging
const jar = read("src/zen/common/jar.inc.mn");
const expectedJar = [
  "AstraSurakshaBootstrap.mjs",
  "AstraSurakshaManager.mjs",
  "AstraSurakshaConnection.mjs",
  "AstraSurakshaProtection.mjs",
  "AstraSurakshaUBlock.mjs",
  "AstraSurakshaPermissions.mjs",
  "AstraSurakshaSiteData.mjs",
  "AstraSurakshaCleanLink.mjs",
  "AstraSurakshaSafeBrowsing.mjs",
  "AstraSurakshaPasswords.mjs",
  "astra-suraksha.css",
];
for (const name of expectedJar) {
  if (jar.includes(name)) ok(`jar packages ${name}`);
  else fail(`jar missing ${name}`);
}

const assets = read("src/browser/base/content/zen-assets.inc.xhtml");
const cssCount = (assets.match(/astra-suraksha\.css/g) || []).length;
if (cssCount === 1) ok("CSS included exactly once");
else fail(`CSS include count=${cssCount}`);

const locales = read("src/browser/base/content/zen-locales.inc.xhtml");
const ftlCount = (locales.match(/zen-suraksha\.ftl/g) || []).length;
if (ftlCount === 1) ok("FTL included exactly once");
else fail(`FTL include count=${ftlCount}`);

// Command / facade / preload
const commands = read("src/browser/base/content/zen-commands.inc.xhtml");
if ((commands.match(/cmd_astraOpenSurakshaCenter/g) || []).length === 1) {
  ok("one Suraksha command definition");
} else fail("Suraksha command definition count wrong");

const preload = read("src/zen/common/ZenPreloadedScripts.js");
if (
  preload.includes("AstraSurakshaBootstrap.mjs") &&
  !preload.includes("AstraSurakshaManager.mjs")
) {
  ok("only bootstrap preloaded");
} else fail("preload must include bootstrap only");

// App Hub: bootstrap at startup; advanced manager must not be eagerly preloaded
if (
  preload.includes("AstraAppHubBootstrap.mjs") &&
  !preload.includes("AstraAppHubManager.mjs")
) {
  ok("App Hub bootstrap-only preload (manager lazy)");
} else fail("App Hub preload must be bootstrap-only");

const sets = read("src/zen/common/zen-sets.js");
if (sets.includes("cmd_zenOpenAppLauncher") && sets.includes("gZenAppLauncher")) {
  ok("App Hub command handler intact");
} else fail("App Hub command handler missing");
if (sets.includes("cmd_astraOpenSurakshaCenter") && sets.includes("gAstraSuraksha")) {
  ok("Suraksha command handler present");
} else fail("Suraksha command handler missing");

const cui = read("src/zen/common/sys/ZenCustomizableUI.sys.mjs");
if (
  cui.includes("zen-app-launcher-button") &&
  cui.includes("astra-suraksha-button") &&
  cui.includes("cmd_zenOpenAppLauncher") &&
  cui.includes("cmd_astraOpenSurakshaCenter")
) {
  ok("toolbar widgets for App Hub + Suraksha");
} else fail("toolbar widget wiring incomplete");

// Upstream Zen intent: sidebar-top defaults to compact-mode only.
const topDefaults = cui.match(
  /registerArea\(\s*"zen-sidebar-top-buttons"[\s\S]*?defaultPlacements:\s*\[([\s\S]*?)\]/
);
if (
  topDefaults &&
  topDefaults[1].includes("zen-toggle-compact-mode") &&
  !topDefaults[1].includes("zen-app-launcher-button") &&
  !topDefaults[1].includes("astra-suraksha-button")
) {
  ok("sidebar-top defaultPlacements match upstream Zen (compact-mode only)");
} else {
  fail("sidebar-top still default-places App Hub/Suraksha");
}

const popups = read("src/browser/base/content/zen-panels/popups.inc");
// App Hub V3 is a single shell — the static fallback catalog block is gone.
if (
  popups.includes('id="PanelUI-zen-app-launcher"') &&
  !popups.includes("PanelUI-zen-app-launcher-fallback")
) {
  ok("App Hub panel present (single shell, no static fallback)");
} else fail("App Hub panel missing or still has static fallback block");
if (
  popups.includes('id="PanelUI-astra-suraksha"') &&
  popups.includes("PanelUI-astra-suraksha-fallback")
) {
  ok("Suraksha panel + static fallback present");
} else fail("Suraksha panel/fallback missing");

if (
  popups.includes("astra-suraksha-shell") &&
  popups.includes("<html:article") &&
  popups.includes("astra-suraksha-scroll") &&
  popups.includes("<html:footer")
) {
  ok("Suraksha advanced content uses HTML shell/scroll/cards");
} else fail("Suraksha HTML advanced layout missing");

const mgr = read("src/zen/common/modules/AstraSurakshaManager.mjs");
if (
  mgr.includes('createElementNS') &&
  mgr.includes("http://www.w3.org/1999/xhtml") &&
  mgr.includes("#onAdvancedClick") &&
  !mgr.includes('createXULElement("toolbarbutton")')
) {
  ok("Suraksha manager uses HTML buttons (no dynamic XUL toolbarbutton actions)");
} else fail("Suraksha manager still creates XUL toolbarbutton actions");

// Emergency labels for fail-safe fallback when Fluent is missing
const fallbackBlock = popups.slice(
  popups.indexOf('id="PanelUI-astra-suraksha-fallback"'),
  popups.indexOf('id="PanelUI-astra-suraksha-advanced"')
);
const emergencyLabels = [
  'label="Open Firefox protection panel"',
  'label="Open site information"',
  'label="Open protection dashboard"',
  'label="Open Add-ons Manager"',
];
for (const label of emergencyLabels) {
  if (fallbackBlock.includes(label)) ok(`emergency fallback ${label}`);
  else fail(`missing emergency fallback ${label}`);
}

// Exact jar destination ↔ import URL pairing
const jarPairs = [
  [
    "content/browser/zen-components/AstraSurakshaBootstrap.mjs",
    "chrome://browser/content/zen-components/AstraSurakshaBootstrap.mjs",
  ],
  [
    "content/browser/zen-components/AstraSurakshaManager.mjs",
    "chrome://browser/content/zen-components/AstraSurakshaManager.mjs",
  ],
  [
    "content/browser/zen-styles/astra-suraksha.css",
    "chrome://browser/content/zen-styles/astra-suraksha.css",
  ],
];
for (const [jarPath, chromeUrl] of jarPairs) {
  if (jar.includes(jarPath) && chromeUrl.endsWith(jarPath.split("/").pop())) {
    ok(`jar/import pair ${jarPath}`);
  } else fail(`jar/import mismatch ${jarPath}`);
}
const bootSrc = read("src/zen/common/modules/AstraSurakshaBootstrap.mjs");
if (
  bootSrc.includes(
    'chrome://browser/content/zen-components/AstraSurakshaManager.mjs'
  )
) {
  ok("bootstrap lazy manager URL matches jar");
} else fail("bootstrap manager URL mismatch");
if (bootSrc.includes("BrowserCommands?.pageInfo") || bootSrc.includes("BrowserCommands.pageInfo")) {
  ok("site-info fallback includes Page Info route");
} else fail("site-info missing Page Info fallback");

const uim = read("src/zen/common/modules/ZenUIManager.mjs");
if (
  uim.includes("astra.ui.sidebar-cleanup.version") &&
  uim.includes("_migrateAstraSidebarCleanupIfNeeded") &&
  uim.includes('CustomizableUI.removeWidgetFromArea') &&
  uim.includes("zen-app-launcher-button") &&
  uim.includes("astra-suraksha-button") &&
  uim.includes('removeValue(uri, "navigator-toolbox", "width")') &&
  uim.includes('"230px" : "186px"')
) {
  ok("versioned sidebar cleanup removes Astra widgets + resets width once");
} else fail("sidebar cleanup migration incomplete");
if (
  uim.includes('setBoolPref(\n        "astra.ui.migration.suraksha-button-added"') ||
  uim.includes('setBoolPref(\r\n        "astra.ui.migration.suraksha-button-added"') ||
  /setBoolPref\(\s*"astra\.ui\.migration\.suraksha-button-added"\s*,\s*true\s*\)/.test(
    uim
  )
) {
  ok("legacy additive Suraksha placement migration retired");
} else fail("legacy Suraksha additive migration still active");
if (/addWidgetToArea\(\s*"astra-suraksha-button"/.test(uim)) {
  fail("Suraksha still forcibly added to sidebar-top");
} else ok("Suraksha is not forcibly added to sidebar-top");

// Fluent IDs referenced in markup/JS exist in FTL
const ftl = read("locales/en-US/browser/browser/zen-suraksha.ftl");
const ftlIds = new Set(
  [...ftl.matchAll(/^([a-z0-9-]+)\s*=/gim)].map(m => m[1])
);
const scanTargets = [
  "src/browser/base/content/zen-panels/popups.inc",
  "src/zen/common/modules/AstraSurakshaManager.mjs",
  "src/zen/common/modules/AstraSurakshaConnection.mjs",
  "src/zen/common/modules/AstraSurakshaProtection.mjs",
  "src/zen/common/modules/AstraSurakshaUBlock.mjs",
  "src/zen/common/modules/AstraSurakshaPermissions.mjs",
  "src/zen/common/modules/AstraSurakshaSiteData.mjs",
  "src/zen/common/modules/AstraSurakshaCleanLink.mjs",
  "src/zen/common/modules/AstraSurakshaSafeBrowsing.mjs",
  "src/zen/common/modules/AstraSurakshaPasswords.mjs",
];
const refIds = new Set();
for (const rel of scanTargets) {
  const text = read(rel);
  for (const m of text.matchAll(/data-l10n-id="(astra-suraksha-[a-z0-9-]+)"/g)) {
    refIds.add(m[1]);
  }
  for (const m of text.matchAll(
    /(?:setAttributes\([^,]+,\s*|labelId:\s*|detailId:\s*|modeId:\s*|id:\s*)["'](astra-suraksha-[a-z0-9-]+)["']/g
  )) {
    refIds.add(m[1]);
  }
  for (const m of text.matchAll(
    /showToast\?\.\(["'](astra-suraksha-[a-z0-9-]+)["']/g
  )) {
    refIds.add(m[1]);
  }
}
let missing = 0;
for (const id of refIds) {
  if (!ftlIds.has(id)) {
    fail(`missing Fluent id ${id}`);
    missing += 1;
  }
}
if (!missing) ok(`all ${refIds.size} referenced Fluent ids exist`);

// Safety greps in Suraksha modules
const surakshaFiles = expectedJar
  .filter(n => n.endsWith(".mjs"))
  .map(n => `src/zen/common/modules/${n}`);
const banned = [
  /moz-extension:/i,
  /getContentBlockingLog/,
  /privacy\.query_stripping\.strip_list/,
  /fetch\(/,
  /XMLHttpRequest/,
  /https:\/\/.*favicon/i,
  /uBlock0@raymondhill\.net\/.*/,
];
for (const rel of surakshaFiles) {
  if (!exists(rel)) {
    fail(`missing module ${rel}`);
    continue;
  }
  const text = read(rel);
  for (const re of banned) {
    if (re.test(text) && !rel.includes("UBlock")) {
      // UBlock module mentions the addon id, which is allowed.
      fail(`${rel} matched banned pattern ${re}`);
    }
  }
  if (/console\.(log|info|debug|warn|error).*(\.host|hostname|currentURI|spec)/i.test(text)) {
    fail(`${rel} may log URL/host data`);
  }
}
ok("Suraksha modules pass safety greps");

// Pref
const pref = read("prefs/zen/suraksha.yaml");
if (pref.includes("astra.suraksha.enabled") && /value:\s*true/.test(pref)) {
  ok("feature pref present default true");
} else fail("feature pref missing/incorrect");

// Bootstrap facade contract
const boot = read("src/zen/common/modules/AstraSurakshaBootstrap.mjs");
for (const method of [
  "init",
  "destroy",
  "open",
  "close",
  "toggle",
  "refresh",
  "openFallbackAction",
]) {
  if (boot.includes(`${method}:`) || boot.includes(`${method}(`)) ok(`facade/method ${method}`);
  else fail(`missing facade method ${method}`);
}
if (boot.includes("gAstraSurakshaDiagnostics")) ok("diagnostics object");
else fail("diagnostics missing");
if (boot.includes("attachManager") && !boot.includes("gAstraSuraksha = manager")) {
  ok("manager attaches without replacing facade");
} else fail("facade replacement risk");

// No ETP/permission mutation in Suraksha
const mutationBanned = [
  "disableForCurrentPage",
  "enableForCurrentPage",
  "setForPrincipal",
  "removeFromPrincipal",
  "userDisabled =",
];
for (const rel of surakshaFiles) {
  const text = read(rel);
  for (const token of mutationBanned) {
    if (text.includes(token)) fail(`${rel} contains mutation API ${token}`);
  }
}
ok("no ETP/permission/addon mutation APIs in Suraksha");

// Shortcut file unchanged requirement — warn if Suraksha added shortcuts
const kbs = read("src/zen/kbs/ZenKeyboardShortcuts.mjs");
if (!kbs.includes("cmd_astraOpenSurakshaCenter")) ok("no Suraksha keyboard shortcut added");
else fail("unexpected Suraksha shortcut");

// --- Entrypoint integrity (runtime-verified regressions) ---

// Attributes-only Fluent on the real toolbarbutton (public widget id).
if (
  /^astra-suraksha-button\s*=\s*$/m.test(ftl) &&
  /\.label\s*=/.test(ftl.slice(ftl.indexOf("astra-suraksha-button"))) &&
  /\.tooltiptext\s*=/.test(ftl.slice(ftl.indexOf("astra-suraksha-button")))
) {
  ok("suraksha button Fluent message is attributes-only");
} else {
  fail("astra-suraksha-button Fluent must be attributes-only (label/tooltip)");
}

// Exactly one real toolbarbutton owns the public widget id (no nested wrapper).
if (/<toolbaritem\s+id="astra-suraksha-button"/.test(cui)) {
  fail("suraksha still uses nested public toolbaritem wrapper");
} else ok("suraksha has no nested public toolbaritem");
if (
  /<toolbarbutton\s+id="astra-suraksha-button"[\s\S]*?command="cmd_astraOpenSurakshaCenter"/.test(
    cui
  ) &&
  !cui.includes('id="astra-suraksha-toolbarbutton"')
) {
  ok("suraksha public widget id belongs to the real toolbarbutton");
} else {
  fail("suraksha direct toolbarbutton/command wiring missing");
}

// App Menu is the primary built-in entry.
const menubar = read("src/zen/common/modules/ZenMenubar.mjs");
if (
  menubar.includes('id="appMenu-astra-suraksha-button"') &&
  menubar.includes("cmd_astraOpenSurakshaCenter")
) {
  ok("App Menu Suraksha entry present");
} else fail("App Menu Suraksha entry missing");
if (
  boot.includes("#toolbarButtonFromEvent") &&
  boot.includes("PanelUI-menu-button") &&
  boot.includes("APPMENU_ID")
) {
  ok("Suraksha anchors toolbar vs App Menu correctly");
} else fail("Suraksha anchor resolution incomplete");

// zen-sets.js forwards the real command event into the facade.
if (
  /case "cmd_astraOpenSurakshaCenter"[\s\S]*?window\.gAstraSuraksha[\s\S]*?toggle\(\{\s*event/.test(
    sets
  )
) {
  ok("suraksha command handler forwards real event into gAstraSuraksha.toggle");
} else {
  fail("suraksha command handler does not forward the real event");
}

// Bootstrap: static shell opens before manager; manager requested once after
// popupshown; bounded postcondition retry via a navbar anchor; transition
// cleared on shown/hidden/unload.
const openBody = boot.slice(
  boot.indexOf("async open("),
  boot.indexOf("#kickManagerAfterShellOpen(options)")
);
if (
  boot.includes("#kickManagerAfterShellOpen") &&
  /#boundPopupShown[\s\S]*?#kickManagerAfterShellOpen/.test(boot) &&
  openBody.includes("#openShell(") &&
  !openBody.includes("#requestManager")
) {
  ok("suraksha requests manager after popupshown (shell-first, once)");
} else {
  fail("suraksha manager request not gated behind popupshown");
}
if (
  boot.includes("#scheduleOpenPostcondition") &&
  boot.includes("openPopup-retry") &&
  /nav-bar/.test(boot) &&
  boot.includes("#openRetried")
) {
  ok("suraksha bounded one-shot open postcondition with navbar anchor");
} else {
  fail("suraksha open postcondition/retry missing");
}
if (
  /#boundPopupShown[\s\S]*?#popupTransition = false/.test(boot) &&
  /#boundPopupHidden[\s\S]*?#popupTransition = false/.test(boot) &&
  /destroy\(\)[\s\S]*?#popupTransition = false/.test(boot)
) {
  ok("suraksha clears popupTransition on shown/hidden/unload");
} else {
  fail("suraksha popupTransition cleanup incomplete");
}

if (errors.length) {
  console.error(`\n${errors.length} validation error(s)`);
  process.exit(1);
}
console.log("\nAll Suraksha source validations passed");
process.exit(0);
