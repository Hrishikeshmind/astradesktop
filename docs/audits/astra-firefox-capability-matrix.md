# Astra Firefox / Zen Capability Matrix

> **Audit-only document.** No runtime source, prefs, manifests, packaging, policies,
> workflows, installers, or generated files were modified to produce this map.
>
> **Baseline:** branch `feature/astra-migration-profiles` @ `1d27263983d4a1ee47e547c26ebaf9d4a8169038`
> **Base engine:** Firefox `149.0.2` (`engine/`), Zen overlay (`src/zen/`), Astra branding.
> **Work branch:** `audit/astra-firefox-capability-map`

## How to read this document

- **Source of truth** is the checked-out tree, not upstream docs. Every row cites a real
  module/path under `engine/` (Firefox), `src/` (Zen/Astra overlay), or `prefs/`.
- **Current Astra state** distinguishes *source present*, *packaged*, *runtime-reachable*,
  and *runtime-tested*. These are **not** equivalent (see
  `astra-native-capability-packaging.md`).
- The word **available** is deliberately avoided when only source code exists.

### Build-reachability caveat (applies to every row)

The local object directory `engine/obj-x86_64-pc-windows-msvc/dist/bin` is a **partial**
build: it contains `zen.exe`, `updater.exe`, `signmar.exe`, and an *unpacked* browser chrome
tree (including `chrome/devtools`), but **no `omni.ja`/`browser.omni.ja`, no `xul.dll`, no
`application.ini`, no shipped `crashreporter.exe`**. Therefore **nothing in this matrix is
"runtime-tested."** Capabilities that are wired into `moz.build`/`jar.mn` are marked
**packaged (registered)**; their real runtime behavior must be validated against a completed
installer build (Batch 0).

### Classification legend

`USE_NATIVE` · `EXPOSE_NATIVE` · `ENABLE_AFTER_TEST` · `ASTRA_UX_WRAPPER` · `INTEGRATE` ·
`DEFER` · `REJECT`

### Field key (the 23 attributes)

Each capability block lists: (1) name, (2) audiences, (3) native owner, (4) source modules,
(5) markup/command entrypoint, (6) prefs, (7) build/platform gates, (8) required packaged
resources, (9) current Astra state, (10) current user entrypoint, (11) private-window
behavior, (12) multi-window behavior, (13) persistence owner, (14) accessibility state,
(15) security/privacy implications, (16) dependencies, (17) known/likely conflicts,
(18) recommended action, (19) required source changes, (20) required runtime tests,
(21) marketing-claim status, (22) implementation risk, (23) suggested batch.

Audience codes: **STU** students · **DEV** developers · **CORP** corporate · **GOV**
government · **NORM** normal users · **ENT** entertainment/media.

---

## PART A — STUDENT CAPABILITIES

### A1. PDF.js viewer (view / annotate / forms / print)
1. PDF viewing, highlight/annotation editor, XFA forms, signature editor, print/save-as-PDF.
2. STU, NORM, CORP, GOV.
3. Toolkit (Firefox/Gecko).
4. `engine/toolkit/components/pdfjs/` (`pdfjs.sys.mjs`, `content/PdfStreamConverter.sys.mjs`, `content/web/viewer.*`, `content/build/pdf.mjs`).
5. Stream converter `@mozilla.org/streamconv;1?from=application/pdf`; viewer toolbar buttons; no Astra command.
6. Astra: `pdfjs.enableHighlightEditor=true`, `pdfjs.enableHighlightFloatingButton=true`, `pdfjs.enableScripting=false` (`prefs/firefox/pdf.yaml`). Native: `pdfjs.enableSignatureEditor`, `pdfjs.enableComment`, `pdfjs.enableXfa`.
7. `#ifdef ANDROID` selects the GeckoView viewer; desktop uses full viewer.
8. `pdfjs.jar` (registered), viewer HTML/CSS/JS, `PdfJsDefaultPrefs.js`.
9. **Packaged (registered); runtime-unverified.**
10. Open any `.pdf` inline → viewer toolbar (print, download, save, highlight, signature).
11. `PdfStreamConverter`/`PdfjsParent` use `PrivateBrowsingUtils`; works in PBM.
12. Per-tab viewer instance; no global singleton.
13. Annotations persist in-document only when saved; no profile store.
14. Native pdf.js toolbar is keyboard/ARIA-instrumented upstream.
15. `enableScripting=false` is a deliberate, defensible hardening (blocks embedded PDF JS).
16. Toolkit stream converter, download component.
17. None architectural; print styling touched by `src/browser/.../zen-panels/print.css`.
18. **USE_NATIVE** (+ **EXPOSE_NATIVE** for a "Student PDF" shortcut/menu label).
19. None for engine; optional shortcut wiring only.
20. Open/annotate/sign/print a PDF; save-as-PDF from a webpage; verify PBM.
21. Proven (native), once runtime-tested.
22. Low.
23. Batch 0 (verify) / Batch 1 (shortcut).

### A2. Reader Mode + Read-Aloud (narrate / TTS)
1. Distraction-free reading; text-to-speech listening.
2. STU, NORM, GOV (accessibility).
3. Toolkit.
4. `engine/toolkit/components/reader/` (`ReaderMode.sys.mjs`, `AboutReader.sys.mjs`), `engine/toolkit/components/narrate/` (`NarrateControls.sys.mjs`, `Narrator.sys.mjs`). Astra wrapper: `src/zen/common/modules/AstraPhase1Actions.mjs` (`openReaderForReadAloud`).
5. `View:ReaderView` command, `key_toggleReaderMode`; Astra `cmd_zenReadAloud` (`zen-commands.inc.xhtml:85`).
6. `narrate.enabled=true` (desktop), `reader.*`. No Astra override besides CSS.
7. `narrate.enabled` gated `#if !defined(ANDROID)`.
8. `toolkit.jar` reader assets; narrate modules (`EXTRA_JS_MODULES.narrate`).
9. **Packaged (registered); runtime-unverified.**
10. Reader icon in urlbar (native) / Astra Read-Aloud command → opens Reader + Listen.
11. No PBM block; works in private windows.
12. Per-tab.
13. None (transient).
14. Read-Aloud is itself an accessibility feature; Reader improves contrast/zoom.
15. TTS uses OS voices; no network. Safe.
16. OS speech synthesis voices.
17. `src/toolkit/themes/shared/aboutReader-css.patch` (styling only).
18. **USE_NATIVE** + **EXPOSE_NATIVE** (Astra already adds the shortcut) + **INTEGRATE** (Study Space).
19. None; the wrapper exists.
20. Toggle Reader; press Listen; verify voice list; verify Astra command.
21. Proven once tested.
22. Low.
23. Batch 1.

### A3. Page Translations + on-device models
1. Full-page and select-text translation with downloadable language models.
2. STU, NORM, GOV, CORP.
3. Toolkit (Bergamot on-device).
4. `engine/toolkit/components/translations/` (`TranslationsFeature.sys.mjs`, `content/translations-engine.*`, `bergamot-translator/`, `actors/`).
5. Translate affordance in urlbar; `about:translations`; Settings → Translations.
6. `browser.translations.enable=true`; Astra `intl.multilingual.downloadEnabled=true` (`prefs/firefox/multilingual.yaml`), `browser.translations.newSettingsUI.enable=true`.
7. `intl.multilingual.*` gated on release channel defines.
8. `toolkit.jar` WASM/JS engine, `actors` FINAL_TARGET_FILES; models via **Mozilla Remote Settings** at runtime.
9. **Packaged (registered); models are runtime-downloaded; runtime-unverified.**
10. Translate popup on foreign-language pages; select-text translate.
11. Standard permission/download flow in PBM.
12. Per-tab translation; model cache shared per profile.
13. Downloaded models cached in profile; managed by native settings.
14. Keyboard-accessible native popup.
15. **On-device** translation — comment in `multilingual.yaml` confirms no Astra/cloud translation. Strong privacy story; must not be rebranded.
16. Remote Settings, Bergamot WASM.
17. Do **not** build a second translator (architectural rule 8).
18. **USE_NATIVE** + **EXPOSE_NATIVE** + **INTEGRATE** (Indian-language emphasis).
19. None for engine.
20. Download a model (e.g. hi↔en); translate offline afterward; verify no network on repeat.
21. Beta-only for Indian-language quality until tested per language pair.
22. Low (models external — verify download host reachable).
23. Batch 0 / Batch 1.

### A4. Screenshots (visible + full-page)
1. Capture visible region or full page; copy/download.
2. STU, NORM, DEV.
3. Firefox (browser component).
4. `engine/browser/components/screenshots/` (`ScreenshotsUtils.sys.mjs`, `overlay/`).
5. `Browser:Screenshot`, `key_screenshot` (Ctrl+Shift+S), context menu; overlay `#visible-page`/`#full-page`.
6. `screenshots.browser.component.enabled=true`, `browser.screenshots.folderList=4`.
7. None significant.
8. `browser.jar` overlay content.
9. **Packaged (registered); runtime-unverified.**
10. Right-click → Take Screenshot; Ctrl+Shift+S.
11. Uses `Downloads.PRIVATE` vs `PUBLIC`; PBM-aware.
12. Per-window overlay.
13. Saved file → downloads dir; clipboard optional.
14. Overlay is keyboard-operable upstream.
15. Safe; local capture.
16. Downloads component.
17. `src/browser/components/screenshots/overlay/overlay-css.patch` (styling).
18. **USE_NATIVE** + **EXPOSE_NATIVE** (Student Tools).
19. None.
20. Capture visible + full-page; save + copy; verify PBM.
21. Proven once tested.
22. Low.
23. Batch 0 / Batch 1.

### A5. Downloads (panel + search)
1. Download manager, indicator, search/filter, safe-browsing checks.
2. All audiences.
3. Firefox (+ Zen download animation + Astra SMART Guard).
4. `engine/browser/components/downloads/`; `src/zen/downloads/` (`ZenDownloadAnimation.mjs`, `ZenSmartGuard.mjs`).
5. Downloads button/panel; `about:downloads`; Ctrl+J.
6. Astra: `browser.download.alwaysOpenPanel=false`, `zen.smart.downloads.enabled=true`, safe-browsing block prefs on.
7. None.
8. `browser.jar` + `src/zen/downloads/jar.inc.mn`.
9. **Packaged (registered); runtime-unverified.** Search = filter by name/URL; **no date grouping** natively.
10. Download list + search box.
11. Private downloads excluded from history; `clearOnShutdown.downloads=false`.
12. Panel per-window; list shared.
13. Places downloads store.
14. Keyboard list navigation.
15. Astra tightens dangerous-download blocking (positive). SMART Guard is local heuristics (no network).
16. Places, safe browsing.
17. SMART Guard vs native download flow (see conflict map).
18. **USE_NATIVE** + **ASTRA_UX_WRAPPER** (grouping/search UX).
19. Optional grouping UI (Astra layer, not a new backend).
20. Download files; trigger safe-browsing block; verify SMART Guard notices.
21. "Download grouping" = cannot claim as native; Astra UX only.
22. Low–medium (SMART Guard heuristics need validation).
23. Batch 0 / Batch 3.

### A6. Bookmarks + reading-list equivalent
1. Bookmarks (toolbar/menu/sidebar); no native reading list — bookmarks/pins are the equivalent.
2. All.
3. Firefox/Places; Astra adds workspace-bookmark mapping.
4. `engine/browser/components/places/`, `engine/toolkit/components/places/`; Astra `ZenSpaceBookmarksStorage.js` (+ `src/browser/components/places/*.patch`).
5. Bookmarks toolbar/menu; sidebar; Ctrl+Shift+O; star button.
6. Astra: `browser.toolbars.bookmarks.visibility="newtab"`, `sidebar.revamp=true`.
7. None.
8. `places/jar.mn` + `sidebar/jar.mn`.
9. **Packaged (registered); runtime-unverified.**
10. Star to bookmark; Library; sidebar.
11. Bookmarks profile-wide; private history not bookmarked by default.
12. Shared store; windows read same DB.
13. Places DB (canonical) + `zen_bookmarks_workspaces` table for space mapping.
14. Native.
15. Safe.
16. Places.
17. Places vs Space bookmark ownership (conflict map).
18. **USE_NATIVE**; **REJECT** any second bookmark system (rule).
19. None (mapping table already exists).
20. Bookmark/organize; verify workspace mapping; verify sync engine.
21. Proven once tested.
22. Low.
23. Batch 0.

### A7. Tab search / open-tab search
1. Search open tabs and switch.
2. STU, DEV, NORM.
3. Firefox urlbar (+ Astra command + Zen folder search).
4. `engine/browser/components/urlbar/UrlbarProviderOpenTabs.sys.mjs`; Astra `ZenUBGlobalActions.sys.mjs`, `AstraPhase1Actions.searchOpenTabs()`.
5. Type `%` in urlbar (RESTRICT.OPENPAGE); Astra `cmd_zenSearchOpenTabs` (`zen-commands.inc.xhtml:84`).
6. Astra sets `browser.urlbar.suggest.openpage=false` (so `%` is the explicit path).
7. None.
8. urlbar chrome modules; `src/browser/components/urlbar/*.patch`.
9. **Packaged (registered); runtime-unverified.**
10. `%` search mode; Astra command/panel.
11. Open-tab provider scoped per container/PBM (`PRIVATE_USER_CONTEXT_ID`).
12. Per-window urlbar; tab index shared.
13. None persistent.
14. Native urlbar a11y.
15. Safe.
16. urlbar muxer/providers.
17. `UrlbarMuxerStandard`/`UrlbarInput` patches add `ZEN_ACTIONS`; watch tab-to-search paths.
18. **EXPOSE_NATIVE** (Astra already exposes command).
19. None.
20. `%` search; Astra command; multi-window tab find.
21. Proven once tested.
22. Low.
23. Batch 1.

### A8. Zoom / Accessibility / Reduced-motion / Contrast / Keyboard nav
1. Zoom, a11y tree, `prefers-reduced-motion`/`prefers-contrast`, keyboard navigation, find-as-you-type.
2. STU, NORM, GOV.
3. Gecko/Toolkit platform.
4. `engine/accessible/`, `engine/layout/`, `engine/toolkit/themes/shared/design-system/`; commands in `browser-sets.inc`.
5. Ctrl +/-/0; View→Zoom; `/` and `'` find; native tab order.
6. `browser.zoom.full=true`, `accessibility.typeaheadfind=true`; OS media queries honored via design tokens.
7. Core platform (built into binary, not a jar feature).
8. Compiled platform; design-system CSS.
9. **Core / packaged; runtime-unverified.**
10. Zoom controls, keyboard.
11. Same in PBM.
12. Per-tab zoom persists per host.
13. Content-prefs (zoom per site).
14. This *is* the accessibility surface — see accessibility gaps in final report; XUL vs HTML semantics need review (conflict map).
15. Safe.
16. Platform a11y (UIA/AT-SPI/VoiceOver).
17. Zen custom XUL/HTML controls may lack labels (conflict map #26).
18. **USE_NATIVE** + **ASTRA_UX_WRAPPER** (accessibility entrypoint).
19. Audit ARIA on Zen/Astra custom controls (App Hub, Suraksha, Spaces).
20. Screen-reader pass (NVDA/JAWS/VoiceOver); keyboard-only pass; reduced-motion.
21. Cannot claim "fully accessible" until AT tested.
22. Medium (custom controls).
23. Batch 1 / Batch 3.

### A9. Picture-in-Picture (lectures/video)
1. Detachable video player.
2. STU, ENT, NORM.
3. Toolkit.
4. `engine/toolkit/components/pictureinpicture/`; patches `src/toolkit/components/pictureinpicture/*.patch`.
5. Video overlay button; urlbar PiP button; Astra `zen.urlbar.show-pip-button=true`.
6. `media.videocontrols.picture-in-picture.enabled=true`, urlbar button locked true; `enable-when-switching-tabs=false`.
7. None.
8. `toolkit.jar` player content.
9. **Packaged (registered); runtime-unverified.**
10. Hover video → PiP; urlbar button.
11. Works in PBM.
12. Per-video; Astra un-PiP can switch workspace (patch).
13. None persistent.
14. Player keyboard controls.
15. Safe.
16. Media stack.
17. PiP vs tab suspension (conflict map #30); Astra skips auto-PiP on muted tabs.
18. **USE_NATIVE** + **INTEGRATE** (Watch Space, media readiness).
19. None.
20. PiP a lecture; switch tabs; verify no suspend while playing.
21. Proven once tested.
22. Low.
23. Batch 0 / Batch 3.

### A10. Mic / Camera / Screen-share permissions
1. `getUserMedia`/`getDisplayMedia` for online classes/calls.
2. STU, CORP, NORM.
3. Gecko + Firefox actors.
4. `engine/dom/media/webrtc/`, `engine/browser/actors/WebRTCParent.sys.mjs` (+ Astra patch → `gZenMediaController.updateMediaSharing`).
5. Permission doorhanger; identity panel; Settings → Permissions.
6. `permissions.default.camera/microphone=0` (prompt); Astra WebRTC ICE hardening (`no_host`, `default_address_only`).
7. None.
8. Compiled platform + browser actors.
9. **Packaged (registered); runtime-unverified.**
10. Site prompt; permissions panel.
11. Ephemeral per private session.
12. Per-tab capture; global indicator.
13. Permissions DB (persistent grants).
14. Native prompts accessible.
15. ICE hardening reduces IP leakage (positive) but must be validated against Meet/Zoom (conflict map #12).
16. WebRTC, permissions.
17. Energy Saver vs calls (conflict map #12).
18. **USE_NATIVE**.
19. None.
20. Meet/Zoom camera+mic+screen-share; verify ICE prefs don't break TURN.
21. Cannot claim "works with all conferencing" until tested.
22. Medium (ICE prefs).
23. Batch 0.

### A11. Spellcheck / dictionaries
1. Inline spellcheck, dictionary selection.
2. STU, CORP, NORM.
3. Toolkit (Hunspell).
4. `engine/extensions/spellcheck/`, `locales/*/hunspell/`.
5. Context menu "Check Spelling"; Settings → Language.
6. Platform defaults; no Astra override.
7. `if MOZ_WIDGET_TOOLKIT != "android"`.
8. Hunspell glue + per-locale dictionaries.
9. **Packaged (registered); runtime-unverified.**
10. Right-click misspelled word.
11. Works in PBM.
12. Per-field.
13. Chosen dictionary in prefs.
14. Supports writing accessibility.
15. Safe.
16. Editor.
17. Which dictionaries ship (en-US at least) — verify packaging; Indian-language dictionaries opportunity.
18. **USE_NATIVE** + **INTEGRATE** (Indian-language dictionaries).
19. None (unless bundling extra dictionaries).
20. Type misspelling; switch dictionary; verify hi dictionary if bundled.
21. Cannot claim Indian-language spellcheck until dictionaries packaged & tested.
22. Low.
23. Batch 0 / Batch 5.

### A12. Session restore / recently closed
1. Restore tabs/windows after close/crash; recently closed lists.
2. All.
3. Firefox SessionStore + Zen ZenSessionStore/WindowSync.
4. `engine/browser/components/sessionstore/`; `src/zen/sessionstore/` (`ZenSessionManager.sys.mjs`, `ZenWindowSync.sys.mjs`).
5. `browser.startup.page=3` (restore); History → Recently Closed; Astra `cmd_zenCrashRestoreSession/Workspace`.
6. Astra: `browser.sessionstore.max_tabs_undo=6`, `max_windows_undo=2`, `zen.session-store.backup-file=true`.
7. None.
8. sessionstore modules; `src/zen/sessionstore/moz.build`.
9. **Packaged (registered); runtime-unverified.**
10. Auto restore on launch; recently closed menu.
11. Private windows excluded from Zen session file.
12. Synced vs unsynced windows (Zen window-sync).
13. **Two owners**: Firefox `sessionstore` + Zen `zen-sessions.jsonlz4` → conflict map #19.
14. N/A.
15. Safe; ensure private data not persisted.
16. SessionStore.
17. SessionStore vs Spaces recovery (conflict map #19).
18. **USE_NATIVE** + **INTEGRATE** (Spaces recovery). Do not create a 3rd session system.
19. None; verify reconciliation.
20. Crash-restore with multiple spaces; verify no duplicate/loss.
21. Beta-only until crash-recovery matrix passes.
22. Medium.
23. Batch 0.

---

## PART B — DEVELOPER CAPABILITIES

### B1. DevTools toolbox (Inspector/Console/Debugger/Network/Storage/RDM/A11y/Performance/Memory)
1. Full web developer toolbox.
2. DEV.
3. Firefox DevTools (`MOZ_DEVTOOLS=all`).
4. `engine/devtools/client/`, `engine/devtools/server/`, `engine/devtools/shared/`, `engine/devtools/startup/`.
5. F12 / Ctrl+Shift+I; per-panel shortcuts (`key-shortcuts.ftl`); Astra remaps Inspector C→L.
6. `devtools.*.enabled=true`; enterprise kill-switch `devtools.policy.disabled`.
7. `MOZ_DEVTOOLS == "all"` (present in `config.status`).
8. `devtools.jar` (unpacked `chrome/devtools` present in obj tree).
9. **Packaged (registered); runtime-unverified.**
10. F12; menu → More Tools.
11. Works in PBM.
12. Per-window toolbox.
13. DevTools prefs.
14. Toolbox has its own a11y; Accessibility Inspector included.
15. `DisableDeveloperTools` policy locks it for CORP/GOV.
16. Platform.
17. DevTools shortcuts vs normal-user shortcuts (conflict map #29); Astra KBS remap.
18. **USE_NATIVE** (advanced tier) + **ASTRA_UX_WRAPPER** (beginner tier / Developer Hub). **REJECT** any second DevTools stack (rule 9).
19. None to engine; optional Hub launcher.
20. Open each panel; verify remapped shortcut; verify policy disables it.
21. Proven once tested.
22. Low.
23. Batch 1 / Batch 3.

### B2. Browser Console / Browser Toolbox / Remote & Add-on debugging
1. Chrome-level console/toolbox, `about:debugging`, remote/add-on debugging.
2. DEV (advanced).
3. Firefox DevTools + `engine/remote/` (Marionette, WebDriver BiDi).
4. `engine/devtools/client/framework/browser-toolbox/`, `engine/remote/`.
5. Ctrl+Shift+J (Browser Console); Ctrl+Shift+Alt+I (Browser Toolbox); `about:debugging`; `-jsconsole`/`-devtools`.
6. `devtools.chrome.enabled=false`, `devtools.debugger.remote-enabled=false` (default off).
7. `--disable-geckodriver` for release; remote stack present.
8. `devtools.jar` + `engine/remote/`.
9. **Packaged (registered); off by default; runtime-unverified.**
10. Shortcuts / about:debugging.
11. N/A.
12. Singleton browser toolbox.
13. DevTools prefs.
14. Advanced UI.
15. Powerful; correctly off by default; policy can disable.
16. Platform.
17. None.
18. **USE_NATIVE** + **ENABLE_AFTER_TEST** (surface toggles in Developer Hub).
19. None.
20. Enable remote debugging; load temp add-on; connect toolbox.
21. Beta-only.
22. Medium.
23. Batch 3.

### B3. View-source / Page Info / Security-certificate panel
1. View page source, page metadata, connection/cert inspection.
2. DEV, CORP, GOV, NORM.
3. Firefox/docshell + NSS.
4. `engine/docshell/base/nsDocShell.cpp`, `engine/browser/base/content/pageinfo/`, `browser-siteIdentity.js`; Zen `ZenSiteDataPanel.sys.mjs`.
5. Ctrl+U; menu → Page Info; lock icon → connection panel.
6. `view_source.tab=true`; ETP category prefs.
7. None.
8. Browser chrome + NSS.
9. **Packaged (registered); runtime-unverified.**
10. Context menu / lock icon.
11. Works in PBM.
12. Per-window dialogs.
13. None.
14. Native dialogs.
15. Cert inspection retained (important for GOV). Astra site-identity patch is cosmetic + Zen site-data panel adds UI.
16. NSS.
17. Astra shortcut remaps around Ctrl+Shift+I (page-info) — verify no clash.
18. **USE_NATIVE** + **EXPOSE_NATIVE** (certificate inspection for GOV).
19. None.
20. View source; open page info; inspect cert on HTTPS + self-signed.
21. Proven once tested.
22. Low.
23. Batch 1 / Batch 4.

### B4. Multiple profiles for dev/testing
See **E-series (Profiles)**. Dev testing profiles = `about:profilemanager` / `about:newprofile` via `SelectableProfileService`. **ENABLE_AFTER_TEST** + **INTEGRATE** (Developer testing-profile shortcut). Batch 3.

---

## PART C — CORPORATE / ENTERPRISE CAPABILITIES

### C1. Enterprise Policies engine
1. 118-policy engine consuming `policies.json` + Windows GPO.
2. CORP, GOV.
3. Firefox (`engine/browser/components/enterprisepolicies/`).
4. `Policies.sys.mjs`, `EnterprisePoliciesParent.sys.mjs`, `schemas/policies-schema.json`, `WindowsGPOParser.sys.mjs`.
5. `${InstallDir}/distribution/policies.json`; Windows registry/GPO.
6. Governed by policy file, not prefs.
7. Standard component (`browsercomps`).
8. `enterprisepolicies/jar.mn`; **no `distribution/policies.json` shipped in `configs/`.**
9. **Packaged (registered); no bundled policy file; runtime-unverified.**
10. Admin-deployed policy file / GPO.
11. Policies can control PBM (`DisablePrivateBrowsing`).
12. Applies process-wide.
13. Policy file on disk.
14. N/A.
15. Full upstream policy surface retained; **no Astra stripping** — strong CORP/GOV foundation.
16. None.
17. Enterprise policy vs persona presets (conflict map #24) — policy must win.
18. **USE_NATIVE** + **INTEGRATE** (Managed-Browser status panel) + **ASTRA_UX_WRAPPER** (admin docs).
19. None to engine; add sample `policies.json` + docs (Batch 4, not this pass).
20. Deploy policy file + GPO; verify lock; verify diagnostics on `about:policies`.
21. **Cannot claim enterprise-ready** without deployment + update proof.
22. Medium.
23. Batch 4.

### C2. ADMX / Group Policy templates
1. Windows ADMX/ADML templates.
2. CORP, GOV.
3. Firefox docs point to external `mozilla/policy-templates`.
4. No `.admx` in tree; `WindowsGPOParser.sys.mjs` parses registry.
5. GPO editor after ADMX import.
6. N/A.
7. Windows only.
8. **ADMX templates NOT in repo** (external).
9. **GPO parser packaged; templates absent.**
10. Admin imports ADMX.
11. N/A.
12. N/A.
13. Registry.
14. N/A.
15. Mozilla ADMX keys are namespaced to Firefox — Astra must ship/adapt its own or document reuse.
16. External repo.
17. None.
18. **ENABLE_AFTER_TEST** + **ASTRA_UX_WRAPPER** (ship/brand ADMX + docs).
19. Add Astra-branded ADMX (Batch 4, not this pass).
20. Import ADMX; set a policy via GPO; verify parse.
21. Cannot claim GPO support until templates shipped & tested.
22. Medium.
23. Batch 4.

### C3. Certificates / enterprise roots / proxy / DoH policy
1. Enterprise root import, cert install, proxy modes, DNS-over-HTTPS policy.
2. CORP, GOV.
3. Firefox/NSS/netwerk.
4. `engine/security/manager/ssl/`, `ProxyPolicies.sys.mjs`, `engine/netwerk/dns/`.
5. Policies: `Certificates.ImportEnterpriseRoots`, `Certificates.Install`, `Proxy`, `DNSOverHTTPS`.
6. `security.enterprise_roots.enabled=true` (static default); Astra DoH `network.trr.mode=2`, Cloudflare URI.
7. None.
8. NSS + netwerk compiled.
9. **Packaged (registered); runtime-unverified.**
10. Policy-driven.
11. Applies to PBM.
12. Process-wide.
13. NSS cert DB / prefs.
14. N/A.
15. **Astra defaults DoH to Cloudflare** — a GOV/CORP-sensitive choice; must be policy-overridable and documented (see pref audit).
16. NSS.
17. DoH default vs enterprise DNS (document override).
18. **USE_NATIVE** + **EXPOSE_NATIVE** (certificate visibility) + **INTEGRATE** (managed status).
19. None to engine.
20. Import enterprise root; set proxy + DoH-off via policy; verify override.
21. Proven (native) once tested; DoH default must be disclosed.
22. Medium.
23. Batch 4.

### C4. Update service / channels / MAR
1. Auto-update, channel, MAR signing/verification, pinning.
2. CORP, GOV, NORM.
3. Toolkit updater (retargeted to Astra host).
4. `engine/toolkit/mozapps/update/`; `src/build/moz-build.patch` (host `updates.astra-browser.app`).
5. `about:preferences` update section; `astra.updates.show-update-notification=true`.
6. Release notes URL → GitHub; channel `unofficial`; `--enable-unverified-updates`.
7. `MOZILLA_OFFICIAL`; maintenance service disabled.
8. `updater.exe`, `signmar.exe` present; **crashreporter absent**.
9. **Packaged (registered); signature verification RELAXED; runtime-unverified.**
10. Update prompt/notification.
11. N/A.
12. Process-wide.
13. Update dir.
14. N/A.
15. **`--enable-unverified-updates` weakens update integrity vs Mozilla Firefox** — a real GOV/CORP concern (see final report N).
16. AUS host, MAR keys.
17. Native updates vs Astra branding/endpoints (conflict map #27).
18. **ENABLE_AFTER_TEST** + **DEFER** (signed-update hardening for GOV).
19. Update-signing hardening is a build/infra change (not this pass).
20. End-to-end update from prior build; rollback; signature check.
21. **Cannot claim secure auto-update** until signing verified.
22. High (external/infra).
23. Batch 4 / Batch 5.

### C5. Work/personal separation, managed indicators, diagnostics
1. Containers + profiles + `about:policies` diagnostics + managed indicator.
2. CORP, GOV.
3. Firefox (containers, policies) + Astra status panel (to build).
4. `ContextualIdentityService.sys.mjs`, `about:policies`, `SelectableProfileService`.
5. Container menu; profiles menu; `about:policies`.
6. `privacy.userContext.enabled=true` (Astra forces on).
7. None.
8. Packaged.
9. **Packaged (registered); managed status panel NOT built; runtime-unverified.**
10. Containers / profiles.
11. Containers not used in PBM.
12. Profile-global identities.
13. Containers store; profile store.
14. N/A.
15. Good separation primitives; managed indicator is an Astra UX addition.
16. Containers, policies.
17. Profiles vs Spaces (conflict map #3); enterprise policy vs presets (#24).
18. **INTEGRATE** (Managed-Browser status panel) + **ASTRA_UX_WRAPPER**.
19. New status panel (Batch 4).
20. Verify managed state reflects active policies.
21. Cannot claim managed-browser until built & tested.
22. Medium.
23. Batch 4.

---

## PART D — GOVERNMENT CAPABILITIES (classified per requirement)

Government capabilities reuse C1–C4 plus the privacy/telemetry stack. **Each is classified
separately** as required:

| Capability | Source module | Status class |
|---|---|---|
| Offline operation / offline installer | NSIS installer (`src/browser/installer/windows/nsis/`) | **requires packaging** (installer build) |
| Telemetry control | `prefs/privatefox/privacy.yaml` (locked off) | **technically supported** (verify locks hold) |
| Crash-report control | crash reporter **not shipped**; prefs off | **technically supported** (absence = no upload) |
| Local translation | `engine/toolkit/components/translations` (Bergamot on-device) | **technically supported** (verify offline) |
| No-forced-account | FxA present but optional; welcome doesn't force login | **technically supported** (verify) |
| Policy locking | `EnterprisePolicies` (`lockPref`) | **technically supported** (verify) |
| Update signing/verification | `--enable-unverified-updates` | **requires independent security audit** |
| Rollback | `AppUpdatePin`/MAR | **requires packaging + audit** |
| Certificate inspection | NSS cert UI | **technically supported** |
| Data export/deletion | `privacy.sanitize.*`, Places | **technically supported** |
| Auditability / security reporting | `about:policies`, no telemetry | **requires legal/compliance work** |
| Private-window control | `DisablePrivateBrowsing` policy | **technically supported** |
| Indian-language support | `intl.accept_languages hi-IN`, translations, langpacks | **requires packaging** (verify hi langpack/dictionaries) |
| Accessibility | platform a11y | **requires independent audit** (AT testing) |

Prohibited claims (never to be used): *government certified, military grade, officially
secure, unhackable*. Everything above stays a **managed-environment preview** until audited.

---

## PART E — NORMAL-USER, PROFILES / MIGRATION / SYNC

### E1. First-run onboarding (Welcome)
1. Welcome → import → experience → appearance → start.
2. NORM (all).
3. Zen/Astra (`ZenWelcome.mjs`).
4. `src/zen/welcome/ZenWelcome.mjs` (lazy `loadSubScript`); import step → `gAstraMigration.openNativeWizard`.
5. Auto on first run (`ZenStartup.#checkForWelcomePage`).
6. `zen.welcome-screen.seen` (sticky false); `browser.aboutwelcome.enabled=false` (native welcome off).
7. Skipped in `MOZ_HEADLESS`.
8. `src/zen/welcome/jar.inc.mn`.
9. **Packaged (registered); runtime-unverified.** Failure resets `seen` (fail-safe).
10. First launch.
11. Skipped/limited in PBM.
12. Once per profile.
13. `zen.welcome-screen.seen`.
14. Must be keyboard/AT accessible (verify).
15. Must not force account or silently enable cloud.
16. Migration center, theme picker.
17. Migration vs profile creation (conflict map #5).
18. **INTEGRATE** (persona presets) + **ASTRA_UX_WRAPPER**.
19. Wire persona choice → suggested Spaces/App-Hub (Batch 2).
20. Full first-run on clean profile; import path; skip path.
21. Beta-only until first-run matrix passes.
22. Medium.
23. Batch 2.

### E2. Local multi-profile support
1. Multiple isolated profiles + switcher.
2. NORM, DEV, CORP.
3. Toolkit `SelectableProfileService` (native) + Astra UI hooks.
4. `engine/toolkit/profile/` + `src/toolkit/profile/zenToolkitProfileServiceDefaultOverride.h`, `nsToolkitProfileService-cpp.patch`; `browser-profiles-js.patch`.
5. App Menu → Profiles; `about:profilemanager`/`about:newprofile`; default name "Default (Astra)".
6. `browser.profiles.enabled=true`.
7. None.
8. Packaged; profile UI native.
9. **Packaged (registered); runtime-unverified.**
10. Profiles menu.
11. Profile create/import blocked in PBM.
12. `SelectableProfileService` singleton (profile-global).
13. Toolkit profiles store.
14. Native menu.
15. Isolation is a privacy positive; must not be conflated with Sync (rule 12).
16. Toolkit profile service.
17. Profiles vs Spaces (#3); Profiles vs private windows (#4); Migration vs profile creation (#5).
18. **USE_NATIVE** + **EXPOSE_NATIVE**. **REJECT** any second profile system (rule 4).
19. None to engine.
20. Create/switch/delete profile; verify isolation; verify launch.
21. Proven once tested; must be labelled "local profiles," not Sync.
22. Medium.
23. Batch 0 / Batch 3.

### E3. Migration engine (Astra Migration Center)
1. Import bookmarks/passwords/history/autofill from other browsers.
2. NORM (all).
3. Firefox `MigrationWizard` (Astra provides UI shell only).
4. `src/zen/common/modules/AstraMigrationCenter.mjs`, `AstraMigrationBootstrap.mjs` → `MigrationUtils.showMigrationWizard()`.
5. App menu `cmd_astraOpenMigrationCenter`; Settings import button; Welcome; Profiles subview.
6. `browser.profiles.enabled`; respects `profileImport` policy.
7. None.
8. `src/zen/common/jar.inc.mn` (bootstrap eager, center lazy).
9. **Packaged (registered); runtime-unverified.**
10. Multiple entrypoints (menu/settings/welcome).
11. Blocked in PBM except startup-migration flag.
12. Per-window panel; native wizard singleton.
13. Import lands in normal Firefox profile stores.
14. Must verify wizard a11y.
15. Astra does **not** parse DBs/copy folders — delegates to native (correct; rule 5).
16. `MigrationUtils`.
17. Migration vs Sync (#6); Migration vs profile creation (#5).
18. **USE_NATIVE** + **ASTRA_UX_WRAPPER**. **REJECT** any second migration engine (rule 5).
19. None to engine.
20. Import from Chrome/Edge; verify each resource type; verify PBM block.
21. Beta-only until per-browser import tested.
22. Medium.
23. Batch 0 / Batch 3.

### E4. Firefox Account / Sync
1. Cloud sync of bookmarks/passwords/tabs/history + Zen workspaces engine.
2. NORM, CORP.
3. Mozilla (`engine/services/sync`, `engine/services/fxaccounts`) — **not rebranded**.
4. Native services; `services.sync.engine.workspaces=true`; `ZenWorkspacesEngine` referenced.
5. Settings → Sync.
6. `services.sync.engine.workspaces=true`.
7. None.
8. Native services packaged; `ZenWorkspacesEngine` impl not in overlay (in engine at build).
9. **Packaged (registered); runtime-unverified.**
10. Sign into Firefox Account.
11. N/A.
12. Account-global.
13. Mozilla Sync servers.
14. Native.
15. **Must NOT be rebranded as "Astra Sync"** (rules 12–13); must not claim local profiles are Sync.
16. FxA infrastructure (Mozilla).
17. FxA identity vs Astra branding (conflict map #28); Migration vs Sync (#6).
18. **USE_NATIVE** + **DEFER** (independent Astra Sync is a future platform system, Batch 6).
19. None now; independent sync is Batch 6.
20. Sign in; sync workspaces engine; verify identity strings.
21. **Cannot claim "Astra Sync"** — it is Firefox Sync.
22. High (external/legal for any rebrand).
23. Batch 6.

### E5. Default browser / search / permissions / private browsing / clear-site-data
1. Standard normal-user controls.
2. NORM.
3. Firefox.
4. `engine/browser/components/preferences/`, shell service, permissions.
5. Settings; identity panel; private window (Ctrl+Shift+P).
6. `browser.search.region=IN`, DoH on, ETP strict, `sanitizeOnShutdown=true`.
7. None.
8. Packaged.
9. **Packaged (registered); runtime-unverified.**
10. Settings/menus.
11. Full PBM.
12. Process-wide settings.
13. Prefs/permissions DB.
14. Native.
15. Astra defaults are privacy-forward (strict ETP, clear cookies on shutdown) — must be discoverable/reversible.
16. Prefs.
17. `sanitizeOnShutdown` + clear cookies could surprise users staying logged in (see pref audit).
18. **USE_NATIVE** + **EXPOSE_NATIVE** (Choose-experience toggles).
19. None.
20. Set default; change search; toggle ETP; verify clear-on-shutdown behavior.
21. Proven once tested.
22. Low–medium.
23. Batch 0 / Batch 2.

---

## PART F — ENTERTAINMENT / MEDIA

### F1. Widevine / EME / DRM playback
1. Encrypted media playback (Netflix/Prime/etc.).
2. ENT, NORM.
3. Gecko EME + GMP (CDM downloaded at runtime).
4. `engine/dom/media/eme/`, `engine/dom/media/gmp/`, `GMPProvider.sys.mjs`.
5. Automatic on DRM sites; CDM download prompt.
6. `media.eme.enabled=true` (`prefs/zen/media.yaml`), `media.gmp-widevinecdm.enabled=true`; `--enable-eme=widevine,wmfcdm`.
7. Windows x64: `MOZ_WMF_CDM=1`.
8. Widevine CDM downloaded from Google at runtime (external, licensing-sensitive).
9. **Packaged (registered) + runtime CDM download; runtime-unverified.**
10. Play DRM content.
11. `browser.privatebrowsing.forceMediaMemoryCache=true`; verify DRM in PBM.
12. Per-tab.
13. CDM in profile/GMP dir.
14. N/A.
15. Widevine is proprietary/externally licensed — **licensing-sensitive** (DEFER hard claims).
16. Google Widevine, WMF.
17. uBlock/ETP vs DRM sites (conflict map #10); autoplay policy vs playback.
18. **USE_NATIVE** + **INTEGRATE** (Media Readiness panel showing truthful DRM status). **REJECT** any second DRM stack (rule 11).
19. None to engine.
20. Play Netflix/Prime; verify CDM install; verify PBM; verify ETP/uBlock don't break.
21. **Never claim "Netflix certified / guaranteed 4K / all services."** DRM status only.
22. High (external/legal).
23. Batch 0 / Batch 3.

### F2. Hardware decode / codecs / fullscreen / autoplay / Media Session / global media controls / captions
1. HW video decode (WMF/ffvpx/dav1d), AV1/AVIF, fullscreen, autoplay policy, Media Session, WebVTT captions, Zen media controls.
2. ENT, NORM, STU.
3. Gecko media + Zen `ZenMediaController`.
4. `engine/dom/media/platforms/`, `AutoplayPolicy.cpp`, `engine/dom/media/mediacontrol/` (+ Astra `MediaController-cpp.patch`); Zen `src/zen/media/ZenMediaController.mjs`.
5. Video controls; fullscreen; OS media keys.
6. `media.hardware-video-decoding.enabled=true`, `image.avif.enabled=true` (locked); `media.autoplay.default=5`; `zen.mediacontrols.enabled=false` (**off by default**).
7. `MOZ_WMF=1`, `MOZ_FFMPEG`.
8. Packaged; codecs compiled; OpenH264 GMP runtime.
9. **Packaged (registered); Zen media controls UI off by default; runtime-unverified.**
10. Native video controls; OS media keys (if enabled).
11. Works in PBM.
12. Global media controller.
13. None persistent.
14. Captions aid accessibility.
15. Astra autoplay policy is restrictive (positive) but may block wanted playback — verify.
16. Media stack.
17. Energy Saver vs streaming (#11); RAM Saver vs A/V tabs (#13); screen-sleep prevention.
18. **USE_NATIVE** + **EXPOSE_NATIVE** (consider enabling `zen.mediacontrols`) + **INTEGRATE** (Media Readiness).
19. None to engine; optional enable of media controls after test.
20. Play video fullscreen; AV1/AVIF; OS media keys; autoplay behavior; captions.
21. Cannot claim guaranteed HW-accel until per-GPU tested.
22. Medium.
23. Batch 0 / Batch 3.

### F3. Casting
1. Native Chromecast/AirPlay mirroring.
2. ENT.
3. **Not present** as a first-party feature; only web Remote Playback/Presentation APIs.
4. Zen "Share" (`src/zen/share/`) is workspace/folder export, not AV casting.
5. N/A.
6. N/A.
7. N/A.
8. N/A.
9. **Not present.**
10. None.
11–17. N/A.
18. **REJECT** for now (only if natively supported later) / **DEFER**.
19. None.
20. N/A.
21. **Cannot claim casting.**
22. N/A.
23. Deferred.

---

## PART G — CROSS-CUTTING SYSTEMS

### G1. Privacy & security stack (ETP / TCP / Safe Browsing / permissions / GPC / HTTPS-only)
- Owner: Firefox. Modules: `antitracking`, `safebrowsing`, `netwerk`, permissions.
- Astra defaults: `browser.contentblocking.category="strict"`, cryptomining/fingerprinting/social/email tracking on, Safe Browsing malware/phishing/download blocking on, `dom.security.https_only_mode(_pbm)=true`, `network.cookie.cookieBehavior=5` (TCP), `privacy.globalprivacycontrol.enabled=true`, `privacy.query_stripping.*` on.
- **USE_NATIVE**; surfaced by **Suraksha** (INTEGRATE). Sandbox/Fission/site-isolation **not reduced** (rule 14 upheld). Batch 0.

### G2. Astra Suraksha Center (security/privacy status panel)
1. Fail-safe panel aggregating connection, protection/ETP, uBlock, permissions, site data, clean-link, Safe Browsing, passwords.
2. All.
3. Astra (wraps native).
4. `src/zen/common/modules/AstraSuraksha*.mjs` (Manager/Bootstrap + 8 adapters); `astra-suraksha.css`.
5. `cmd_astraOpenSurakshaCenter`; toolbar button + App-Menu entry; panel `PanelUI-astra-suraksha`.
6. `astra.suraksha.enabled=true` (disable hides button + menu, no migration).
7. None.
8. `src/zen/common/jar.inc.mn` (bootstrap eager, manager lazy).
9. **Packaged (registered); runtime-unverified.** Bootstrap try/catch → non-fatal.
10. Toolbar/menu → Suraksha panel.
11. Reflects PBM state (should be verified).
12. Per-window manager; reads global protections.
13. None (reads native state).
14. Custom panel — **ARIA/keyboard must be audited**.
15. **Read/wrapper only** — must not duplicate/replace native protection backends (rule upheld). Does not weaken security.
16. ETP, uBlock (add-on), permissions, Safe Browsing, Places.
17. Suraksha vs native protections UI (#8); uBlock vs ETP (#9); vs DRM/banking (#10).
18. **INTEGRATE** + **ASTRA_UX_WRAPPER**.
19. None (verify adapters read live state).
20. Toggle protections; block a tracker; verify each adapter; PBM; a11y.
21. Beta-only until adapters verified against live state.
22. Medium.
23. Batch 0 / Batch 3.

### G3. Astra App Hub
1. Curated launcher of web apps (mail/meet/storage/productivity/education/entertainment/shopping/gov/news/work) incl. Indian services (IRCTC, DigiLocker, GST, EPFO, SWAYAM, JioSaavn, etc.).
2. All.
3. Astra.
4. `AstraAppHubManager.mjs`, `AstraAppHubState.mjs`, `AstraAppHubIcons.mjs`, `app-hub/AstraAppHubCatalog.mjs`; `AstraSpaceAppBridge.mjs`; icons packaged in `jar.inc.mn`; panel `PanelUI-zen-app-launcher` (static **fallback** panel in `popups.inc`).
5. Toolbar/menu → App Hub panel.
6. No dedicated enable pref found (bootstrap-gated); catalog schema v1.
7. None.
8. Packaged SVG icons (local only; **never remote list-style-image**); catalog ESM (lazy).
9. **Packaged (registered); runtime-unverified.** Has static fallback (rule 18 upheld).
10. App Hub button.
11. Per-window; verify PBM persistence (App Hub state is profile-local singleton — conflict map #23).
12. Per-window controller; profile-local state.
13. Profile-local App Hub state (custom).
14. Custom panel — ARIA/keyboard audit needed.
15. Icons local/packaged only (good). Opens normal web apps.
16. Places (favicons), Spaces bridge.
17. App Hub vs native pinned sites/apps/taskbar tabs (#7); private windows vs persistent App Hub state (#23).
18. **INTEGRATE** + **ASTRA_UX_WRAPPER**.
19. None (verify state ownership in PBM).
20. Launch apps; custom app add; icon fallback; PBM; a11y.
21. Beta-only.
22. Medium.
23. Batch 2 / Batch 3.

### G4. Spaces / Workspaces
See subagent map. Owner Zen. Modules `src/zen/spaces/*`. Persistence: `zen-sessions.jsonlz4` (+ Firefox sessionstore + `zen.workspaces.active`). Private: ephemeral, not persisted. Multi-window: per-window cache + `gZenWindowSync` propagation. **USE_NATIVE (Zen)** + **INTEGRATE** (persona Space templates). Conflicts #1,#2,#3,#18,#19. Batch 0 / Batch 2.

### G5. Vertical tabs / sidebar / compact / glance / split-view / folders / transparent mode / energy saver / RAM saver / mods
| Capability | Owner | Module | Default | State | Action | Batch |
|---|---|---|---|---|---|---|
| Vertical tabs | Zen | `ZenUIManager.mjs` | `zen.tabs.vertical=true` | packaged | USE_NATIVE | 0 |
| Sidebar | Zen | `ZenUIManager.mjs` | `zen.view.sidebar-expanded=true` | packaged | USE_NATIVE | 0 |
| Compact mode | Zen | `ZenCompactMode.mjs` | hide-tabbar=true | packaged | USE_NATIVE (conflict #17) | 0 |
| Glance | Zen | `ZenGlanceManager.mjs` | `zen.glance.enabled=true` | packaged | USE_NATIVE | 0 |
| Split View | Zen | `ZenViewSplitter.mjs` | tab-drop on | packaged | USE_NATIVE | 0 |
| Folders | Zen | `ZenFolders.mjs` | search on; super off | packaged | USE_NATIVE | 0 |
| Transparent Mode | Astra | `AstraTransparencyManager.mjs` | `astra.theme.transparent.enabled=true` | packaged | USE_NATIVE (conflicts #15,#16) | 0 |
| Energy Saver | Zen | `ZenEnergySaver.mjs` | `zen.energy-saver.mode="auto"` | packaged, global mgr | USE_NATIVE (conflicts #11,#12) | 0 |
| RAM Saver | Astra | `ZenStartup.mjs #initRamSaver` | `astra.ramsaver.enabled=true`, 3072 MB | packaged | USE_NATIVE (conflicts #13,#14) | 0 |
| Zen Mods | Zen | `ZenMods.mjs` | `zen.themes.disable-all=true` (off) | packaged, disabled | DEFER (off by default) | later |

### G6. Extensions / add-ons
- Owner Firefox. `xpinstall.signatures.required=true` (Astra), uBlock integration (Suraksha adapter), recommendations disabled (`disablemozilla.yaml`), extensions sidebar (`zen.sidebar.extensions.enabled`).
- **USE_NATIVE**; add-on policies via EnterprisePolicies. Batch 0 / Batch 4.

### G7. Updates & recovery
- Update service retargeted to Astra host, **unverified updates enabled** (security concern, C4). Troubleshooting mode, reset/refresh, `about:support` native. Crash reporter **not shipped**. **ENABLE_AFTER_TEST / DEFER** for GOV signing. Batch 4/5.

---

## Classification summary (counts)

Counts reflect the curated capability set enumerated above (grouped rows counted once).

| Classification | Count | Examples |
|---|---:|---|
| USE_NATIVE | 24 | PDF.js, translations, screenshots, DevTools, containers, ETP/Safe Browsing, vertical tabs, glance, split-view, folders, PiP, spellcheck, bookmarks, HW decode, EnterprisePolicies, profiles |
| EXPOSE_NATIVE | 11 | Reader/Read-Aloud shortcut, tab search command, certificate visibility, media controls, choose-experience toggles, PDF/Student shortcuts |
| ENABLE_AFTER_TEST | 6 | Remote/add-on debugging, ADMX shipping, update hardening, media controls enable, testing-profile shortcuts |
| ASTRA_UX_WRAPPER | 9 | Beginner DevTools/Developer Hub, admin docs, download grouping UX, Managed-Browser panel, Suraksha, App Hub presentation |
| INTEGRATE | 12 | Study/Research/Watch Spaces, persona presets, Suraksha, App Hub, Media Readiness, Spaces recovery, Indian-language emphasis |
| DEFER | 5 | Independent Astra Sync, GOV update signing, GOV compliance/audit, Zen Mods marketplace, casting |
| REJECT | 4 | Second PDF/translation/DevTools/DRM/profile/migration backends; deceptive claims; casting-as-feature (until native) |

> Counts are indicative for planning; the per-capability blocks are authoritative.
