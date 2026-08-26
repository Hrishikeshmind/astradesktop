#!/usr/bin/env python3
"""After Pages publish: fetch live update.xml + MAR header and assert invariants.

Cheap check for the two bugs that broke updates: wrong MAR channel and
unsigned MARs (CERT_VERIFY_ERROR 19). Does not replace the apply→restart
smoke in scripts/smoke_update_apply.py.

When publish is paused and live XML is empty <updates/>, exits 0 (that is
the correct paused state). Pass --require-patch to fail on empty XML.

Live Pages XML is fetched with retries + a cache-busting query param so
GitHub Pages commit-to-live lag (and the CDN's ~10min max-age) does not
look like a missing <patch>. Matches the Release job's MAR URL probe:
6 attempts, 10s apart.
"""

from __future__ import annotations

import argparse
import re
import struct
import sys
import tempfile
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from astra_channel import mar_channel_id  # noqa: E402
from ci_guard_update_publish import is_paused  # noqa: E402
from verify_mar_product_info import parse_mar_product_info  # noqa: E402

DEFAULT_TARGETS = {
    "release": [
        "https://hrishikeshmind.github.io/astradesktop/updates/browser/WINNT_x86_64-msvc-x64/release/update.xml",
        "https://hrishikeshmind.github.io/astradesktop/updates/browser/Linux_x86_64-gcc3/release/update.xml",
    ],
    "twilight": [
        "https://hrishikeshmind.github.io/astradesktop/updates/browser/WINNT_x86_64-msvc-x64/twilight/update.xml",
        "https://hrishikeshmind.github.io/astradesktop/updates/browser/Linux_x86_64-gcc3/twilight/update.xml",
    ],
}

# Same cadence as "Assert release MAR URLs are fetchable" (6×10s).
PAGES_FETCH_ATTEMPTS = 6
PAGES_FETCH_BACKOFF_S = 10

FetchBytes = Callable[..., bytes]
SleepFn = Callable[[float], None]


def cache_bust_url(url: str, nonce: int | None = None) -> str:
    """Append ?_=<ms> so a CDN edge cache is not reused across retries."""
    token = nonce if nonce is not None else time.time_ns() // 1_000_000
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}_={token}"


def fetch(url: str, max_bytes: int | None = None, *, cache_bust: bool = False) -> bytes:
    if cache_bust:
        url = cache_bust_url(url)
    headers = {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
    }
    if max_bytes is not None:
        headers["Range"] = f"bytes=0-{max_bytes - 1}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        return data[:max_bytes] if max_bytes is not None else data


def fetch_pages_update_xml(
    url: str,
    *,
    attempts: int = PAGES_FETCH_ATTEMPTS,
    backoff_s: float = PAGES_FETCH_BACKOFF_S,
    wait_for_patch: bool = True,
    fetch_bytes: FetchBytes | None = None,
    sleep: SleepFn = time.sleep,
) -> tuple[str, int, float, str | None]:
    """Fetch live Pages update.xml, retrying empty/no-patch while wait_for_patch.

    Returns (xml_text, attempts_used, elapsed_seconds, last_error).
    last_error is set when the final attempt was a fetch failure.
    """
    getter = fetch if fetch_bytes is None else fetch_bytes
    started = time.monotonic()
    xml = ""
    last_error: str | None = None
    used = 0
    if attempts < 1:
        raise ValueError("attempts must be >= 1")
    for attempt in range(1, attempts + 1):
        used = attempt
        last_error = None
        try:
            raw = getter(url, cache_bust=True)
            xml = raw.decode("utf-8", errors="replace")
        except (OSError, urllib.error.URLError) as exc:
            last_error = str(exc)
            xml = ""
            print(
                f"  attempt {attempt}/{attempts}: fetch error: {exc}",
                file=sys.stderr,
            )
            if wait_for_patch and attempt < attempts:
                print(f"    waiting {backoff_s:.0f}s for GitHub Pages...")
                sleep(backoff_s)
                continue
            break
        if "<patch " in xml or not wait_for_patch:
            if attempt > 1 and "<patch " in xml:
                elapsed = time.monotonic() - started
                print(
                    f"  OK: got <patch> on attempt {attempt}/{attempts} "
                    f"after {elapsed:.0f}s (GitHub Pages commit-to-live lag)"
                )
            return xml, used, time.monotonic() - started, None
        print(
            f"  attempt {attempt}/{attempts}: live XML has no <patch> "
            f"(Pages commit-to-live lag?)",
            file=sys.stderr,
        )
        if attempt < attempts:
            print(f"    waiting {backoff_s:.0f}s for GitHub Pages...")
            sleep(backoff_s)
    return xml, used, time.monotonic() - started, last_error


def _no_patch_message(
    url: str,
    *,
    attempts_used: int,
    attempts_limit: int,
    elapsed_s: float,
    last_error: str | None,
) -> str:
    err = f" (last fetch error: {last_error})" if last_error else ""
    # Distinguish a single-shot miss from exhausting the Pages-lag window.
    if attempts_limit <= 1 or attempts_used <= 1:
        return f"FAIL: {url} has no patch{err}"
    return (
        f"FAIL: {url} still empty after {attempts_used} attempts "
        f"over {elapsed_s:.0f}s{err} "
        f"(GitHub Pages lag/cache race: live XML has no <patch> after waiting)"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand", required=True)
    parser.add_argument(
        "--require-patch",
        action="store_true",
        help="Fail when live XML has no <patch> (default: empty OK if paused)",
    )
    parser.add_argument(
        "--attempts",
        type=int,
        default=PAGES_FETCH_ATTEMPTS,
        help=(
            "Pages XML fetch attempts while waiting for <patch> "
            f"(default: {PAGES_FETCH_ATTEMPTS})"
        ),
    )
    parser.add_argument(
        "--backoff",
        type=float,
        default=PAGES_FETCH_BACKOFF_S,
        help=f"Seconds between Pages XML retries (default: {PAGES_FETCH_BACKOFF_S})",
    )
    args = parser.parse_args(argv)
    expected = mar_channel_id(args.brand)
    paused, reason = is_paused()
    wait_for_patch = bool(args.require_patch or not paused)
    failures = 0
    for xml_url in DEFAULT_TARGETS.get(args.brand, DEFAULT_TARGETS["release"]):
        print(f"--- {xml_url} ---")
        xml, used, elapsed, last_error = fetch_pages_update_xml(
            xml_url,
            attempts=args.attempts,
            backoff_s=args.backoff,
            wait_for_patch=wait_for_patch,
        )
        print(xml[:600])
        if "<patch " not in xml:
            if wait_for_patch:
                print(
                    _no_patch_message(
                        xml_url,
                        attempts_used=used,
                        attempts_limit=args.attempts,
                        elapsed_s=elapsed,
                        last_error=last_error,
                    ),
                    file=sys.stderr,
                )
                failures += 1
            else:
                print(f"OK empty AUS while paused ({reason or 'publish-paused'})")
            continue
        if paused:
            print(
                f"FAIL: publish is paused but {xml_url} still offers a patch",
                file=sys.stderr,
            )
            failures += 1
            continue
        m = re.search(r'URL="([^"]+\.mar)"', xml)
        if not m:
            print(f"FAIL: {xml_url} missing MAR URL", file=sys.stderr)
            failures += 1
            continue
        mar_url = m.group(1)
        header = fetch(mar_url, 65536)
        if header[:4] != b"MAR1":
            print(f"FAIL: {mar_url} is not MAR1", file=sys.stderr)
            failures += 1
            continue
        with tempfile.NamedTemporaryFile(suffix=".mar", delete=False) as tmp:
            tmp.write(header)
            tmp_path = Path(tmp.name)
        try:
            info = parse_mar_product_info(tmp_path)
            chan = info.channel_id
            nsig = info.num_signatures
        except Exception:
            nsig = struct.unpack(">I", header[16:20])[0]
            # Unsigned: product-info channel starts at offset 32.
            chan = header[32:96].split(b"\x00", 1)[0].decode("ascii", errors="replace")
        finally:
            tmp_path.unlink(missing_ok=True)
        print(f"{mar_url}: channel={chan!r} sigs={nsig}")
        if chan != expected:
            print(f"FAIL: channel {chan!r} != SSOT {expected!r}", file=sys.stderr)
            failures += 1
        if nsig < 1:
            print(f"FAIL: unsigned MAR at {mar_url}", file=sys.stderr)
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
