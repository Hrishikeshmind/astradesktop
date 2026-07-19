# ASTRA-CAP-037 — Proxy and DoH policy controls

> Design document only. No runtime source, prefs, manifests, packaging, policies, localization, or installers were modified.
> Baseline: `architecture/astra-capability-rfcs` @ `29d95dd9ee311331f328e4c57162bddc7a900d36`
> Canonical source: `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19` index 37

## Identity

| Field | Value |
|---|---|
| Stable ID | `ASTRA-CAP-037` |
| Slug | `proxy-and-doh-policy-controls` |
| Title | Proxy and DoH policy controls |
| Canonical group | Corporate |
| Secondary groups | `Privacy & Security` |
| Audiences | `CORP`, `GOV` |
| Classification | `ASTRA_UX_WRAPPER` |
| Supporting classifications | `USE_NATIVE`, `EXPOSE_NATIVE`, `INTEGRATE` |
| Integration mode | `ASTRA_UX_WRAPPER` |
| Batch | Batch 4 |
| Readiness status | `DISCOVERED` |
| Source / package / runtime status | `UNVERIFIED` / `UNVERIFIED` / `UNVERIFIED` |
| Dependencies | _none_ |

### Why this classification

Primary classification `ASTRA_UX_WRAPPER` is taken exactly from the human-approved 62-item catalog (index 37). Supporting tags from the capability matrix are recorded as notes, not extra registry rows.

### Integration notes

- DoH default (Cloudflare) must be policy-overridable and disclosed.

## Canonical source

| Field | Value |
|---|---|
| source_id | `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19` |
| canonical_index | 37 |
| canonical_title | Proxy and DoH policy controls |
| canonical_group | Corporate |
| canonical_primary_classification | `ASTRA_UX_WRAPPER` |

## Matrix evidence

| Field | Value |
|---|---|
| blocks | `C3` |
| mapping_status | `PARTIAL` |
| notes | Sub-aspect of matrix block C3 (proxy/DoH policy). |

## Owners

| Role | Owner |
|---|---|
| Native owner | Firefox netwerk + ProxyPolicies |
| UX owner | Astra managed status over native proxy/DoH |

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

**Evidence status:** Design-only. Overlay file presence (if listed below) is not E1/E2 wiring proof, packaging proof, or installer SourceStamp proof. `Astra integration evidence remains E0 until wiring/entrypoint references are pinned.`

### Readiness note

Current readiness `DISCOVERED` is preserved from the registry. Existence of this feature document does **not** advance readiness to `DESIGN_READY_FOR_IMPLEMENTATION`.

## Upstream implementation locations

Evidence status for every `engine/**` path: **UNVERIFIED — UPSTREAM REVISION NOT PINNED**.

- `engine/browser/components/enterprisepolicies/ProxyPolicies.sys.mjs`
- `engine/netwerk/dns/`

## Proposed Astra / Zen entrypoints

Proposed managed/status UX over native Proxy + DoH prefs/policies.

### Related overlay / prefs paths (worktree presence only; not E2+)

- `prefs/firefox/performance.yaml (network.trr.mode verified)`

## State

| Field | Value |
|---|---|
| state_status | `REFERENCED` |
| state_refs | `ASTRA-STATE-014`, `ASTRA-STATE-017` |

- `ASTRA-STATE-014` — owner: Firefox netwerk (prefs) + ProxyPolicies (canonical text only in [astra-state-ownership.md](../architecture/astra-state-ownership.md))
- `ASTRA-STATE-017` — owner: Firefox EnterprisePolicies (`policies.json` + Windows GPO) (canonical text only in [astra-state-ownership.md](../architecture/astra-state-ownership.md))

## Conflicts and resolution rules

- `ASTRA-CONFLICT-024` — Enterprise policies vs persona presets (map #24, S1). Status: RESOLVED_BY_DESIGN (architecture constraint only; not runtime proof). See [astra-conflict-resolution.md](../architecture/astra-conflict-resolution.md).

Applicable rule: RESOLVED_BY_DESIGN means an accepted architecture constraint exists. It is **not** proof that implementation, enforcement, source tests, packaging, or runtime behavior passed.

## Feature flag

`NATIVE_PREF` `network.trr.mode` (status: VERIFIED) — verified present in worktree prefs/ where applicable.

## Lazy-load / startup plan

Follow App Hub V3 / Suraksha patterns:

1. Must **not** block `browser.xhtml` startup.
2. Any new Astra panel/command loads lazily after first user action or `popupshown`; prefer static fallback shell where a panel is introduced.
3. Bootstrap failures are non-fatal (try/catch); hide the surface rather than brick chrome.
4. `Do not introduce a second state owner or eager heavy import.`

## Source test plan

| Check | Result |
|---|---|
| Architecture validator (`scripts/validate_astra_architecture_docs.cjs`) includes this ID/slug | NOT TESTED (document-level; suite run at Checkpoint C) |
| Registry field parity (id/title/group/classification/integration_mode/state/conflict) | NOT TESTED |
| No invented wrapper for NATIVE_ONLY | NOT TESTED |
| Pref/policy names match registry only | NOT TESTED |

SOURCE_IMPLEMENTATION_COMPLETE: **Not claimed. Existing overlay modules (if listed) are presence-only at E0; wiring not E2-verified in this pass.**

## Manual runtime test plan

All results are **NOT TESTED** until Batch 0 on a correct installer (BuildID + SourceStamp). Do not infer PASS from audit prose.

| Scenario | Result |
|---|---|
| Primary user path for this capability | NOT TESTED |
| Private window behavior | NOT TESTED |
| Multi-window behavior | NOT TESTED |
| Failure / disable / policy override path | NOT TESTED |

## Rollback plan

Revert/disable via verified native pref `network.trr.mode` and/or remove Astra discoverability surface. Do not delete native backend.

## Minimum beta safety sections

### 1. Data touched

`enterprise-managed`

### 2. Network behavior

`no network`

### 3. Private-window policy

`fully supported`

### 4. Primary failure behavior

Native failure surfaces its own UI or no-op; browsing remains usable. Astra discoverability/shell failures must hide the surface without blocking browser.xhtml.

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
