# Astra Native Capability Packaging Audit

> **Audit-only.** No manifests, JARs, or build files modified. Baseline
> `feature/astra-migration-profiles` @ `1d27263`.
>
> **Golden rule of this document:** `SOURCE PRESENT` ≠ `PACKAGED` ≠ `RUNTIME REACHABLE` ≠
> `RUNTIME TESTED`. A capability is only claimable when it reaches the last state on a real
> installer build.

## The four states

| State | Meaning | Evidence used here |
|---|---|---|
| **SOURCE PRESENT** | Code exists in the tree | file paths under `engine/` or `src/` |
| **PACKAGED** | Registered into the build | `moz.build`, `jar.mn`/`jar.inc.mn`, `components.conf`, `.manifest` entries |
| **RUNTIME REACHABLE** | Enabled by default prefs/build on target OS | pref defaults + build flags, *assuming a complete build* |
| **RUNTIME TESTED** | Verified working on an installed Astra build | **none yet — see build status** |

## Local build status (Windows) — why nothing is RUNTIME TESTED

`engine/obj-x86_64-pc-windows-msvc/dist/bin`:
- **Present:** `zen.exe`, `updater.exe`, `signmar.exe`, `screenshot.exe`, `nss3.dll`,
  `mozglue.dll`, unpacked `browser/chrome/` incl. `chrome/devtools`, `gmp-clearkey`,
  `gmp-fake`, `wmfclearkey.dll`.
- **Absent:** `omni.ja` / `browser.omni.ja` (packed chrome), `xul.dll`, `application.ini`,
  `dependentlibs.list`, `crashreporter.exe`, main launcher (`firefox.exe`/`astra.exe`).
- **config.status:** `MOZ_DEVTOOLS=all`, `MOZ_CRASHREPORTER=1` (compile) but crash reporter
  **not shipped**, `MOZ_WMF=1`, `MOZ_WMF_CDM=1`, `MOZ_WMF_MEDIA_ENGINE=1`.

**Conclusion:** partial/dev object tree, not a completed packaged browser. All rows below top
out at **PACKAGED** or **RUNTIME REACHABLE (assumed)**; **RUNTIME TESTED must be produced by
Batch 0** on a full installer build.

---

## Packaging matrix

Legend for OS columns: ✅ supported · ➖ present but unverified here · ❓ needs check ·
n/a not applicable.

| Capability | Source | Manifest/JAR entry | L10n strings | Icons/assets | Feature-gate reachable | Win | Linux/macOS | Optional binary/CDM | Runtime download | Licensing/external | Updater impact | State |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PDF.js | `toolkit/components/pdfjs` | `pdfjs.jar` + `components.conf` | ✅ | viewer assets | pref-gated | ✅ | ➖ | none | none | none | none | PACKAGED |
| Reader + Narrate | `toolkit/components/reader`,`/narrate` | `toolkit.jar`; `EXTRA_JS_MODULES.narrate` | ✅ | — | `!ANDROID` | ✅ | ➖ | OS TTS voices | none | none | none | PACKAGED |
| Translations | `toolkit/components/translations` | `toolkit.jar`; actors `FINAL_TARGET_FILES` | ✅ | Bergamot WASM | release-gated | ✅ | ➖ | none | **models via Remote Settings** | Mozilla RS host | none | PACKAGED + runtime models |
| Screenshots | `browser/components/screenshots` | `browser.jar` | ✅ | overlay | pref-gated | ✅ | ➖ | `screenshot.exe` present | none | none | none | PACKAGED |
| Downloads | `browser/components/downloads` + `src/zen/downloads` | `browser.jar` + `jar.inc.mn` | ✅ | anim assets | on | ✅ | ➖ | none | Safe Browsing lists | Google SB | none | PACKAGED |
| Bookmarks/Places | `browser/components/places` | `places/jar.mn`,`sidebar/jar.mn` | ✅ | — | on | ✅ | ➖ | none | none | none | none | PACKAGED |
| Tab search | `browser/components/urlbar` | chrome (no sep jar) | ✅ | — | on | ✅ | ➖ | none | none | none | none | PACKAGED |
| PiP | `toolkit/components/pictureinpicture` | `toolkit.jar` | ✅ | player | on | ✅ | ➖ | none | none | none | none | PACKAGED |
| WebRTC perms | `dom/media/webrtc`,`browser/actors` | compiled + actors | ✅ | — | on | ✅ | ➖ | none | none | none | none | PACKAGED |
| Spellcheck | `extensions/spellcheck`,`locales/*/hunspell` | `spellcheck/moz.build` | ✅ (per locale) | dictionaries | `!android` | ✅ | ➖ | none | none | none | none | PACKAGED (verify hi dict) |
| Containers | `toolkit/components/contextualidentity` | `EXTRA_JS_MODULES` | ✅ | — | pref-on (Astra) | ✅ | ➖ | none | none | none | none | PACKAGED |
| DevTools | `devtools/{client,server,shared,startup}` | `devtools.jar`; `MOZ_DEVTOOLS=all` | ✅ | icons | build+pref | ✅ (unpacked in obj) | ➖ | none | none | none | none | PACKAGED |
| Browser Toolbox / remote | `devtools/.../browser-toolbox`,`remote/` | `devtools.jar`,`remote/moz.build` | ✅ | — | off-by-default | ✅ | ➖ | none | none | none | none | PACKAGED (off) |
| EnterprisePolicies | `browser/components/enterprisepolicies` | `enterprisepolicies/jar.mn` | ✅ | — | needs `policies.json` | ✅ | ➖ | none | none | none | none | PACKAGED; **no bundled policy file** |
| ADMX templates | — | **absent** | n/a | n/a | Windows | ❓ | n/a | n/a | external repo | Mozilla templates | none | **NOT PACKAGED** |
| autoconfig (MCD) | `extensions/pref/autoconfig` | `moz.build` | n/a | — | needs cfg | ✅ | ➖ | none | none | none | none | PACKAGED (dormant) |
| Enterprise roots / certs | `security/manager/ssl` | compiled | ✅ | — | pref-on | ✅ | ➖ | none | OS cert store | none | none | PACKAGED |
| Update service | `toolkit/mozapps/update` | `updater.exe`,`signmar.exe` present | ✅ | — | on | ✅ | ➖ | MAR | AUS host `updates.astra-browser.app` | none | **core** | PACKAGED (**unverified updates**) |
| Crash reporter | `toolkit/crashreporter` | **commented out in package manifest** | — | — | `--disable-crashreporter` (release) | ❌ | ❌ | binary absent | none | none | none | **SOURCE ONLY / NOT SHIPPED** |
| Telemetry | `toolkit/components/telemetry` | compiled | — | — | disabled+locked | n/a | n/a | none | none | none | none | PACKAGED but **runtime off** |
| Widevine/EME | `dom/media/eme`,`gmp`,`GMPProvider` | `--enable-eme=widevine,wmfcdm` | ✅ | — | pref-on | ✅ | ➖ | **Widevine CDM downloaded at runtime** | Google | **proprietary/licensed** | none | PACKAGED + runtime CDM |
| HW decode/codecs | `dom/media/platforms` | `MOZ_WMF`,`MOZ_FFMPEG` | n/a | — | pref-on | ✅ | ➖ | OpenH264 GMP (runtime) | Cisco OpenH264 | OpenH264 license | none | PACKAGED |
| Media Session / global controls | `dom/media/mediacontrol` + `src/zen/media` | compiled + Zen overlay | ✅ | — | `zen.mediacontrols=false` | ✅ | ➖ | none | none | none | none | PACKAGED; UI **off** |
| Casting | — | — | — | — | — | ❌ | ❌ | — | — | — | — | **NOT PRESENT** |

---

## Astra/Zen custom feature packaging

All Astra/Zen chrome ships via `src/zen/**/jar.inc.mn` into `chrome://browser/content/zen-components/`
and `chrome://browser/content/zen-styles/` (see `src/zen/common/jar.inc.mn`). Verified entries:

| Feature | Modules (packaged) | Icons/CSS packaged | L10n | Load timing | Fallback | State |
|---|---|---|---|---|---|---|
| App Hub | `AstraAppHub{Bootstrap,Manager,State,Icons,Catalog}.mjs` | 40+ app SVGs + `astra-app-hub.css` | `zen-locales.inc.xhtml` | bootstrap eager, manager+catalog lazy | **static fallback panel** (`popups.inc` `app-hub-mode="fallback"`) | PACKAGED |
| Suraksha | `AstraSuraksha*` (Manager/Bootstrap + 8 adapters) | `astra-suraksha.css`, icons | ✅ | bootstrap eager (try/catch), manager lazy | non-fatal on failure | PACKAGED |
| Migration Center | `AstraMigration{Bootstrap,Center}.mjs` | `astra-migration.css` | ✅ | bootstrap eager (try/catch), center lazy | wraps native wizard | PACKAGED |
| Transparent Mode | `AstraTransparencyManager.mjs` | `astra-transparent-mode.css` | — | preloaded | per-window compute | PACKAGED |
| RAM Saver | in `ZenStartup.mjs` | — (sidebar notification) | `zen-general.ftl` | post-init | pref-gated | PACKAGED |
| Phase1 actions (ReadAloud/TabSearch) | `AstraPhase1Actions.mjs` | — | ✅ | on demand | wraps native | PACKAGED |
| Spaces/Workspaces | `src/zen/spaces/*` | space-peek CSS, gradients | ✅ | preloaded | — | PACKAGED |
| Glance/SplitView/Folders/Compact | `src/zen/{glance,split-view,folders,compact-mode}` | per-feature CSS | ✅ | per-window assets | — | PACKAGED |
| Welcome/onboarding | `src/zen/welcome/ZenWelcome.mjs` | welcome CSS | ✅ | lazy `loadSubScript` | resets `seen` on fail | PACKAGED |

**Startup-safety note (rule 16–18 upheld):** `ZenPreloadedScripts.js` loads App Hub, Migration,
and Suraksha **bootstraps** eagerly but wraps Migration/Suraksha in try/catch and lazy-loads the
heavy managers/catalog. App Hub ships a **static fallback panel**. Welcome uses lazy subscript and
self-heals. This matches "optional features must not block `browser.xhtml` startup" and "important
panels require static fallback."

---

## Packaging GAPS (actionable, no changes this pass)

1. **Crash reporter not shipped** — `crashreporter.exe` absent + disabled in release mozconfig +
   commented out in `package-manifest-in.patch`. For GOV/CORP "supportability" this means **no
   local crash diagnostics**. Decide: ship a *local-only* (non-uploading) crash reporter, or
   document that crash handling relies on OS + `about:crashes` being empty.
2. **No bundled `policies.json` / distribution dir** in `configs/` — EnterprisePolicies engine is
   packaged but ships with no sample policy. CORP/GOV deployment needs a documented
   `distribution/policies.json` template (Batch 4).
3. **No ADMX/ADML templates** in the tree — Windows GPO parsing works but admins have no Astra
   templates. Ship Astra-branded ADMX (Batch 4).
4. **`ZenWorkspacesEngine` not in overlay** — `services.sync.engine.workspaces=true` references an
   engine impl not present under `src/`. Confirm it exists in the engine checkout at build, else
   the sync engine pref is dangling.
5. **`zen.sidebar.enabled` / `.extensions.enabled`** — prefs with no runtime consumer; either dead
   or unshipped feature.
6. **Indian-language dictionaries** — verify a Hindi (and other Indian-language) Hunspell
   dictionary is actually packaged, not just `hi-IN` in `accept_languages`.
7. **Widevine CDM + OpenH264** are **runtime downloads from Google/Cisco** — offline/GOV builds
   will not have them without network. Document offline behavior; do not claim DRM works offline.
8. **Translation models** are runtime downloads from Mozilla Remote Settings — same offline caveat
   for GOV; the on-device engine is packaged but the language pairs are not.
9. **JXL (`image.jxl.enabled=true`)** — verify the build compiled JXL support, else pref is a no-op.

---

## What Batch 0 must convert from PACKAGED → RUNTIME TESTED
Produce a full installer build and verify, per OS, that each PACKAGED row actually loads and
functions (see `astra-native-capability-build-trains.md` Batch 0 test matrix and
`Installer runtime matrix` in the final report).
