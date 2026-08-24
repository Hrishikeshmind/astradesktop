# Astra update pipeline (AUS + MAR)

Astra clients resolve updates from:

`https://hrishikeshmind.github.io/astradesktop/updates/browser/%BUILD_TARGET%/%CHANNEL%/update.xml`

(see `[AppUpdate] URL` in `application.ini`, published via the release workflow
into the updates-server `updates/**` tree). Default prefs also set
`app.update.url` from Surfer's `updateHostname`; **`app.update.url.override`**
is the testing hook. Rewriting `application.ini` alone does not redirect AUS.

## Rule (launch-critical)

**Never ship or hand out a build whose `BuildID` is newer than the
`buildID` currently published in Pages `update.xml` for that channel**, unless
the matching complete MAR + `update.xml` are published in the same release
cut.

If Pages lags the binary:

- Fresh installs of the newer binary will never see an update *to* that cut
  (correct — they are already ahead).
- Older clients may update to an *older* Pages MAR than a sideloaded newer
  binary, creating a split fleet.
- About / AUS “update available” loops are hard to reason about when
  buildIDs move without a matching manifest.

## What generates buildID

UTC `YYYYMMDDHHMMSS` from the `buildid` job in `.github/workflows/build.yml`:

```
date -u +"%Y%m%d%H%M%S"
```

That value is passed as `MOZ_BUILD_DATE` into Windows/Linux/macOS builds and
must appear in packaged `application.ini` / `platform.ini`.

**Do not use `%I` (12-hour clock).** That was a monotonicity footgun (afternoon
builds can sort *before* morning ones).

The same job calls `scripts/assert_buildid_monotonic.py`, which refuses a
buildID that is not **strictly greater** than:

1. `.astra/published-builds.json` (every ID that reached a client or Pages)
2. `.astra/last-published-buildid`
3. The currently live Pages `update.xml` (fetched at generate time)

Before Pages publish, `scripts/ci_guard_update_publish.py` repeats that check
against live XML so a 6-hour build cannot publish a stale ID.

Version: on `create_release` for the `release` brand, Surfer `--bump prerelease`
runs in the same `build-data` job so displayVersion and buildID cannot drift
apart (this is how we stayed on `1.19.8b` while buildIDs moved).

## MAR channel ID (single source of truth)

**File:** `.astra/channel.env`  
**Loader:** `scripts/astra_channel.py --brand <release|twilight>`

Every MAR build/verify path must read that file. Do not hardcode `release` or
`firefox-mozilla-central` in workflows or packaging scripts.

The packaged app’s `update-settings.ini` must contain **exactly**:

```
ACCEPTED_MAR_CHANNEL_IDS=<value from channel.env for that brand>
```

Do **not** widen the accepted list to paper over a mismatched MAR. That is the
anti-tamper check.

Complete MARs are created with `mar -H ${MAR_CHANNEL_ID}` /
`scripts/mar_create_from_filelist.py -H` (see `scripts/make_complete_mar_from_appdir.sh`
and `scripts/create_windows_mar.sh`).

If the MAR product-information channel is `firefox-mozilla-central` (or
anything else) while the client only accepts `release`, AUS will **offer and
download** the update, then fail with:

> The Update could not be installed (patch apply failed)

Verify with the first bytes of a `.mar` (ASCII channel string after `MAR1`)
or:

```
python scripts/verify_mar_product_info.py windows.mar --brand release --assert-channel --dump
```

CI runs that assert after each platform MAR is built, and again in the
release job (`ci_guard_update_publish.py`) **before** the Pages commit.

## MAR signatures (launch-critical)

Shipped `updater.exe` is built with `MOZ_VERIFY_MAR_SIGNATURE` (`MOZILLA_OFFICIAL=1`
in `configs/common/mozconfig` when `ZEN_RELEASE=1`). signmar/the updater use
**RSA-PKCS1-SHA384** (MAR signature algorithm ID 2). Astra has not diverged from
that: the only updater patch is a Linux RPATH in
`src/toolkit/mozapps/update/updater/updater-common-build.patch`.

Public certs live in `build/signing/` (committed) and are copied into the
engine updater tree at build time by `scripts/mar_sign.sh -i`:

| File | Embedded as |
| --- | --- |
| `release_primary.der` | `engine/toolkit/mozapps/update/updater/release_primary.der` (+ dep1, xpcshell) |
| `release_backup.der` | `engine/toolkit/mozapps/update/updater/release_secondary.der` (+ dep2) |

Fingerprints (public, safe to share) are in `build/signing/FINGERPRINTS.txt`.

Private keys are **never** in the repo:

- Primary: GitHub Actions secret `ZEN_SIGNING_PRIVATE_KEY_PEM_BASE64`
  (base64 of the PEM). Releases fail closed if this is missing/empty.
- Backup: offline / password-manager vault **not** stored as another secret in
  this repo. Embedded so a future primary-key loss does not repeat this
  incident.

CI signs with the primary key (`scripts/mar_sign.sh -s <mar>` →
`scripts/mar_sign_openssl.py`, RSA-PKCS1-SHA384) immediately after MAR
creation on Windows and Linux, then
`python scripts/verify_mar_product_info.py --assert-channel --assert-signed --verify-cert build/signing/release_primary.der`.
A channel-correct unsigned MAR fails that guard the same way a channel
mismatch does. The combined release job repeats fail-closed signing +
`ci_guard_update_publish.py` (which also crypto-verifies) before Pages
publish.

`MOZ_DISABLE_MAR_CERT_VERIFICATION=1` at **package** time does **not** disable
verification in the already-built `updater.exe`.

### One-time reinstall for the 20260819052941 fleet

A new signing keypair only works for updaters compiled **after** the public
certs above were embedded. Already-installed `BuildID=20260819052941` binaries
still contain the old `CN=MAR Signing` public key
(`50:E4:B1:07:46:11:40:AC:29:64:A2:3A:8F:23:49:66:31:D5:44:36`). They will
**correctly reject** any MAR signed with the new primary key (fail closed:
cert verify error, no apply, no profile corruption). That is not a clash —
it is a new trust root.

Those users need **one** manual install of the next signed build from
https://github.com/Hrishikeshmind/astradesktop/releases
(`app.update.url.manual` / `detailsURL` in `update.xml` point there). After
that reinstall, silent background updates work for every later release.

Do **not** widen `ACCEPTED_MAR_CHANNEL_IDS` to try to make old and new keys
"both work". Signature verification is cryptographic, not a channel string.

Do **not** un-pause `.astra/publish-paused` until Part 4 of the key-rotation
checklist has been demonstrated: (1) old 20260819052941 install rejects a
new-key MAR, (2) a new-installer install completes check → download →
verify → apply → restart onto the next buildID via
`scripts/smoke_update_apply.py`.

## Pause / halt publish (no revert required)

File: `.astra/publish-paused`

```
paused=1
reason=human-readable why
```

When `paused=1`:

- `build.yml` `buildid` job fails if `create_release` is set (no 6-hour build
  that cannot publish)
- `build.yml` release job guard fails before touching the `updates` branch
- Scheduled twilight (`twilight-release-schedule.yml`) skips via `publish-gate`

**Critical:** Pausing publish does **not** automatically clear live Pages
manifests. A stale `update.xml` that still lists a complete MAR will keep
offering that update to every older buildID — even when the MAR is unsigned,
wrong-channel, or otherwise unapplyable. That is the “~106 MB update forever”
failure mode.

While paused (or whenever no real newer cut should be offered), publish an
**empty** AUS document so clients report up-to-date:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<updates>
</updates>
```

Use `scripts/publish_empty_aus_manifests.py --root <updates-branch-checkout>`
against the GitHub Pages `updates` branch, then commit + push that branch.
Firefox treats empty `<updates/>` as “no update available”.

The 2026-08-21 emergency also **disabled** the GitHub workflow
“Astra Nova Scheduled Releases” (`gh workflow disable twilight-release-schedule.yml`).
Re-enable only after pause is cleared: `gh workflow enable twilight-release-schedule.yml`.

Clear pause by setting `paused=0` (keep the file as the switch). Do not delete
the file; the gate treats a missing file as “not paused”.
Do **not** un-pause until empty-or-correct live XML is in place and Part 4
apply→restart smoke has passed on a new-key installer.

Staged/canary percentage rollout (Balrog-style throttling) is **not**
implemented on GitHub Pages. Pages serves one static `update.xml`. The pause
file is the halt switch. A percentage gate would need a small AUS server or
query-param hashing in front of Pages — deferred.

We do not ship incremental/partial MARs today (`generate_windows_update_xml.mjs`
emits `type="complete"` only).

## Post-publish checks

1. **Header check (every release, ubuntu):**
   `scripts/post_publish_mar_header_check.py` fetches live `update.xml` and the
   first 64KiB of the MAR, asserts channel == SSOT and `numSignatures >= 1`.
   Empty XML is OK while `.astra/publish-paused` is set; pass `--require-patch`
   after a real publish.
2. **Staged XML vs MAR (every release, before Pages commit):**
   `scripts/validate_update_xml.py` asserts hash/size/buildID/channel/signature
   on the artifacts about to be published.
3. **Apply→restart (required for a human “it works” claim, and for CI when a
   previous Windows zip is available):**
   `scripts/smoke_update_apply.py` — existing install at the **previous**
   buildID, not a fresh install. Sets `app.update.url.override` (not only
   `application.ini`). Confirms `Services.appinfo.appBuildID` after restart.

Fresh-install tests do **not** exercise apply.

## Update-log visibility

- Updater: `updates/0/update.log` next to the install (or the Windows update
  dir). Enable with `app.update.log`.
- Astra: `astra.updates.log-to-file` (default true) appends JSON lines to
  `ProfD/astra-update-status.log` (`version`, `buildID`, active update state).
  Beta users can send that file. Pref is in `prefs/zen/updates.yaml`.

## Publish a real update (runbook)

Do **not** start this until Part 4 apply→restart smoke has passed on a
new-key installer (see MAR signatures above). Until then keep
`.astra/publish-paused` at `paused=1` and live Pages on empty `<updates/>`.

### Preconditions

1. Live Pages serves empty `<updates/>` on every platform (or a prior good cut).
2. `python scripts/ci_guard_update_publish.py --brand release --check-pause-only --assert-empty-aus-while-paused` exits `2` while paused with empty AUS, or `0` when unpaused.
3. GitHub secret `ZEN_SIGNING_PRIVATE_KEY_PEM_BASE64` matches
   `build/signing/release_primary.der`.
4. `.astra/channel.env` still maps `release=release` (never widen accepted IDs).

### Un-pause + ship

1. Set `.astra/publish-paused` to `paused=0` (keep the file). Commit on `dev`/`stable` as appropriate.
2. Re-enable scheduled twilight only if intended:
   `gh workflow enable twilight-release-schedule.yml`
3. Run the release workflow with `create_release=true` and
   `update_branch=release` from the correct source branch (`stable` for release).
4. CI will, in order:
   - Fail closed if still paused / non-monotonic buildID / wrong MAR channel / unsigned MAR
   - Sign MARs (or verify already-signed) and **refresh update.xml hash/size**
   - `scripts/validate_update_xml.py` — staged XML must match signed MAR bytes
   - Upload GitHub Release assets (**MARs first**)
   - HEAD-check every MAR URL in staged XML
   - Commit `updates` branch (Pages) **only after** MARs are fetchable
   - `scripts/post_publish_mar_header_check.py` on live Pages
5. Manually: `scripts/smoke_update_apply.py` from a **previous** buildID install.
6. Append the new buildID to `.astra/published-builds.json` and
   `.astra/last-published-buildid`.

### Pause again (halt offers without disabling the client)

1. Set `paused=1` in `.astra/publish-paused`.
2. Checkout the `updates` branch and run:
   `python scripts/publish_empty_aus_manifests.py --root . --include-twilight`
3. Commit + push the `updates` branch so Pages serves empty `<updates/>`.
4. Confirm with the live URLs under
   `https://hrishikeshmind.github.io/astradesktop/updates/browser/.../update.xml`.

Never leave `paused=1` while live XML still contains a `<patch>` — that is the
false “update available forever” failure mode.

### Atomicity contract

| Step | Safe if it fails mid-way? |
| --- | --- |
| Build + sign MAR, no Pages change | Yes — users keep empty/prior AUS |
| GitHub Release uploaded, Pages not yet updated | Yes — no offer yet |
| Pages updated | Offer is live; MAR URL must already 200 |

Never publish Pages XML that points at a MAR that is not yet a release asset.

## Manual verification checklist (every Windows release)

Use an **existing** packaged tree (copy of Program Files is fine; do not rely
on a brand-new installer profile).

1. Note `BuildID` from the packaged `application.ini` / `platform.ini`.
2. Confirm `update-settings.ini` is `ACCEPTED_MAR_CHANNEL_IDS=<SSOT>` — do not
   loosen it.
3. Confirm artifacts include `windows.mar` (and arm64/linux if shipping).
4. `python scripts/verify_mar_product_info.py windows.mar --brand release --assert-channel --assert-signed --dump`
   — channel must match SSOT, `numSignatures` must be ≥ 1, and the signature
   must verify against `build/signing/release_primary.der`.
5. Confirm the release job published non-stub `update.xml` under
   `updates/browser/WINNT_*/<channel>/` with that same `buildID` (or newer).
6. Fetch the live Pages URL; `appVersion` + `buildID` ≥ what you just shipped.
7. Run `scripts/smoke_update_apply.py` against a **previous** buildID install
   (or stage `update.mar` and run `updater.exe 3 <patch-dir> <install> <install> first`
   and read `update.log`). Proof is apply success + restart showing the new
   buildID, not “AUS offered”.
8. Screenshot or log-paste pre- and post-update `BuildID`.
9. Append the new buildID to `.astra/published-builds.json` and
   `.astra/last-published-buildid`.

## 2026-08-21 incident (do not re-derive under pressure)

| Item | Evidence |
| --- | --- |
| Live Pages `update.xml` | `buildID=20260816124354`, MAR `windows.mar` @ `1.19.8b` |
| Real Program Files install | `C:\Program Files\Astra Browser`, `BuildID=20260819052941`, `ACCEPTED_MAR_CHANNEL_IDS=release` |
| Published MAR header | `MAR_CHANNEL_ID=firefox-mozilla-central`, `numSignatures=0` |
| AUS | Offers the Pages MAR even when it cannot apply (channel not checked at offer; older buildID still appeared in checker results) |
| Apply of a **channel-correct unsigned** MAR | `updater.exe` log: `ERROR: There must be at least one signature.` / `failed: 19` |
| Root causes | (1) MAR channel `firefox-mozilla-central` vs accepted `release` (2) unsigned MAR vs verifying updater (3) Pages buildID **older** than sideloaded 20260819052941 |

Unsigned channel-`release` MAR was built locally as
`.tmp-mar-rebuild/windows.mar` (`BuildID=20260821165944`, version `1.19.9b`)
from a copy of the Program Files tree. **Not published** — it would still fail
error 19 and make the “update available forever” loop worse.

The original `CN=MAR Signing` private key was never recovered. The 2026-08-21
decision is to **rotate**: embed a new primary+backup public keypair in the
next compiled updater, sign MARs with the new primary, and have the
20260819052941 fleet reinstall **once**. Until that signed build has passed
the apply→restart smoke on a new-key installer, **do not publish a new
`update.xml`** (keep `.astra/publish-paused`).
