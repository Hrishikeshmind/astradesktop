#!/usr/bin/env python3
"""After Pages publish: fetch live update.xml + MAR header and assert invariants.

Cheap check for the two bugs that broke updates: wrong MAR channel and
unsigned MARs (CERT_VERIFY_ERROR 19). Does not replace the apply→restart
smoke in scripts/smoke_update_apply.py.

When publish is paused and live XML is empty <updates/>, exits 0 (that is
the correct paused state). Pass --require-patch to fail on empty XML.
"""

from __future__ import annotations

import argparse
import re
import struct
import sys
import tempfile
import urllib.request
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


def fetch(url: str, max_bytes: int | None = None) -> bytes:
    headers = {}
    if max_bytes is not None:
        headers["Range"] = f"bytes=0-{max_bytes - 1}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        return data[:max_bytes] if max_bytes is not None else data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand", required=True)
    parser.add_argument(
        "--require-patch",
        action="store_true",
        help="Fail when live XML has no <patch> (default: empty OK if paused)",
    )
    args = parser.parse_args()
    expected = mar_channel_id(args.brand)
    paused, reason = is_paused()
    failures = 0
    for xml_url in DEFAULT_TARGETS.get(args.brand, DEFAULT_TARGETS["release"]):
        xml = fetch(xml_url).decode("utf-8", errors="replace")
        print(f"--- {xml_url} ---")
        print(xml[:600])
        if "<patch " not in xml:
            if args.require_patch or not paused:
                print(f"FAIL: {xml_url} has no patch", file=sys.stderr)
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
