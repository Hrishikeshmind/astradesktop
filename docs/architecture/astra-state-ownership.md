# Astra State / Data-Flow Ownership Spec (Phase 1)

> Source identity: `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19`
> Baseline branch: `architecture/astra-capability-rfcs`
> Baseline HEAD: `29d95dd9ee311331f328e4c57162bddc7a900d36`
>
> **Canonical owner free-text lives ONLY in this document** (registry records point here via
> `state_refs` and never duplicate the owner prose). One stable `ASTRA-STATE-###` ID per row.
> IDs are never reused or renumbered.
>
> **CONFLICT rule:** a row with more than one *writer* is a CONFLICT and blocks implementation
> until an accepted resolution exists. Such rows name the resolving `ASTRA-CONFLICT-###`
> constraint from `astra-conflict-resolution.md`; the design-level resolution is accepted, and
> runtime verification is deferred to Batch 0 (so no dependent capability is `BLOCKED_ON_CONFLICT`).
>
> **Worktree caveat:** the vendored Firefox `engine/` tree is not present in this architecture
> worktree; native owners below are cited from the capability matrix (baseline `1d27263`) and the
> present Astra/Zen overlay under `src/`. Native ownership is re-verified in later phases.

## Legend

- **Writers > 1 => CONFLICT** (marked in the *Multi-writer?* column).
- Private-window = behavior in Private Browsing Mode (PBM).
- Persistence = on-disk store or in-memory only.

## State rows

| ID | State item | Canonical owner | Other readers | Other writers | Multi-writer? | Private-window behavior | Multi-window behavior | Persistence | Capability IDs |
|---|---|---|---|---|---|---|---|---|---|
| ASTRA-STATE-001 | Bookmarks & history | Firefox Places (`places.sqlite`) | Bookmarks UI, sidebar, Sync, urlbar, Suraksha | Zen workspace-bookmark mapping table (`zen_bookmarks_workspaces`, separate rows) | No (Places is sole bookmark writer) | PBM history not written; bookmarks profile-wide | Shared DB across windows | `places.sqlite` + `zen_bookmarks_workspaces` | 12, 35, 52, 53 |
| ASTRA-STATE-002 | Downloads list & download-protection state | Firefox Downloads (Places downloads) | Downloads panel, `about:downloads`, Suraksha | Zen SMART Guard (annotates, local heuristics) | No | Private downloads excluded from history | Panel per-window; list shared | Places downloads store | 10, 11, 57 |
| ASTRA-STATE-003 | Session / window / tab restore | **Two owners:** Firefox SessionStore (`sessionstore.jsonlz4`) + Zen ZenSessionStore (`zen-sessions.jsonlz4`) | Recently-closed UI, crash restore | Firefox SessionStore **and** Zen ZenSessionStore | **YES — CONFLICT** (ASTRA-CONFLICT-019) | Private windows excluded from Zen session file | Zen `gZenWindowSync` propagation | `sessionstore.jsonlz4` + `zen-sessions.jsonlz4` | 14, 60 |
| ASTRA-STATE-004 | Workspaces / Spaces membership & active space | Zen `gZenWorkspaces` | Per-window managers, session restore | Zen (+ window sync) | No | Ephemeral in PBM | Per-window cache + `gZenWindowSync` | `zen-sessions.jsonlz4` + `zen.workspaces.active` | 12, 14 |
| ASTRA-STATE-005 | Per-site zoom | Firefox content-prefs | Zoom UI | Firefox content-prefs | No | Same as normal | Per-tab; persists per host | `content-prefs.sqlite` | 18 |
| ASTRA-STATE-006 | Reader / Narrate view state | Firefox Reader/Narrate (transient) | — | — | No | Works in PBM | Per-tab | None (transient) | 6, 7 |
| ASTRA-STATE-007 | Translation models cache & settings | Firefox Translations (profile cache) | Translation UI, India workflows | Firefox Translations (Remote Settings downloads) | No | Standard download flow in PBM | Model cache shared per profile | Profile model cache | 8, 9, 62 |
| ASTRA-STATE-008 | PDF in-document annotation/form/signature state | Firefox pdf.js (in-document only) | — | pdf.js (on save into the document) | No | Works in PBM | Per-tab viewer instance | In-document only (no profile store) | 1, 2, 3, 4, 5 |
| ASTRA-STATE-009 | Site permissions (camera/mic/geo/autoplay/notifications) & clear-site-data | Firefox permissions (`permissions.sqlite`) | Identity panel, Settings, Suraksha | Firefox permissions | No | Ephemeral per private session | Per-tab prompts; global grants | `permissions.sqlite` | 16, 47, 58 |
| ASTRA-STATE-010 | Container contextual identities | Firefox ContextualIdentityService | Container menu, tabs | Firefox ContextualIdentityService | No | Containers not used in PBM | Profile-global identities | `containers.json` | 50 |
| ASTRA-STATE-011 | Local profiles registry | **Two upstream systems:** SelectableProfileService (SQLite) + ToolkitProfileService (`profiles.ini`) | Profiles menu, `about:profiles`, migration | SelectableProfileService **and** ToolkitProfileService | **YES — CONFLICT** (ASTRA-CONFLICT-003, upstream risk) | Profile create/import blocked in PBM | Profile-global singleton | SQLite datastore + `profiles.ini` | 51, 53 |
| ASTRA-STATE-012 | Firefox Account / Sync identity & engines | Mozilla FxA / Sync | Sync UI, `about:dialog` | Mozilla FxA / Sync servers | No | N/A in PBM | Account-global | Mozilla Sync servers + local | 54 |
| ASTRA-STATE-013 | ETP category / Total Cookie Protection / Safe Browsing settings | Firefox privacy/antitracking (prefs) | Suraksha, `about:protections`, identity panel | Firefox (prefs) | No | Applies in PBM | Process-wide | Prefs | 55, 56, 57 |
| ASTRA-STATE-014 | HTTPS-only + DoH/TRR + proxy settings | Firefox netwerk (prefs) + ProxyPolicies | Suraksha, Settings | Firefox (prefs) / EnterprisePolicies (override) | No (policy overrides prefs by precedence) | Applies in PBM (`https_only_mode_pbm`) | Process-wide | Prefs + policy | 37, 59 |
| ASTRA-STATE-015 | EME/Widevine CDM + GMP (OpenH264) install state | Gecko GMPProvider (profile GMP dir) | Media Readiness panel | Gecko (runtime download from Google/Cisco) | No | Verify DRM in PBM (`forceMediaMemoryCache`) | Per-profile GMP dir | Profile GMP dir | 43, 44 |
| ASTRA-STATE-016 | Media playback / Media Session / protected-tab predicate | Gecko mediacontrol + Zen ZenMediaController (in-memory) | Energy Saver, RAM Saver, tab-unloader, `unloadOnLowMemory` | Gecko media stack | No (single "protected" predicate must be authoritative) | Works in PBM | Global media controller | In-memory only | 15, 46, 49 |
| ASTRA-STATE-017 | Enterprise policy state | Firefox EnterprisePolicies (`policies.json` + Windows GPO) | Persona presets (read-only), managed status panel | Admin (policy file / GPO) | No | Can control PBM (`DisablePrivateBrowsing`) | Process-wide | `policies.json` on disk + registry | 33, 34, 35, 36, 37, 38, 39, 40, 41, 42 |
| ASTRA-STATE-018 | Update state / channel / notification | Toolkit updater (Astra host) | Update UI, managed status | Toolkit updater | No | N/A | Process-wide | Update dir + prefs | 39, 60 |
| ASTRA-STATE-019 | Telemetry & crash-report settings | Firefox Telemetry (locked off); crash reporter **not shipped** | Managed status | Firefox (prefs, locked) | No | N/A | Process-wide | Prefs (locked); no crash upload | 40 |
| ASTRA-STATE-020 | Extension install / signature & extension policy state | Firefox add-ons (`extensions.json`) + EnterprisePolicies | Suraksha uBlock adapter, add-ons UI | Firefox add-ons / policy | No | Extensions limited in PBM unless allowed | Profile-global | `extensions.json` + policy | 36, 61 |
| ASTRA-STATE-021 | App Hub state (profile-local singleton) | Astra `AstraAppHubState` | Per-window App Hub controllers | Per-window controllers (writers to a singleton) | Coordinated (ASTRA-CONFLICT-022, ASTRA-CONFLICT-023) | Must be read-only/session-scoped in PBM | Profile-local singleton + per-window controllers | Profile-local custom store | (cross-cutting; App Hub surface) |
| ASTRA-STATE-022 | Suraksha aggregated read-state | Astra `AstraSurakshaManager` (reads native, no own state) | — | None (read/wrapper only) | No | Reflects PBM state | Per-window manager; reads global protections | None (stateless wrapper) | 55, 56, 57, 58, 61 (surfaced) |
| ASTRA-STATE-023 | Transparent Mode mica / glass prefs | Astra `AstraTransparencyManager` (process-global) | Per-window transparency managers | Per-window managers (writers to process-global mica prefs) | Coordinated (ASTRA-CONFLICT-022) | N/A | NativeCoordinator serializes writes | `widget.windows.mica*` prefs | (cross-cutting; Astra chrome) |
| ASTRA-STATE-024 | Sidebar expanded state | Centralized sidebar-expanded-state owner (`zen.view.sidebar-expanded`) | Zen UI, extension sidebar | Zen (pref-driven) | No | Same | Per-window with pref default | Pref (not xulstore) | 13 |
| ASTRA-STATE-025 | Keyboard shortcuts / keyset | Zen KBS (`ZenKeyboardShortcuts`, `zen.keyboard.shortcuts.version`) | Firefox `browser-sets.inc`, DevTools, Astra commands | Zen KBS (merges/rebinds) | No (single source of truth) | Same | Per-window keyset | Prefs / keyset | 7, 13, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 |
| ASTRA-STATE-026 | Spellcheck dictionary selection | Firefox Editor (Hunspell) | Context menu, Settings | Firefox (prefs) | No | Works in PBM | Per-field | Prefs | 17, 62 |
| ASTRA-STATE-027 | Accessibility / reduced-motion / contrast | Gecko/Toolkit platform + design tokens | Zen/Astra chrome | Platform (OS media queries) | No | Same | Process-wide | OS media queries + design-system CSS | 18 |
| ASTRA-STATE-028 | India locale: accept_languages / search region / langpack | Firefox l10n + prefs (`intl.accept_languages`, `browser.search.region`) | Onboarding, India catalog | Firefox (prefs) | No | Same | Process-wide | Prefs + langpack | 62 |
| ASTRA-STATE-029 | DevTools preferences & toolbox state | Firefox DevTools (`devtools.*` prefs) | Developer Hub, toolbox | Firefox DevTools | No | Works in PBM | Per-window toolbox | DevTools prefs | 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 |

## Conflict rows (multiple writers) — resolution pointers

- **ASTRA-STATE-003** (session dual store) → resolved by **ASTRA-CONFLICT-019** (single reconciled pipeline: Zen owns space/tab mapping, delegates window/tab payload to Firefox sessionstore). Runtime proof: Batch 0 crash-restore matrix.
- **ASTRA-STATE-011** (profiles dual upstream) → resolved by **ASTRA-CONFLICT-003** (keep systems separate; Astra never adds a third profile system; account for upstream concurrency/custom-dir risk).
- **ASTRA-STATE-021 / ASTRA-STATE-023** (per-window writers to a singleton/process-global) → resolved by **ASTRA-CONFLICT-022** (coordinator serializes writes) and, for PBM, **ASTRA-CONFLICT-023**.

## Notes

- Rows 021, 023, 024 are cross-cutting subsystem state (App Hub, Transparent Mode, sidebar) that
  are not one of the 62 numbered capabilities but are owned state referenced by conflicts; they are
  listed for completeness and are not required as registry `state_refs`.
- Every registry `state_refs` value resolves to a row above (validator-enforced).
