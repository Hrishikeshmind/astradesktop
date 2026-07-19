# Astra Capability Exclusions — Decision-Constraint Ledger (Phase 0)

> Source identity: `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19`
> Baseline branch: `architecture/astra-capability-rfcs`
> Baseline HEAD: `29d95dd9ee311331f328e4c57162bddc7a900d36`
>
> This is a **decision-constraint ledger, not a forced fixed-size catalog**. It preserves
> every explicit `DEFER` / `REJECT` decision found in the seven audit documents. Stable IDs
> (`ASTRA-EXCLUSION-###`) are never reused or renumbered.

## Validator extraction rule (documented, machine-checked)

The validator (`scripts/validate_astra_architecture_docs.cjs`) independently extracts every
explicit decision clause from the seven audit documents using this exact rule:

- Scan each audit document line-by-line for the standalone uppercase tokens `DEFER` or
  `REJECT` (word-boundary match).
- **Exclude** the classification-legend line (a line containing both `` `DEFER` `` and
  `` `REJECT` `` as back-tick-wrapped legend tokens).
- **Exclude** classification-summary table rows (lines matching `^\s*\|\s*(DEFER|REJECT)\s*\|`).

Every remaining occurrence (a `file:line` pair) must be cited in at least one ledger entry's
`source_locations`. Merges are permitted and must be documented via `duplicate_or_overlap_key`.

At this baseline the rule yields **11 explicit decision lines**, all in
`astra-firefox-capability-matrix.md`: lines 194, 373, 530, 636, 661, 686, 737, 740, 784, 865,
872. All other DEFER/REJECT text (lines 32, 887, 888) is legend/summary metadata and is
excluded by rule.

## Historical planning-summary status

The historical **"5 DEFER / 4 REJECT"** planning tally in the capability matrix
(`Classification summary`, lines 887–888) is marked:

    UNRECONCILED_PLANNING_SUMMARY

It is a hand-tally with grouped examples (e.g. "Second PDF/translation/DevTools/DRM/profile/
migration backends" is one summary bucket covering multiple explicit clauses; "GOV compliance/
audit" and "deceptive claims" have no standalone uppercase DEFER/REJECT token and appear only
as prose / prohibited-claims policy). Per the human-approved v7 decision, Checkpoint A is **not**
blocked by this count mismatch: every explicit block-level clause below is preserved, and every
uncertain merge is marked `PARTIAL`.

---

## Ledger entries

### ASTRA-EXCLUSION-001
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: A6 (Bookmarks + reading-list equivalent)
- source_locations: astra-firefox-capability-matrix.md:194
- decision_title: No second bookmark system
- classification: REJECT
- clause_summary: "USE_NATIVE; REJECT any second bookmark system (rule)." Places is the single canonical bookmark/history store.
- reason: A duplicate bookmark backend would fork state ownership away from Places and break sync/workspace mapping.
- affected_capabilities: ASTRA-CAP-012
- duplicate_or_overlap_key: reject-second-backend/bookmarks
- reopen_condition: Only if Places is replaced upstream or an approved architecture RFC supersedes rule.
- temporary_or_permanent: permanent
- human_mapping_status: VERIFIED

### ASTRA-EXCLUSION-002
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: B1 (DevTools toolbox)
- source_locations: astra-firefox-capability-matrix.md:373
- decision_title: No second DevTools stack
- classification: REJECT
- clause_summary: "REJECT any second DevTools stack (rule 9)." Astra adds a beginner tier (Developer Hub) over native DevTools, never a replacement.
- reason: A parallel DevTools implementation would duplicate a huge native surface and diverge from web-platform behavior.
- affected_capabilities: ASTRA-CAP-019, ASTRA-CAP-020, ASTRA-CAP-021, ASTRA-CAP-022, ASTRA-CAP-023, ASTRA-CAP-024, ASTRA-CAP-025, ASTRA-CAP-026, ASTRA-CAP-027, ASTRA-CAP-028, ASTRA-CAP-029, ASTRA-CAP-030, ASTRA-CAP-031, ASTRA-CAP-032
- duplicate_or_overlap_key: reject-second-backend/devtools
- reopen_condition: Only via approved architecture RFC.
- temporary_or_permanent: permanent
- human_mapping_status: VERIFIED

### ASTRA-EXCLUSION-003
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: E2 (Local multi-profile support)
- source_locations: astra-firefox-capability-matrix.md:636
- decision_title: No second profile system
- classification: REJECT
- clause_summary: "USE_NATIVE + EXPOSE_NATIVE. REJECT any second profile system (rule 4)." Uses toolkit SelectableProfileService only.
- reason: A second profile system would collide with the already-fragile dual upstream profile services (ToolkitProfileService vs SelectableProfileService).
- affected_capabilities: ASTRA-CAP-051
- duplicate_or_overlap_key: reject-second-backend/profiles
- reopen_condition: Only via approved architecture RFC after upstream profile consolidation.
- temporary_or_permanent: permanent
- human_mapping_status: VERIFIED

### ASTRA-EXCLUSION-004
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: E3 (Migration engine)
- source_locations: astra-firefox-capability-matrix.md:661
- decision_title: No second migration engine
- classification: REJECT
- clause_summary: "USE_NATIVE + ASTRA_UX_WRAPPER. REJECT any second migration engine (rule 5)." Astra Migration Center is a UI shell over the native wizard.
- reason: Parsing browser DBs/folders directly would duplicate native MigrationUtils and risk data corruption.
- affected_capabilities: ASTRA-CAP-052, ASTRA-CAP-053
- duplicate_or_overlap_key: reject-second-backend/migration
- reopen_condition: Only via approved architecture RFC.
- temporary_or_permanent: permanent
- human_mapping_status: VERIFIED

### ASTRA-EXCLUSION-005
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: F1 (Widevine / EME / DRM)
- source_locations: astra-firefox-capability-matrix.md:740
- decision_title: No second DRM stack
- classification: REJECT
- clause_summary: "USE_NATIVE + INTEGRATE (Media Readiness). REJECT any second DRM stack (rule 11)."
- reason: DRM is proprietary/externally licensed; a parallel stack is infeasible and legally risky.
- affected_capabilities: ASTRA-CAP-043
- duplicate_or_overlap_key: reject-second-backend/drm
- reopen_condition: Only if licensing model changes and an approved RFC exists.
- temporary_or_permanent: permanent
- human_mapping_status: VERIFIED

### ASTRA-EXCLUSION-006
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: F3 (Casting)
- source_locations: astra-firefox-capability-matrix.md:784
- decision_title: Casting not shipped as a first-party feature
- classification: REJECT
- clause_summary: "REJECT for now (only if natively supported later) / DEFER." Native Chromecast/AirPlay mirroring is not present; only web Remote Playback/Presentation APIs exist. This single clause carries both a REJECT (for now) and a DEFER (until native support) token.
- reason: No native casting backend exists; Zen "Share" is workspace/folder export, not AV casting.
- affected_capabilities: none (casting is outside the 62 actionable canonical items)
- duplicate_or_overlap_key: casting-not-a-feature
- reopen_condition: If a native casting backend is added upstream/in-tree.
- temporary_or_permanent: temporary
- human_mapping_status: VERIFIED

### ASTRA-EXCLUSION-007
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: C4 (Update service) and G7 (Updates & recovery)
- source_locations: astra-firefox-capability-matrix.md:530, astra-firefox-capability-matrix.md:872
- decision_title: GOV signed/verified-update hardening deferred
- classification: DEFER
- clause_summary: "ENABLE_AFTER_TEST + DEFER (signed-update hardening for GOV)" (C4, line 530) and "ENABLE_AFTER_TEST / DEFER for GOV signing" (G7, line 872). Both express the same policy: replacing `--enable-unverified-updates` with signed/verified updates is deferred to Batch 5.
- reason: Update-signing hardening is a build/infra change requiring an independent security audit; out of scope for design-only Phase 0.
- affected_capabilities: ASTRA-CAP-039, ASTRA-CAP-060
- duplicate_or_overlap_key: defer/gov-update-signing
- reopen_condition: Batch 5 execution with external security audit sign-off.
- temporary_or_permanent: temporary
- human_mapping_status: PARTIAL

### ASTRA-EXCLUSION-008
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: E4 (Firefox Account / Sync)
- source_locations: astra-firefox-capability-matrix.md:686
- decision_title: Independent Astra Sync deferred
- classification: DEFER
- clause_summary: "USE_NATIVE + DEFER (independent Astra Sync is a future platform system, Batch 6)." Existing Firefox Account/Sync is used and must not be rebranded.
- reason: An independent account/sync platform is a large, legally-sensitive future system (Batch 6).
- affected_capabilities: ASTRA-CAP-054
- duplicate_or_overlap_key: defer/independent-sync
- reopen_condition: Batch 6 platform work with legal review.
- temporary_or_permanent: temporary
- human_mapping_status: VERIFIED

### ASTRA-EXCLUSION-009
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: F1 (Widevine / EME / DRM), field 15 (security/privacy implications)
- source_locations: astra-firefox-capability-matrix.md:737
- decision_title: Defer hard DRM claims (licensing-sensitive)
- classification: DEFER
- clause_summary: "Widevine is proprietary/externally licensed — licensing-sensitive (DEFER hard claims)." Only truthful DRM status may be shown.
- reason: Marketing/hard claims about DRM support are licensing- and evidence-gated; only a truthful Media Readiness status is allowed.
- affected_capabilities: ASTRA-CAP-043
- duplicate_or_overlap_key: defer/drm-claims
- reopen_condition: Only after per-service runtime evidence and legal review.
- temporary_or_permanent: temporary
- human_mapping_status: VERIFIED

### ASTRA-EXCLUSION-010
- source_document: docs/audits/astra-firefox-capability-matrix.md
- source_block: G5 (Zen Mods row)
- source_locations: astra-firefox-capability-matrix.md:865
- decision_title: Zen Mods marketplace off by default (deferred)
- classification: DEFER
- clause_summary: "Zen Mods | ... | zen.themes.disable-all=true (off) | ... | DEFER (off by default) | later." Marketplace mods are disabled by default and deferred.
- reason: Third-party mod marketplace is a safety/rollout risk; kept off for beta.
- affected_capabilities: none (Zen Mods is outside the 62 actionable canonical items)
- duplicate_or_overlap_key: defer/zen-mods
- reopen_condition: Post-beta with a mod safety/review model.
- temporary_or_permanent: temporary
- human_mapping_status: VERIFIED

---

## Coverage summary

- Explicit decision lines extracted by rule: 194, 373, 530, 636, 661, 686, 737, 740, 784, 865, 872 (11 lines).
- Ledger entries: 10 (`ASTRA-EXCLUSION-001` … `ASTRA-EXCLUSION-010`).
- Merges: `ASTRA-EXCLUSION-007` merges lines 530 + 872 (same GOV update-signing decision), marked `PARTIAL`.
- Classification split among ledger entries: REJECT = 6 (001–006), DEFER = 4 (007–010). Note line
  784 (ASTRA-EXCLUSION-006) is dual-token (REJECT + DEFER) and is recorded once under REJECT.
- Historical "5 DEFER / 4 REJECT" summary: `UNRECONCILED_PLANNING_SUMMARY` (see above).
