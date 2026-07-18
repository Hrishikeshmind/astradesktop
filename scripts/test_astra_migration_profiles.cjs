#!/usr/bin/env node
/* Pure helper tests for Astra migration / profiles (no browser runtime). */
"use strict";

const path = require("path");
const { pathToFileURL } = require("url");

async function main() {
  const modPath = pathToFileURL(
    path.resolve(__dirname, "../src/zen/common/modules/AstraMigrationCenter.mjs")
  ).href;

  // Production module imports chrome resources — load only pure exports via
  // dynamic import fails under Node. Mirror by reading + evaluating the pure
  // functions through a lightweight extract: import the source file after
  // stubbing ChromeUtils.
  globalThis.ChromeUtils = {
    defineESModuleGetters(target, getters) {
      for (const key of Object.keys(getters)) {
        Object.defineProperty(target, key, {
          get() {
            return {
              availableMigratorKeys: [],
              resourceTypes: {
                BOOKMARKS: 1,
                HISTORY: 2,
                PASSWORDS: 4,
                FORMDATA: 8,
                PAYMENT_METHODS: 16,
                COOKIES: 32,
                SESSION: 64,
                EXTENSIONS: 128,
                OTHERDATA: 256,
              },
              getMigrator: async () => null,
              showMigrationWizard: async () => {},
              MIGRATION_ENTRYPOINTS: { UNKNOWN: "unknown" },
            };
          },
          configurable: true,
        });
      }
    },
  };

  const {
    filterNormalMigrators,
    resourceTypesFromBitfield,
    isPrivateMigrationBlocked,
    canOfferSelectableProfiles,
    sanitizeMigrationLogDetail,
    RESOURCE_ENUM,
  } = await import(modPath);

  let failed = 0;
  const assert = (cond, msg) => {
    if (!cond) {
      failed += 1;
      console.error(`FAIL ${msg}`);
    } else {
      console.log(`OK  ${msg}`);
    }
  };

  // startup-only exclusion
  {
    const list = filterNormalMigrators([
      { key: "chrome", startupOnly: false },
      { key: "firefox", startupOnly: true },
      { key: "edge", startupOnly: false },
      { key: "internal-testing", startupOnly: false },
      null,
    ]);
    assert(
      list.every(m => m.key !== "firefox" && !m.startupOnly),
      "startup-only migrators excluded"
    );
    assert(
      list.every(m => m.key !== "internal-testing"),
      "internal-testing excluded"
    );
    assert(list.map(m => m.key).join(",") === "chrome,edge", "keeps chrome+edge");
  }

  // resource bitfield
  {
    const types = {
      BOOKMARKS: 1,
      HISTORY: 2,
      PASSWORDS: 4,
      COOKIES: 32,
      EXTENSIONS: 128,
    };
    const r = resourceTypesFromBitfield(1 | 2 | 32 | 512, types);
    assert(r.includes(RESOURCE_ENUM.BOOKMARKS), "bookmarks from bitfield");
    assert(r.includes(RESOURCE_ENUM.HISTORY), "history from bitfield");
    assert(r.includes(RESOURCE_ENUM.COOKIES), "cookies when present");
    assert(!r.includes(RESOURCE_ENUM.PASSWORDS), "passwords absent when unset");
    assert(!r.includes("unknown"), "unknown bits ignored");
    assert(resourceTypesFromBitfield(0, types).length === 0, "zero resources");
  }

  // private blocked
  {
    assert(isPrivateMigrationBlocked(true), "private blocked");
    assert(!isPrivateMigrationBlocked(false), "normal allowed");
  }

  // profile capability
  {
    assert(
      !canOfferSelectableProfiles({
        prefEnabled: true,
        serviceEnabled: false,
        isPrivate: false,
      }),
      "pref alone insufficient"
    );
    assert(
      !canOfferSelectableProfiles({
        prefEnabled: true,
        serviceEnabled: true,
        isPrivate: true,
      }),
      "private cannot create profiles"
    );
    assert(
      canOfferSelectableProfiles({
        prefEnabled: true,
        serviceEnabled: true,
        isPrivate: false,
      }),
      "pref+service enables create"
    );
  }

  // log sanitization
  {
    const clean = sanitizeMigrationLogDetail({
      migratorKey: "chrome",
      sourceProfileId: "C:\\Users\\secret\\Chrome",
      resources: ["bookmarks", "passwords"],
      errorCategory: "enumerate",
      password: "nope",
      url: "https://example.com",
    });
    assert(clean.migratorKey === "chrome", "keeps migrator key");
    assert(clean.sourceProfileId === undefined, "drops source profile id");
    assert(clean.password === undefined, "drops password");
    assert(clean.url === undefined, "drops url");
    assert(
      JSON.stringify(clean.resources) === '["bookmarks","passwords"]',
      "keeps resource enums"
    );
  }

  // bootstrap source must not enumerate at startup
  {
    const boot = require("fs").readFileSync(
      path.resolve(
        __dirname,
        "../src/zen/common/modules/AstraMigrationBootstrap.mjs"
      ),
      "utf8"
    );
    assert(
      !/listAvailableMigrators|getMigrateData|getSourceProfiles/.test(boot),
      "bootstrap performs no migrator enumeration"
    );
    assert(/#withFlight|#flight/.test(boot), "single-flight guard present");
    assert(/private-window/.test(boot), "private-window denial present");
  }

  // center must not fabricate result counts for UI
  {
    const center = require("fs").readFileSync(
      path.resolve(
        __dirname,
        "../src/zen/common/modules/AstraMigrationCenter.mjs"
      ),
      "utf8"
    );
    assert(
      /opened:\s*true/.test(center) &&
        !/importedCount|bookmarkCount|passwordCount/.test(center),
      "no fabricated import counts"
    );
    assert(
      /filterNormalMigrators/.test(center) &&
        /startupOnlyMigrator/.test(center),
      "startup-only exclusion in production helpers"
    );
    assert(
      /Native wizard owns/.test(center) ||
        /wizard owns/.test(center.toLowerCase()),
      "native wizard ownership documented in code"
    );
  }

  if (failed) {
    console.error(`\n${failed} pure migration test failure(s)`);
    process.exit(1);
  }
  console.log("\nAll pure Astra migration/profile tests passed.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
