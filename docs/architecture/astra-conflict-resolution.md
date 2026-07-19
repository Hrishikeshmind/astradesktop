# Astra Conflict Resolution Design (Phase 1)

> Source identity: `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19`
> Baseline branch: `architecture/astra-capability-rfcs`
> Baseline HEAD: `29d95dd9ee311331f328e4c57162bddc7a900d36`
>
> One stable `ASTRA-CONFLICT-###` ID per row; never reused or renumbered. Each row is an
> **enforceable constraint** with a named canonical owner, tagged with affected capability IDs.
> Severity: **S1** startup/data-loss/security · **S2** feature breakage · **S3** UX/perf · **S4** cosmetic.
> Rows 001–030 reconcile the 30 rows of `docs/audits/astra-capability-conflict-map.md`; row 031 is
> newly discovered in this pass.
>
> **Resolution status:** `RESOLVED_BY_DESIGN` = an accepted design-level constraint exists (runtime
> verification deferred to the relevant batch). It is an architecture constraint only — **not**
> implementation proof, enforcement proof, source-test proof, packaging proof, or runtime proof.
> No capability is `BLOCKED_ON_CONFLICT` because every referenced conflict has an accepted design
> resolution.

## Conflicts

### ASTRA-CONFLICT-001 — Firefox sidebar vs Zen vertical tabs (map #1, S2)
- Systems: native `#sidebar-box` / `sidebar.verticalTabs` vs Zen `zen.tabs.vertical`.
- Constraint: **Zen owns the tab rail**; keep `sidebar.verticalTabs` locked `false`; Firefox sidebar limited to web/extension panels.
- Affected: ASTRA-CAP-013.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-024.

### ASTRA-CONFLICT-002 — Native horizontal tabs vs Zen tabs (map #2, S2)
- Systems: `#tabbrowser-tabs` patches vs Zen vertical model.
- Constraint: single tab model (Zen); re-validate `tab-js.patch`/`tabbrowser-js.patch` against engine before build.
- Affected: ASTRA-CAP-013, ASTRA-CAP-014.
- Status: RESOLVED_BY_DESIGN. Highest-risk patches flagged in the patch inventory.

### ASTRA-CONFLICT-003 — Profiles vs Spaces (map #3, S3; + upstream dual profile systems)
- Systems: SelectableProfileService / ToolkitProfileService (data isolation) vs `gZenWorkspaces` (tab grouping).
- Constraint: **keep separate with naming discipline** — Profile = isolated data; Space = tab organization within one profile. Presets configure Spaces, never profiles silently. Account for upstream dual-profile concurrency/custom-dir risk.
- Affected: ASTRA-CAP-050, ASTRA-CAP-051, ASTRA-CAP-014.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-011 (CONFLICT row).

### ASTRA-CONFLICT-004 — Profiles vs private windows (map #4, S3)
- Constraint: keep profile create/import blocked in PBM (`isPrivateMigrationBlocked`); show explanatory message, not a silent no-op.
- Affected: ASTRA-CAP-051, ASTRA-CAP-052, ASTRA-CAP-032 (testing profiles).
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-005 — Migration vs profile creation (map #5, S2)
- Constraint: single import entrypoint per flow; welcome sets `isStartupMigration=false`; profile creation via `about:newprofile` only.
- Affected: ASTRA-CAP-051, ASTRA-CAP-052, ASTRA-CAP-053.
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-006 — Migration vs Sync (map #6, S2)
- Constraint: **never label import as Sync**; import = one-time copy, Sync = continuous (FxA); do not auto-enable Sync after import.
- Affected: ASTRA-CAP-052, ASTRA-CAP-053, ASTRA-CAP-054.
- Status: RESOLVED_BY_DESIGN. See also ASTRA-EXCLUSION-008.

### ASTRA-CONFLICT-007 — App Hub vs native pinned sites / taskbar tabs (map #7, S3)
- Constraint: **App Hub = discovery/launch**, Zen essentials = persistent pinned, taskbar tabs = OS integration; App Hub "add to essentials" rather than a 4th store.
- Affected: (cross-cutting App Hub surface; no numbered capability).
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-021.

### ASTRA-CONFLICT-008 — Suraksha vs native protections UI (map #8, S2)
- Constraint: **Firefox owns backend + canonical toggles**; Suraksha is read + deep-link only; adapters read live state and defer writes to native surfaces.
- Affected: ASTRA-CAP-055, ASTRA-CAP-056, ASTRA-CAP-057, ASTRA-CAP-058.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-022.

### ASTRA-CONFLICT-009 — uBlock vs Enhanced Tracking Protection (map #9, S2)
- Constraint: **ETP is baseline (always on)**, uBlock is the user-controllable layer; per-site uBlock disable must not require touching ETP.
- Affected: ASTRA-CAP-055, ASTRA-CAP-061, ASTRA-CAP-036.
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-010 — uBlock/ETP vs DRM, banking, authentication sites (map #10, S1)
- Constraint: ETP with documented allowances; keep `firstparty.isolate=false`; maintain a tested compatibility checklist (UPI/netbanking 3DS/OAuth/Netflix/Prime); Suraksha per-site disable.
- Affected: ASTRA-CAP-043, ASTRA-CAP-054, ASTRA-CAP-055, ASTRA-CAP-056, ASTRA-CAP-058, ASTRA-CAP-061.
- Status: RESOLVED_BY_DESIGN. Gates media/CORP/GOV claims.

### ASTRA-CONFLICT-011 — Energy Saver vs streaming (map #11, S2)
- Constraint: Energy Saver must **exempt active A/V tabs**; never throttle a tab with active media/Media Session.
- Affected: ASTRA-CAP-043, ASTRA-CAP-046, ASTRA-CAP-047, ASTRA-CAP-048, ASTRA-CAP-015.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-016.

### ASTRA-CONFLICT-012 — Energy Saver vs Meet/Zoom calls (map #12, S1)
- Constraint: **WebRTC session wins**; exempt tabs with active `getUserMedia`/`getDisplayMedia`; validate ICE hardening (`ice.no_host`/`default_address_only`) against Meet/Zoom TURN.
- Affected: ASTRA-CAP-016.
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-013 — RAM Saver vs audio/video tabs (map #13, S2)
- Constraint: media state protects the tab; tab-unloader must skip audible/PiP/Media-Session tabs.
- Affected: ASTRA-CAP-015, ASTRA-CAP-046, ASTRA-CAP-049.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-016.

### ASTRA-CONFLICT-014 — RAM Saver vs downloads/uploads (map #14, S3)
- Constraint: `minimizeMemoryUsage` is GC-only; verify it does not abort active transfers; consider skipping while active downloads exist.
- Affected: ASTRA-CAP-011.
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-015 — Transparent Mode vs hardware acceleration (map #15, S3)
- Constraint: `AstraTransparencyManager` owns mica prefs and must respect HW-accel state; graceful fallback (Acrylic→Mica→Astra Glass) when compositor off / GPU blocklisted.
- Affected: ASTRA-CAP-045.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-023.

### ASTRA-CONFLICT-016 — Transparent Mode vs browser-content opacity (map #16, S3)
- Constraint: keep `browser.tabs.allow_transparent_browser=false`; chrome glass separated from web content.
- Affected: (cross-cutting Astra chrome).
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-017 — Compact Mode vs AI / sidebar panels (map #17, S3)
- Constraint: Zen compact mode manages chrome; panels pin above the hover layer; hover reveal must not trap focus.
- Affected: ASTRA-CAP-018.
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-018 — XULStore vs sidebar defaults (map #18, S3)
- Constraint: prefs for Zen chrome, xulstore for native customizable toolbar only; `ZenUIMigration` reconciles on upgrade.
- Affected: (cross-cutting chrome).
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-019 — SessionStore vs Spaces recovery (map #19, S1)
- Systems: Firefox `sessionstore.jsonlz4` **and** Zen `zen-sessions.jsonlz4`.
- Constraint: **single reconciled pipeline** — Zen SessionStore patch is authority for space/tab mapping while delegating window/tab payload to Firefox sessionstore; verify `SessionStore-sys-mjs.patch` reconciliation; crash-restore matrix (Batch 0).
- Affected: ASTRA-CAP-014, ASTRA-CAP-060.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-003 (CONFLICT row). Highest-risk patch cluster.

### ASTRA-CONFLICT-020 — Fluent localization vs nested toolbar DOM (map #20, S3)
- Constraint: every custom control needs a `data-l10n-id` + fallback; audit App Hub/Suraksha/Migration panels for l10n coverage; verify RTL/long-string.
- Affected: ASTRA-CAP-018, ASTRA-CAP-041, ASTRA-CAP-062.
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-021 — Shared-global vs window-global modules (map #21, S2)
- Constraint: document each module scope — global `sys` module = one instance; window managers = per-window with `gZenWindowSync` coordinator; verify propagation paths.
- Affected: ASTRA-CAP-014, ASTRA-CAP-041, ASTRA-CAP-050.
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-022 — Multi-window managers vs singleton state (map #22, S2)
- Constraint: a coordinator serializes writes (`#withFlight` pattern; NativeCoordinator for mica) to avoid last-writer-wins races.
- Affected: ASTRA-CAP-014, ASTRA-CAP-041, ASTRA-CAP-050.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-021, ASTRA-STATE-023.

### ASTRA-CONFLICT-023 — Private windows vs persistent App Hub / Space state (map #23, S2)
- Constraint: **PBM = no persistent writes**; App Hub is read-only/session-scoped in private windows; verify no catalog/custom-app writes from PBM.
- Affected: ASTRA-CAP-058.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-021.

### ASTRA-CONFLICT-024 — Enterprise policies vs persona presets (map #24, S1)
- Constraint: **EnterprisePolicies always wins**; presets check `Services.policies`/locked state and defer; never override a locked pref.
- Affected: ASTRA-CAP-033, ASTRA-CAP-034, ASTRA-CAP-035, ASTRA-CAP-036, ASTRA-CAP-037, ASTRA-CAP-038, ASTRA-CAP-039, ASTRA-CAP-040, ASTRA-CAP-041, ASTRA-CAP-042, ASTRA-CAP-059.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-017.

### ASTRA-CONFLICT-025 — Keyboard shortcuts across Firefox / Zen / Astra (map #25, S2)
- Constraint: **Zen KBS is the single source of truth**; a shortcut-conflict validator asserts unique accelerators; document reserved keys and the Inspector C→L remap.
- Affected: ASTRA-CAP-007, ASTRA-CAP-013, ASTRA-CAP-019 through ASTRA-CAP-032.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-025.

### ASTRA-CONFLICT-026 — Accessibility semantics across XUL and HTML controls (map #26, S2/S1-GOV)
- Constraint: every Astra/Zen custom control meets an ARIA baseline; a11y audit + AT pass on App Hub/Suraksha/Spaces/welcome.
- Affected: ASTRA-CAP-018, ASTRA-CAP-025, ASTRA-CAP-041.
- Status: RESOLVED_BY_DESIGN.

### ASTRA-CONFLICT-027 — Native updates vs Astra branding / endpoints (map #27, S1)
- Constraint: **Astra release infra with signed MAR**; move to verified updates before GOV/CORP claims; full update+rollback+tamper test.
- Affected: ASTRA-CAP-039, ASTRA-CAP-060.
- Status: RESOLVED_BY_DESIGN. See ASTRA-EXCLUSION-007. State: ASTRA-STATE-018.

### ASTRA-CONFLICT-028 — Firefox Account identity vs Astra branding (map #28, S1)
- Constraint: **Mozilla owns FxA/Sync; label truthfully**; never rebrand as "Astra Sync"; disclose Firefox Account.
- Affected: ASTRA-CAP-054.
- Status: RESOLVED_BY_DESIGN. See ASTRA-EXCLUSION-008. State: ASTRA-STATE-012.

### ASTRA-CONFLICT-029 — DevTools shortcuts vs normal-user shortcuts (map #29, S3)
- Constraint: DevTools defaults for advanced tier; beginner tier hides but does not remove; keep native shortcuts reachable; document remaps.
- Affected: ASTRA-CAP-019, ASTRA-CAP-020, ASTRA-CAP-021, ASTRA-CAP-022, ASTRA-CAP-023, ASTRA-CAP-024, ASTRA-CAP-030, ASTRA-CAP-031.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-025, ASTRA-STATE-029.

### ASTRA-CONFLICT-030 — Media playback vs tab suspension (map #30, S2)
- Constraint: a **single "is this tab protected?" predicate** honored by tab-unloader, Energy Saver, RAM Saver, and `browser.tabs.unloadOnLowMemory`.
- Affected: ASTRA-CAP-015, ASTRA-CAP-016, ASTRA-CAP-043, ASTRA-CAP-046, ASTRA-CAP-047, ASTRA-CAP-048, ASTRA-CAP-049.
- Status: RESOLVED_BY_DESIGN. State: ASTRA-STATE-016.

### ASTRA-CONFLICT-031 — Native backend source not vendored in the architecture worktree (newly discovered, S3/process)
- Systems: this architecture worktree contains only the Astra/Zen overlay (`src/`, `prefs/`, `configs/`, `locales/`, `mods/`); the vendored Firefox `engine/` tree is absent.
- Constraint: native backend evidence stays at **E0** until re-verified against the pinned engine checkout at build time; native paths cited from the capability matrix (baseline `1d27263`) are marked accordingly; no capability may claim native `E1+` evidence from this worktree alone.
- Affected: all 62 capabilities (native evidence dimension).
- Status: RESOLVED_BY_DESIGN (evidence policy recorded in the registry header and per-record).

## Cross-conflict themes (from the audit)

1. **S1 architectural risks to resolve first:** ASTRA-CONFLICT-019 (dual session stores) and ASTRA-CONFLICT-024 (policy vs presets).
2. **Media protection** (ASTRA-CONFLICT-011/012/013/014/030) needs a single "protected tab" predicate (ASTRA-STATE-016).
3. **Sensitive-site compatibility** (ASTRA-CONFLICT-010) and **update integrity** (ASTRA-CONFLICT-027) gate any CORP/GOV/media claim.
4. **A11y + l10n on custom panels** (ASTRA-CONFLICT-020/026) gate accessibility/Indian-language claims.
