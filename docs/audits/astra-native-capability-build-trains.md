# Astra Native Capability Build Trains

> **Audit-only planning document.** No features implemented, no flags flipped, no builds
> triggered. Baseline `feature/astra-migration-profiles` @ `1d27263`.
>
> Each batch is scoped to fit a single ~3-hour installer build with maximum user value and
> contained blast radius. Batches are ordered by risk and dependency.

## Global rules for every batch
- Firefox is the canonical backend; Zen owns tab/sidebar/Space; Astra adds experience + truthful presentation.
- Every new panel/feature: **lazy import + static fallback + feature flag** that can disable it.
- Never block `browser.xhtml` startup. Never reduce sandbox/Fission/site-isolation/Safe Browsing.
- No new telemetry. No fabricated claims. Enterprise policy always wins.
- Proposed feature-flag names are **suggestions** (not created in this pass).

---

## BATCH 0 — RUNTIME VERIFICATION (no code changes)
**Purpose:** convert PACKAGED → RUNTIME TESTED on a real installer build. This is the
prerequisite for every claim in the matrix.

- **Capabilities:** all already-packaged natives + Zen/Astra features (PDF, Reader/Read-Aloud,
  Translations + model download, Screenshots, Downloads+SMART Guard, Bookmarks, Tab search, PiP,
  WebRTC perms, Spellcheck, Containers, DevTools, EnterprisePolicies load, EME/Widevine, HW
  decode, Spaces, vertical tabs, sidebar, glance, split-view, folders, compact, Transparent Mode,
  Energy/RAM Saver, Suraksha, App Hub, Migration, Welcome, session/crash restore).
- **Source modules affected:** none (verification only).
- **Feature flags:** none.
- **Failure containment:** n/a (observation).
- **Expected diff size:** 0.
- **Source validators:** `./mach lint zen`; jar/manifest presence check; pref-load sanity.
- **Installer runtime tests (matrix):** per OS (Win first; Linux/macOS as available):
  1. Cold start ≤ target; `browser.xhtml` loads with Suraksha/App Hub/Spaces present.
  2. Open+annotate+print a PDF; save-as-PDF.
  3. Reader + Read-Aloud (voice list).
  4. Download a translation model; translate offline afterward.
  5. Visible + full-page screenshot; save + copy.
  6. Download flow + Safe Browsing block + SMART Guard notice.
  7. `%` tab search; Astra tab-search command.
  8. PiP a video; switch tabs; verify not suspended.
  9. Meet + Zoom call (cam/mic/screen-share) 30 min; verify ICE prefs OK.
  10. DevTools all panels; remapped Inspector; Browser Toolbox.
  11. EME playback (Netflix/Prime): CDM download, playback, ETP/uBlock compat, PBM.
  12. Containers; profiles create/switch/import; PBM blocks.
  13. Crash-restore with N spaces/folders/split-views (conflict #19).
  14. Energy/RAM Saver with a playing tab (conflicts #11/#13/#30).
  15. EnterprisePolicies: drop a `policies.json`, verify `about:policies`.
- **Rollback:** n/a.
- **Dependencies:** completed installer build (obj dir is currently partial).
- **Belongs together:** it is a single verification pass; nothing is combined risk-wise.
- **Must not combine:** do not mix code changes into Batch 0 — it must measure the baseline.

---

## BATCH 1 — LOW-RISK NATIVE EXPOSURE
**Purpose:** surface mature natives via clear entrypoints; no backend changes.

- **Capabilities:** Reader/Read-Aloud shortcut (exists — polish), PDF/Student shortcut labels,
  Translation entrypoint (Indian-language emphasis), Developer Hub *launcher* (beginner names →
  native DevTools), accessibility/language entrypoints, profile/media **status** entrypoints,
  certificate-visibility surface, tab-search command polish.
- **Source modules likely affected:** `src/zen/common/modules/AstraPhase1Actions.mjs`,
  `zen-commands.inc.xhtml`, `zen-sets.js`, menu/toolbar markup, `locales/*` (l10n ids). No engine
  backend edits.
- **Feature flags (suggested):** `astra.hub.developer.enabled`, `astra.shortcuts.student.enabled`,
  `astra.status.media.enabled` — each defaults safe-off until tested, then on.
- **Failure containment:** each entrypoint lazy + guarded; failure hides the button, never blocks startup.
- **Expected diff size:** small (mostly markup/commands/l10n).
- **Source validators:** lint; l10n coverage check; shortcut-conflict validator (conflict #25).
- **Installer tests:** each new entrypoint opens the correct native surface; keyboard + AT reachable; PBM behavior.
- **Rollback:** flip flags off / remove menu entries.
- **Dependencies:** Batch 0 green.
- **Belongs together:** all are thin wrappers over verified natives → same low-risk class.
- **Must not combine:** anything that writes new persistent state (that's Batch 2+).

---

## BATCH 2 — PERSONA ONBOARDING
**Purpose:** Simple/Student/Developer/Work/Entertainment/Custom presets + reversible choices.

- **Capabilities:** persona selection in Welcome; Space templates; App Hub visibility presets;
  toolbar/appearance suggestions; persist `astra.persona.selected`.
- **Source modules likely affected:** `src/zen/welcome/ZenWelcome.mjs`, `ZenSpacePresets.mjs`,
  `ZenSpaceCreation.mjs`, App Hub state/visibility, `AstraSpaceAppBridge.mjs`, l10n.
- **Feature flags (suggested):** `astra.persona.enabled`, `astra.persona.selected`.
- **Failure containment:** preset application reads policy first (conflict #24), applies only
  unlocked prefs; failure falls back to Simple; never creates profiles implicitly.
- **Expected diff size:** medium.
- **Source validators:** lint; assert presets touch only allowed knobs; policy-precedence test.
- **Installer tests:** each preset → correct Spaces/App-Hub/toolbar; switch presets (reversible);
  under a locking policy, policy wins; no data duplication.
- **Rollback:** clear `astra.persona.selected` → Simple.
- **Dependencies:** Batch 0 + Batch 1 (entrypoints), Spaces verified.
- **Belongs together:** presets share the same suggestion engine + guardrails.
- **Must not combine:** enterprise foundations (Batch 4) — presets must not imply managed status.

---

## BATCH 3 — WORKFLOW INTEGRATION
**Purpose:** deepen per-audience workflows over verified natives.

- **Capabilities:** Student tools (Study/Research/Classes wiring to PDF/Reader/Translate/PiP);
  Developer Hub (beginner+advanced tiers, localhost/project launcher, testing-profile shortcut);
  Media Readiness panel (truthful DRM/HW/PiP status; consider enabling `zen.mediacontrols` after
  test); Managed-Browser status panel (read-only); command/search integration (Astra actions in
  urlbar).
- **Source modules likely affected:** `AstraPhase1Actions.mjs`, `ZenUBGlobalActions.sys.mjs`,
  Spaces bridge, new status panels (lazy + fallback), `src/zen/media/ZenMediaController.mjs`
  (enable path only), preferences UI.
- **Feature flags (suggested):** `astra.studenttools.enabled`, `astra.devhub.enabled`,
  `astra.media.readiness.enabled`, `astra.managed.status.enabled`, `zen.mediacontrols.enabled`
  (flip after test).
- **Failure containment:** each panel lazy + static fallback; media protection predicate shared
  across Energy/RAM Saver + unloader (conflicts #11/#13/#30) — must land here.
- **Expected diff size:** medium–large.
- **Source validators:** lint; a11y/l10n checks on new panels; media-protection unit checks.
- **Installer tests:** each workflow end-to-end; media never suspended while playing; managed
  panel reflects live policy; DRM status truthful.
- **Rollback:** per-flag disable.
- **Dependencies:** Batches 0–2; media protection resolution.
- **Belongs together:** all are integration over verified natives with shared panel/flag pattern.
- **Must not combine:** update/signing changes (Batch 4/5) — different risk domain.

---

## BATCH 4 — ENTERPRISE FOUNDATIONS
**Purpose:** make the packaged policy engine usable + documented.

- **Capabilities:** ship sample `distribution/policies.json` template; Astra-branded ADMX/ADML;
  admin/deployment docs; Managed-Browser status (full); certificate/proxy/DoH visibility; update
  controls (channel/pin) exposure.
- **Source modules likely affected:** `configs/` (new distribution template + ADMX — *not this
  pass*), docs, `about:policies` surfacing, status panel.
- **Feature flags (suggested):** `astra.enterprise.docs`, `astra.managed.status.enabled`.
- **Failure containment:** policy engine already native; additions are files/docs/read-only UI.
- **Expected diff size:** medium (mostly config/docs).
- **Source validators:** validate `policies.json` against `policies-schema.json`; ADMX schema check.
- **Installer tests:** deploy policy file + GPO; verify locks, diagnostics, managed indicator;
  cert import; proxy/DoH override.
- **Rollback:** remove distribution files.
- **Dependencies:** Batch 0 (policy load verified).
- **Belongs together:** all enterprise deployment surface.
- **Must not combine:** government hardening (Batch 5) — that needs external audit.

---

## BATCH 5 — GOVERNMENT HARDENING
**Purpose:** prerequisites for any GOV positioning (preview only).

- **Capabilities:** **signed/verified updates** (replace `--enable-unverified-updates`), MAR
  signing verification + rollback proof; telemetry/update/offline documentation; offline/admin
  workflows; local (non-uploading) crash diagnostics decision; independent security-audit
  prerequisites; Indian-language dictionary/langpack packaging verification; accessibility audit.
- **Source modules likely affected:** mozconfig/build infra (update signing), packaging, docs.
  (Build/infra — outside audit scope; planned here.)
- **Feature flags:** n/a (build/infra).
- **Failure containment:** staged; update-signing must be validated end-to-end before release.
- **Expected diff size:** large (infra).
- **Source validators:** MAR signature verification; update+rollback test harness.
- **Installer tests:** signed update + rollback + tamper test; offline install/run; AT + Indian-language pass.
- **Rollback:** revert to prior signed build.
- **Dependencies:** Batch 4; external security audit.
- **Belongs together:** integrity + compliance are one program.
- **Must not combine:** consumer feature work — different reviewers/sign-off.

---

## BATCH 6 — FUTURE PLATFORM SYSTEMS
**Purpose:** long-horizon platform capabilities (do not conflate with current natives).

- **Capabilities:** independent **Astra account**; independent **Sync** (only if it does not
  rebrand Firefox Sync — rules 12/13); mobile continuity; remote configuration.
- **Source modules likely affected:** new backend services (not in this repo yet).
- **Feature flags:** heavily gated, off by default.
- **Failure containment:** entirely optional; must not touch FxA identity or claim to be it.
- **Expected diff size:** very large (new platform).
- **Source validators:** security review of any new service; no hidden remote services (rule 23).
- **Installer tests:** account/sync isolation; opt-in only; no forced account.
- **Rollback:** feature-flag off; no data migration required.
- **Dependencies:** everything above; legal review.
- **Belongs together:** these define a new Astra platform tier.
- **Must not combine:** with any batch that ships to CORP/GOV before audit.

---

## Combination guardrails (what must NOT ship together)
- **Batch 0 alone** — never bundle code changes with baseline verification.
- **Presets (2) ≠ enterprise (4)** — presets must not imply managed/certified status.
- **Workflow (3) ≠ update signing (5)** — different risk domain and reviewers.
- **DRM/media exposure ≠ any marketing claim** — status only until independently proven.
- **Anything touching sessions (Spaces/window-sync) ≠ anything touching migration/profiles in the
  same build** — both write persistence; isolate to keep crash-restore (#19) debuggable.
