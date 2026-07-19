# Astra Feature Design Documents (Phase 2)

> Source identity: `HUMAN_APPROVED_ASTRA_62_CATALOG_2026-07-19`
> Baseline: `architecture/astra-capability-rfcs` @ `29d95dd9ee311331f328e4c57162bddc7a900d36`
>
> Exactly **62** feature documents, one per canonical registry capability.
> Within each group, capabilities are listed **lowest-risk classification first**:
> `USE_NATIVE` → `EXPOSE_NATIVE` → `ENABLE_AFTER_TEST` → `ASTRA_UX_WRAPPER` → `INTEGRATE`.
>
> Evidence policy: `native_evidence` remains **E0** while the pinned Firefox `engine/` tree
> is absent. Feature-document existence does **not** advance readiness to
> `DESIGN_READY_FOR_IMPLEMENTATION`.

## Traceability

See [`../architecture/astra-feature-traceability.md`](../architecture/astra-feature-traceability.md).

## Student & Reading

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-001` | PDF viewing and navigation | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-001-pdf-viewing-and-navigation.md](./ASTRA-CAP-001-pdf-viewing-and-navigation.md) |
| `ASTRA-CAP-003` | PDF forms support | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-003-pdf-forms-support.md](./ASTRA-CAP-003-pdf-forms-support.md) |
| `ASTRA-CAP-002` | PDF annotations and editing tools | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-002-pdf-annotations-and-editing.md](./ASTRA-CAP-002-pdf-annotations-and-editing.md) |
| `ASTRA-CAP-004` | PDF signatures | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-004-pdf-signatures.md](./ASTRA-CAP-004-pdf-signatures.md) |
| `ASTRA-CAP-005` | Print / Save as PDF workflows | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-005-print-save-as-pdf.md](./ASTRA-CAP-005-print-save-as-pdf.md) |
| `ASTRA-CAP-006` | Reader Mode | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-006-reader-mode.md](./ASTRA-CAP-006-reader-mode.md) |
| `ASTRA-CAP-008` | On-device webpage translation | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-008-on-device-webpage-translation.md](./ASTRA-CAP-008-on-device-webpage-translation.md) |
| `ASTRA-CAP-010` | Page and full-page screenshots | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-010-page-and-full-page-screenshots.md](./ASTRA-CAP-010-page-and-full-page-screenshots.md) |
| `ASTRA-CAP-009` | Translation model download and offline status | `ENABLE_AFTER_TEST` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-009-translation-model-download-offline.md](./ASTRA-CAP-009-translation-model-download-offline.md) |
| `ASTRA-CAP-007` | Narrate / Read Aloud | `ASTRA_UX_WRAPPER` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-007-narrate-read-aloud.md](./ASTRA-CAP-007-narrate-read-aloud.md) |

## Everyday Productivity

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-011` | Downloads management and search | `USE_NATIVE` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-011-downloads-management-and-search.md](./ASTRA-CAP-011-downloads-management-and-search.md) |
| `ASTRA-CAP-012` | Bookmarks, history and Places | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-012-bookmarks-history-places.md](./ASTRA-CAP-012-bookmarks-history-places.md) |
| `ASTRA-CAP-014` | Session restore and recently closed tabs/windows | `USE_NATIVE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-014-session-restore-and-recently-closed.md](./ASTRA-CAP-014-session-restore-and-recently-closed.md) |
| `ASTRA-CAP-013` | Open-tab search / urlbar TABS mode | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-013-open-tab-search-urlbar-tabs.md](./ASTRA-CAP-013-open-tab-search-urlbar-tabs.md) |

## Media & Classes

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-016` | Camera, microphone and screen-sharing permissions | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-016-camera-microphone-screen-sharing-permissions.md](./ASTRA-CAP-016-camera-microphone-screen-sharing-permissions.md) |
| `ASTRA-CAP-015` | Picture-in-Picture | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-015-picture-in-picture.md](./ASTRA-CAP-015-picture-in-picture.md) |

## Language & Access

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-017` | Spellcheck and dictionaries | `ENABLE_AFTER_TEST` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-017-spellcheck-and-dictionaries.md](./ASTRA-CAP-017-spellcheck-and-dictionaries.md) |
| `ASTRA-CAP-018` | Zoom, contrast, reduced motion and keyboard navigation | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-018-zoom-contrast-reduced-motion-keyboard-nav.md](./ASTRA-CAP-018-zoom-contrast-reduced-motion-keyboard-nav.md) |

## Developer

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-027` | Service Worker inspection | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-027-devtools-service-worker-inspection.md](./ASTRA-CAP-027-devtools-service-worker-inspection.md) |
| `ASTRA-CAP-028` | WebSocket inspection | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-028-devtools-websocket-inspection.md](./ASTRA-CAP-028-devtools-websocket-inspection.md) |
| `ASTRA-CAP-029` | Source maps and CSS grid/flex tools | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-029-devtools-source-maps-css-grid-flex.md](./ASTRA-CAP-029-devtools-source-maps-css-grid-flex.md) |
| `ASTRA-CAP-019` | Page Inspector | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-019-devtools-page-inspector.md](./ASTRA-CAP-019-devtools-page-inspector.md) |
| `ASTRA-CAP-020` | Web Console | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-020-devtools-web-console.md](./ASTRA-CAP-020-devtools-web-console.md) |
| `ASTRA-CAP-021` | JavaScript Debugger | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-021-devtools-javascript-debugger.md](./ASTRA-CAP-021-devtools-javascript-debugger.md) |
| `ASTRA-CAP-022` | Network Monitor | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-022-devtools-network-monitor.md](./ASTRA-CAP-022-devtools-network-monitor.md) |
| `ASTRA-CAP-023` | Storage Inspector | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-023-devtools-storage-inspector.md](./ASTRA-CAP-023-devtools-storage-inspector.md) |
| `ASTRA-CAP-024` | Responsive Design Mode | `EXPOSE_NATIVE` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-024-devtools-responsive-design-mode.md](./ASTRA-CAP-024-devtools-responsive-design-mode.md) |
| `ASTRA-CAP-030` | Browser Console | `ENABLE_AFTER_TEST` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-030-devtools-browser-console.md](./ASTRA-CAP-030-devtools-browser-console.md) |
| `ASTRA-CAP-031` | Browser Toolbox / chrome debugging | `ENABLE_AFTER_TEST` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-031-devtools-browser-toolbox.md](./ASTRA-CAP-031-devtools-browser-toolbox.md) |
| `ASTRA-CAP-032` | Remote and add-on debugging | `ENABLE_AFTER_TEST` | `ASTRA_ENTRYPOINT` | `DISCOVERED` | [ASTRA-CAP-032-devtools-remote-and-addon-debugging.md](./ASTRA-CAP-032-devtools-remote-and-addon-debugging.md) |
| `ASTRA-CAP-025` | Accessibility Inspector | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-025-devtools-accessibility-inspector.md](./ASTRA-CAP-025-devtools-accessibility-inspector.md) |
| `ASTRA-CAP-026` | Performance Profiler | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-026-devtools-performance-profiler.md](./ASTRA-CAP-026-devtools-performance-profiler.md) |

## Corporate

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-033` | EnterprisePolicies engine | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-033-enterprise-policies-engine.md](./ASTRA-CAP-033-enterprise-policies-engine.md) |
| `ASTRA-CAP-042` | Offline/silent deployment foundation | `ENABLE_AFTER_TEST` | `DEEP_INTEGRATION` | `NEEDS_CLARIFICATION` | [ASTRA-CAP-042-offline-silent-deployment-foundation.md](./ASTRA-CAP-042-offline-silent-deployment-foundation.md) |
| `ASTRA-CAP-034` | Windows GPO / ADMX deployment support | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `NEEDS_CLARIFICATION` | [ASTRA-CAP-034-windows-gpo-admx-deployment.md](./ASTRA-CAP-034-windows-gpo-admx-deployment.md) |
| `ASTRA-CAP-037` | Proxy and DoH policy controls | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-037-proxy-and-doh-policy-controls.md](./ASTRA-CAP-037-proxy-and-doh-policy-controls.md) |
| `ASTRA-CAP-038` | Enterprise roots and internal certificate authorities | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-038-enterprise-roots-internal-cas.md](./ASTRA-CAP-038-enterprise-roots-internal-cas.md) |
| `ASTRA-CAP-041` | Managed-browser / about:policies status | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-041-managed-browser-about-policies-status.md](./ASTRA-CAP-041-managed-browser-about-policies-status.md) |
| `ASTRA-CAP-035` | Managed bookmarks | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-035-managed-bookmarks.md](./ASTRA-CAP-035-managed-bookmarks.md) |
| `ASTRA-CAP-036` | Extension allowlist/blocklist and install policies | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-036-extension-allowlist-blocklist-policies.md](./ASTRA-CAP-036-extension-allowlist-blocklist-policies.md) |
| `ASTRA-CAP-039` | Update policy and channel control | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-039-update-policy-and-channel-control.md](./ASTRA-CAP-039-update-policy-and-channel-control.md) |
| `ASTRA-CAP-040` | Telemetry and crash-report policy controls | `INTEGRATE` | `DEEP_INTEGRATION` | `NEEDS_CLARIFICATION` | [ASTRA-CAP-040-telemetry-and-crash-report-policy.md](./ASTRA-CAP-040-telemetry-and-crash-report-policy.md) |

## Entertainment

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-044` | OpenH264 / Windows media decoding | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-044-openh264-windows-media-decoding.md](./ASTRA-CAP-044-openh264-windows-media-decoding.md) |
| `ASTRA-CAP-047` | Autoplay controls | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-047-autoplay-controls.md](./ASTRA-CAP-047-autoplay-controls.md) |
| `ASTRA-CAP-048` | Fullscreen, subtitles and captions | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-048-fullscreen-subtitles-captions.md](./ASTRA-CAP-048-fullscreen-subtitles-captions.md) |
| `ASTRA-CAP-049` | Audio tab indicator and mute controls | `USE_NATIVE` | `NATIVE_ONLY` | `NEEDS_CLARIFICATION` | [ASTRA-CAP-049-audio-tab-indicator-and-mute.md](./ASTRA-CAP-049-audio-tab-indicator-and-mute.md) |
| `ASTRA-CAP-043` | Widevine / EME protected playback | `ENABLE_AFTER_TEST` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-043-widevine-eme-protected-playback.md](./ASTRA-CAP-043-widevine-eme-protected-playback.md) |
| `ASTRA-CAP-046` | Media Session / global media controls | `ENABLE_AFTER_TEST` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-046-media-session-global-media-controls.md](./ASTRA-CAP-046-media-session-global-media-controls.md) |
| `ASTRA-CAP-045` | Hardware acceleration and video decode status | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-045-hardware-acceleration-video-decode-status.md](./ASTRA-CAP-045-hardware-acceleration-video-decode-status.md) |

## Identity & Separation

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-053` | Bookmarks, passwords and history import resources | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-053-bookmarks-passwords-history-import.md](./ASTRA-CAP-053-bookmarks-passwords-history-import.md) |
| `ASTRA-CAP-054` | Existing Firefox Account / Sync identity | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-054-firefox-account-sync-identity.md](./ASTRA-CAP-054-firefox-account-sync-identity.md) |
| `ASTRA-CAP-050` | Container tabs / contextual identities | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-050-container-tabs-contextual-identities.md](./ASTRA-CAP-050-container-tabs-contextual-identities.md) |
| `ASTRA-CAP-051` | Native local profiles and switcher | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-051-native-local-profiles-and-switcher.md](./ASTRA-CAP-051-native-local-profiles-and-switcher.md) |
| `ASTRA-CAP-052` | Native browser migration wizard | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-052-native-browser-migration-wizard.md](./ASTRA-CAP-052-native-browser-migration-wizard.md) |

## Privacy & Security

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-055` | Enhanced Tracking Protection | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-055-enhanced-tracking-protection.md](./ASTRA-CAP-055-enhanced-tracking-protection.md) |
| `ASTRA-CAP-056` | Total Cookie Protection | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-056-total-cookie-protection.md](./ASTRA-CAP-056-total-cookie-protection.md) |
| `ASTRA-CAP-059` | HTTPS and DNS modes | `ASTRA_UX_WRAPPER` | `ASTRA_UX_WRAPPER` | `DISCOVERED` | [ASTRA-CAP-059-https-and-dns-modes.md](./ASTRA-CAP-059-https-and-dns-modes.md) |
| `ASTRA-CAP-057` | Safe Browsing and download protection | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-057-safe-browsing-and-download-protection.md](./ASTRA-CAP-057-safe-browsing-and-download-protection.md) |
| `ASTRA-CAP-058` | Site permissions and clear-site-data controls | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-058-site-permissions-and-clear-site-data.md](./ASTRA-CAP-058-site-permissions-and-clear-site-data.md) |

## Reliability

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-060` | Native updater, troubleshooting and recovery foundations | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-060-native-updater-troubleshooting-recovery.md](./ASTRA-CAP-060-native-updater-troubleshooting-recovery.md) |

## Extensions

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-061` | Firefox add-ons ecosystem and extension debugging | `USE_NATIVE` | `NATIVE_ONLY` | `DISCOVERED` | [ASTRA-CAP-061-firefox-addons-ecosystem-and-extension-debugging.md](./ASTRA-CAP-061-firefox-addons-ecosystem-and-extension-debugging.md) |

## India & Language

| ID | Title | Classification | Integration mode | Readiness | Doc |
|---|---|---|---|---|---|
| `ASTRA-CAP-062` | Hindi/Indian-language UI, dictionaries and local translation workflows | `INTEGRATE` | `DEEP_INTEGRATION` | `DISCOVERED` | [ASTRA-CAP-062-india-language-workflows.md](./ASTRA-CAP-062-india-language-workflows.md) |
