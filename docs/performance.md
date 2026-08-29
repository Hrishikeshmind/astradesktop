# Recommended Performance Settings

In **Settings → Tabs and browsing → Performance**, Astra shows engine-managed status and a **Use recommended performance settings** option. This page explains what that toggle does.

## What “recommended performance settings” tunes

When enabled, Astra follows Firefox’s balanced performance profile:

- **Hardware acceleration** stays on when your GPU and drivers support it (faster video and compositing).
- **Process settings** follow the engine default for your platform (site isolation / Fission where available).
- **Tab unloading** can respond sooner under memory pressure (works together with Smart Suspend in Tab Management).

When disabled, you can change individual advanced prefs yourself; most users should leave the recommended profile on.

## What this setting does *not* do

- It does **not** invent per-tab RAM numbers — the Performance panel only reports what the engine exposes.
- It is **not** the same as **Low bandwidth mode** (Settings → Look and Feel → Theme), which blocks images/autoplay/fonts to save data.
- It does **not** replace **Smart Suspend** in Tab Management, which controls how aggressively background tabs sleep.

## Related tools

From the Performance section you can open:

- **Task Manager** — see which tabs and extensions use CPU/memory.
- **Unloads** — inspect tabs the engine has unloaded.
- **Memory** — `about:memory` for advanced diagnostics.

## Need help?

If the browser feels slow after a change, reset **Use recommended performance settings** to on and restart Astra. Still stuck? [Open a bug report](https://github.com/Hrishikeshmind/astradesktop/issues/new?labels=bug).

*Astra Browser · [github.com/Hrishikeshmind/astradesktop](https://github.com/Hrishikeshmind/astradesktop)*
