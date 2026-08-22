#!/usr/bin/env python3
"""Fail if a candidate buildID is not strictly newer than every known ship.

Compares against:
  1. Repo ledger `.astra/published-builds.json`
  2. `.astra/last-published-buildid`
  3. Currently live GitHub Pages update.xml (if --live-xml is given / fetchable)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / ".astra" / "published-builds.json"
LAST = ROOT / ".astra" / "last-published-buildid"

BUILDID_RE = re.compile(r"^[0-9]{14}$")
XML_BUILDID_RE = re.compile(r'buildID="([0-9]{14})"')


def parse_buildid(value: str, label: str) -> str:
    value = value.strip()
    if not BUILDID_RE.match(value):
        raise ValueError(f"{label}: not a 14-digit YYYYMMDDHHMMSS buildID: {value!r}")
    return value


def ledger_buildids(path: Path = LEDGER) -> list[str]:
    if not path.is_file():
        raise FileNotFoundError(f"missing ledger {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    ids = []
    for entry in data.get("builds", []):
        ids.append(parse_buildid(str(entry["buildID"]), f"{path} entry"))
    return ids


def last_published_buildid(path: Path = LAST) -> str | None:
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return None
    return parse_buildid(text.splitlines()[0], str(path))


def fetch_live_buildid(url: str, timeout: float = 30.0) -> str | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except OSError as exc:
        print(f"WARN: could not fetch live update.xml {url}: {exc}", file=sys.stderr)
        return None
    match = XML_BUILDID_RE.search(body)
    if not match:
        print(f"WARN: no buildID in {url}", file=sys.stderr)
        return None
    return parse_buildid(match.group(1), url)


def collect_known(live_xml_urls: list[str]) -> dict[str, str]:
    known: dict[str, str] = {}
    for bid in ledger_buildids():
        known[bid] = "ledger"
    last = last_published_buildid()
    if last:
        known[last] = "last-published-buildid"
    for url in live_xml_urls:
        live = fetch_live_buildid(url)
        if live:
            known[live] = url
    return known


def assert_newer(new_buildid: str, live_xml_urls: list[str]) -> tuple[str, dict[str, str]]:
    new = parse_buildid(new_buildid, "new buildID")
    known = collect_known(live_xml_urls)
    if not known:
        raise ValueError("no known previous buildIDs; refusing to publish blindly")
    max_known = max(known)
    if new <= max_known:
        raise ValueError(
            f"new buildID {new} is not strictly greater than previous "
            f"{max_known} ({known[max_known]}). Known: {known}"
        )
    return max_known, known


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--new-buildid", required=True)
    parser.add_argument(
        "--live-xml",
        action="append",
        default=[],
        help="Live update.xml URL (repeatable)",
    )
    args = parser.parse_args(argv)
    try:
        prev, known = assert_newer(args.new_buildid, args.live_xml)
    except (ValueError, FileNotFoundError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"OK: {args.new_buildid} > {prev}")
    for bid, src in sorted(known.items()):
        print(f"  known {bid}  ({src})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
