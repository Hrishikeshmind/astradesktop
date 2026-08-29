# Add-ons Help for Astra

Astra is still in **public beta**. Extension and add-on support is available today, but a dedicated Astra add-ons marketplace is **not live yet**. This page explains what works now, what we are building next, and where to get help.

---

## What works today

### Firefox-compatible extensions

Astra is built on Mozilla Firefox technology, so most **Firefox WebExtensions** work in Astra today.

You can:

- Install extensions from [addons.mozilla.org](https://addons.mozilla.org/) (AMO)
- Manage installed extensions from **Settings → Extensions and themes → Extensions** (`about:addons`)
- Enable, disable, update, and remove extensions like uBlock Origin, password managers, and other WebExtensions

> **Note:** Some Firefox-only or Mozilla-specific extensions may not work. If an extension fails to install or run, please [report it on GitHub](https://github.com/Hrishikeshmind/astradesktop/issues/new?labels=bug).

### Built-in browser plugins

Required media plugins (such as OpenH264 and Widevine) are bundled for compatibility with video and encrypted streaming sites. Manage them under **Plugins** in the add-ons manager.

### Astra Mods (themes and UI customization)

Astra includes a **Mods** system for themes and interface customization. Open **Settings → Astra Mods** to:

- Import and export mods
- Apply community themes
- Check for mod updates

This is separate from the Firefox extension ecosystem and is maintained by the Astra project.

---

## What is not available yet

| Feature | Status |
| --- | --- |
| Dedicated **Astra Add-ons Store** | Planned — not launched |
| Curated India-first extension collection | Planned |
| First-party Astra extensions catalog | Planned |
| Developer portal for publishing Astra-specific add-ons | Planned |
| In-browser add-on recommendations pane | Disabled by design in Astra |

If you clicked **Add-ons Support** in the add-ons manager and landed here, that is expected.

---

## Getting help right now

| Need | Where to go |
| --- | --- |
| Extension not working | [Report a bug](https://github.com/Hrishikeshmind/astradesktop/issues/new?labels=bug) |
| Feature request | [Open an issue](https://github.com/Hrishikeshmind/astradesktop/issues/new?labels=enhancement) |
| General browser help | [GitHub Issues](https://github.com/Hrishikeshmind/astradesktop/issues) |
| Releases and changelog | [GitHub Releases](https://github.com/Hrishikeshmind/astradesktop/releases) |

When reporting an extension problem, please include:

1. Astra version (**Help → About Astra**)
2. Extension name and version
3. Steps to reproduce
4. Whether the same extension works in Firefox on your system

---

## Frequently asked questions

### Can I use Chrome extensions in Astra?

No. Astra supports **Firefox WebExtensions** only (the same format used on addons.mozilla.org).

### Why does Astra hide the “Recommendations” pane?

Astra disables Mozilla’s add-on discovery and recommendation UI to reduce clutter. You can still search and install from AMO when needed.

### I am a developer — can I publish an add-on for Astra today?

Publish to **addons.mozilla.org** as a Firefox extension. If it works in Firefox, it will likely work in Astra.

---

## Related pages

- [Community](./community.md)
- [Contributing guide](./contribute.md)

*Last updated: August 2026 · Astra Browser · [github.com/Hrishikeshmind/astradesktop](https://github.com/Hrishikeshmind/astradesktop)*
