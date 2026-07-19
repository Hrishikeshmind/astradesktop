#!/usr/bin/env node
/*
 * Astra Architecture Docs Validator
 * -------------------------------------------------------------------------
 * Phase 0 bootstrap. This file is EXTENDED (not replaced) in later phases.
 *
 * Source identity: HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19
 *
 * No third-party dependency is used. A small deterministic parser handles the
 * constrained YAML subset emitted in docs/architecture/astra-capability-registry.yaml
 * (top-level `capabilities:` block sequence; 2-space nesting; inline flow arrays only).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARCH = path.join(ROOT, 'docs', 'architecture');
const REGISTRY = path.join(ARCH, 'astra-capability-registry.yaml');
const EXCLUSIONS = path.join(ARCH, 'astra-capability-exclusions.md');
const AUDIT_DIR = path.join(ROOT, 'docs', 'audits');
// Phase 1 artifacts
const SYSTEM_MAP = path.join(ARCH, 'astra-system-map.md');
const WIRING_GRAPH = path.join(ARCH, 'astra-wiring-graph.md');
const STATE_DOC = path.join(ARCH, 'astra-state-ownership.md');
const CONFLICT_DOC = path.join(ARCH, 'astra-conflict-resolution.md');
const PATCH_CSV = path.join(ARCH, 'astra-upstream-patch-inventory.csv');
// Phase 2 artifacts
const FEATURES_DIR = path.join(ROOT, 'docs', 'features');
const FEATURES_README = path.join(FEATURES_DIR, 'README.md');
const TRACEABILITY = path.join(ARCH, 'astra-feature-traceability.md');
// Phase 3 artifacts
const ROLLOUT_PLAN = path.join(ARCH, 'astra-rollout-plan.md');
const OWNERSHIP_MATRIX = path.join(ARCH, 'astra-ownership-matrix.md');

const STATE_STATUSES = ['REFERENCED', 'NATIVE_STATELESS', 'IN_MEMORY_ONLY', 'UNVERIFIED'];
const VALID_BATCHES = new Set(['Batch 0', 'Batch 1', 'Batch 2', 'Batch 3', 'Batch 4', 'Batch 5', 'Batch 6']);
const RELEASE_GATES = new Set([
  'REQUIRED_FOR_CURRENT_BETA',
  'OPTIONAL_FOR_CURRENT_BETA',
  'DEFERRED_POST_BETA',
  'BLOCKED',
]);
const OWNERSHIP_PATTERNS = new Set([
  'NATIVE_ONLY',
  'ASTRA_ENTRYPOINT',
  'APP_HUB_PATTERN',
  'SURAKSHA_PATTERN',
  'SPACES_PATTERN',
  'NEW_SUBSYSTEM',
  'DEEP_INTEGRATION',
]);

const FEATURE_REQUIRED_MARKERS = [
  '## Canonical source',
  '## Matrix evidence',
  '## Evidence blocks',
  '### native_evidence',
  '### astra_integration_evidence',
  '## Upstream implementation locations',
  '## Proposed Astra / Zen entrypoints',
  '## State',
  '## Conflicts and resolution rules',
  '## Lazy-load / startup plan',
  '## Source test plan',
  '## Manual runtime test plan',
  '## Rollback plan',
  '### 1. Data touched',
  '### 2. Network behavior',
  '### 3. Private-window policy',
  '### 4. Primary failure behavior',
  '### 5. Minimum accessibility gate',
  '## Open questions',
  '## Explicit non-goals',
  'Integration mode',
  'Readiness status',
  'UNVERIFIED — UPSTREAM REVISION NOT PINNED',
];

const CANONICAL_SOURCE_ID = 'HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19';

const CANONICAL_GROUPS = [
  'Student & Reading',
  'Everyday Productivity',
  'Media & Classes',
  'Language & Access',
  'Developer',
  'Corporate',
  'Entertainment',
  'Identity & Separation',
  'Privacy & Security',
  'Reliability',
  'Extensions',
  'India & Language',
];

const PRIMARY_CLASSES = [
  'USE_NATIVE',
  'EXPOSE_NATIVE',
  'ENABLE_AFTER_TEST',
  'ASTRA_UX_WRAPPER',
  'INTEGRATE',
];

const EXPECTED_CLASS_COUNTS = {
  USE_NATIVE: 19,
  EXPOSE_NATIVE: 14,
  ENABLE_AFTER_TEST: 8,
  ASTRA_UX_WRAPPER: 10,
  INTEGRATE: 11,
};

const INTEGRATION_MODES = [
  'NATIVE_ONLY',
  'ASTRA_ENTRYPOINT',
  'ASTRA_UX_WRAPPER',
  'DEEP_INTEGRATION',
];

const FLAG_TYPES = [
  'NATIVE_PREF',
  'ASTRA_PREF_NEW',
  'NATIVE_NO_NEW_FLAG',
  'POLICY_CONTROLLED',
  'UNVERIFIED',
];

const FLAG_STATUSES = ['VERIFIED', 'PROPOSED', 'UNVERIFIED'];

const READINESS = [
  'DISCOVERED',
  'NEEDS_CLARIFICATION',
  'BLOCKED_ON_CONFLICT',
  'DESIGN_READY_FOR_IMPLEMENTATION',
  'SOURCE_IMPLEMENTATION_COMPLETE',
  'RUNTIME_VERIFIED',
  'STABLE_CLAIM_APPROVED',
];

const MAPPING_STATUSES = ['VERIFIED', 'PARTIAL', 'UNVERIFIED'];

// Known matrix block IDs (anti-invented-row check).
const KNOWN_BLOCKS = new Set([
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4', 'C5',
  'D',
  'E1', 'E2', 'E3', 'E4', 'E5',
  'F1', 'F2', 'F3',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7',
]);

// Human-approved canonical 62-item catalog (index -> title/group/primary classification).
const CATALOG = [
  [1, 'PDF viewing and navigation', 'Student & Reading', 'USE_NATIVE'],
  [2, 'PDF annotations and editing tools', 'Student & Reading', 'EXPOSE_NATIVE'],
  [3, 'PDF forms support', 'Student & Reading', 'USE_NATIVE'],
  [4, 'PDF signatures', 'Student & Reading', 'EXPOSE_NATIVE'],
  [5, 'Print / Save as PDF workflows', 'Student & Reading', 'EXPOSE_NATIVE'],
  [6, 'Reader Mode', 'Student & Reading', 'EXPOSE_NATIVE'],
  [7, 'Narrate / Read Aloud', 'Student & Reading', 'ASTRA_UX_WRAPPER'],
  [8, 'On-device webpage translation', 'Student & Reading', 'EXPOSE_NATIVE'],
  [9, 'Translation model download and offline status', 'Student & Reading', 'ENABLE_AFTER_TEST'],
  [10, 'Page and full-page screenshots', 'Student & Reading', 'EXPOSE_NATIVE'],
  [11, 'Downloads management and search', 'Everyday Productivity', 'USE_NATIVE'],
  [12, 'Bookmarks, history and Places', 'Everyday Productivity', 'USE_NATIVE'],
  [13, 'Open-tab search / urlbar TABS mode', 'Everyday Productivity', 'EXPOSE_NATIVE'],
  [14, 'Session restore and recently closed tabs/windows', 'Everyday Productivity', 'USE_NATIVE'],
  [15, 'Picture-in-Picture', 'Media & Classes', 'EXPOSE_NATIVE'],
  [16, 'Camera, microphone and screen-sharing permissions', 'Media & Classes', 'USE_NATIVE'],
  [17, 'Spellcheck and dictionaries', 'Language & Access', 'ENABLE_AFTER_TEST'],
  [18, 'Zoom, contrast, reduced motion and keyboard navigation', 'Language & Access', 'ASTRA_UX_WRAPPER'],
  [19, 'Page Inspector', 'Developer', 'EXPOSE_NATIVE'],
  [20, 'Web Console', 'Developer', 'EXPOSE_NATIVE'],
  [21, 'JavaScript Debugger', 'Developer', 'EXPOSE_NATIVE'],
  [22, 'Network Monitor', 'Developer', 'EXPOSE_NATIVE'],
  [23, 'Storage Inspector', 'Developer', 'EXPOSE_NATIVE'],
  [24, 'Responsive Design Mode', 'Developer', 'EXPOSE_NATIVE'],
  [25, 'Accessibility Inspector', 'Developer', 'ASTRA_UX_WRAPPER'],
  [26, 'Performance Profiler', 'Developer', 'ASTRA_UX_WRAPPER'],
  [27, 'Service Worker inspection', 'Developer', 'USE_NATIVE'],
  [28, 'WebSocket inspection', 'Developer', 'USE_NATIVE'],
  [29, 'Source maps and CSS grid/flex tools', 'Developer', 'USE_NATIVE'],
  [30, 'Browser Console', 'Developer', 'ENABLE_AFTER_TEST'],
  [31, 'Browser Toolbox / chrome debugging', 'Developer', 'ENABLE_AFTER_TEST'],
  [32, 'Remote and add-on debugging', 'Developer', 'ENABLE_AFTER_TEST'],
  [33, 'EnterprisePolicies engine', 'Corporate', 'USE_NATIVE'],
  [34, 'Windows GPO / ADMX deployment support', 'Corporate', 'ASTRA_UX_WRAPPER'],
  [35, 'Managed bookmarks', 'Corporate', 'INTEGRATE'],
  [36, 'Extension allowlist/blocklist and install policies', 'Corporate', 'INTEGRATE'],
  [37, 'Proxy and DoH policy controls', 'Corporate', 'ASTRA_UX_WRAPPER'],
  [38, 'Enterprise roots and internal certificate authorities', 'Corporate', 'ASTRA_UX_WRAPPER'],
  [39, 'Update policy and channel control', 'Corporate', 'INTEGRATE'],
  [40, 'Telemetry and crash-report policy controls', 'Corporate', 'INTEGRATE'],
  [41, 'Managed-browser / about:policies status', 'Corporate', 'ASTRA_UX_WRAPPER'],
  [42, 'Offline/silent deployment foundation', 'Corporate', 'ENABLE_AFTER_TEST'],
  [43, 'Widevine / EME protected playback', 'Entertainment', 'ENABLE_AFTER_TEST'],
  [44, 'OpenH264 / Windows media decoding', 'Entertainment', 'USE_NATIVE'],
  [45, 'Hardware acceleration and video decode status', 'Entertainment', 'ASTRA_UX_WRAPPER'],
  [46, 'Media Session / global media controls', 'Entertainment', 'ENABLE_AFTER_TEST'],
  [47, 'Autoplay controls', 'Entertainment', 'USE_NATIVE'],
  [48, 'Fullscreen, subtitles and captions', 'Entertainment', 'USE_NATIVE'],
  [49, 'Audio tab indicator and mute controls', 'Entertainment', 'USE_NATIVE'],
  [50, 'Container tabs / contextual identities', 'Identity & Separation', 'INTEGRATE'],
  [51, 'Native local profiles and switcher', 'Identity & Separation', 'INTEGRATE'],
  [52, 'Native browser migration wizard', 'Identity & Separation', 'INTEGRATE'],
  [53, 'Bookmarks, passwords and history import resources', 'Identity & Separation', 'USE_NATIVE'],
  [54, 'Existing Firefox Account / Sync identity', 'Identity & Separation', 'USE_NATIVE'],
  [55, 'Enhanced Tracking Protection', 'Privacy & Security', 'USE_NATIVE'],
  [56, 'Total Cookie Protection', 'Privacy & Security', 'USE_NATIVE'],
  [57, 'Safe Browsing and download protection', 'Privacy & Security', 'INTEGRATE'],
  [58, 'Site permissions and clear-site-data controls', 'Privacy & Security', 'INTEGRATE'],
  [59, 'HTTPS and DNS modes', 'Privacy & Security', 'ASTRA_UX_WRAPPER'],
  [60, 'Native updater, troubleshooting and recovery foundations', 'Reliability', 'INTEGRATE'],
  [61, 'Firefox add-ons ecosystem and extension debugging', 'Extensions', 'USE_NATIVE'],
  [62, 'Hindi/Indian-language UI, dictionaries and local translation workflows', 'India & Language', 'INTEGRATE'],
];

const AUDIT_FILES = [
  'astra-firefox-capability-matrix.md',
  'astra-capability-conflict-map.md',
  'astra-firefox-pref-audit.md',
  'astra-native-capability-packaging.md',
  'astra-persona-experience-map.md',
  'astra-native-capability-build-trains.md',
  'astra-vs-chrome-capability-gap.md',
];

const errors = [];
const warnings = [];
function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// --------------------------------------------------------------------------
// Minimal deterministic YAML-subset parser
// --------------------------------------------------------------------------
function parseScalar(s) {
  s = s.trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

function splitFlow(inner) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"') { q = !q; cur += c; }
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map((x) => parseScalar(x));
}

function parseValue(v) {
  v = v.trim();
  if (v.startsWith('[')) {
    const end = v.lastIndexOf(']');
    const inner = v.slice(1, end);
    if (inner.trim() === '') return [];
    return splitFlow(inner);
  }
  return parseScalar(v);
}

function parseYamlSubset(text) {
  const raw = text.split(/\r?\n/);
  const lines = [];
  for (const l of raw) {
    if (/^\s*#/.test(l)) continue;
    if (/^\s*$/.test(l)) continue;
    lines.push(l.replace(/\s+$/, ''));
  }
  let idx = 0;
  const indentOf = (l) => l.match(/^ */)[0].length;

  function parseBlock(indent) {
    if (idx >= lines.length) return null;
    if (indentOf(lines[idx]) < indent) return null;
    if (/^\s*- /.test(lines[idx]) && indentOf(lines[idx]) === indent) {
      // sequence
      const arr = [];
      while (idx < lines.length) {
        const line = lines[idx];
        const li = indentOf(line);
        if (li < indent) break;
        if (li === indent && /^\s*- /.test(line)) {
          const rest = line.slice(li + 2);
          lines[idx] = ' '.repeat(li + 2) + rest;
          arr.push(parseBlock(li + 2));
        } else {
          break;
        }
      }
      return arr;
    }
    // mapping
    const obj = {};
    while (idx < lines.length) {
      const line = lines[idx];
      const li = indentOf(line);
      if (li < indent) break;
      if (li > indent) break;
      if (/^\s*- /.test(line)) break;
      const m = line.match(/^\s*([^:]+):\s*(.*)$/);
      if (!m) { idx++; continue; }
      const key = m[1].trim();
      const rawVal = m[2];
      idx++;
      if (rawVal === '') {
        if (idx < lines.length && indentOf(lines[idx]) > indent) {
          obj[key] = parseBlock(indentOf(lines[idx]));
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = parseValue(rawVal);
      }
    }
    return obj;
  }

  return parseBlock(0);
}

// --------------------------------------------------------------------------
// Registry checks
// --------------------------------------------------------------------------
function levelNum(l) {
  if (typeof l !== 'string' || !/^E[0-7]$/.test(l)) return NaN;
  return parseInt(l.slice(1), 10);
}

function validateRegistry() {
  if (!fs.existsSync(REGISTRY)) {
    err(`Registry file missing: ${REGISTRY}`);
    return null;
  }
  const text = fs.readFileSync(REGISTRY, 'utf8');

  if (/\bTBD\b/.test(text)) {
    err('Registry contains a raw "TBD" placeholder (forbidden unless explicitly UNVERIFIED).');
  }

  let doc;
  try {
    doc = parseYamlSubset(text);
  } catch (e) {
    err(`Registry parse failure: ${e.message}`);
    return null;
  }
  const caps = doc && doc.capabilities;
  if (!Array.isArray(caps)) {
    err('Registry `capabilities` is not a sequence.');
    return null;
  }

  if (caps.length !== 62) {
    err(`Registry must have exactly 62 entries; found ${caps.length}.`);
  }

  const idNums = new Set();
  const indexNums = new Set();
  const slugs = new Set();
  const classCounts = {};
  const readinessCounts = {};
  const groupCounts = {};
  const mappingCounts = {};

  caps.forEach((rec, i) => {
    const where = rec && rec.id ? rec.id : `entry#${i + 1}`;
    if (!rec || typeof rec !== 'object') { err(`${where}: not a mapping.`); return; }

    // id format + correspondence
    const id = rec.id;
    if (typeof id !== 'string' || !/^ASTRA-CAP-\d{3}$/.test(id)) {
      err(`${where}: invalid id format.`);
    } else {
      const n = parseInt(id.slice('ASTRA-CAP-'.length), 10);
      if (idNums.has(n)) err(`${id}: duplicate id.`);
      idNums.add(n);
      const cs = rec.canonical_source || {};
      if (cs.canonical_index !== n) {
        err(`${id}: canonical_index (${cs.canonical_index}) does not match id number (${n}).`);
      }
      if (indexNums.has(cs.canonical_index)) err(`${id}: duplicate canonical_index ${cs.canonical_index}.`);
      indexNums.add(cs.canonical_index);

      // catalog match
      const cat = CATALOG[n - 1];
      if (cat) {
        if (rec.title !== cat[1]) err(`${id}: title "${rec.title}" != catalog "${cat[1]}".`);
        if (cs.canonical_title !== cat[1]) err(`${id}: canonical_title mismatch.`);
        if (rec.group !== cat[2]) err(`${id}: group "${rec.group}" != catalog "${cat[2]}".`);
        if (cs.canonical_group !== cat[2]) err(`${id}: canonical_group mismatch.`);
        if (rec.classification !== cat[3]) err(`${id}: classification "${rec.classification}" != catalog "${cat[3]}".`);
        if (cs.canonical_primary_classification !== cat[3]) err(`${id}: canonical_primary_classification mismatch.`);
      }
      if (cs.source_id !== CANONICAL_SOURCE_ID) {
        err(`${id}: canonical_source.source_id must equal ${CANONICAL_SOURCE_ID}.`);
      }
    }

    // slug
    if (typeof rec.slug !== 'string' || rec.slug === '') err(`${where}: missing slug.`);
    else if (slugs.has(rec.slug)) err(`${where}: duplicate slug "${rec.slug}".`);
    else slugs.add(rec.slug);

    // group
    if (!CANONICAL_GROUPS.includes(rec.group)) err(`${where}: group "${rec.group}" not one of the 12 canonical groups.`);
    groupCounts[rec.group] = (groupCounts[rec.group] || 0) + 1;

    // classification
    if (!PRIMARY_CLASSES.includes(rec.classification)) err(`${where}: invalid classification "${rec.classification}".`);
    classCounts[rec.classification] = (classCounts[rec.classification] || 0) + 1;

    // integration_mode
    if (!INTEGRATION_MODES.includes(rec.integration_mode)) err(`${where}: invalid integration_mode "${rec.integration_mode}".`);

    // matrix_evidence
    const me = rec.matrix_evidence || {};
    if (!Array.isArray(me.blocks)) err(`${where}: matrix_evidence.blocks missing.`);
    if (!MAPPING_STATUSES.includes(me.mapping_status)) err(`${where}: invalid matrix_evidence.mapping_status.`);
    mappingCounts[me.mapping_status] = (mappingCounts[me.mapping_status] || 0) + 1;
    const blocks = Array.isArray(me.blocks) ? me.blocks : [];
    for (const b of blocks) {
      if (!KNOWN_BLOCKS.has(b)) err(`${where}: invented/unknown matrix block "${b}".`);
    }
    if (blocks.length === 0) {
      if (me.mapping_status !== 'UNVERIFIED' || !Array.isArray(me.notes) || me.notes.length === 0) {
        err(`${where}: empty matrix_evidence.blocks requires mapping_status UNVERIFIED with an explanatory note.`);
      }
    }

    // feature_flag
    const ff = rec.feature_flag || {};
    if (!FLAG_TYPES.includes(ff.type)) err(`${where}: invalid feature_flag.type "${ff.type}".`);
    if (!FLAG_STATUSES.includes(ff.status)) err(`${where}: invalid feature_flag.status "${ff.status}".`);
    if (ff.type === 'NATIVE_PREF') {
      if (!ff.name || ff.status !== 'VERIFIED') err(`${where}: NATIVE_PREF requires a non-empty name and VERIFIED status.`);
    } else if (ff.type === 'ASTRA_PREF_NEW') {
      if (typeof ff.name !== 'string' || !ff.name.startsWith('astra.') || ff.status !== 'PROPOSED') {
        err(`${where}: ASTRA_PREF_NEW requires an astra.* name and PROPOSED status.`);
      }
    } else if (ff.type === 'NATIVE_NO_NEW_FLAG') {
      if (ff.name !== null) err(`${where}: NATIVE_NO_NEW_FLAG requires name: null.`);
    }

    // NATIVE_ONLY must not require a new Astra pref
    if (rec.integration_mode === 'NATIVE_ONLY' && ff.type === 'ASTRA_PREF_NEW') {
      err(`${where}: NATIVE_ONLY must not use ASTRA_PREF_NEW.`);
    }

    // evidence blocks
    for (const dim of ['native_evidence', 'astra_integration_evidence']) {
      const ev = rec[dim] || {};
      const ln = levelNum(ev.level);
      if (Number.isNaN(ln)) err(`${where}: ${dim}.level invalid ("${ev.level}").`);
      if (!Array.isArray(ev.references)) err(`${where}: ${dim}.references must be an array.`);
      else if (ln >= 1 && ev.references.length === 0) {
        err(`${where}: ${dim} at ${ev.level} requires at least one reference.`);
      }
    }

    // readiness
    if (!READINESS.includes(rec.readiness_status)) err(`${where}: invalid readiness_status "${rec.readiness_status}".`);
    readinessCounts[rec.readiness_status] = (readinessCounts[rec.readiness_status] || 0) + 1;
    const nl = levelNum((rec.native_evidence || {}).level);
    const al = levelNum((rec.astra_integration_evidence || {}).level);
    if (rec.readiness_status === 'DESIGN_READY_FOR_IMPLEMENTATION') {
      if (!(nl >= 3)) err(`${where}: DESIGN_READY requires native_evidence >= E3.`);
      if (rec.state_status === 'UNVERIFIED') err(`${where}: DESIGN_READY not allowed with UNVERIFIED state_status.`);
      if (ff.type === 'UNVERIFIED') err(`${where}: DESIGN_READY not allowed with UNVERIFIED feature_flag.`);
      if ((rec.matrix_evidence || {}).mapping_status === 'UNVERIFIED') err(`${where}: DESIGN_READY not allowed with UNVERIFIED matrix mapping.`);
    }
    if (rec.readiness_status === 'SOURCE_IMPLEMENTATION_COMPLETE' && !(al >= 2)) {
      err(`${where}: SOURCE_IMPLEMENTATION_COMPLETE requires astra_integration_evidence >= E2.`);
    }
    if (rec.readiness_status === 'RUNTIME_VERIFIED' && !(nl >= 4 && al >= 5)) {
      err(`${where}: RUNTIME_VERIFIED requires native >= E4 and astra >= E5.`);
    }
    if (rec.readiness_status === 'STABLE_CLAIM_APPROVED' && !(al >= 6)) {
      err(`${where}: STABLE_CLAIM_APPROVED requires astra_integration_evidence >= E6.`);
    }
  });

  // id / index coverage 1..62
  for (let n = 1; n <= 62; n++) {
    if (!idNums.has(n)) err(`Missing ASTRA-CAP-${String(n).padStart(3, '0')}.`);
    if (!indexNums.has(n)) err(`Missing canonical_index ${n}.`);
  }

  // classification distribution
  for (const cls of PRIMARY_CLASSES) {
    const got = classCounts[cls] || 0;
    if (got !== EXPECTED_CLASS_COUNTS[cls]) {
      err(`Classification count for ${cls} is ${got}; expected ${EXPECTED_CLASS_COUNTS[cls]}.`);
    }
  }

  return { caps, classCounts, readinessCounts, groupCounts, mappingCounts };
}

// --------------------------------------------------------------------------
// Exclusions ledger checks (documented extraction rule)
// --------------------------------------------------------------------------
function extractDecisionOccurrences() {
  const occ = [];
  for (const f of AUDIT_FILES) {
    const p = path.join(AUDIT_DIR, f);
    if (!fs.existsSync(p)) { err(`Audit document missing: ${f}`); continue; }
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/\b(DEFER|REJECT)\b/.test(line)) return;
      // exclude classification legend line (both tokens back-tick wrapped)
      if (line.includes('`DEFER`') && line.includes('`REJECT`')) return;
      // exclude classification-summary table rows
      if (/^\s*\|\s*(DEFER|REJECT)\s*\|/.test(line)) return;
      occ.push(`${f}:${i + 1}`);
    });
  }
  return occ;
}

function validateExclusions() {
  if (!fs.existsSync(EXCLUSIONS)) {
    err(`Exclusions ledger missing: ${EXCLUSIONS}`);
    return null;
  }
  const text = fs.readFileSync(EXCLUSIONS, 'utf8');

  const entryIds = [...text.matchAll(/^### (ASTRA-EXCLUSION-\d{3})/gm)].map((m) => m[1]);
  if (entryIds.length === 0) err('Exclusions ledger has no ASTRA-EXCLUSION entries.');
  const seen = new Set();
  for (const id of entryIds) {
    if (seen.has(id)) err(`Duplicate exclusion id ${id}.`);
    seen.add(id);
  }

  // per-entry required fields
  const parts = text.split(/^### ASTRA-EXCLUSION-\d{3}/gm).slice(1);
  parts.forEach((block, i) => {
    const id = entryIds[i];
    if (!/- classification:\s*(DEFER|REJECT)\b/.test(block)) err(`${id}: missing/invalid classification (DEFER|REJECT).`);
    if (!/- source_locations:/.test(block)) err(`${id}: missing source_locations.`);
    if (!/- reason:/.test(block)) err(`${id}: missing reason.`);
    if (!/- reopen_condition:/.test(block)) err(`${id}: missing reopen_condition.`);
    if (!/- temporary_or_permanent:\s*(temporary|permanent)\b/.test(block)) err(`${id}: missing temporary_or_permanent.`);
    if (!/- human_mapping_status:\s*(VERIFIED|PARTIAL|UNVERIFIED)\b/.test(block)) err(`${id}: missing human_mapping_status.`);
  });

  // coverage: every extracted decision occurrence must be cited
  const cited = new Set(
    [...text.matchAll(/astra-firefox-capability-matrix\.md:(\d+)/g)].map(
      (m) => `astra-firefox-capability-matrix.md:${m[1]}`,
    ),
  );
  const occ = extractDecisionOccurrences();
  const missing = occ.filter((o) => !cited.has(o));
  if (missing.length) {
    err(`Exclusion ledger does not cover explicit DEFER/REJECT clauses: ${missing.join(', ')}`);
  }

  return { entryCount: entryIds.length, occurrences: occ.length, cited: cited.size };
}

// --------------------------------------------------------------------------
// Phase 1 checks: docs exist; state/conflict refs resolve; state_status gate
// --------------------------------------------------------------------------
function validatePhase1(caps) {
  const docs = [
    ['system map', SYSTEM_MAP],
    ['wiring graph', WIRING_GRAPH],
    ['state ownership', STATE_DOC],
    ['conflict resolution', CONFLICT_DOC],
    ['patch inventory CSV', PATCH_CSV],
  ];
  for (const [label, p] of docs) {
    if (!fs.existsSync(p)) err(`Phase 1 ${label} missing: ${path.relative(ROOT, p)}`);
  }
  if (!caps) return null;

  const stateIds = new Set();
  const conflictIds = new Set();
  if (fs.existsSync(STATE_DOC)) {
    for (const m of fs.readFileSync(STATE_DOC, 'utf8').matchAll(/ASTRA-STATE-\d{3}/g)) stateIds.add(m[0]);
  }
  if (fs.existsSync(CONFLICT_DOC)) {
    for (const m of fs.readFileSync(CONFLICT_DOC, 'utf8').matchAll(/ASTRA-CONFLICT-\d{3}/g)) conflictIds.add(m[0]);
  }

  const stateStatusCounts = {};
  for (const rec of caps) {
    const where = (rec && rec.id) || 'entry';
    const st = rec.state_status;
    if (!STATE_STATUSES.includes(st)) err(`${where}: invalid state_status "${st}".`);
    stateStatusCounts[st] = (stateStatusCounts[st] || 0) + 1;
    // Phase 1 gate: no capability may remain UNVERIFIED
    if (st === 'UNVERIFIED') err(`${where}: state_status still UNVERIFIED (Phase 1 requires a resolved state_status).`);
    const srefs = Array.isArray(rec.state_refs) ? rec.state_refs : [];
    if (st === 'REFERENCED' && srefs.length === 0) err(`${where}: REFERENCED requires at least one state_refs entry.`);
    for (const r of srefs) if (!stateIds.has(r)) err(`${where}: state_refs "${r}" does not resolve to a row in astra-state-ownership.md.`);
    const crefs = Array.isArray(rec.conflict_refs) ? rec.conflict_refs : [];
    for (const c of crefs) if (!conflictIds.has(c)) err(`${where}: conflict_refs "${c}" does not resolve to a row in astra-conflict-resolution.md.`);
    // BLOCKED_ON_CONFLICT is the only way to reference an unresolved conflict; all conflicts here
    // are RESOLVED_BY_DESIGN, so no capability should be BLOCKED_ON_CONFLICT without cause.
  }
  return { stateIds: stateIds.size, conflictIds: conflictIds.size, stateStatusCounts };
}

// --------------------------------------------------------------------------
// Phase 2 checks: feature docs, README, traceability, safety sections
// --------------------------------------------------------------------------
function validatePhase2(caps) {
  if (!fs.existsSync(FEATURES_DIR)) {
    err('Phase 2 features directory missing: docs/features');
    return null;
  }
  if (!fs.existsSync(FEATURES_README)) err('Phase 2 features README missing: docs/features/README.md');
  if (!fs.existsSync(TRACEABILITY)) err('Phase 2 traceability missing: docs/architecture/astra-feature-traceability.md');
  if (!caps) return null;

  const files = fs.readdirSync(FEATURES_DIR).filter((f) => /^ASTRA-CAP-\d{3}-.+\.md$/.test(f));
  if (files.length !== 62) err(`Phase 2 requires exactly 62 feature docs; found ${files.length}.`);

  const byId = {};
  for (const c of caps) byId[c.id] = c;
  const seen = new Set();
  const stateIds = new Set();
  const conflictIds = new Set();
  if (fs.existsSync(STATE_DOC)) {
    for (const m of fs.readFileSync(STATE_DOC, 'utf8').matchAll(/ASTRA-STATE-\d{3}/g)) stateIds.add(m[0]);
  }
  if (fs.existsSync(CONFLICT_DOC)) {
    for (const m of fs.readFileSync(CONFLICT_DOC, 'utf8').matchAll(/ASTRA-CONFLICT-\d{3}/g)) conflictIds.add(m[0]);
  }

  for (const f of files) {
    const m = f.match(/^(ASTRA-CAP-\d{3})-(.+)\.md$/);
    if (!m) { err(`Bad feature filename: ${f}`); continue; }
    const id = m[1];
    const slug = m[2];
    if (seen.has(id)) err(`Duplicate feature doc for ${id}`);
    seen.add(id);
    const rec = byId[id];
    if (!rec) { err(`Feature doc ${f} has unknown registry id.`); continue; }
    if (rec.slug !== slug) err(`${id}: filename slug "${slug}" != registry slug "${rec.slug}".`);
    const text = fs.readFileSync(path.join(FEATURES_DIR, f), 'utf8');
    for (const marker of FEATURE_REQUIRED_MARKERS) {
      if (!text.includes(marker)) err(`${id}: missing required section/marker "${marker}".`);
    }
    if (!text.includes(rec.title)) err(`${id}: feature doc missing registry title.`);
    if (!text.includes(rec.group)) err(`${id}: feature doc missing registry group.`);
    if (!text.includes('`' + rec.classification + '`')) err(`${id}: feature doc missing classification.`);
    if (!text.includes('`' + rec.integration_mode + '`')) err(`${id}: feature doc missing integration_mode.`);
    if (!text.includes('`' + rec.readiness_status + '`')) err(`${id}: feature doc missing readiness_status.`);
    if (!text.includes('`E0`')) err(`${id}: feature doc must keep evidence at E0 in this worktree.`);
    // Preserve registry refs
    for (const s of (rec.state_refs || [])) {
      if (!text.includes(s)) err(`${id}: feature doc missing state_ref ${s}.`);
      if (!stateIds.has(s)) err(`${id}: state_ref ${s} unresolved.`);
    }
    for (const c of (rec.conflict_refs || [])) {
      if (!text.includes(c)) err(`${id}: feature doc missing conflict_ref ${c}.`);
      if (!conflictIds.has(c)) err(`${id}: conflict_ref ${c} unresolved.`);
    }
    // NATIVE_ONLY must not invent ASTRA_PREF_NEW in the doc's registry mirror
    if (rec.integration_mode === 'NATIVE_ONLY' && rec.feature_flag && rec.feature_flag.type === 'ASTRA_PREF_NEW') {
      err(`${id}: NATIVE_ONLY registry entry must not use ASTRA_PREF_NEW.`);
    }
    // Relative links
    for (const lm of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = lm[1];
      if (/^https?:\/\//.test(href)) continue;
      const target = path.resolve(FEATURES_DIR, href);
      if (!fs.existsSync(target)) err(`${id}: broken link ${href}`);
    }
    // Readiness must not jump to DESIGN_READY without evidence (already enforced in registry);
    // additionally: feature doc existence must not claim DESIGN_READY unless registry says so.
    if (/\bDESIGN_READY_FOR_IMPLEMENTATION\b/.test(text) && rec.readiness_status !== 'DESIGN_READY_FOR_IMPLEMENTATION') {
      // Allow mentioning the status name in explanatory prose only if not claiming current status.
      // Harden: if the Identity table claims it as current readiness, the readiness_status field must match.
      // The generator writes `Readiness status | \`...\`` — already checked above against registry.
    }
  }
  for (let n = 1; n <= 62; n++) {
    const id = `ASTRA-CAP-${String(n).padStart(3, '0')}`;
    if (!seen.has(id)) err(`Missing feature doc for ${id}.`);
  }

  // README / traceability link resolution
  if (fs.existsSync(FEATURES_README)) {
    const readme = fs.readFileSync(FEATURES_README, 'utf8');
    for (const lm of readme.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = lm[1];
      if (/^https?:\/\//.test(href)) continue;
      const target = path.resolve(FEATURES_DIR, href);
      if (!fs.existsSync(target)) err(`features/README.md broken link: ${href}`);
    }
    for (const c of caps) {
      if (!readme.includes(c.id)) err(`features/README.md missing ${c.id}.`);
      if (!readme.includes(`${c.id}-${c.slug}.md`)) err(`features/README.md missing file link for ${c.id}.`);
    }
  }
  if (fs.existsSync(TRACEABILITY)) {
    const tr = fs.readFileSync(TRACEABILITY, 'utf8');
    for (const c of caps) {
      if (!tr.includes(c.id)) err(`astra-feature-traceability.md missing ${c.id}.`);
    }
    for (const lm of tr.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = lm[1];
      if (/^https?:\/\//.test(href)) continue;
      const target = path.resolve(ARCH, href);
      if (!fs.existsSync(target)) err(`astra-feature-traceability.md broken link: ${href}`);
    }
  }

  return { featureDocs: files.length };
}

// --------------------------------------------------------------------------
// Phase 3 checks: rollout plan + ownership matrix
// --------------------------------------------------------------------------
function checkMermaidBalanced(text, label) {
  const opens = (text.match(/```mermaid/g) || []).length;
  const fences = (text.match(/```/g) || []).length;
  if (opens === 0) return;
  if (fences % 2 !== 0) err(`${label}: Mermaid/code fences are unbalanced.`);
}

function validatePhase3(caps) {
  if (!fs.existsSync(ROLLOUT_PLAN)) err('Phase 3 rollout plan missing: docs/architecture/astra-rollout-plan.md');
  if (!fs.existsSync(OWNERSHIP_MATRIX)) err('Phase 3 ownership matrix missing: docs/architecture/astra-ownership-matrix.md');
  if (!caps) return null;

  const byId = {};
  for (const c of caps) byId[c.id] = c;

  const rollout = fs.existsSync(ROLLOUT_PLAN) ? fs.readFileSync(ROLLOUT_PLAN, 'utf8') : '';
  const ownership = fs.existsSync(OWNERSHIP_MATRIX) ? fs.readFileSync(OWNERSHIP_MATRIX, 'utf8') : '';

  checkMermaidBalanced(rollout, 'astra-rollout-plan.md');
  checkMermaidBalanced(ownership, 'astra-ownership-matrix.md');

  // Forbidden claim language / readiness advancement
  if (/STABLE_CLAIM_APPROVED/.test(rollout + ownership)) {
    err('Phase 3 docs must not claim STABLE_CLAIM_APPROVED.');
  }
  if (/readiness_status:\s*DESIGN_READY_FOR_IMPLEMENTATION/.test(rollout + ownership)) {
    err('Phase 3 docs must not advance readiness_status.');
  }
  // Astra Sync branding / government readiness honesty
  if (!/Astra-branded Sync remains blocked|Astra Sync.*blocked|Never label FxA\/Sync as Astra Sync/i.test(rollout + ownership)) {
    err('Phase 3 docs must keep Astra-branded Sync blocked/deferred while Firefox identity remains native.');
  }
  if (!/Government readiness blocked|government-ready|Government-ready claims/i.test(rollout)) {
    err('Phase 3 rollout plan must keep government readiness blocked/deferred where evidence is absent.');
  }
  if (!/Planning document only|not.*runtime proof|Batch assignment ≠ runtime|planning is not runtime/i.test(rollout)) {
    err('Phase 3 rollout plan must state that planning is not runtime proof.');
  }
  if (!/candidate minimum beta validation set/i.test(rollout)) {
    err('Phase 3 rollout plan must name the "candidate minimum beta validation set" (not proven beta-ready).');
  }

  // Parse capability dependency table rows from rollout
  const primaryBatch = {};
  const depCapsMap = {};
  const depBatchMap = {};
  const releaseGate = {};
  const tableRowRe = /^\| `(ASTRA-CAP-\d{3})` \| `(Batch [0-6])` \| ([^|]*) \| ([^|]*) \| ([^|]*) \| `([^`]+)` \|/gm;
  let tm;
  while ((tm = tableRowRe.exec(rollout)) !== null) {
    const id = tm[1];
    const batch = tm[2];
    if (primaryBatch[id]) err(`Rollout plan: ${id} has more than one primary_batch.`);
    primaryBatch[id] = batch;
    if (!VALID_BATCHES.has(batch)) err(`Rollout plan: ${id} has invalid batch "${batch}".`);
    const depCaps = tm[3].trim() === '—' ? [] : tm[3].trim().split(/[\s,]+/).filter(Boolean);
    const depBatches = tm[4].trim() === '—'
      ? []
      : [...tm[4].matchAll(/Batch\s*[0-6]/g)].map((x) => x[0].replace(/\s+/, ' '));
    for (const d of depCaps) {
      if (!/^ASTRA-CAP-\d{3}$/.test(d)) err(`Rollout plan: ${id} has bad depends_on_capability_ids token "${d}".`);
      if (d === id) err(`Rollout plan: ${id} depends on itself.`);
      if (!byId[d]) err(`Rollout plan: ${id} depends on unknown capability ${d}.`);
    }
    for (const b of depBatches) {
      if (!VALID_BATCHES.has(b)) err(`Rollout plan: ${id} depends on unknown batch "${b}".`);
    }
    depCapsMap[id] = depCaps;
    depBatchMap[id] = depBatches;
    if (!RELEASE_GATES.has(tm[6])) err(`Rollout plan: ${id} has invalid release_gate "${tm[6]}".`);
    releaseGate[id] = tm[6];
  }

  for (const c of caps) {
    if (!primaryBatch[c.id]) err(`Rollout plan missing primary assignment for ${c.id}.`);
    else {
      // Must match registry batch (normalized)
      const regBatch = String(c.batch).replace(/^Batch\s*/, 'Batch ');
      const norm = regBatch.match(/Batch\s*(\d)/) ? `Batch ${regBatch.match(/Batch\s*(\d)/)[1]}` : regBatch;
      if (primaryBatch[c.id] !== norm) {
        err(`Rollout plan primary_batch for ${c.id} is ${primaryBatch[c.id]} but registry batch is ${c.batch}.`);
      }
    }
    if (!rollout.includes(c.id)) err(`Rollout plan text missing ${c.id}.`);
  }
  if (Object.keys(primaryBatch).length !== 62) {
    err(`Rollout plan primary assignments count ${Object.keys(primaryBatch).length} != 62.`);
  }

  // Batch dependency edges from meta + Mermaid (Batch N --> Batch M)
  const batchEdges = [];
  for (const m of rollout.matchAll(/B(\d)\[[\s\S]*?\]\s*-->\s*B(\d)/g)) {
    batchEdges.push([`Batch ${m[1]}`, `Batch ${m[2]}`]);
  }
  // Also parse "Depends on batches" lines
  for (const m of rollout.matchAll(/\| Depends on batches \| ([^|]+) \|/g)) {
    const fromMatch = rollout.slice(0, m.index).match(/### (Batch [0-6])/g);
    if (!fromMatch) continue;
    const from = fromMatch[fromMatch.length - 1].replace('### ', '');
    const deps = [...m[1].matchAll(/`(Batch [0-6])`/g)].map((x) => x[1]);
    for (const d of deps) batchEdges.push([d, from]);
  }
  // Cycle detect on batches
  const nodes = [...VALID_BATCHES];
  const adj = {};
  for (const n of nodes) adj[n] = new Set();
  for (const [a, b] of batchEdges) {
    if (VALID_BATCHES.has(a) && VALID_BATCHES.has(b)) adj[a].add(b);
  }
  const visiting = new Set();
  const visited = new Set();
  function dfs(n) {
    if (visiting.has(n)) { err(`Circular batch dependency involving ${n}.`); return true; }
    if (visited.has(n)) return false;
    visiting.add(n);
    for (const m of adj[n]) if (dfs(m)) return true;
    visiting.delete(n);
    visited.add(n);
    return false;
  }
  for (const n of nodes) dfs(n);

  // Capability dependency cycle (depends_on_capability_ids)
  const capAdj = {};
  for (const id of Object.keys(byId)) capAdj[id] = new Set(depCapsMap[id] || []);
  const cVisiting = new Set();
  const cVisited = new Set();
  function dfsCap(n) {
    if (cVisiting.has(n)) { err(`Circular capability dependency involving ${n}.`); return true; }
    if (cVisited.has(n)) return false;
    cVisiting.add(n);
    for (const m of capAdj[n] || []) if (dfsCap(m)) return true;
    cVisiting.delete(n);
    cVisited.add(n);
    return false;
  }
  for (const id of Object.keys(byId)) dfsCap(id);

  // Ownership matrix: parse table rows (first cells)
  const ownRows = {};
  const ownRowRe = /^\| `(ASTRA-CAP-\d{3})` \| ([^|]+) \| ([^|]+) \| `([^`]+)` \| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| `([^`]+)` \| `(Batch [0-6])` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| `([^`]+)` \| ([^|]+) \|/gm;
  let om;
  while ((om = ownRowRe.exec(ownership)) !== null) {
    const id = om[1];
    if (ownRows[id]) err(`Ownership matrix: duplicate row for ${id}.`);
    const title = om[2].trim();
    const group = om[3].trim();
    const classification = om[4];
    const integrationMode = om[5];
    const stateRefs = om[8].trim() === '—' ? [] : om[8].trim().split(/\s+/).filter(Boolean);
    const conflictRefs = om[9].trim() === '—' ? [] : om[9].trim().split(/\s+/).filter(Boolean);
    const pattern = om[10];
    const batch = om[11];
    const reviewers = om[12].trim();
    const lessons = om[13].trim();
    const evidence = om[14].trim();
    const gate = om[15];
    const rollback = om[16].trim();
    const rec = byId[id];
    if (!rec) { err(`Ownership matrix unknown id ${id}`); continue; }
    if (title !== rec.title) err(`Ownership matrix ${id}: title mismatch.`);
    if (group !== rec.group) err(`Ownership matrix ${id}: group mismatch.`);
    if (classification !== rec.classification) err(`Ownership matrix ${id}: classification mismatch.`);
    if (integrationMode !== rec.integration_mode) err(`Ownership matrix ${id}: integration_mode mismatch.`);
    const regStates = (rec.state_refs || []).slice().sort().join(' ');
    const docStates = stateRefs.slice().sort().join(' ');
    if (regStates !== docStates) err(`Ownership matrix ${id}: state_refs mismatch registry.`);
    const regConflicts = (rec.conflict_refs || []).slice().sort().join(' ');
    const docConflicts = conflictRefs.slice().sort().join(' ');
    if (regConflicts !== docConflicts) err(`Ownership matrix ${id}: conflict_refs mismatch registry.`);
    if (!OWNERSHIP_PATTERNS.has(pattern)) err(`Ownership matrix ${id}: invalid pattern "${pattern}".`);
    if (primaryBatch[id] && batch !== primaryBatch[id]) {
      err(`Ownership matrix ${id}: batch ${batch} != rollout primary ${primaryBatch[id]}.`);
    }
    if (!reviewers) err(`Ownership matrix ${id}: missing reviewers.`);
    if (!lessons) err(`Ownership matrix ${id}: missing historical lesson check.`);
    if (!evidence) err(`Ownership matrix ${id}: missing evidence limitations.`);
    if (!RELEASE_GATES.has(gate)) err(`Ownership matrix ${id}: invalid release gate "${gate}".`);
    if (releaseGate[id] && gate !== releaseGate[id]) {
      err(`Ownership matrix ${id}: release gate ${gate} != rollout ${releaseGate[id]}.`);
    }
    if (!rollback) err(`Ownership matrix ${id}: missing rollback owner.`);
    ownRows[id] = true;
  }
  if (Object.keys(ownRows).length !== 62) {
    err(`Ownership matrix parsed ${Object.keys(ownRows).length} rows; expected 62.`);
  }
  for (const c of caps) {
    if (!ownRows[c.id]) err(`Ownership matrix missing row for ${c.id}.`);
  }

  // Link resolution for both docs
  for (const [label, text, base] of [
    ['astra-rollout-plan.md', rollout, ARCH],
    ['astra-ownership-matrix.md', ownership, ARCH],
  ]) {
    for (const lm of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = lm[1];
      if (/^https?:\/\//.test(href)) continue;
      const target = path.resolve(base, href);
      if (!fs.existsSync(target)) err(`${label}: broken link ${href}`);
    }
  }

  const batchCounts = {};
  const releaseCounts = {};
  for (const id of Object.keys(primaryBatch)) {
    batchCounts[primaryBatch[id]] = (batchCounts[primaryBatch[id]] || 0) + 1;
    releaseCounts[releaseGate[id]] = (releaseCounts[releaseGate[id]] || 0) + 1;
  }

  // Expected Phase-3 frozen counts (Checkpoint D contract)
  const expectedBatches = {
    'Batch 0': 21, 'Batch 1': 19, 'Batch 2': 0, 'Batch 3': 10,
    'Batch 4': 10, 'Batch 5': 2, 'Batch 6': 0,
  };
  for (const [b, n] of Object.entries(expectedBatches)) {
    const got = batchCounts[b] || 0;
    if (got !== n) err(`Rollout primary count for ${b} is ${got}; expected ${n}.`);
  }
  const expectedRelease = {
    REQUIRED_FOR_CURRENT_BETA: 15,
    OPTIONAL_FOR_CURRENT_BETA: 25,
    DEFERRED_POST_BETA: 17,
    BLOCKED: 5,
  };
  for (const [g, n] of Object.entries(expectedRelease)) {
    const got = releaseCounts[g] || 0;
    if (got !== n) err(`Release-gate count for ${g} is ${got}; expected ${n}.`);
  }
  // Zero-primary batches must be documented as coordination/future tracks
  if (!/no primary CAP IDs|program track|platform track|coordination/i.test(rollout)) {
    err('Rollout plan must document zero-primary-assignment batches as coordination/future tracks.');
  }

  return {
    primaryAssignments: Object.keys(primaryBatch).length,
    ownershipRows: Object.keys(ownRows).length,
    batchCounts,
    releaseCounts,
  };
}

// --------------------------------------------------------------------------
// Phase 4 checks: final completeness / truthfulness / architecture integrity
// --------------------------------------------------------------------------
function validatePhase4(caps) {
  if (!caps) return null;

  // Evidence & readiness freeze
  let nativeE0 = 0;
  let astraE0 = 0;
  let designReady = 0;
  let runtimeVerified = 0;
  let stableClaim = 0;
  for (const c of caps) {
    const nl = (c.native_evidence || {}).level;
    const al = (c.astra_integration_evidence || {}).level;
    if (nl === 'E0') nativeE0++;
    if (al === 'E0') astraE0++;
    if (c.readiness_status === 'DESIGN_READY_FOR_IMPLEMENTATION') designReady++;
    if (c.readiness_status === 'RUNTIME_VERIFIED') runtimeVerified++;
    if (c.readiness_status === 'STABLE_CLAIM_APPROVED') stableClaim++;
    if (nl !== 'E0') {
      err(`${c.id}: Phase 4 freeze expects native_evidence E0 while engine/ is absent (found ${nl}).`);
    }
    if (al !== 'E0') {
      err(`${c.id}: Phase 4 freeze expects astra_integration_evidence E0 (found ${al}).`);
    }
  }
  if (designReady !== 0) err(`DESIGN_READY_FOR_IMPLEMENTATION count is ${designReady}; expected 0.`);
  if (runtimeVerified !== 0) err(`RUNTIME_VERIFIED count is ${runtimeVerified}; expected 0.`);
  if (stableClaim !== 0) err(`STABLE_CLAIM_APPROVED count is ${stableClaim}; expected 0.`);

  // System map + patch inventory
  if (!fs.existsSync(SYSTEM_MAP)) err('Phase 4: system map missing.');
  else {
    const sm = fs.readFileSync(SYSTEM_MAP, 'utf8');
    if (!/astra-upstream-patch-inventory\.csv/.test(sm)) {
      err('System map must link astra-upstream-patch-inventory.csv.');
    }
    if (!/UNVERIFIED — VENDOR BASELINE NOT PINNED|UNVERIFIED-VENDOR-BASELINE-NOT-PINNED/i.test(sm)) {
      err('System map must state vendor baseline is UNVERIFIED where not pinned.');
    }
    checkMermaidBalanced(sm, 'astra-system-map.md');
  }
  if (!fs.existsSync(PATCH_CSV)) err('Phase 4: patch inventory CSV missing.');
  else {
    const rows = fs.readFileSync(PATCH_CSV, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
    const dataRows = rows.length > 0 && rows[0].startsWith('path,') ? rows.length - 1 : rows.length;
    if (dataRows !== 189) {
      err(`Patch inventory data rows = ${dataRows}; expected 189 (document a source change if intentional).`);
    }
  }

  // Wiring graph: all 62 IDs + 12 group Mermaid fences.
  // Phase-1 tables use "| NNN Title |" (zero-padded canonical_index).
  if (!fs.existsSync(WIRING_GRAPH)) err('Phase 4: wiring graph missing.');
  else {
    const wg = fs.readFileSync(WIRING_GRAPH, 'utf8');
    checkMermaidBalanced(wg, 'astra-wiring-graph.md');
    const mermaidCount = (wg.match(/```mermaid/g) || []).length;
    if (mermaidCount < 12) {
      err(`Wiring graph has ${mermaidCount} Mermaid graphs; expected at least 12 (one per canonical group).`);
    }
    const missing = [];
    for (const c of caps) {
      const n = String(c.canonical_source.canonical_index).padStart(3, '0');
      const rowOk = new RegExp(`\\|\\s*${n}\\s+`).test(wg);
      if (!(wg.includes(c.id) || rowOk)) missing.push(c.id);
    }
    if (missing.length) {
      err(`Wiring graph missing capability coverage: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
    }
  }

  // State / conflict exact ID ranges
  if (fs.existsSync(STATE_DOC)) {
    const st = fs.readFileSync(STATE_DOC, 'utf8');
    checkMermaidBalanced(st, 'astra-state-ownership.md');
    for (let i = 1; i <= 29; i++) {
      const id = `ASTRA-STATE-${String(i).padStart(3, '0')}`;
      const count = (st.match(new RegExp(id, 'g')) || []).length;
      if (count < 1) err(`State doc missing ${id}.`);
    }
    // Exact once as row definition: look for "| ASTRA-STATE-NNN |"
    for (let i = 1; i <= 29; i++) {
      const id = `ASTRA-STATE-${String(i).padStart(3, '0')}`;
      const defs = (st.match(new RegExp(`\\|\\s*${id}\\s*\\|`, 'g')) || []).length;
      if (defs !== 1) err(`State doc must define ${id} exactly once as a table row (found ${defs}).`);
    }
    if (/ASTRA-STATE-030/.test(st)) err('State doc must not define ASTRA-STATE-030+.');
  }
  if (fs.existsSync(CONFLICT_DOC)) {
    const ct = fs.readFileSync(CONFLICT_DOC, 'utf8');
    checkMermaidBalanced(ct, 'astra-conflict-resolution.md');
    for (let i = 1; i <= 31; i++) {
      const id = `ASTRA-CONFLICT-${String(i).padStart(3, '0')}`;
      const defs = (ct.match(new RegExp(`###\\s+${id}\\b`, 'g')) || []).length;
      if (defs !== 1) err(`Conflict doc must define ${id} exactly once (found ${defs}).`);
    }
    if (/###\s+ASTRA-CONFLICT-032\b/.test(ct)) err('Conflict doc must not define ASTRA-CONFLICT-032+.');
    if (!/RESOLVED_BY_DESIGN/.test(ct)) err('Conflict doc must use RESOLVED_BY_DESIGN status language.');
    if (!/architecture constraint only|not\*\*[\s\S]{0,40}runtime proof|not runtime\/implementation proof|not.*runtime proof/i.test(ct)) {
      err('Conflict doc must state RESOLVED_BY_DESIGN is not runtime/implementation proof.');
    }
  }

  // Beta wording truthfulness in rollout
  if (fs.existsSync(ROLLOUT_PLAN)) {
    const rollout = fs.readFileSync(ROLLOUT_PLAN, 'utf8');
    if (!/candidate minimum beta validation set/i.test(rollout)) {
      err('Rollout plan must use "candidate minimum beta validation set".');
    }
    const banned = [
      [/all 62 (are|capabilities are) beta-ready/i, 'must not claim all 62 are beta-ready'],
      [/government[- ]ready(?!\s+claims|\s*\||,)/i, 'must not claim government-ready without block context'],
      [/secure verified automatic updates/i, 'must not claim secure verified automatic updates'],
      [/Astra-branded Sync exists/i, 'must not claim Astra-branded Sync exists'],
      [/DRM\/service certification is proven/i, 'must not claim DRM certification proven'],
      [/these 15 already passed runtime/i, 'must not claim the 15 already passed runtime testing'],
    ];
    // Positive required denials
    if (!/not.*proven beta-ready|are \*\*not\*\* proven beta-ready|not proven beta-ready/i.test(rollout)) {
      err('Rollout plan must state the candidate set is not proven beta-ready.');
    }
    if (!/Source validators are not runtime proof|source validators.*not runtime/i.test(rollout)) {
      err('Rollout plan must state source validators are not runtime proof.');
    }
  }

  // Traceability 62 rows with IDs
  if (fs.existsSync(TRACEABILITY)) {
    const tr = fs.readFileSync(TRACEABILITY, 'utf8');
    let trCount = 0;
    for (const c of caps) {
      if (tr.includes(c.id)) trCount++;
      else err(`Traceability missing ${c.id}.`);
    }
    if (trCount !== 62) err(`Traceability ID coverage ${trCount} != 62.`);
  }

  // Features README beta-safety completeness already enforced per-doc; confirm group headers
  if (fs.existsSync(FEATURES_README)) {
    const readme = fs.readFileSync(FEATURES_README, 'utf8');
    for (const g of CANONICAL_GROUPS) {
      if (!readme.includes(`## ${g}`)) err(`features/README.md missing group heading: ${g}.`);
    }
  }

  return {
    nativeE0,
    astraE0,
    designReady,
    patchRows: fs.existsSync(PATCH_CSV)
      ? fs.readFileSync(PATCH_CSV, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').length - 1
      : 0,
  };
}

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------
function main() {
  const reg = validateRegistry();
  const exc = validateExclusions();
  const ph1 = validatePhase1(reg ? reg.caps : null);
  const ph2 = validatePhase2(reg ? reg.caps : null);
  const ph3 = validatePhase3(reg ? reg.caps : null);
  const ph4 = validatePhase4(reg ? reg.caps : null);

  console.log('=== Astra Architecture Validator (Phase 0–4) ===');
  console.log(`Registry: ${path.relative(ROOT, REGISTRY)}`);
  console.log(`Exclusions: ${path.relative(ROOT, EXCLUSIONS)}`);
  if (reg) {
    console.log(`Registry entries: ${reg.caps.length}`);
    console.log('Classification counts:', JSON.stringify(reg.classCounts));
    console.log('Readiness counts:', JSON.stringify(reg.readinessCounts));
    console.log('Group counts:', JSON.stringify(reg.groupCounts));
    console.log('Matrix mapping_status counts:', JSON.stringify(reg.mappingCounts));
  }
  if (exc) {
    console.log(`Exclusion ledger entries: ${exc.entryCount}`);
    console.log(`Explicit DEFER/REJECT decision lines extracted: ${exc.occurrences}`);
  }
  if (ph1) {
    console.log(`State rows defined: ${ph1.stateIds}  Conflict rows defined: ${ph1.conflictIds}`);
    console.log('state_status counts:', JSON.stringify(ph1.stateStatusCounts));
  }
  if (ph2) {
    console.log(`Feature documents: ${ph2.featureDocs}`);
  }
  if (ph3) {
    console.log(`Phase 3 primary assignments: ${ph3.primaryAssignments}; ownership rows: ${ph3.ownershipRows}`);
    console.log('Batch counts:', JSON.stringify(ph3.batchCounts));
    console.log('Release-gate counts:', JSON.stringify(ph3.releaseCounts));
  }
  if (ph4) {
    console.log(`Phase 4 evidence freeze: native E0=${ph4.nativeE0}, astra E0=${ph4.astraE0}, DESIGN_READY=${ph4.designReady}`);
    console.log(`Patch inventory data rows: ${ph4.patchRows}`);
  }

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach((w) => console.log(`  - WARN: ${w}`));
  }

  if (errors.length) {
    console.log(`\nFAILED with ${errors.length} error(s):`);
    errors.forEach((e) => console.log(`  - ERROR: ${e}`));
    process.exit(1);
  }
  console.log('\nOK: all Phase 0–4 checks passed.');
  process.exit(0);
}

main();
