# Astra Capability Conflict Map

> **Audit-only.** No source, prefs, or packaging changed. Baseline
> `feature/astra-migration-profiles` @ `1d27263`.
>
> **Guiding rule:** every piece of state must have **one canonical owner**. Where two
> systems touch the same DOM node, pref, session record, or resource, this map names the
> owner, the failure mode, and the resolution.

## Severity scale
- **S1** startup/data-loss/security risk · **S2** feature breakage · **S3** UX confusion/perf · **S4** cosmetic.

## Column key
Systems · Shared state · Current owner · Potential failure · Severity · Recommended owner ·
Resolution · Runtime tests.

---

### 1. Firefox Sidebar vs Zen vertical tabs
- **Shared state:** `#sidebar-box`, `sidebar.revamp`, `sidebar.verticalTabs`, `zen.tabs.vertical`.
- **Current owner:** Zen relocates native `#sidebar-box` in `ZenStartup.mjs`; `sidebar.verticalTabs=false` **locked**, `zen.tabs.vertical=true`.
- **Failure:** if native vertical tabs (`sidebar.verticalTabs`) unlocks, two vertical-tab systems fight for the same rail.
- **Severity:** S2.
- **Recommended owner:** **Zen** owns tab rail; Firefox sidebar limited to web/extension panels.
- **Resolution:** keep `sidebar.verticalTabs` locked false; document that native vertical tabs is intentionally disabled in favor of Zen.
- **Tests:** open extension sidebar + Zen tabs; toggle `sidebar.revamp`; verify no duplicate rail.

### 2. Native horizontal tabs vs Zen tabs
- **Shared state:** `#tabbrowser-tabs`, tabbrowser patches (`tabbrowser-js.patch`, `tab-js.patch` — the latter is in working-tree dirt).
- **Current owner:** Zen (vertical). Horizontal tabstrip hidden.
- **Failure:** patch drift on `tab-js.patch` (currently modified, uncommitted) may desync tab DOM assumptions.
- **Severity:** S2.
- **Recommended owner:** **Zen**.
- **Resolution:** re-validate `tab-js.patch` against engine tabbrowser before build; keep single tab model.
- **Tests:** tab open/close/move/pin/drag; essentials; folder drag.

### 3. Profiles vs Spaces
- **Shared state:** user mental model + data location; `SelectableProfileService` (profile-global on-disk) vs `gZenWorkspaces` (in-profile tab grouping in `zen-sessions.jsonlz4`).
- **Current owner:** distinct — profiles = toolkit; spaces = Zen.
- **Failure:** UX confusion (users think a Space isolates cookies/passwords like a profile — it does not).
- **Severity:** S3.
- **Recommended owner:** keep separate; **naming discipline**.
- **Resolution:** onboarding/docs must state: Profile = isolated data; Space = tab organization within one profile. Persona presets configure Spaces, never profiles silently.
- **Tests:** create profile vs space; verify cookie/login isolation only at profile level.

### 4. Profiles vs private windows
- **Shared state:** ephemeral vs persistent identity; profile create/import blocked in PBM (`isPrivateMigrationBlocked`).
- **Current owner:** correct — PBM blocks profile/migration ops.
- **Failure:** attempting profile creation from a private window.
- **Severity:** S3.
- **Recommended owner:** **Toolkit**; PBM stays ephemeral.
- **Resolution:** keep block; show explanatory message instead of silent no-op.
- **Tests:** attempt create/import in PBM; verify blocked with message.

### 5. Migration vs profile creation
- **Shared state:** `MigrationWizard`, `SelectableProfileService.createNewProfile`, welcome import step.
- **Current owner:** Astra Migration Center wraps native wizard; profile creation launches `about:newprofile`.
- **Failure:** double-import (import into new profile then re-run wizard); `isStartupMigration` flag misuse.
- **Severity:** S2.
- **Recommended owner:** **Firefox MigrationWizard** for import; toolkit for profile creation.
- **Resolution:** single import entrypoint per flow; welcome sets `isStartupMigration=false` (already).
- **Tests:** welcome import; settings import; new-profile import; verify no duplicate bookmarks.

### 6. Migration vs Sync
- **Shared state:** bookmarks/passwords/history destination.
- **Current owner:** Migration = one-shot copy (native wizard); Sync = ongoing FxA replication.
- **Failure:** users expecting import to keep syncing; or import creating duplicates of synced data.
- **Severity:** S2.
- **Recommended owner:** keep distinct; **never label import as Sync** (rule 12).
- **Resolution:** onboarding copy: "Import = one-time copy. Sync = continuous, needs Firefox Account." Do not auto-enable Sync after import.
- **Tests:** import then sign into Sync; verify no duplication/loops.

### 7. App Hub vs native pinned sites / taskbar tabs
- **Shared state:** "pinned web apps" concept; `browser.taskbarTabs.enabled=true`, native pinned tabs, Zen essentials, App Hub catalog.
- **Current owner:** overlapping — App Hub (launcher), essentials (pinned), taskbar tabs (native PWA-like).
- **Failure:** three ways to "pin an app" confuse users; duplicate entries.
- **Severity:** S3.
- **Recommended owner:** **App Hub** = discovery/launch; **Zen essentials** = persistent pinned; **taskbar tabs** = OS integration.
- **Resolution:** define clear roles in UX; App Hub "add to essentials" rather than a 4th store.
- **Tests:** launch from App Hub; pin to essentials; create taskbar tab; verify no duplicate state.

### 8. Suraksha vs native protections UI
- **Shared state:** ETP state, identity/permissions panel, `about:preferences#privacy`.
- **Current owner:** native owns protection backend + `about:protections`; Suraksha reads/links to it.
- **Failure:** Suraksha showing stale state diverging from native panel; users toggling in two places.
- **Severity:** S2.
- **Recommended owner:** **Firefox** owns backend + canonical toggles; Suraksha is read + deep-link only.
- **Resolution:** Suraksha adapters must read live `Services`/ETP state and defer writes to native surfaces.
- **Tests:** toggle ETP in native panel; verify Suraksha reflects immediately; verify Suraksha "manage" opens native UI.

### 9. uBlock vs Enhanced Tracking Protection
- **Shared state:** request blocking (both block trackers/ads).
- **Current owner:** ETP (native, strict) + uBlock (add-on) both active.
- **Failure:** double-blocking breakage, or user disabling one thinking it's the other; perf overlap.
- **Severity:** S2.
- **Recommended owner:** **ETP** is baseline (always), **uBlock** is user-controllable layer.
- **Resolution:** Suraksha explains both; disabling uBlock per-site should not require touching ETP.
- **Tests:** ad-heavy site with both; disable uBlock per-site; measure over-block/breakage.

### 10. uBlock/ETP vs DRM, banking, authentication sites
- **Shared state:** request/script blocking on sensitive sites; `cookieBehavior=5`, strict ETP, `firstparty.isolate=false` (kept off to not break Google login).
- **Current owner:** ETP + uBlock.
- **Failure:** blocking breaks Widevine license requests, UPI/bank 3-D Secure, OAuth popups.
- **Severity:** **S1** (payments/auth).
- **Recommended owner:** ETP with documented allowances; keep `firstparty.isolate=false`, `dom.disable_open_during_load=true` verified against OAuth popups.
- **Resolution:** maintain a tested compatibility checklist (bank/UPI/OAuth/Netflix); Suraksha per-site disable.
- **Tests:** UPI payment, netbanking 3DS, Google/Microsoft OAuth, Netflix/Prime playback.

### 11. Energy Saver vs streaming
- **Shared state:** `zen.energy-saver.mode="auto"`, media playback, frame throttling.
- **Current owner:** Zen Energy Saver (global manager).
- **Failure:** throttling drops frames/audio during video.
- **Severity:** S2.
- **Recommended owner:** **Energy Saver** must exempt active A/V tabs.
- **Resolution:** verify media-playback exception in `ZenEnergySaver.mjs`; never throttle tab with active media/Media Session.
- **Tests:** 1080p/4K playback under battery/auto mode; verify no frame drops.

### 12. Energy Saver vs Meet/Zoom calls
- **Shared state:** background throttling + WebRTC capture + ICE hardening prefs.
- **Current owner:** Energy Saver + WebRTC.
- **Failure:** throttling/ICE prefs degrade calls (audio cutout, no host candidates).
- **Severity:** **S1** (calls).
- **Recommended owner:** **WebRTC session** wins; Energy Saver exempts capture tabs.
- **Resolution:** exempt tabs with active `getUserMedia`/`getDisplayMedia`; validate `ice.no_host`/`default_address_only` against Meet/Zoom TURN.
- **Tests:** 30-min Meet + Zoom call on battery; screen-share; verify no drops.

### 13. RAM Saver vs audio/video tabs
- **Shared state:** `astra.ramsaver.*`, idle `minimizeMemoryUsage()`, Zen tab-unloader, playing media.
- **Current owner:** RAM Saver (idle observer + threshold) + tab-unloader.
- **Failure:** unloading/minimizing a playing/background-audio tab stops playback.
- **Severity:** S2.
- **Recommended owner:** **media state** protects the tab; unloader must skip playing/audible tabs.
- **Resolution:** confirm tab-unloader excludes audible/PiP/Media-Session tabs; `minimizeMemoryUsage` on idle is safe (GC) but verify no audio glitch.
- **Tests:** background music tab + idle 3+ min; many tabs > threshold with one playing.

### 14. RAM Saver vs downloads / uploads
- **Shared state:** idle minimize + active network transfer.
- **Current owner:** RAM Saver idle observer (180s idle).
- **Failure:** aggressive memory minimize during large transfer.
- **Severity:** S3.
- **Recommended owner:** transfer completes; minimize is GC-only (low risk).
- **Resolution:** verify `minimizeMemoryUsage` doesn't abort transfers; consider skipping while active downloads exist.
- **Tests:** large download/upload while idle; verify completion + integrity.

### 15. Transparent Mode vs hardware acceleration
- **Shared state:** `astra.theme.transparent.*`, `widget.windows.mica*`, compositor (`gfx.webrender.compositor`).
- **Current owner:** `AstraTransparencyManager` (process-wide native coordinator) sets mica prefs live.
- **Failure:** Mica/acrylic + WebRender interaction → repaint cost, or transparency lost when compositor disabled.
- **Severity:** S3.
- **Recommended owner:** **AstraTransparencyManager** owns mica prefs; must respect HW-accel state.
- **Resolution:** effective mode computed per-window at runtime (already); verify graceful fallback when compositor off / GPU blocklisted.
- **Tests:** Windows Mica on/off; GPU blocklist; multi-monitor; measure repaint.

### 16. Transparent Mode vs browser-content opacity
- **Shared state:** `astra.theme.transparent.enabled` (chrome glass) vs `browser.tabs.allow_transparent_browser=false` (web content).
- **Current owner:** Astra (correctly separated per `theme.yaml`/`windows.yaml`).
- **Failure:** confusing the two → page backgrounds showing chrome through.
- **Severity:** S3.
- **Recommended owner:** **Astra**; keep `allow_transparent_browser=false`.
- **Resolution:** documented separation exists; keep it.
- **Tests:** pages with missing backgrounds under Transparent Mode; verify content not see-through.

### 17. Compact Mode vs AI / sidebar panels
- **Shared state:** `zen.view.compact.*`, sidebar hover reveal, AI chat sidebar (`browser.ml.chat.sidebar=true`).
- **Current owner:** Zen compact mode + Firefox ML sidebar.
- **Failure:** compact auto-hide hides/So collides with AI/extension sidebar panels.
- **Severity:** S3.
- **Recommended owner:** **Zen compact mode** manages chrome; panels pin above hover layer.
- **Resolution:** verify sidebar panels remain reachable in compact; hover reveal doesn't trap focus.
- **Tests:** compact + AI chat sidebar + extension panel; keyboard reveal.

### 18. XULStore vs sidebar defaults
- **Shared state:** toolbar/sidebar persisted layout (`xulstore.json`) vs Zen pref-driven defaults.
- **Current owner:** mixed — Zen uses prefs (`zen.view.sidebar-expanded`) not xulstore; native toolbar uses xulstore.
- **Failure:** stale xulstore overriding Zen defaults on upgrade.
- **Severity:** S3.
- **Recommended owner:** **prefs** for Zen chrome; xulstore for native customizable toolbar only.
- **Resolution:** `ZenUIMigration.sys.mjs` reconciles; verify on profile upgrade.
- **Tests:** upgrade profile with customized toolbar; verify Zen layout intact.

### 19. SessionStore vs Spaces recovery
- **Shared state:** window/tab restore — Firefox `sessionstore.jsonlz4` **and** Zen `zen-sessions.jsonlz4`.
- **Current owner:** **two owners** (highest-risk duplication).
- **Failure:** divergence → duplicated tabs, lost workspaces, or crash-restore mismatch.
- **Severity:** **S1**.
- **Recommended owner:** **single reconciled pipeline** — Zen SessionStore patch must be the authority for space/tab mapping while delegating window/tab payload to Firefox sessionstore.
- **Resolution:** verify `SessionStore-sys-mjs.patch` reconciliation; crash-restore matrix; unsynced-window handling.
- **Tests:** kill process with N spaces/folders/split-views; restart; verify exact restore, no dupes.

### 20. Fluent localization vs nested toolbar DOM
- **Shared state:** `data-l10n-id` attributes on deeply nested Zen/Astra DOM (App Hub, Suraksha, Spaces).
- **Current owner:** Fluent (`locales/`, `zen-*.ftl`).
- **Failure:** missing l10n ids → empty labels; RTL/long-string overflow in custom panels.
- **Severity:** S3.
- **Recommended owner:** **Fluent**; every custom control needs an id + fallback.
- **Resolution:** audit App Hub/Suraksha/Migration panels for l10n coverage + fallback text.
- **Tests:** switch to hi + a long-string pseudo-locale; verify no blank/overflow.

### 21. Shared-global modules vs window-global modules
- **Shared state:** `SelectableProfileService`/`ZenEnergySaver`/`ZenSessionStore`(sys) singletons vs per-window `gZenWorkspaces`/`gAstraSuraksha`/`gAstraAppHub`/`AstraTransparencyManager`.
- **Current owner:** mixed by design.
- **Failure:** per-window managers assuming global state (or vice versa) → cross-window desync.
- **Severity:** S2.
- **Recommended owner:** document each: global sys module = one instance; window managers = per-window with sync coordinator (`gZenWindowSync`).
- **Resolution:** verify propagation paths (`propagateWorkspacesToAllWindows`, `setPinnedTabState`).
- **Tests:** multi-window workspace/pin changes; verify all windows converge.

### 22. Multi-window managers vs singleton state
- **Shared state:** App Hub state (profile-local singleton) accessed by per-window controllers; Transparent mica prefs (process-global) set by per-window managers.
- **Current owner:** singleton state + multiple window writers.
- **Failure:** last-writer-wins races (e.g. two windows toggling transparency/mica).
- **Severity:** S2.
- **Recommended owner:** **coordinator** serializes writes; `NativeCoordinator` for mica.
- **Resolution:** verify serialization (`#withFlight` pattern in migration; NativeCoordinator for transparency).
- **Tests:** toggle transparency/App Hub edits in two windows simultaneously.

### 23. Private windows vs persistent App Hub / Space state
- **Shared state:** App Hub state + Spaces in PBM.
- **Current owner:** Spaces ephemeral in PBM (correct); App Hub state is profile-local singleton.
- **Failure:** App Hub edits in a private window persisting to profile, or private launches leaking into history.
- **Severity:** S2.
- **Recommended owner:** **PBM = no persistent writes**; App Hub should be read-only or session-scoped in PBM.
- **Resolution:** verify App Hub doesn't write catalog/custom-app state from private windows.
- **Tests:** add custom app in PBM; verify not persisted; launch app in PBM.

### 24. Enterprise policies vs persona presets
- **Shared state:** prefs a preset would set that a policy locks.
- **Current owner:** policy engine (lock) vs persona preset (suggest).
- **Failure:** preset trying to change a locked pref → silent failure or conflict.
- **Severity:** **S1** (managed environments).
- **Recommended owner:** **EnterprisePolicies always wins**.
- **Resolution:** presets must check `Services.policies`/locked state and defer; never override policy (rule).
- **Tests:** apply Work preset under a policy that locks homepage/extensions; verify policy wins.

### 25. Keyboard shortcuts across Firefox / Zen / Astra
- **Shared state:** keysets — Firefox `browser-sets.inc`, Zen `ZenKeyboardShortcuts.mjs` (`zen.keyboard.shortcuts.version`), DevTools `key-shortcuts.ftl`, Astra commands (`cmd_zenReadAloud`, `cmd_zenSearchOpenTabs`, `cmd_astraOpen*`).
- **Current owner:** Zen KBS manager merges/rebinds; Astra remaps Inspector C→L.
- **Failure:** collisions (e.g. Ctrl+Shift+I page-info vs inspector), duplicate accelerators.
- **Severity:** S2.
- **Recommended owner:** **Zen KBS** is single source of truth; validate no duplicate accel.
- **Resolution:** shortcut conflict validator (Batch source validators); document reserved keys.
- **Tests:** enumerate all keysets; assert unique accelerators; verify remaps.

### 26. Accessibility semantics across XUL and HTML controls
- **Shared state:** ARIA/role on mixed XUL + HTML custom controls (App Hub, Suraksha, Spaces, theme picker).
- **Current owner:** each component.
- **Failure:** unlabeled controls, focus traps, missing roles → screen-reader gaps.
- **Severity:** S2 (S1 for GOV accessibility requirements).
- **Recommended owner:** each Astra/Zen component must meet ARIA baseline.
- **Resolution:** a11y audit of all custom panels; keyboard + AT pass.
- **Tests:** NVDA/JAWS/VoiceOver/Orca on App Hub/Suraksha/Spaces/welcome.

### 27. Native updates vs Astra branding / update endpoints
- **Shared state:** AUS URL (`updates.astra-browser.app`), channel `unofficial`, `--enable-unverified-updates`, MAR keys.
- **Current owner:** Astra (retargeted).
- **Failure:** update to wrong/unsigned artifact; rollback failure; branding vs Mozilla update logic mismatch.
- **Severity:** **S1** (integrity).
- **Recommended owner:** **Astra release infra** with signed MAR.
- **Resolution:** move to verified updates + signed MAR before GOV/CORP claims (Batch 5).
- **Tests:** full update + rollback from prior build; tamper test.

### 28. Firefox Account identity vs Astra branding
- **Shared state:** FxA identity strings, Sync UI, `about:dialog` version (shows Firefox base).
- **Current owner:** Mozilla FxA; Astra branding on chrome.
- **Failure:** implying Astra owns the account/sync ("Astra Sync") — false + potential ToS issue.
- **Severity:** **S1** (legal/trust).
- **Recommended owner:** **Mozilla** owns FxA/Sync; label truthfully.
- **Resolution:** never rebrand FxA as Astra Sync (rules 12–13); disclose Firefox Account.
- **Tests:** review all Sync/account strings for accurate attribution.

### 29. DevTools shortcuts vs normal-user shortcuts
- **Shared state:** F12/Ctrl+Shift+* accelerators.
- **Current owner:** DevTools + Zen KBS.
- **Failure:** normal users triggering DevTools; or Astra remaps breaking dev muscle memory.
- **Severity:** S3.
- **Recommended owner:** **DevTools defaults** for advanced tier; beginner tier hides but doesn't remove.
- **Resolution:** two UX levels (Developer Hub); keep native shortcuts intact; document remaps.
- **Tests:** verify F12 works; verify beginner tier doesn't lose functionality.

### 30. Media playback vs tab suspension
- **Shared state:** playing tab vs tab-unloader/Energy/RAM Saver/`unloadOnLowMemory`.
- **Current owner:** Zen tab-unloader + Astra savers + Firefox low-memory unload.
- **Failure:** suspending a playing/PiP tab stops media.
- **Severity:** S2.
- **Recommended owner:** **media/Media-Session state** protects tab from all suspension paths.
- **Resolution:** single "is this tab protected?" check honored by unloader, Energy Saver, RAM Saver, and `browser.tabs.unloadOnLowMemory`.
- **Tests:** play audio/video/PiP; force low-memory + idle + high-tab-count; verify never suspended.

---

## Cross-conflict themes
1. **Two session stores (#19)** and **enterprise-vs-preset (#24)** are the S1 architectural risks to resolve first.
2. **Media protection (#11–#14, #30)** needs a *single* "protected tab" predicate shared by every suspension/throttle path.
3. **Sensitive-site compatibility (#10)** and **update integrity (#27)** gate any CORP/GOV/media marketing claim.
4. **A11y + l10n on custom panels (#20, #26)** must pass before accessibility/Indian-language claims.
