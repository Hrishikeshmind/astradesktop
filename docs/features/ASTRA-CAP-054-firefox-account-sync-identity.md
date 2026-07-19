# ASTRA-CAP-054 — Existing Firefox Account / Sync identity

> Design document only. No runtime source, prefs, manifests, packaging, policies, localization, or installers were modified.
> Baseline: `architecture/astra-capability-rfcs` @ `29d95dd9ee311331f328e4c57162bddc7a900d36`
> Canonical source: `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19` index 54

## Identity

| Field | Value |
|---|---|
| Stable ID | `ASTRA-CAP-054` |
| Slug | `firefox-account-sync-identity` |
| Title | Existing Firefox Account / Sync identity |
| Canonical group | Identity & Separation |
| Secondary groups | _none_ |
| Audiences | `NORM`, `CORP` |
| Classification | `USE_NATIVE` |
| Supporting classifications | _none_ |
| Integration mode | `NATIVE_ONLY` |
| Batch | Batch 0 |
| Readiness status | `DISCOVERED` |
| Source / package / runtime status | `UNVERIFIED` / `UNVERIFIED` / `UNVERIFIED` |
| Dependencies | _none_ |

### Why this classification

Primary classification `USE_NATIVE` is taken exactly from the human-approved 62-item catalog (index 54). Supporting tags from the capability matrix are recorded as notes, not extra registry rows.

### Integration notes

- Do not rebrand; preserve Firefox Account / Sync identity; independent Astra Sync DEFERRED to Batch 6 (ASTRA-EXCLUSION-008).

## Canonical source

| Field | Value |
|---|---|
| source_id | `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19` |
| canonical_index | 54 |
| canonical_title | Existing Firefox Account / Sync identity |
| canonical_group | Identity & Separation |
| canonical_primary_classification | `USE_NATIVE` |

## Matrix evidence

| Field | Value |
|---|---|
| blocks | `E4` |
| mapping_status | `VERIFIED` |
| notes | 1:1 with matrix block E4 (Firefox Account/Sync); normalized primary to USE_NATIVE. |

## Owners

| Role | Owner |
|---|---|
| Native owner | Mozilla FxA / Sync |
| UX owner | Native (Mozilla); Astra branding on chrome only |

## Evidence blocks

### native_evidence

| Field | Value |
|---|---|
| level | `E0` |
| references | _empty (allowed at E0)_ |

**Evidence status:** UNVERIFIED — UPSTREAM REVISION NOT PINNED. The vendored Firefox `engine/` tree is absent from this architecture worktree (ASTRA-CONFLICT-031). Matrix/audit path names are documentary only and do **not** raise evidence above E0.

### astra_integration_evidence

| Field | Value |
|---|---|
| level | `E0` |
| references | _empty (allowed at E0)_ |

**Evidence status:** Design-only. Overlay file presence (if listed below) is not E1/E2 wiring proof, packaging proof, or installer SourceStamp proof. `For NATIVE_ONLY, Astra evidence will later mean packaging/reachability inside a verified Astra installer — not a new wrapper backend.`

### Readiness note

Current readiness `DISCOVERED` is preserved from the registry. Existence of this feature document does **not** advance readiness to `DESIGN_READY_FOR_IMPLEMENTATION`.

## Upstream implementation locations

Evidence status for every `engine/**` path: **UNVERIFIED — UPSTREAM REVISION NOT PINNED**.

- `engine/services/sync/`
- `engine/services/fxaccounts/`

## Proposed Astra / Zen entrypoints

None required (NATIVE_ONLY). Do not rebrand Firefox Account / Sync.

### Related overlay / prefs paths (worktree presence only; not E2+)

- `prefs/zen/workspaces.yaml (services.sync.engine.workspaces verified)`

## State

| Field | Value |
|---|---|
| state_status | `REFERENCED` |
| state_refs | `ASTRA-STATE-012` |

- `ASTRA-STATE-012` — owner: Mozilla FxA / Sync (canonical text only in [astra-state-ownership.md](../architecture/astra-state-ownership.md))

## Conflicts and resolution rules

- `ASTRA-CONFLICT-006` — Migration vs Sync (map #6, S2). Status: RESOLVED_BY_DESIGN (architecture constraint only; not runtime proof). See [astra-conflict-resolution.md](../architecture/astra-conflict-resolution.md).
- `ASTRA-CONFLICT-028` — Firefox Account identity vs Astra branding (map #28, S1). Status: RESOLVED_BY_DESIGN (architecture constraint only; not runtime proof). See [astra-conflict-resolution.md](../architecture/astra-conflict-resolution.md).

Applicable rule: RESOLVED_BY_DESIGN means an accepted architecture constraint exists. It is **not** proof that implementation, enforcement, source tests, packaging, or runtime behavior passed.

## Feature flag

`NATIVE_PREF` `services.sync.engine.workspaces` (status: VERIFIED) — verified present in worktree prefs/ where applicable.

## Lazy-load / startup plan

Follow App Hub V3 / Suraksha patterns:

1. Must **not** block `browser.xhtml` startup.
2. Any new Astra panel/command loads lazily after first user action or `popupshown`; prefer static fallback shell where a panel is introduced.
3. Bootstrap failures are non-fatal (try/catch); hide the surface rather than brick chrome.
4. `NATIVE_ONLY: no new Astra startup module. Native command/pref/policy remains the activation path.`

## Source test plan

| Check | Result |
|---|---|
| Architecture validator (`scripts/validate_astra_architecture_docs.cjs`) includes this ID/slug | NOT TESTED (document-level; suite run at Checkpoint C) |
| Registry field parity (id/title/group/classification/integration_mode/state/conflict) | NOT TESTED |
| No invented wrapper for NATIVE_ONLY | NOT TESTED |
| Pref/policy names match registry only | NOT TESTED |

SOURCE_IMPLEMENTATION_COMPLETE: **NOT_APPLICABLE (NATIVE_ONLY — no Astra backend implementation required)**

## Manual runtime test plan

All results are **NOT TESTED** until Batch 0 on a correct installer (BuildID + SourceStamp). Do not infer PASS from audit prose.

| Scenario | Result |
|---|---|
| Primary user path for this capability | NOT TESTED |
| Private window behavior | NOT TESTED |
| Multi-window behavior | NOT TESTED |
| Failure / disable / policy override path | NOT TESTED |

## Rollback plan

Use the existing native command, native pref, enterprise policy, or remove any discoverability-only surface. Do not invent an Astra pref solely for rollback.

## Minimum beta safety sections

### 1. Data touched

`authentication-sensitive`

### 2. Network behavior

`native Firefox endpoint`

### 3. Private-window policy

`fully supported`

### 4. Primary failure behavior

Native UI/error path applies. No Astra manager failure mode. Browsing remains usable.

### 5. Minimum accessibility gate

| Gate | Status |
|---|---|
| Keyboard activation | NOT TESTED |
| Focus behavior | NOT TESTED |
| Accessible name | NOT TESTED |
| Escape/back behavior | NOT TESTED |
| 200% zoom status | NOT TESTED |

## Open questions

1. When will the pinned Firefox engine checkout be available so native_evidence can move beyond E0?
2. Which exact installer BuildID/SourceStamp will be used for Batch 0 runtime proof?
3. Are any packaging gaps (ADMX, dictionaries, CDM/models offline behavior) accepted for the current beta MVP?

## Explicit non-goals

- Do not invent native source files, prefs, policies, package mappings, BuildIDs, SourceStamps, or runtime results.
- Do not raise evidence levels above E0 without matching pinned source/packaging/runtime proof.
- Do not treat RESOLVED_BY_DESIGN as implementation, enforcement, or runtime proof.
- Do not create an Astra manager, wrapper backend, duplicated store, or ASTRA_PREF_NEW solely for schema satisfaction.
- SOURCE_IMPLEMENTATION_COMPLETE is NOT_APPLICABLE until/unless packaging/reachability evidence inside a verified Astra installer is recorded.
- Do not rebrand Firefox Account / Sync as Astra Sync.
