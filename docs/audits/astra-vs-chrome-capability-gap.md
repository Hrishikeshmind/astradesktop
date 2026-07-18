# Astra vs Chrome — Capability Gap Analysis

> **Audit-only. No marketing claims.** This is an engineering comparison for healthy
> competition, not dominance language. Baseline `feature/astra-migration-profiles` @ `1d27263`.
>
> "Chrome" here means Chrome/Chromium as a functional reference. Astra's foundation is Firefox
> 149 + Zen. Every "potential advantage" below still requires the evidence noted before any
> public statement.

## Column key
- **Foundation:** what the Firefox/Zen/Astra base provides.
- **Current Astra usability:** honest state today (source vs packaged vs runtime-tested).
- **Chrome advantage:** where Chrome is genuinely ahead.
- **Astra potential advantage:** realistic differentiators.
- **Work required:** to make the potential real.
- **Evidence required:** what must be proven before a public claim.

---

### Browsing compatibility
- **Foundation:** Gecko 149, modern web platform, HW decode, EME.
- **Current Astra usability:** packaged; runtime-unverified locally. Strict ETP + uBlock + WebRTC
  hardening + autoplay/DoH defaults may cause site-specific breakage (conflict #10).
- **Chrome advantage:** largest real-world site-compat surface; sites test Chrome first; Blink quirks are the de-facto target.
- **Astra potential advantage:** privacy-forward defaults without a second engine.
- **Work required:** compatibility checklist (banking/UPI/OAuth/streaming); per-site Suraksha exceptions.
- **Evidence required:** pass a defined compat matrix on a real build.

### Tabs / workspaces
- **Foundation:** Zen vertical tabs, Spaces/workspaces, essentials, folders, split-view, glance, compact.
- **Current Astra usability:** packaged; rich and differentiated.
- **Chrome advantage:** tab groups are simple and universally understood; huge extension ecosystem for tab tools.
- **Astra potential advantage:** **strong** — Spaces + folders + split-view + glance exceed Chrome's native tab model.
- **Work required:** crash-restore reliability (#19); onboarding so users understand Spaces vs Profiles (#3).
- **Evidence required:** restore matrix + usability testing.

### Migration
- **Foundation:** native Firefox MigrationWizard wrapped by Astra Migration Center.
- **Current Astra usability:** packaged; multiple entrypoints; delegates to native (no second engine).
- **Chrome advantage:** near-frictionless import from other Chromium browsers + Google account.
- **Astra potential advantage:** clear, guided import UX across browsers.
- **Work required:** per-browser import verification (Chrome/Edge/Brave); autofill/passwords.
- **Evidence required:** each resource type imports correctly.

### Profiles
- **Foundation:** toolkit `SelectableProfileService`, `browser.profiles.enabled=true`.
- **Current Astra usability:** packaged; native profiles + Astra hooks.
- **Chrome advantage:** polished profile switcher tied to Google identity; avatars.
- **Astra potential advantage:** local, account-free isolation.
- **Work required:** profile switcher UX; distinguish from Spaces/Sync in UI.
- **Evidence required:** isolation + launch tests.

### Sync
- **Foundation:** Mozilla Firefox Account + Sync (+ `services.sync.engine.workspaces`).
- **Current Astra usability:** packaged; **it is Firefox Sync** — must not be rebranded (#28, rules 12/13).
- **Chrome advantage:** seamless Google-account sync across all devices incl. Android/iOS.
- **Astra potential advantage:** none today; independent Astra Sync is Batch 6 (future).
- **Work required:** independent account/sync platform (large; legal).
- **Evidence required:** cannot claim "Astra Sync" until it exists independently.

### Passwords
- **Foundation:** Firefox Lockwise/password manager + breach alerts.
- **Current Astra usability:** packaged; Suraksha password adapter surfaces it.
- **Chrome advantage:** Google Password Manager cross-device + Android autofill integration.
- **Astra potential advantage:** local-first passwords + breach warnings without Google account.
- **Work required:** none new (rule 6: no second password manager); surface + educate.
- **Evidence required:** breach-alert + autofill tests.

### Privacy
- **Foundation:** ETP strict, TCP, GPC, query-stripping, DoH, telemetry off+locked, Fission/site isolation intact.
- **Current Astra usability:** packaged; **stronger defaults than Chrome**.
- **Chrome advantage:** perceived stability; no over-blocking; but weaker anti-tracking.
- **Astra potential advantage:** **strong** — genuinely more private out of the box; no ad-tech owner.
- **Work required:** avoid over-block breakage (#10); disclose DoH provider; reconsider clear-cookies-on-shutdown default (pref audit).
- **Evidence required:** compat matrix + third-party privacy verification before "more private" claims.

### Extensions
- **Foundation:** Firefox add-ons, signed-only, uBlock, extensions sidebar, policy allow/block.
- **Current Astra usability:** packaged; MV2-capable content blocking (uBlock full power).
- **Chrome advantage:** far larger store; but MV3 weakens content blockers.
- **Astra potential advantage:** **strong for blocking** — full uBlock vs Chrome MV3 limits.
- **Work required:** curate recommended add-ons; policy templates for CORP.
- **Evidence required:** blocker efficacy comparison (careful, non-marketing).

### DevTools
- **Foundation:** full Firefox DevTools (`MOZ_DEVTOOLS=all`), Browser Toolbox, remote/add-on debugging.
- **Current Astra usability:** packaged; two-tier UX planned (Developer Hub).
- **Chrome advantage:** DevTools are the industry default; more extensions/tutorials target them.
- **Astra potential advantage:** beginner + advanced tiers over full native tools.
- **Work required:** Developer Hub (Batch 3); document shortcut remaps (#25/#29).
- **Evidence required:** all panels functional on real build.

### PDF / Reader
- **Foundation:** pdf.js (annotate/sign/forms), Reader Mode + Read-Aloud.
- **Current Astra usability:** packaged; Astra adds Read-Aloud shortcut + highlight defaults.
- **Chrome advantage:** fast built-in PDF; but no Reader Mode / narrate.
- **Astra potential advantage:** **strong** — PDF annotate/sign + Reader + Read-Aloud beat Chrome for students.
- **Work required:** Student shortcuts (Batch 1); verify sign/forms/print.
- **Evidence required:** PDF workflow tests.

### Translation
- **Foundation:** on-device Bergamot translation + downloadable models.
- **Current Astra usability:** packaged; models runtime-downloaded; Indian-language emphasis.
- **Chrome advantage:** instant cloud translation, huge language coverage, high quality.
- **Astra potential advantage:** **on-device/private** translation (privacy differentiator).
- **Work required:** verify Indian-language pairs; offline behavior.
- **Evidence required:** per-language-pair quality/coverage before quality claims.

### Accessibility
- **Foundation:** platform a11y, zoom, reduced-motion/contrast, keyboard nav, captions, Accessibility Inspector.
- **Current Astra usability:** native strong; **custom Astra/Zen panels need a11y audit** (#26).
- **Chrome advantage:** mature, heavily-tested AT support.
- **Astra potential advantage:** parity possible; Read-Aloud + reader are pluses.
- **Work required:** ARIA/keyboard audit of App Hub/Suraksha/Spaces/welcome; AT testing.
- **Evidence required:** NVDA/JAWS/VoiceOver/Orca pass before accessibility claims.

### Media / DRM
- **Foundation:** Widevine EME, WMF CDM, HW decode, PiP, Media Session, captions.
- **Current Astra usability:** packaged; CDM runtime-downloaded; media controls UI off by default.
- **Chrome advantage:** widest streaming-service certification, higher DRM tiers (some 4K paths), casting.
- **Astra potential advantage:** solid 1080p streaming + PiP; truthful Media Readiness panel.
- **Work required:** verify per-service playback; media protection vs savers (#11/#13/#30); consider enabling media controls.
- **Evidence required:** **never** claim "Netflix certified / 4K / all services / casting" without proof.

### Enterprise policy
- **Foundation:** full 118-policy EnterprisePolicies engine + GPO parser (native).
- **Current Astra usability:** packaged; **no bundled policy file / ADMX** yet.
- **Chrome advantage:** vast, mature admin ecosystem; Google Admin Console; ubiquitous ADMX.
- **Astra potential advantage:** real Firefox-grade policy engine, unstripped.
- **Work required:** ship `policies.json` template + Astra ADMX + docs (Batch 4).
- **Evidence required:** deployment + update proof before "enterprise-ready."

### Updates
- **Foundation:** toolkit updater retargeted to Astra host.
- **Current Astra usability:** packaged; **`--enable-unverified-updates` (integrity gap)**.
- **Chrome advantage:** rock-solid signed auto-update at scale.
- **Astra potential advantage:** controllable channels + pinning via policy.
- **Work required:** signed/verified updates + rollback proof (Batch 5).
- **Evidence required:** cannot claim secure auto-update until signing verified.

### Recovery
- **Foundation:** session/crash restore (two stores — #19), troubleshooting mode, reset/refresh, `about:support`.
- **Current Astra usability:** packaged; **crash reporter not shipped**.
- **Chrome advantage:** robust crash recovery + reporting.
- **Astra potential advantage:** Spaces-aware recovery.
- **Work required:** reconcile session stores (#19); decide on local crash diagnostics.
- **Evidence required:** crash-restore matrix.

### Mobile continuity
- **Foundation:** none in this desktop repo.
- **Current Astra usability:** absent.
- **Chrome advantage:** **large** — seamless desktop↔Android/iOS.
- **Astra potential advantage:** future (Batch 6).
- **Work required:** mobile product + continuity backend.
- **Evidence required:** cannot claim mobile continuity.

### AI foundations
- **Foundation:** Firefox ML (`browser.ml.*`), on-device model hub, chat sidebar; link-preview off.
- **Current Astra usability:** packaged; prefs enabled (note contradictory comment — pref audit).
- **Chrome advantage:** Gemini integration + cloud AI scale.
- **Astra potential advantage:** on-device/private AI options.
- **Work required:** clarify AI defaults; no hidden cloud services (rule 23).
- **Evidence required:** disclose what runs locally vs remotely before AI privacy claims.

### Performance
- **Foundation:** Fission/e10s (adaptive process count restored), tab unloader, Energy/RAM Saver, HW accel restored to upstream.
- **Current Astra usability:** packaged; performance prefs reverted to sane upstream (pref audit = healthy).
- **Chrome advantage:** benchmark-leading JS/startup on many workloads; V8.
- **Astra potential advantage:** lower RAM via unloader/savers on many-tab workloads.
- **Work required:** benchmarks (rule 15); media-protection so savers don't harm playback.
- **Evidence required:** **no performance claims without benchmarks**.

### User onboarding
- **Foundation:** Astra Welcome (import → experience → appearance → start), personas planned.
- **Current Astra usability:** packaged; needs persona wiring (Batch 2).
- **Chrome advantage:** minimal, familiar, frictionless; Google sign-in.
- **Astra potential advantage:** **strong** — guided, account-free, persona-based 3-minute setup.
- **Work required:** personas (Batch 2); a11y/l10n on welcome.
- **Evidence required:** first-run usability + accessibility pass.

---

## Where Astra can realistically compete (summary, evidence-gated)
- **Strong potential differentiators:** privacy defaults, full-power content blocking (uBlock vs
  MV3), Spaces/tabs/workspaces, PDF+Reader+Read-Aloud for students, on-device translation,
  guided account-free onboarding, unstripped enterprise policy engine.
- **Genuine Chrome advantages to respect:** raw site compatibility, mobile continuity, Google-account
  sync ecosystem, streaming certification/casting, enterprise admin ecosystem maturity, benchmark
  performance on some workloads.
- **Hard gates before any public claim:** completed build + runtime tests (Batch 0), compat matrix
  (#10), signed updates (#27), a11y + Indian-language verification, benchmarks for any perf claim,
  and truthful media/DRM status (no certification claims).

The goal is a **healthy, honest competitor**: lead with privacy, workspaces, students, and
account-free onboarding; be candid about compatibility, mobile, and sync.
