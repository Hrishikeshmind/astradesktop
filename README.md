# Add-ons Support for Astra

Astra is still in **public beta**. Extension and add-on support is available today, but a dedicated Astra add-ons marketplace is **not live yet**. This page explains what works now, what we are building next, and where to get help.

---

## What works today

### Firefox-compatible extensions

Astra is built on Mozilla Firefox technology, so most **Firefox WebExtensions** work in Astra today.

You can:

- Install extensions from [addons.mozilla.org](https://addons.mozilla.org/) (AMO)
- Manage installed extensions from **Settings ΓåÆ Extensions and themes ΓåÆ Extensions** (`about:addons`)
- Enable, disable, update, and remove extensions like uBlock Origin, password managers, and other WebExtensions

> **Note:** Some Firefox-only or Mozilla-specific extensions may not work. If an extension fails to install or run, please [report it on GitHub](https://github.com/Hrishikeshmind/astradesktop/issues/new?labels=bug).

### Built-in browser plugins

Required media plugins (such as OpenH264 and Widevine) are bundled for compatibility with video and encrypted streaming sites. Manage them under **Plugins** in the add-ons manager.

### Astra Mods (themes and UI customization)

Astra includes a **Mods** system for themes and interface customization. Open **Settings ΓåÆ Astra Mods** to:

- Import and export mods
- Apply community themes
- Check for mod updates

This is separate from the Firefox extension ecosystem and is maintained by the Astra project.

---

## What is not available yet

| Feature | Status |
| --- | --- |
| Dedicated **Astra Add-ons Store** | Planned ΓÇö not launched |
| Curated India-first extension collection | Planned |
| First-party Astra extensions catalog | Planned |
| Developer portal for publishing Astra-specific add-ons | Planned |
| In-browser add-on recommendations pane | Disabled by design in Astra |

If you clicked **Add-ons Support** in the add-ons manager and landed here, that is expected ΓÇö we do not have a Mozilla Support (SUMO) page for Astra yet.

---

## Our roadmap for add-ons

We are taking a deliberate, privacy-first approach rather than copying MozillaΓÇÖs add-ons marketplace wholesale.

### Phase 1 ΓÇö Foundation (current)

- Stable Firefox WebExtension compatibility
- Sensible defaults: no Mozilla recommendation spam, no discovery pane
- uBlock Origin and other essential extensions packaged where appropriate
- Astra Mods for visual and UI customization

### Phase 2 ΓÇö Curated catalog (next)

- A **curated list** of extensions tested with Astra
- Clear compatibility notes per extension
- Better in-product links from the add-ons manager
- Documentation for common extension setup (ad blockers, password managers, etc.)

### Phase 3 ΓÇö Astra Add-ons Store (future)

- A dedicated place to discover extensions and mods **for Astra**
- Support for India-relevant tools, regional services, and privacy-focused add-ons
- Developer guidelines and a submission process
- Signed / reviewed listings where practical for user safety

### Phase 4 ΓÇö Ecosystem (longer term)

- APIs and tooling for Astra-specific extension features (workspace integration, vertical tabs, compact mode hooks)
- Community themes and mods marketplace with import/export
- Partnerships with open-source extension authors

Timelines will depend on beta feedback and contributor capacity. We will update this page as milestones ship.

---

## Getting help right now

| Need | Where to go |
| --- | --- |
| Extension not working | [Report a bug](https://github.com/Hrishikeshmind/astradesktop/issues/new?labels=bug) |
| Feature request (add-ons store, new mod types) | [Open a discussion / issue](https://github.com/Hrishikeshmind/astradesktop/issues/new?labels=enhancement) |
| General browser help | [GitHub Issues](https://github.com/Hrishikeshmind/astradesktop/issues) |
| Releases and changelog | [GitHub Releases](https://github.com/Hrishikeshmind/astradesktop/releases) |

When reporting an extension problem, please include:

1. Astra version (**Help ΓåÆ About Astra**)
2. Extension name and version
3. Steps to reproduce
4. Whether the same extension works in Firefox on your system

---

## Frequently asked questions

### Can I use Chrome extensions in Astra?

No. Astra supports **Firefox WebExtensions** only (the same format used on addons.mozilla.org).

### Why does Astra hide the ΓÇ£RecommendationsΓÇ¥ pane?

Astra disables MozillaΓÇÖs add-on discovery and recommendation UI to reduce clutter and keep the experience focused. You can still search and install from AMO when needed.

### Will there be an Astra-only extension format?

Not initially. We plan to stay compatible with the open WebExtension standard. Astra-specific enhancements may come later as optional APIs, not a separate walled garden.

### I am a developer ΓÇö can I publish an add-on for Astra today?

Publish to **addons.mozilla.org** as a Firefox extension. If it works in Firefox, it will likely work in Astra. When the Astra catalog launches, we will publish submission guidelines here.

### How do I stay updated?

Watch the [repository](https://github.com/Hrishikeshmind/astradesktop), follow [releases](https://github.com/Hrishikeshmind/astradesktop/releases), and check this page for updates.

---

## Related pages

- [Astra README](../README.md) ΓÇö project overview and features
- [Contributing guide](./contribute.md) ΓÇö how to help build Astra

---

*Last updated: August 2026 ┬╖ Astra Browser ┬╖ [github.com/Hrishikeshmind/astradesktop](https://github.com/Hrishikeshmind/astradesktop)*
