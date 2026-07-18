# Astra Firefox Preference Audit

> **Audit-only. No pref is modified in this pass.** Baseline
> `feature/astra-migration-profiles` @ `1d27263`.
>
> Source of truth: `prefs/**/*.yaml` (declarative overrides compiled into
> `engine/browser/app/profile/zen.js`). Upstream defaults from Firefox 149
> `StaticPrefList.yaml` / `all.js` / `firefox.js`.

## Reading the tables
Columns: pref · upstream default · Astra default · lock · usage/feature · platform · privacy/security · performance · compatibility · policy-override · recommended action.
Where a field is unremarkable it is abbreviated. **⚠ = flagged** (see Flags section).

---

## 1. Privacy & anti-tracking (`prefs/firefox/browser.yaml`, `prefs/privatefox/privacy.yaml`)

| Pref | Upstream | Astra | Lock | Notes / recommendation |
|---|---|---|---|---|
| `browser.contentblocking.category` | standard | **strict** | no | ETP strict. Good; ensure Suraksha reflects. Keep. |
| `privacy.trackingprotection.enabled` | false(std) | true | no | Keep. |
| `privacy.trackingprotection.{cryptomining,fingerprinting,socialtracking,emailtracking}.enabled` | mixed | true | no | Keep; strong default. |
| `network.cookie.cookieBehavior` | 5 | **5** | no | Matches upstream TCP. Keep. |
| `dom.security.https_only_mode` / `_pbm` | false | **true** | no | ⚠ May surprise on HTTP-only intranet/gov sites → verify enterprise override + exception UX. |
| `privacy.globalprivacycontrol.enabled` | true | true | no | Keep. |
| `privacy.query_stripping.enabled` / `strip_on_share.enabled` | mixed | true | no | Keep; no page-load cost. |
| `privacy.sanitize.sanitizeOnShutdown` | false | **true** | no | ⚠ **High-impact**: with `clearOnShutdown.cookies=true` users are logged out every restart. Sessions/history/formdata kept. Confirm this is intended default vs opt-in; big NORM-UX surprise. |
| `privacy.clearOnShutdown.cookies` / `cache` / `offlineApps` | false | **true** | no | ⚠ See above. Consider making cookie-clear opt-in per persona. |
| `privacy.resistFingerprinting` | false | false | no | Off (correct — RFP breaks layout); letterboxing off. Keep. |
| `geo.enabled` | true | **false** | no | ⚠ Breaks location features (maps "near me"). Document; consider prompt instead of hard-off. |
| `dom.push.enabled` / `connection.enabled` | true | **false** | no | ⚠ Disables Web Push → no site notifications (WhatsApp Web, etc.). Conflicts with `dom.webnotifications.enabled=true`. See Flags (contradiction). |
| `beacon.enabled` | true | false | no | Minor analytics breakage risk. Acceptable. |
| `device.sensors.enabled` | false | false | no | Keep. |
| `media.peerconnection.ice.no_host` / `default_address_only` / `proxy_only_if_behind_proxy` | false/false/false | **true** | no | ⚠ WebRTC hardening — must validate against Meet/Zoom/Teams (conflict #12). |
| `security.tls.enable_0rtt_data` | true | **false** | no | Good (replay safety); tiny latency cost. Keep. |
| `network.trr.mode` / `uri` / `bootstrapAddr` | 0 / "" | **2 / Cloudflare / 1.1.1.1** | no | ⚠ **DoH default to Cloudflare**. Privacy-forward but GOV/CORP-sensitive and a third-party dependency. Must be policy-overridable (it is, via `DNSOverHTTPS`) and disclosed. |
| `media.autoplay.default` | 1 | **5** | no | Block audio+video autoplay. ⚠ ENT: may over-block wanted playback. |
| `media.autoplay.blocking_policy` | 0 | **2** | no | ⚠ Strictest. Duplicated across `browser.yaml`(default=5) and `privacy.yaml`(blocking_policy=2). Verify combined effect. |

## 2. Telemetry / data reporting (`prefs/privatefox/privacy.yaml`)
All telemetry/health/coverage/normandy/shield prefs set **false and locked**
(`toolkit.telemetry.*`, `datareporting.*`, `app.shield.optoutstudies.enabled`,
`app.normandy.*`, `toolkit.coverage.*`). `toolkit.telemetry.server="data:,"` locked.
- **Consequence:** no data upload. Strong GOV/privacy posture.
- ⚠ **Duplication:** `toolkit.telemetry.unified`, `datareporting.healthreport.uploadEnabled`,
  `datareporting.policy.dataSubmissionEnabled` are declared **twice** (top of file locked, and
  again near line 243 unlocked). The unlocked later duplicates could weaken the lock depending
  on merge order → **flag for dedup**.
- Recommendation: keep locked-off; remove duplicate unlocked entries.

## 3. Performance / network / cache (`prefs/firefox/performance.yaml`, `prefs/fastfox/smoothscroll.yaml`)

| Pref | Upstream | Astra | Notes |
|---|---|---|---|
| `browser.lowMemoryResponseMask` | 0 | 3 (Win/macOS) | Aggressive low-mem response; platform-gated. Verify no premature unloads. |
| `gfx.canvas.accelerated` / `layers.gpu-process.enabled` / `media.hardware-video-decoding.enabled` | true | true | ✅ **Restored to upstream** (comments show prior force-disable removed). Good. |
| `javascript.options.ion` / `baselinejit` | true | true | ✅ Restored; asm.js left at upstream. Good. |
| `browser.cache.*` | dynamic | dynamic (-1) | ✅ Restored dynamic sizing (prior 48 MB cap removed). Good. |
| `browser.sessionhistory.max_total_viewers` | -1 | -1 | ✅ Restored (prior cap of 1 removed — that had crippled back/forward). Good. |
| `network.trr.*` | — | DoH on | see §1. |
| `network.http.connection-*` timeouts | 250/90/300 | matched upstream | ✅ Restored (prior 0 retry removed). Good. |
| `network.http.max-persistent-connections-per-server` | 6 | 6 | Matches upstream. |
| `general.smoothScroll.pages` | true | **false** | Minor; saves CPU. |
| `layout.frame_rate.precise` | false | false | Keep. |
| `dom.ipc.processCount` | platform-adaptive | **not overridden** | ✅ Comment confirms prior wrong override removed (restores Fission/e10s adaptivity). Good. |
| `image.mem.max_decoded_image_kb` | varies | 98304 | Reasonable. |

**Overall performance posture: healthy.** The file explicitly documents reverting earlier
aggressive overrides back to Firefox defaults — this satisfies architectural rule 15 (no
aggressive network/process prefs without benchmarks). Remaining items are conservative.

⚠ **Duplication across files:** `general.smoothScroll` and `general.smoothScroll.pages`
appear in both `performance.yaml` and `fastfox/smoothscroll.yaml` (same values) → dedup.

## 4. URL bar / search (`prefs/firefox/urlbar.yaml`, `prefs/firefox/india.yaml`, `prefs/firefox/newtab.yaml`)

| Pref | Astra | Notes |
|---|---|---|
| `browser.search.region` | IN | India default. Keep. |
| `intl.accept_languages` | en-IN,en,hi-IN,hi | ✅ Indian-language ordering. |
| `browser.urlbar.quicksuggest.*` / sponsored | false **locked** | ✅ No sponsored suggestions. Keep. |
| `browser.urlbar.suggest.openpage` | **false** | Intentional — `%` is explicit tab search path (matrix A7). |
| `browser.formfill.enable` | **false** | ⚠ Disables form autofill history. May surprise NORM users; verify vs password/autofill expectations. |
| `browser.urlbar.trending`/`weather`/`quickactions` | false | Lean. Keep. |
| `browser.newtabpage.activity-stream.*` topsites/stories/weather/wallpapers | false | Lean newtab (Astra NTP). Keep. |
| `browser.search.suggest.enabled.private` | true | Suggestions in PBM — mild privacy tradeoff; acceptable, documented in `india.yaml`. |

## 5. Extensions / security (`prefs/firefox/extensions.yaml`, `prefs/privatefox/disablemozilla.yaml`)
- `xpinstall.signatures.required=true` → ✅ signed extensions only. Keep (rule: don't reduce security).
- Recommendation/discovery/CFR/promo prefs off → lean, less nagware. Keep.
- `browser.taskbarTabs.enabled=true` → interacts with App Hub/essentials (conflict #7).
- ⚠ `termsofuse.bypassNotification=true`, `browser.aboutwelcome.enabled=false` — Astra owns onboarding; ensure no legal notice is being suppressed that must be shown.

## 6. Media / DRM (`prefs/zen/media.yaml`, `prefs/firefox/pip.yaml`, `prefs/firefox/fullscreen.yaml`)
- `media.eme.enabled=true`, `image.avif.enabled=true (locked)`, `image.jxl.enabled=true` — DRM + modern codecs. ⚠ JXL is behind upstream default; verify build support.
- PiP: toggle on, urlbar button locked on, tab-switch-PiP off. Keep.
- Fullscreen: instant transitions, warning suppressed (`warning.timeout=0`, `delay=-1`). ⚠ Suppressing the fullscreen warning slightly reduces spoofing protection; acceptable for UX but note for GOV.

## 7. Zen feature prefs (spot-flags only)
- `zen.themes.disable-all=true` — marketplace mods off by default (safe rollout). Keep.
- `zen.mediacontrols.enabled=false` — global media controls UI off; candidate for ENABLE_AFTER_TEST.
- `astra.ramsaver.enabled=true`, `threshold-mb=3072` — verify threshold sane on 4 GB machines.
- `astra.theme.transparent.enabled=true` + `widget.windows.mica*` owned by manager — see conflicts #15/#16/#22. Correctly separated from `browser.tabs.allow_transparent_browser=false`.
- `zen.injections.match-urls` locked to Astra GitHub on official builds — verify this injection is benign (site theming on your own domain) and cannot run on arbitrary sites.
- `services.sync.engine.workspaces=true` — enables Zen workspaces sync engine (must ship `ZenWorkspacesEngine`; see packaging doc).

## 8. Update / branding (`prefs/zen/updates.yaml`)
- `astra.updates.show-update-notification=true`; release-notes URL → GitHub. Fine.
- ⚠ Build-level `--enable-unverified-updates` (mozconfig) is **not a pref** but is the single
  biggest security-consequence item — tracked in packaging + conflict #27.

---

## FLAGS (consolidated)

### Duplicate prefs
1. `toolkit.telemetry.unified`, `datareporting.healthreport.uploadEnabled`,
   `datareporting.policy.dataSubmissionEnabled` — declared twice in `privatefox/privacy.yaml`
   (locked early, unlocked late). **Dedup; keep locked.**
2. `general.smoothScroll` / `.pages` — in both `performance.yaml` and `fastfox/smoothscroll.yaml`.
3. `browser.search.suggest.enabled(.private)` — in both `india.yaml` and `urlbar.yaml`.
4. `media.videocontrols.picture-in-picture.*` — split across `pip.yaml` and `urlbar.yaml`.
5. `browser.ml.linkPreview.enabled=false` — declared twice in `firefox/browser.yaml` and `firefox/ai.yaml`.

### Obsolete / verify-against-149
- `image.jxl.enabled=true` — JPEG-XL support varies; verify the build actually decodes JXL, else this is a no-op.
- `gfx.webrender.compositor` guarded with a searchfox pin comment — re-verify against 149 rev.

### Contradictory prefs
1. **Notifications:** `dom.webnotifications.enabled=true` **but** `dom.push.enabled=false` and
   `permissions.default.desktop-notification=2` (block). Net effect: notification API present,
   push transport off, default-deny. This is defensible (blocks spam) but **internally
   confusing** — a site can't use push, and notifications are blocked by default. Document the
   intended behavior; align the three.
2. **AI/ML:** `browser.ml.chat.enabled=true` (+ shortcuts/sidebar/menu true) with a comment
   claiming "ML/chat off by default." Comment contradicts value. **Fix comment or value.**
3. **Autoplay:** `media.autoplay.default=5` (browser.yaml) + `media.autoplay.blocking_policy=2`
   (privacy.yaml) — two strict layers; confirm combined behavior is intended.

### Prefs enabled without confirmed packaged feature support
- `zen.sidebar.enabled` / `zen.sidebar.extensions.enabled` — YAML-only; **no runtime consumer
  found** in `src/`. Either dead prefs or future feature. Flag.
- `services.sync.engine.workspaces=true` — depends on `ZenWorkspacesEngine` which is **not in
  the overlay tree**; verify it exists in the engine checkout at build, else the pref enables a
  missing engine.
- `browser.tabs.notes.enabled=false` — native tab notes off; ok (not relied on).

### Prefs locked without strong reason (review)
- `sidebar.verticalTabs=false locked`, `browser.tabs.splitView.enabled=false locked` —
  intentional (Zen owns these); reason is sound, keep but document.
- `browser.urlbar.suggest.topsites=true locked`, `quicksuggest.*=false locked` — fine.
- `image.avif.enabled=true locked` — fine.
- `sidebar.verticalTabs.dragToPinPromo.dismissed=true locked` (disablemozilla) — cosmetic; ok.

### Aggressive performance overrides
- **None outstanding.** `performance.yaml` documents reverting previous aggressive overrides to
  upstream. `browser.lowMemoryResponseMask=3` and `tabs.unloadOnLowMemory=true` are the only
  aggressive items — validate they don't unload playing/needed tabs (conflicts #13/#30).

### Security reductions
- `full-screen-api.warning.timeout=0` (minor).
- Build `--enable-unverified-updates` (major; not a pref).
- **No reduction** of sandbox/Fission/site-isolation/Safe Browsing found (rule 14 upheld).

### Content-transparency risks
- `astra.theme.transparent.enabled=true` + mica prefs — chrome-only; web content transparency
  kept off (`browser.tabs.allow_transparent_browser=false`). ✅ Correctly separated.

### Platform-specific prefs used globally (verify conditions)
- Most platform prefs are correctly `condition:`-gated (`XP_WIN`, `XP_MACOSX`, `MOZ_WIDGET_GTK`).
- `browser.lowMemoryResponseMask` gated to `XP_MACOSX || XP_WIN` ✅.
- Verify none of the `zen.widget.macos.*` / `widget.windows.mica.*` leak to the wrong platform
  (they carry conditions — spot-check after build).

### Policy-override behavior
- Privacy/telemetry locks use `locked: true` → cannot be changed by user, **but EnterprisePolicies
  can still `lockPref`/override**. DoH, proxy, updates, extensions all have corresponding policies
  (`DNSOverHTTPS`, `Proxy`, `AppUpdate*`, `Extensions`), so managed environments retain control.
  ✅ No pref blocks policy control.

---

## Recommended actions (no changes made this pass)
1. **Resolve the 3 contradictions** (notifications, AI-comment, autoplay) — doc or value fixes.
2. **Dedup the 5 duplicate groups**, keeping the locked/stricter variant.
3. **Reconsider `sanitizeOnShutdown` + cookie-clear as a global default** — likely should be
   persona-scoped (opt-in for Simple; on for a "Private" persona) to avoid logging users out.
4. **Disclose DoH-to-Cloudflare** prominently and keep it policy-overridable.
5. **Remove or wire up dead prefs** (`zen.sidebar.enabled`, verify `ZenWorkspacesEngine`).
6. **Validate `geo.enabled=false` and `formfill.enable=false`** against NORM expectations.
7. Treat `--enable-unverified-updates` as a **release-blocking** item for CORP/GOV.
