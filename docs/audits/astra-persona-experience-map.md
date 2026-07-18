# Astra Persona Experience Map

> **Audit-only design document.** No presets, prefs, or code are created/activated in this
> pass. Baseline `feature/astra-migration-profiles` @ `1d27263`.

## Design principles (binding constraints)

Presets are **lightweight, reversible suggestion layers**. A preset may configure ONLY:
- suggested **Spaces** (Zen workspaces / templates)
- **App Hub** category visibility
- **toolbar** suggestions
- **onboarding** guidance
- native-feature **shortcuts**
- **appearance** suggestions

A preset **must not**:
- create a separate browser backend
- weaken security (ETP/Fission/sandbox/Safe Browsing/signatures)
- silently enable cloud services
- force accounts
- **override enterprise policy** (policy always wins — conflict #24)
- prevent later customization
- duplicate user data

Every user can change presets later. A preset is a *starting configuration*, not a mode lock.

## How a preset is applied (proposed, non-binding)
1. Read `Services.policies` first; any policy-locked pref is left untouched.
2. Apply only *unlocked* suggestion prefs + Space templates + App Hub visibility.
3. Persist the chosen preset id (e.g. `astra.persona.selected`) so it can be re-shown/changed.
4. Never write to another user's profile; never create profiles implicitly.

---

## SIMPLE (default for Normal Users)
- **Goal:** clean, safe, fast; three-minute setup; zero jargon.
- **Onboarding:** Welcome → Import → Choose experience (Simple preselected) → Choose appearance → Start.
- **Spaces:** one default Space ("Personal").
- **App Hub visibility:** Mail, Storage, Entertainment, Shopping, News, Gov Services (India-relevant).
- **Toolbar:** urlbar, Suraksha button, Downloads, App Hub. Compact optional.
- **Shortcuts surfaced:** Reader, Screenshot (Ctrl+Shift+S), Translate, PiP.
- **Appearance:** light/dark auto, Transparent Mode on (per current default), gradient theme.
- **Never exposes:** XUL, Gecko, prefs, Spaces internals, policies, migration internals.
- **Security:** inherits Astra strict defaults; nothing weakened.

## STUDENT
- **Goal:** reading, research, classes, note-taking, low distraction.
- **Spaces (templates):** **Study**, **Research**, **Classes**.
  - Study: Reader/Read-Aloud shortcuts, PDF pinned, Focus/compact.
  - Research: tab search (`%`), split-view, folders for sources, bookmarks.
  - Classes: App Hub education apps pinned; mic/cam/screen-share reminder.
- **App Hub visibility:** Education (Classroom, Teams-Edu, Zoom-Edu, SWAYAM), Productivity, Storage, Mail.
- **Native features surfaced:** PDF viewer + highlight/annotate, Reader + Read-Aloud, Translations (Indian-language emphasis), Screenshots (full-page), PiP for lectures, spellcheck.
- **Appearance:** reduced-motion respected; high-contrast reader option.
- **Integrations:** Study Space ↔ PDF/Reader; Classes Space ↔ App Hub education + WebRTC permissions.
- **No new engines** (uses native PDF/translation/reader).

## DEVELOPER (two UX levels)
- **Goal:** fast access to native DevTools without replacing them.
- **BEGINNER tier (Developer Hub):**
  - Simple tool names ("Inspect", "Console", "Network"), one-line explanations, safe shortcuts.
  - Launches native DevTools panels; **no loss of native functionality**.
  - localhost/project launcher; testing-profile shortcut (`about:newprofile`).
- **ADVANCED tier:**
  - Direct native DevTools (F12), Browser Toolbox (Ctrl+Shift+Alt+I), Browser Console (Ctrl+Shift+J), Profiler, remote/add-on debugging (`about:debugging`), full keyboard access.
- **Spaces (templates):** **Dev** (per-project), localhost pinned, split-view for docs+app.
- **App Hub visibility:** Work (GitHub/Slack/Trello/Linear-style), Productivity.
- **Shortcuts:** respects Astra Inspector remap (C→L) but keeps native defaults reachable; documents remaps (conflict #25/#29).
- **Never** replaces Firefox DevTools (rule 9).

## WORK (corporate, non-managed)
- **Goal:** work/personal separation, managed-browser awareness (preview), productivity apps.
- **Spaces (templates):** **Work** (containers for work identity), **Personal**.
- **App Hub visibility:** Mail (Outlook/M365), Meetings (Teams/Zoom/Meet/Webex), Storage (OneDrive/Drive/Dropbox), Productivity (M365/Notion), Work (Slack/Trello/Freshdesk).
- **Native features surfaced:** containers, profiles, Managed-Browser status panel (when policies present), certificate visibility, proxy/DoH status.
- **Enterprise:** if EnterprisePolicies active, **policy wins**; preset only suggests within unlocked space.
- **Never** silently enables Sync or accounts.

## ENTERTAINMENT
- **Goal:** streaming, media, comfortable playback.
- **Spaces (templates):** **Watch**.
- **App Hub visibility:** Entertainment (YouTube, Netflix, JioHotstar, Spotify, JioSaavn, Prime), plus Media Readiness entry.
- **Native features surfaced:** PiP, fullscreen, HW decode status, Media Session/global media controls (candidate to enable after test), captions, autoplay control.
- **Media Readiness panel:** truthful DRM (Widevine) / hardware-accel / PiP status — **no** "Netflix certified / guaranteed 4K / all services" claims.
- **Media protection:** playing/PiP tabs exempt from Energy/RAM Saver + unloader (conflicts #11/#13/#30) — verify before shipping preset.

## CUSTOM
- **Goal:** power users assemble their own.
- Starts from Simple; every Space/App-Hub/toolbar/appearance choice is individually editable.
- No preset lock; can import another preset's suggestions à la carte.

## GOVERNMENT — **managed-environment preview only**
- **Not a selectable consumer persona.** Remains behind managed deployment until:
  - independent security audit (update signing, sandbox posture),
  - telemetry/update/offline documentation,
  - accessibility + Indian-language verification,
  - compliance/legal review.
- Configured via EnterprisePolicies + distribution, **not** a one-click persona.
- No prohibited claims (certified/military-grade/unhackable) anywhere in UI or docs.

---

## Preset → capability mapping (summary)

| Preset | Suggested Spaces | App Hub categories | Key native shortcuts | Appearance |
|---|---|---|---|---|
| Simple | Personal | Mail, Storage, Entertainment, Shopping, News, Gov | Reader, Screenshot, Translate, PiP | auto theme, glass |
| Student | Study, Research, Classes | Education, Productivity, Storage, Mail | PDF, Reader/Read-Aloud, Translate, Screenshot, PiP | reduced-motion, reader contrast |
| Developer | Dev (per-project) | Work, Productivity | DevTools/Toolbox/Console, testing profile | compact optional |
| Work | Work, Personal | Mail, Meetings, Storage, Productivity, Work | containers, profiles, managed status | neutral |
| Entertainment | Watch | Entertainment + Media Readiness | PiP, media controls, fullscreen | rich/glass |
| Custom | user-defined | user-defined | user-defined | user-defined |
| Government (preview) | policy-defined | policy-defined | policy-defined | policy-defined |

## Reversibility & data-ownership guarantees
- Presets never duplicate bookmarks/passwords/history (those stay in Places / profile).
- Switching presets re-suggests Spaces/App-Hub visibility; it does not delete user data.
- Enterprise policy state is read-only to presets.
- Chosen preset is a single pref; clearing it returns to Simple.
