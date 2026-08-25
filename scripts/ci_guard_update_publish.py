#!/usr/bin/env python3
"""CI gate: refuse to publish mismatched / non-monotonic / paused updates."""

from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from assert_buildid_monotonic import assert_newer  # noqa: E402
from astra_channel import mar_channel_id  # noqa: E402
from verify_mar_product_info import parse_mar_product_info  # noqa: E402
from mar_sign_openssl import DEFAULT_PRIMARY_DER, verify_mar_signature  # noqa: E402

PAUSE_FILE = ROOT / ".astra" / "publish-paused"

DEFAULT_LIVE_XML = [
    "https://hrishikeshmind.github.io/astradesktop/updates/browser/WINNT_x86_64-msvc-x64/release/update.xml",
    "https://hrishikeshmind.github.io/astradesktop/updates/browser/WINNT_x86_64-msvc/release/update.xml",
    "https://hrishikeshmind.github.io/astradesktop/updates/browser/Linux_x86_64-gcc3/release/update.xml",
    "https://hrishikeshmind.github.io/astradesktop/updates/browser/Linux_aarch64-gcc3/release/update.xml",
]

PATCH_RE = re.compile(r"<patch\s", re.I)


def is_paused(path: Path = PAUSE_FILE) -> tuple[bool, str]:
    if not path.is_file():
        return False, ""
    text = path.read_text(encoding="utf-8")
    paused = False
    reason = ""
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("paused="):
            paused = line.split("=", 1)[1].strip() in {"1", "true", "yes"}
        elif line.startswith("reason="):
            reason = line.split("=", 1)[1].strip()
    return paused, reason


def live_xml_offers_update(url: str, timeout: float = 30.0) -> bool | None:
    """Return True if live XML contains a <patch>, False if empty/no-patch, None on fetch error."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except OSError as exc:
        print(f"WARN: could not fetch {url}: {exc}", file=sys.stderr)
        return None
    return bool(PATCH_RE.search(body))


def assert_live_aus_empty_while_paused(live_urls: list[str]) -> int:
    """While paused, fail if any live release XML still offers a MAR patch."""
    failures = 0
    for url in live_urls:
        offers = live_xml_offers_update(url)
        if offers is None:
            continue
        if offers:
            print(
                f"FAIL: publish is paused but live AUS still offers an update: {url}\n"
                "  Clear with: python scripts/publish_empty_aus_manifests.py "
                "--root <updates-branch-checkout>",
                file=sys.stderr,
            )
            failures += 1
        else:
            print(f"OK empty AUS (paused): {url}")
    return failures


def find_mars(search_roots: list[Path]) -> list[Path]:
    found: list[Path] = []
    names = {
        "windows.mar",
        "windows-arm64.mar",
        "linux.mar",
        "linux-aarch64.mar",
        "macos.mar",
    }
    for root in search_roots:
        if root.is_file() and root.name in names:
            found.append(root)
            continue
        if not root.is_dir():
            continue
        # download-artifact names directories after the artifact (windows.mar/),
        # and Path.rglob("*.mar") matches those directories as well as the MAR
        # file inside. Run #136 crashed with IsADirectoryError on windows-arm64.mar.
        for path in root.rglob("*.mar"):
            if not path.is_file():
                continue
            if path.name in names and path.stat().st_size > 0:
                found.append(path)
    # De-dupe while preserving order
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in found:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(path)
    return unique


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand", required=True)
    parser.add_argument("--new-buildid", default="")
    parser.add_argument(
        "--search",
        action="append",
        default=[],
        help="Directory or MAR path to scan (repeatable). Default: current directory",
    )
    parser.add_argument(
        "--allow-paused-override",
        action="store_true",
        help="Do not fail on pause file (still runs channel/buildID checks)",
    )
    parser.add_argument(
        "--require-mars",
        action="store_true",
        help="Fail if no MAR files were found",
    )
    parser.add_argument("--live-xml", action="append", default=[])
    parser.add_argument(
        "--check-pause-only",
        action="store_true",
        help="Exit 2 if paused, 0 otherwise. Skip MAR/buildID checks.",
    )
    parser.add_argument(
        "--assert-empty-aus-while-paused",
        action="store_true",
        help="If paused, also fail when live update.xml still contains a <patch> "
        "(stale false-update offers). Uses --live-xml or defaults.",
    )
    args = parser.parse_args(argv)

    paused, reason = is_paused()
    live = args.live_xml or DEFAULT_LIVE_XML

    if args.check_pause_only:
        if paused:
            print(f"publish paused: {reason or 'see .astra/publish-paused'}", file=sys.stderr)
            if args.assert_empty_aus_while_paused:
                if assert_live_aus_empty_while_paused(live):
                    return 1
            return 2
        print("publish not paused")
        return 0

    if not args.new_buildid:
        print("--new-buildid is required unless --check-pause-only", file=sys.stderr)
        return 2

    if paused and not args.allow_paused_override:
        print(
            f"FAIL: publish paused ({reason or 'see .astra/publish-paused'})",
            file=sys.stderr,
        )
        if args.assert_empty_aus_while_paused:
            assert_live_aus_empty_while_paused(live)
        return 2

    if paused and args.assert_empty_aus_while_paused:
        if assert_live_aus_empty_while_paused(live):
            return 1

    expected = mar_channel_id(args.brand)
    search_roots = args.search or ["."]
    mars = find_mars([Path(p) for p in search_roots])
    if args.require_mars and not mars:
        print("FAIL: no MAR artifacts found", file=sys.stderr)
        return 1

    failures = 0
    for mar in mars:
        info = parse_mar_product_info(mar)
        print(
            f"{mar}: channel={info.channel_id!r} version={info.product_version!r} "
            f"sigs={info.num_signatures} size={info.size}"
        )
        if info.channel_id != expected:
            print(
                f"FAIL: {mar} channel {info.channel_id!r} != SSOT {expected!r}",
                file=sys.stderr,
            )
            failures += 1
        if info.num_signatures < 1:
            print(
                f"FAIL: {mar} is unsigned (numSignatures={info.num_signatures}); "
                "shipped updater.exe requires a signature (CERT_VERIFY_ERROR 19)",
                file=sys.stderr,
            )
            failures += 1
        elif DEFAULT_PRIMARY_DER.is_file():
            try:
                verify_mar_signature(mar, DEFAULT_PRIMARY_DER)
                print(f"OK {mar}: signature verifies against {DEFAULT_PRIMARY_DER.name}")
            except (ValueError, OSError) as exc:
                print(f"FAIL: {mar} signature verify: {exc}", file=sys.stderr)
                failures += 1
        if info.size < 10 * 1024 * 1024:
            print(f"FAIL: {mar} is a stub ({info.size} bytes)", file=sys.stderr)
            failures += 1

    try:
        prev, _known = assert_newer(args.new_buildid, live)
        print(f"OK buildID {args.new_buildid} > {prev}")
    except (ValueError, FileNotFoundError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        failures += 1

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
