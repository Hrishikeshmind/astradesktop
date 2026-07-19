#!/usr/bin/env node
/*
 * Source-level validation for Astra App Hub V3 (one shell / one controller).
 *
 * Asserts the single-shell rewrite invariants:
 *   - bootstrap lazy-imports the manager and idle-prewarms it
 *   - the static fallback catalog is gone from popups.inc
 *   - no normal-state "basic apps are ready" notice; fatal-only banner instead
 *   - catalog schema references + 44 packaged icons (module map + jar)
 *   - favorites toggle wiring with accessible star
 *   - sanitized diagnostics fields
 *   - createElementNS <img> with load/error-before-src + complete/naturalWidth
 *     reconcile
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

const REL = {
  bootstrap: "src/zen/common/modules/AstraAppHubBootstrap.mjs",
  manager: "src/zen/common/modules/AstraAppHubManager.mjs",
  icons: "src/zen/common/modules/AstraAppHubIcons.mjs",
  catalog: "src/zen/common/app-hub/AstraAppHubCatalog.mjs",
  popups: "src/browser/base/content/zen-panels/popups.inc",
  ftl: "locales/en-US/browser/browser/zen-app-hub.ftl",
  css: "src/zen/common/styles/astra-app-hub.css",
  jar: "src/zen/common/jar.inc.mn",
};

const bootstrap = read(REL.bootstrap);
const manager = read(REL.manager);
const icons = read(REL.icons);
const catalog = read(REL.catalog);
const popups = read(REL.popups);
const ftl = read(REL.ftl);
const css = read(REL.css);
const jar = read(REL.jar);

const NORMAL_NOTICE = "Advanced App Hub is unavailable. Basic apps are ready.";
const FATAL_MSG = "App Hub could not finish loading.";
const MANAGER_URL =
  "chrome://browser/content/zen-components/AstraAppHubManager.mjs";
const FALLBACK_ID = "PanelUI-zen-app-launcher-fallback";

// —— 1. Bootstrap: manager import path + idle prewarm ——————————————————————
if (bootstrap.includes(MANAGER_URL) && bootstrap.includes("importESModule")) {
  ok("bootstrap lazy-imports the manager module by chrome URL");
} else {
  fail("bootstrap missing manager import path / importESModule");
}

if (
  /idleDispatchToMainThread/.test(bootstrap) ||
  /requestIdleCallback/.test(bootstrap)
) {
  ok("bootstrap schedules idle prewarm (idleDispatchToMainThread/requestIdleCallback)");
} else {
  fail("bootstrap has no idle prewarm dispatch");
}

if (
  /idleDispatchToMainThread/.test(bootstrap) &&
  /requestIdleCallback/.test(bootstrap)
) {
  ok("bootstrap has idleDispatch with requestIdleCallback fallback");
} else {
  fail("bootstrap should use idleDispatchToMainThread OR requestIdleCallback fallback");
}

if (/#schedulePrewarm|#dispatchIdlePrewarm|prewarm/.test(bootstrap)) {
  ok("bootstrap has an explicit prewarm path");
} else {
  fail("bootstrap prewarm path missing");
}

if (bootstrap.includes("delayedStartupFinished") || bootstrap.includes("browser-delayed-startup-finished")) {
  ok("bootstrap defers prewarm until delayed startup");
} else {
  fail("bootstrap should defer prewarm to delayed startup");
}

// —— 2. Bootstrap: stable facade + single shell (no fallback swap) —————————
const facadeKeys = ["open:", "close:", "toggle:", "openApp:"];
if (
  bootstrap.includes("window.gZenAppLauncher") &&
  facadeKeys.every(k => bootstrap.includes(k))
) {
  ok("bootstrap exposes stable gZenAppLauncher facade (open/close/toggle/openApp)");
} else {
  fail("bootstrap facade gZenAppLauncher incomplete");
}

if (
  bootstrap.includes("window.gAstraAppHubBootstrap") &&
  bootstrap.includes("window.gAstraAppHubDiagnostics")
) {
  ok("bootstrap exposes gAstraAppHubBootstrap + gAstraAppHubDiagnostics");
} else {
  fail("bootstrap globals missing");
}

if (!/#openFallback\b/.test(bootstrap)) {
  ok("bootstrap has no #openFallback path");
} else {
  fail("bootstrap still contains #openFallback (dual-mode leftover)");
}

if (!/app-hub-mode["']?\s*,\s*["'](fallback|advanced)/.test(bootstrap) && !bootstrap.includes('"advanced"')) {
  ok("bootstrap does not swap app-hub-mode fallback/advanced");
} else {
  fail("bootstrap still performs fallback/advanced mode swap");
}

// Container unhide on open (bootstrap fatal path or manager open path).
if (/container\.hidden\s*=\s*false/.test(bootstrap)) {
  ok("bootstrap unhides the single container");
} else {
  fail("bootstrap does not unhide the container");
}

// —— 3. Bootstrap: sanitized diagnostics fields —————————————————————————————
const diagFields = [
  "stage",
  "ready",
  "rendered",
  "iconSuccessCount",
  "iconFailureCount",
  "initDuration",
];
const missingDiag = diagFields.filter(f => !bootstrap.includes(f));
if (!missingDiag.length) {
  ok("bootstrap diagnostics expose stage/ready/rendered/icon counts/initDuration");
} else {
  fail(`bootstrap diagnostics missing fields: ${missingDiag.join(", ")}`);
}

// Diagnostics must stay sanitized: no URL/query/profile/history exposure.
if (/gAstraAppHubDiagnostics/.test(bootstrap) && !/\b(profileDir|selectedURI|searchQuery|historyList|tabTitles)\b/.test(bootstrap)) {
  ok("bootstrap diagnostics avoid URL/query/profile/history leakage");
} else {
  fail("bootstrap diagnostics may leak sensitive data");
}

// —— 4. Bootstrap: perf pref (timing only) ————————————————————————————————
if (bootstrap.includes("astra.diagnostics.performance")) {
  ok("bootstrap honors astra.diagnostics.performance pref");
} else {
  fail("bootstrap missing astra.diagnostics.performance pref support");
}

// —— 5. popups.inc: no static fallback markup ——————————————————————————————
if (!popups.includes(FALLBACK_ID)) {
  ok("popups.inc has no PanelUI-zen-app-launcher-fallback block");
} else {
  fail("popups.inc still contains the static fallback block");
}

if (
  popups.includes('id="PanelUI-zen-app-launcher-container"') &&
  popups.includes('id="PanelUI-zen-app-launcher-list"')
) {
  ok("popups.inc keeps the minimal single-shell container + list");
} else {
  fail("popups.inc single-shell container/list missing");
}

// —— 6. No normal-state notice; fatal-only banner ————————————————————————————
if (!manager.includes(NORMAL_NOTICE)) {
  ok("manager banner path drops the normal-state 'basic apps are ready' notice");
} else {
  fail("manager still contains the normal-state 'basic apps are ready' notice");
}

if (!ftl.includes(NORMAL_NOTICE)) {
  ok("ftl no longer contains the normal-state 'basic apps are ready' notice");
} else {
  fail("ftl still contains the normal-state 'basic apps are ready' notice");
}

if (manager.includes(FATAL_MSG) || ftl.includes(FATAL_MSG)) {
  ok("fatal-only banner message present and distinct");
} else {
  fail("fatal-only banner message missing");
}

if (
  manager.includes("#showFallbackFailureBanner") &&
  manager.includes("retry-catalog") &&
  ftl.includes("astra-app-hub-retry")
) {
  ok("fatal banner keeps a Retry action");
} else {
  fail("fatal Retry banner wiring missing");
}

// Banner must target the single container, not the removed fallback id.
{
  const idx = manager.indexOf("#showFallbackFailureBanner(show)");
  const body = idx >= 0 ? manager.slice(idx, idx + 1400) : "";
  if (body.includes("this.container") && !body.includes(FALLBACK_ID)) {
    ok("fatal banner renders into the single container (not fallback id)");
  } else {
    fail("fatal banner still references the removed fallback node");
  }
}

// handoff-from-fallback dependency neutralized (no lookup of the removed node).
{
  const idx = manager.indexOf("#handoffFocusFromHiddenFallback()");
  const body = idx >= 0 ? manager.slice(idx, idx + 400) : "";
  if (!body.includes(`getElementById(\n        "${FALLBACK_ID}"`) && !body.includes(`"${FALLBACK_ID}"`)) {
    ok("#handoffFocusFromHiddenFallback no longer depends on removed fallback node");
  } else {
    fail("#handoffFocusFromHiddenFallback still queries the removed fallback node");
  }
}

// —— 7. Catalog schema references —————————————————————————————————————————————
if (
  manager.includes("CATALOG_SCHEMA_VERSION") &&
  /schemaVersion/.test(manager) &&
  /schemaVersion:\s*1/.test(catalog)
) {
  ok("catalog schemaVersion validated by manager and declared by catalog");
} else {
  fail("catalog schema references missing");
}

// —— 8. 44 packaged icons: module map + jar packaging ————————————————————————
{
  const mapStart = icons.indexOf("ASTRA_APP_HUB_ICONS");
  const mapBody = mapStart >= 0 ? icons.slice(mapStart, icons.indexOf("});", mapStart)) : "";
  const iconCount = (mapBody.match(/\$\{ICON_BASE\}/g) || []).length;
  if (iconCount === 44) {
    ok("ASTRA_APP_HUB_ICONS declares exactly 44 packaged icons");
  } else {
    fail(`ASTRA_APP_HUB_ICONS has ${iconCount} icons (expected 44)`);
  }
}

{
  const jarIcons = (
    jar.match(/zen-components\/app-hub-icons\/[^\s]+\.svg/g) || []
  ).length;
  if (jarIcons === 44) {
    ok("jar packages exactly 44 app-hub-icons SVG files");
  } else {
    fail(`jar packages ${jarIcons} app-hub-icons SVGs (expected 44)`);
  }
}

// —— 9. Favorites toggle + accessible star ————————————————————————————————————
if (
  manager.includes('"toggle-favorite"') &&
  manager.includes("gAstraAppHubState.toggleFavorite")
) {
  ok("favorites toggle wiring present (toggle-favorite + state.toggleFavorite)");
} else {
  fail("favorites toggle wiring missing");
}

{
  const idx = manager.indexOf("astra-app-hub-fav-btn");
  const body = idx >= 0 ? manager.slice(idx - 200, idx + 800) : "";
  if (body.includes("aria-label") && body.includes("aria-pressed")) {
    ok("favorites star has aria-label + aria-pressed");
  } else {
    fail("favorites star missing accessible label / pressed state");
  }
}

// CSS reveals the star on hover AND keyboard focus.
if (
  /:hover .astra-app-hub-fav-btn/.test(css) &&
  /:focus-within .astra-app-hub-fav-btn/.test(css)
) {
  ok("favorites star revealed on hover and keyboard focus (CSS)");
} else {
  fail("favorites star hover/focus reveal CSS missing");
}

// —— 10. Single scrollbar + four-column grid (CSS) ————————————————————————————
if (/repeat\(4, minmax\(0, 1fr\)\)/.test(css)) {
  ok("grid uses a four-column layout");
} else {
  fail("four-column grid missing");
}

{
  const scrollRegions = (css.match(/overflow-y:\s*auto/g) || []).length;
  if (scrollRegions <= 1 && !css.includes(FALLBACK_ID)) {
    ok("single scroll region; no fallback-block CSS dependency");
  } else {
    fail(`multiple scroll regions (${scrollRegions}) or lingering fallback CSS`);
  }
}

// —— 11. Icon <img>: createElementNS + handlers-before-src + reconcile ————————
if (
  manager.includes('createElementNS(\n          "http://www.w3.org/1999/xhtml",\n          "img"\n        )') ||
  /createElementNS\(\s*"http:\/\/www\.w3\.org\/1999\/xhtml",\s*"img"\s*\)/s.test(manager)
) {
  ok("icons use createElementNS XHTML img");
} else {
  fail("icons not created via createElementNS XHTML img");
}

{
  // load/error listeners must be attached before src is assigned.
  const createBtn = manager.indexOf("#createAppButton(app, sectionOptions");
  const body = createBtn >= 0 ? manager.slice(createBtn, createBtn + 4000) : "";
  const loadIdx = body.search(/addEventListener\(\s*"load"/);
  const errIdx = body.search(/addEventListener\(\s*"error"/);
  const srcIdx = body.indexOf("image.src = safe");
  if (loadIdx >= 0 && errIdx >= 0 && srcIdx >= 0 && loadIdx < srcIdx && errIdx < srcIdx) {
    ok("createAppButton attaches load/error before setting src");
  } else {
    fail("createAppButton sets src before attaching load/error handlers");
  }
}

if (manager.includes("naturalWidth") && /image\.complete|!image\.complete|\.complete\b/.test(manager)) {
  ok("icon state reconciled via image.complete + naturalWidth");
} else {
  fail("icon complete/naturalWidth reconcile missing");
}

if (manager.includes("#reconcileIconState")) {
  ok("shared #reconcileIconState helper present");
} else {
  fail("#reconcileIconState helper missing");
}

// —— 12. Manager init single-flight + no double init hazard ————————————————————
if (manager.includes("#initPromise")) {
  ok("manager init has single-flight (#initPromise)");
} else {
  fail("manager init single-flight missing");
}

// —— Summary ——————————————————————————————————————————————————————————————————
console.log("");
if (errors.length) {
  console.error(`\n${errors.length} check(s) FAILED`);
  process.exit(1);
}
console.log("All Astra App Hub V3 checks passed.");
