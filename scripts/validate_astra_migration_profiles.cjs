#!/usr/bin/env node
/* Source validation for Astra Migration Center + local multi-profile. */
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

function validateBalancedXulTags(rel) {
  const text = read(rel);
  const stack = [];
  let i = 0;
  let line = 1;
  const advance = n => {
    for (let k = 0; k < n; k++) {
      if (text[i + k] === "\n") line++;
    }
    i += n;
  };
  while (i < text.length) {
    if (text[i] === "\n") {
      line++;
      i++;
      continue;
    }
    if (text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end < 0) {
        fail(`XUL unclosed comment in ${rel}:${line}`);
        return;
      }
      advance(end + 3 - i);
      continue;
    }
    if (text[i] !== "<") {
      i++;
      continue;
    }
    if (text[i + 1] === "!" || text[i + 1] === "?") {
      let j = i + 2;
      while (j < text.length && text[j] !== ">") {
        if (text[j] === "\n") line++;
        j++;
      }
      if (j >= text.length) {
        fail(`XUL truncated directive in ${rel}:${line}`);
        return;
      }
      advance(j + 1 - i);
      continue;
    }
    const close = text[i + 1] === "/";
    let j = i + (close ? 2 : 1);
    let name = "";
    while (j < text.length && /[A-Za-z0-9:_-]/.test(text[j])) {
      name += text[j++];
    }
    if (!name) {
      i++;
      continue;
    }
    let selfClosing = false;
    while (j < text.length && text[j] !== ">") {
      if (text[j] === "\n") line++;
      if (text[j] === "/" && text[j + 1] === ">") {
        selfClosing = true;
        j += 2;
        break;
      }
      if (text[j] === '"' || text[j] === "'") {
        const q = text[j++];
        while (j < text.length && text[j] !== q) {
          if (text[j] === "\n") line++;
          j++;
        }
        j++;
        continue;
      }
      j++;
    }
    if (j < text.length && text[j] === ">") j++;
    if (close) {
      if (!stack.length || stack[stack.length - 1].name !== name) {
        fail(
          `XUL unexpected </${name}> in ${rel}:${line} (expected ${
            stack.length ? stack[stack.length - 1].name : "none"
          })`
        );
        return;
      }
      stack.pop();
    } else if (!selfClosing) {
      stack.push({ name, line });
    }
    advance(j - i);
  }
  if (stack.length) {
    fail(
      `XUL unclosed <${stack[stack.length - 1].name}> in ${rel}:${
        stack[stack.length - 1].line
      }`
    );
    return;
  }
  ok(`balanced XUL tags ${rel}`);
}

const required = [
  "src/zen/common/modules/AstraMigrationBootstrap.mjs",
  "src/zen/common/modules/AstraMigrationCenter.mjs",
  "src/zen/common/styles/astra-migration.css",
  "locales/en-US/browser/browser/astra-migration.ftl",
  "scripts/validate_astra_migration_profiles.cjs",
  "scripts/test_astra_migration_profiles.cjs",
];
for (const rel of required) {
  if (exists(rel)) ok(`present ${rel}`);
  else fail(`missing ${rel}`);
}

const center = read("src/zen/common/modules/AstraMigrationCenter.mjs");
const boot = read("src/zen/common/modules/AstraMigrationBootstrap.mjs");
const jar = read("src/zen/common/jar.inc.mn");
const preload = read("src/zen/common/ZenPreloadedScripts.js");
const prefsBrowser = read("prefs/firefox/browser.yaml");
const ftl = read("locales/en-US/browser/browser/astra-migration.ftl");
const popups = read("src/browser/base/content/zen-panels/popups.inc");
const welcome = read("src/zen/welcome/ZenWelcome.mjs");
const zenSettings = read("src/browser/components/preferences/zen-settings.js");
const assets = read("src/browser/base/content/zen-assets.inc.xhtml");
const localesInc = read("src/browser/base/content/zen-locales.inc.xhtml");
const welcomeFtl = read("locales/en-US/browser/browser/zen-welcome.ftl");

if (
  center.includes("MigrationUtils") &&
  center.includes("showMigrationWizard") &&
  center.includes("getMigrator") &&
  !/Login Data|Cookies\.|Local State|OSCrypt|DPAPI|key4\.db/i.test(center) &&
  !/profiles\.ini/i.test(center) &&
  !/copy.*profile.*folder|nsIFile.*clone/i.test(center)
) {
  ok("MigrationUtils remains canonical; no DB/password/profile-dir copy");
} else {
  fail("Migration Center unsafe or incomplete");
}

// Astra must NOT maintain a second source/browser/profile/resource enumeration
// model — that is the native wizard's job and a parallel model can go stale and
// mis-pass a raw profile-id string to MigratorBase.getMigrateData.
if (
  !/export\s+async\s+function\s+listAvailableMigrators/.test(center) &&
  !/export\s+async\s+function\s+listSourceProfiles/.test(center) &&
  !/export\s+async\s+function\s+listAvailableResources/.test(center) &&
  !/getMigrateData\s*\(/.test(center) &&
  !/getSourceProfiles\s*\(/.test(center)
) {
  ok("no duplicated source/profile/resource enumeration model");
} else {
  fail("duplicated source/profile/resource model must be removed");
}

// SelectableProfileService must be reached through the canonical module URL,
// never assumed as a window or global object.
if (
  center.includes(
    "resource:///modules/profiles/SelectableProfileService.sys.mjs"
  ) &&
  /defineESModuleGetters\([\s\S]*?SelectableProfileService/.test(center) &&
  /lazy\.SelectableProfileService/.test(center) &&
  !/win\?\.SelectableProfileService|globalThis\.SelectableProfileService/.test(
    center
  )
) {
  ok("SelectableProfileService imported via module URL, not a global");
} else {
  fail("SelectableProfileService must be a lazy module import, not a global");
}

// Native create-and-launch (Option A): create without auto-launch, then launch
// a separate instance opening about:newprofile. No old-process import claim.
if (
  /createNewProfile\(\s*false\s*\)/.test(center) &&
  /launchInstance\(\s*profile\s*,\s*\[\s*"about:newprofile"\s*\]\s*\)/.test(
    center
  ) &&
  /importDeferred:\s*true/.test(center) &&
  /profileCreated:\s*true/.test(center) &&
  !/importStarted|importComplete|import(ing)?\s+started|alreadyImport/i.test(
    center
  )
) {
  ok("native create-and-launch sequence; import deferred, no old-process claim");
} else {
  fail("profile create/launch sequence or truthful state incomplete");
}

if (
  center.includes("filterNormalMigrators") &&
  center.includes("startupOnlyMigrator") &&
  /reason:\s*"startup-only"/.test(center)
) {
  ok("startup-only migrators excluded from normal UI");
} else {
  fail("startup-only exclusion incomplete");
}

if (
  /Native Migration Wizard|wizard owns/i.test(center) &&
  /destination/.test(center) &&
  !/#state\.migrators\s*=\s*await listAvailableMigrators/.test(center) &&
  !/skipSourceSelection:\s*true/.test(
    center.match(/confirmAndRun[\s\S]*?^}/m)?.[0] || ""
  )
) {
  ok("Astra panel defers source/resource selection to native wizard");
} else {
  fail("Astra panel still duplicates native wizard selection");
}

if (
  /opened:\s*true/.test(center) &&
  !/importedCount|bookmarkCount|passwordCount|everything imported/i.test(
    center
  )
) {
  ok("no fabricated result counts");
} else {
  fail("result fabrication risk");
}

if (
  !/listAvailableMigrators|getMigrateData|getSourceProfiles/.test(boot) &&
  preload.includes("AstraMigrationBootstrap.mjs") &&
  !preload.includes("AstraMigrationCenter.mjs")
) {
  ok("bootstrap performs no enumeration; center is lazy");
} else {
  fail("startup bootstrap budget regression");
}

if (
  boot.includes("private-window") &&
  center.includes("isPrivateMigrationBlocked") &&
  ftl.includes("astra-migration-private-blocked")
) {
  ok("private window migration blocked");
} else {
  fail("private window policy incomplete");
}

if (
  center.includes("canOfferSelectableProfiles") &&
  center.includes("selectableProfilesServiceEnabled") &&
  center.includes("isEnabled") &&
  ftl.includes("astra-migration-new-profile-handoff") &&
  /deferredToNewProfile/.test(center)
) {
  ok("selectable profile capability + Option A handoff");
} else {
  fail("profile capability/handoff incomplete");
}

{
  const profilesPref = prefsBrowser.match(
    /- name:\s*browser\.profiles\.enabled\s*\n(?:[^\n]*\n)*?\s*value:\s*(true|false)/
  );
  if (profilesPref && profilesPref[1] === "true") {
    ok("browser.profiles.enabled=true (unlocked)");
  } else {
    fail("browser.profiles.enabled is not true");
  }
  if (!/browser\.profiles\.enabled[\s\S]{0,80}locked:\s*true/.test(prefsBrowser)) {
    ok("browser.profiles.enabled is not locked");
  } else {
    fail("browser.profiles.enabled must not be locked");
  }
}

// Profile safety fixes present in engine SelectableProfileService
if (exists("engine/browser/components/profiles/SelectableProfileService.sys.mjs")) {
  const sps = read(
    "engine/browser/components/profiles/SelectableProfileService.sys.mjs"
  );
  if (
    sps.includes("ProfilesDatastoreService.storeID") &&
    sps.includes("migrateToProfilesCreatedPref") &&
    /groupToolkitProfile\.storeID\s*=\s*this\.storeID/.test(sps) &&
    /currentProfile[\s\S]{0,200}createProfile/.test(sps)
  ) {
    ok("engine profile storeID/currentProfile recovery present");
  } else {
    fail("engine profile safety recovery missing");
  }
} else {
  fail("SelectableProfileService.sys.mjs missing from engine");
}

if (
  jar.includes("AstraMigrationBootstrap.mjs") &&
  jar.includes("AstraMigrationCenter.mjs") &&
  jar.includes("astra-migration.css") &&
  !/\*\s+content\/browser\/zen-styles\/astra-migration\.css/.test(jar) &&
  assets.includes("astra-migration.css") &&
  localesInc.includes("astra-migration.ftl")
) {
  ok("packaging: modules/CSS/FTL mapped; CSS not preprocessed");
} else {
  fail("packaging/import mismatch");
}

if (
  popups.includes('id="PanelUI-astra-migration"') &&
  popups.includes("astra-migration-continue") &&
  ftl.includes("astra-migration-title") &&
  ftl.includes("astra-migration-privacy-note") &&
  welcome.includes("gAstraMigration") &&
  welcome.includes("openNativeWizard") &&
  welcome.includes("MigrationUtils.showMigrationWizard") &&
  zenSettings.includes("_initAstraMigrationEntry")
) {
  ok("UI markup, Fluent, welcome, preferences wired");
} else {
  fail("UI/entry wiring incomplete");
}

// The in-session welcome must NOT request startup migration. Passing
// isStartupMigration:true forces a blocking startup/refresh modal and
// misrepresents a non-existent nsIProfileStartup context.
if (!/isStartupMigration:\s*true/.test(welcome)) {
  ok("welcome does not request isStartupMigration:true");
} else {
  fail("welcome must not set isStartupMigration:true (normal in-session)");
}
if (/isStartupMigration:\s*false/.test(welcome)) {
  ok("welcome uses normal in-session migration (isStartupMigration:false)");
} else {
  fail("welcome should explicitly use isStartupMigration:false");
}

// Onboarding import copy must be browser-neutral (no hardcoded source browser).
if (
  !/zen-import-chrome\b/.test(welcome) &&
  /zen-import-browser\b/.test(welcome) &&
  !/zen-import-chrome\b/.test(welcomeFtl) &&
  /zen-import-browser\s*=/.test(welcomeFtl) &&
  /zen-import-browser-sub\s*=/.test(welcomeFtl)
) {
  ok("onboarding import copy is browser-neutral");
} else {
  fail("onboarding import copy must be browser-neutral");
}

{
  const sanitizeFn =
    center.match(
      /export function sanitizeMigrationLogDetail[\s\S]*?\n\}/
    )?.[0] || "";
  if (
    sanitizeFn.includes("migratorKey") &&
    !sanitizeFn.includes("sourceProfileId") &&
    !/password|https?:|path/i.test(sanitizeFn)
  ) {
    ok("log sanitizer omits profile ids/paths/secrets");
  } else {
    fail("log sanitizer incomplete");
  }
}

// No Sync/OAuth changes
const oauthHits = [
  "identity.fxaccounts.remote.root",
  "OAUTH_CLIENT_ID",
  "token.services.mozilla.com",
  "services.sync.engine",
];
const changedLikely = [center, boot, prefsBrowser].join("\n");
if (!oauthHits.some(h => changedLikely.includes(h))) {
  ok("no OAuth/Sync endpoint changes in migration modules/prefs");
} else {
  fail("unexpected Sync/OAuth content in migration changes");
}

if (
  jar.includes("AstraSurakshaBootstrap.mjs") &&
  preload.includes("AstraSurakshaBootstrap.mjs")
) {
  ok("Suraksha packaging untouched");
} else {
  fail("Suraksha packaging regression");
}

if (/#withFlight|#flight/.test(boot)) {
  ok("single-flight guard present");
} else {
  fail("missing single-flight guard");
}

validateBalancedXulTags("src/browser/base/content/zen-panels/popups.inc");
validateBalancedXulTags("src/browser/base/content/zen-assets.inc.xhtml");

const idCount = (popups.match(/id="PanelUI-astra-migration"/g) || []).length;
if (idCount === 1) ok("unique PanelUI-astra-migration id");
else fail(`PanelUI-astra-migration count=${idCount}`);

if (errors.length) {
  console.error(`\n${errors.length} failure(s)`);
  process.exit(1);
}
console.log("\nAll Astra migration/profiles source checks passed.");
process.exit(0);
