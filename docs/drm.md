# DRM-Controlled Content in Astra

Some streaming sites (Netflix, Disney+, Spotify, and similar services) protect their media with **DRM** — Digital Rights Management. Astra needs permission to play that protected content in the browser.

## What the setting does

In **Settings → Tabs and browsing → Media**, the option **Play DRM-controlled content** lets Astra use the Widevine module (bundled with the browser) so protected video and audio can play.

- **On (default):** Streaming sites that require DRM can play normally.
- **Off:** Protected streams may fail or show a playback error. Open web video without DRM is unaffected.

## Why this setting exists

DRM is required by many commercial streaming services. Astra does not create or enforce DRM — it only enables the same playback stack Firefox uses so sites you choose to visit can work.

## Privacy note

Enabling DRM allows licensed media modules to run. It does not give Astra or Mozilla access to what you watch; playback still happens between you and the site.

## Need help?

If a site fails to play with DRM enabled, [report a bug](https://github.com/Hrishikeshmind/astradesktop/issues/new?labels=bug) with the site name and Astra version from **Help → About Astra**.

*Astra Browser · [github.com/Hrishikeshmind/astradesktop](https://github.com/Hrishikeshmind/astradesktop)*
