# ASTRA-CAP-044 — OpenH264 / Windows media decoding

> Design document only. No runtime source, prefs, manifests, packaging, policies, localization, or installers were modified.
> Baseline: `architecture/astra-capability-rfcs` @ `29d95dd9ee311331f328e4c57162bddc7a900d36`
> Canonical source: `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19` index 44

## Identity

| Field | Value |
|---|---|
| Stable ID | `ASTRA-CAP-044` |
| Slug | `openh264-windows-media-decoding` |
| Title | OpenH264 / Windows media decoding |
| Canonical group | Entertainment |
| Secondary groups | _none_ |
| Audiences | `ENT`, `NORM`, `STU` |
| Classification | `USE_NATIVE` |
| Supporting classifications | `EXPOSE_NATIVE`, `INTEGRATE` |
| Integration mode | `NATIVE_ONLY` |
| Batch | Batch 0 |
| Readiness status | `DISCOVERED` |
| Source / package / runtime status | `UNVERIFIED` / `UNVERIFIED` / `UNVERIFIED` |
| Dependencies | _none_ |

### Why this classification

Primary classification `USE_NATIVE` is taken exactly from the human-approved 62-item catalog (index 44). Supporting tags from the capability matrix are recorded as notes, not extra registry rows.

### Integration notes

- OpenH264 GMP is a runtime download (Cisco); offline caveat applies.

## Canonical source

| Field | Value |
|---|---|
| source_id | `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19` |
| canonical_index | 44 |
| canonical_title | OpenH264 / Windows media decoding |
| canonical_group | Entertainment |
| canonical_primary_classification | `USE_NATIVE` |

## Matrix evidence

| Field | Value |
|---|---|
| blocks | `F2` |
| mapping_status | `PARTIAL` |
| notes | Canonical slice of matrix block F2 (codecs/decode). |

## Owners

| Role | Owner |
|---|---|
| Native owner | Gecko media platforms (WMF/ffvpx) + OpenH264 GMP |
| UX owner | Native (Firefox) |

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

- `engine/dom/media/platforms/`
- `OpenH264 GMP`

## Proposed Astra / Zen entrypoints

None required (NATIVE_ONLY).

### Related overlay / prefs paths (worktree presence only; not E2+)

- _none proposed beyond discoverability / NATIVE_ONLY packaging reachability_

## State

| Field | Value |
|---|---|
| state_status | `REFERENCED` |
| state_refs | `ASTRA-STATE-015` |

- `ASTRA-STATE-015` — owner: Gecko GMPProvider (profile GMP dir) (canonical text only in [astra-state-ownership.md](../architecture/astra-state-ownership.md))

## Conflicts and resolution rules

- `ASTRA-CONFLICT-011` — Energy Saver vs streaming (map #11, S2). Status: RESOLVED_BY_DESIGN (architecture constraint only; not runtime proof). See [astra-conflict-resolution.md](../architecture/astra-conflict-resolution.md).
- `ASTRA-CONFLICT-030` — Media playback vs tab suspension (map #30, S2). Status: RESOLVED_BY_DESIGN (architecture constraint only; not runtime proof). See [astra-conflict-resolution.md](../architecture/astra-conflict-resolution.md).

Applicable rule: RESOLVED_BY_DESIGN means an accepted architecture constraint exists. It is **not** proof that implementation, enforcement, source tests, packaging, or runtime behavior passed.

## Feature flag

`NATIVE_NO_NEW_FLAG` (name: null, status: VERIFIED) — prefer native command/pref for rollback.

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

`local settings`

### 2. Network behavior

`runtime download dependency`

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
