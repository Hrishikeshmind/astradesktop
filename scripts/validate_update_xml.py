#!/usr/bin/env python3
"""Fail closed if staged update.xml does not match the signed MAR on disk.

Catches the class of bugs that caused false / broken offers:
  - hash/size from an unsigned MAR left in XML after signing
  - stub / empty / wrong-channel XML
  - buildID drift between application.ini (in MAR packaging) and the manifest
  - missing <patch> when a real publish is intended

Usage (CI, after Sign MARs + Copy manifests, before Pages commit):

  python scripts/validate_update_xml.py \\
    --brand release \\
    --expected-buildid "$NEW_BUILDID" \\
    --xml-root updates-server/updates \\
    --mar windows.mar=./windows.mar \\
    --mar linux.mar=./linux.mar \\
    --mar linux-aarch64.mar=./linux-aarch64.mar \\
    --mar windows-arm64.mar=./windows-arm64.mar \\
    --require-win-linux
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from astra_channel import mar_channel_id  # noqa: E402
from mar_sign_openssl import DEFAULT_PRIMARY_DER, verify_mar_signature  # noqa: E402
from verify_mar_product_info import parse_mar_product_info  # noqa: E402

BUILDID_RE = re.compile(r'buildID="([0-9]{14})"')
HASH_RE = re.compile(r'hashValue="([0-9a-fA-F]+)"')
SIZE_RE = re.compile(r'\ssize="(\d+)"')
URL_RE = re.compile(r'URL="([^"]+)"')
PATCH_RE = re.compile(r"<patch\s", re.I)


def sha512_file(path: Path) -> str:
    h = hashlib.sha512()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_mar_map(entries: list[str]) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for entry in entries:
        if "=" not in entry:
            raise ValueError(f"--mar expects name=path, got {entry!r}")
        name, path = entry.split("=", 1)
        name = name.strip()
        path_obj = Path(path.strip())
        if not name.endswith(".mar"):
            raise ValueError(f"MAR name must end with .mar: {name!r}")
        out[name] = path_obj
    return out


def mar_name_from_url(url: str) -> str | None:
    path = urlparse(url).path
    base = Path(path).name
    return base if base.endswith(".mar") else None


def validate_one_xml(
    xml_path: Path,
    mar_map: dict[str, Path],
    *,
    expected_channel: str,
    expected_buildid: str,
    require_github_release_url: bool,
) -> list[str]:
    errors: list[str] = []
    text = xml_path.read_text(encoding="utf-8")
    if not PATCH_RE.search(text):
        errors.append(f"{xml_path}: empty / no <patch> (refusing stub publish)")
        return errors

    build_m = BUILDID_RE.search(text)
    if not build_m:
        errors.append(f"{xml_path}: missing buildID")
    elif expected_buildid and build_m.group(1) != expected_buildid:
        errors.append(
            f"{xml_path}: buildID {build_m.group(1)} != expected {expected_buildid}"
        )

    hash_m = HASH_RE.search(text)
    size_m = SIZE_RE.search(text)
    url_m = URL_RE.search(text)
    if not hash_m or not size_m or not url_m:
        errors.append(f"{xml_path}: missing hashValue, size, or URL on <patch>")
        return errors

    url = url_m.group(1)
    mar_name = mar_name_from_url(url)
    if not mar_name:
        errors.append(f"{xml_path}: URL does not end in .mar: {url}")
        return errors
    if require_github_release_url and "github.com/" not in url:
        errors.append(f"{xml_path}: MAR URL is not a GitHub release asset: {url}")

    mar_path = mar_map.get(mar_name)
    if mar_path is None:
        errors.append(
            f"{xml_path}: no local MAR mapped for {mar_name} "
            f"(pass --mar {mar_name}=<path>)"
        )
        return errors
    if not mar_path.is_file():
        errors.append(f"{xml_path}: MAR missing on disk: {mar_path}")
        return errors

    actual_size = mar_path.stat().st_size
    xml_size = int(size_m.group(1))
    if actual_size != xml_size:
        errors.append(
            f"{xml_path}: size {xml_size} != MAR {actual_size} bytes "
            "(likely XML generated before signing; refresh hash/size)"
        )

    actual_hash = sha512_file(mar_path)
    if actual_hash.lower() != hash_m.group(1).lower():
        errors.append(
            f"{xml_path}: hashValue mismatch vs {mar_path.name} "
            "(XML must be refreshed after MAR signing)"
        )

    try:
        info = parse_mar_product_info(mar_path)
    except (OSError, ValueError) as exc:
        errors.append(f"{xml_path}: cannot parse MAR header: {exc}")
        return errors

    if info.channel_id != expected_channel:
        errors.append(
            f"{xml_path}: MAR channel {info.channel_id!r} != SSOT {expected_channel!r}"
        )
    if info.num_signatures < 1:
        errors.append(
            f"{xml_path}: MAR {mar_path.name} is unsigned "
            f"(numSignatures={info.num_signatures})"
        )
    elif DEFAULT_PRIMARY_DER.is_file():
        try:
            verify_mar_signature(mar_path, DEFAULT_PRIMARY_DER)
        except (ValueError, OSError) as exc:
            errors.append(f"{xml_path}: signature verify failed for {mar_path.name}: {exc}")

    if actual_size < 10 * 1024 * 1024:
        errors.append(f"{xml_path}: MAR {mar_path.name} looks like a stub ({actual_size} bytes)")

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand", required=True)
    parser.add_argument("--expected-buildid", default="")
    parser.add_argument(
        "--xml-root",
        type=Path,
        required=True,
        help="Tree containing browser/<platform>/<channel>/update.xml",
    )
    parser.add_argument(
        "--mar",
        action="append",
        default=[],
        help="Mapping basename=path (repeatable), e.g. windows.mar=./windows.mar",
    )
    parser.add_argument(
        "--channel",
        default="",
        help="AUS channel directory name (default: --brand)",
    )
    parser.add_argument(
        "--require-win-linux",
        action="store_true",
        help="Fail if no WINNT_* or Linux_* update.xml for the channel was checked",
    )
    parser.add_argument(
        "--allow-non-github-url",
        action="store_true",
        help="Skip GitHub release URL check (local AUS smoke only)",
    )
    args = parser.parse_args(argv)

    channel = args.channel or args.brand
    expected = mar_channel_id(args.brand)
    try:
        mar_map = parse_mar_map(args.mar)
    except ValueError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 2

    root = args.xml_root
    if (root / "updates" / "browser").is_dir():
        root = root / "updates"
    if not (root / "browser").is_dir():
        print(f"FAIL: no browser/ under {args.xml_root}", file=sys.stderr)
        return 2

    xmls = sorted(
        p
        for p in (root / "browser").rglob("update.xml")
        if p.parent.name == channel
    )
    if not xmls:
        print(f"FAIL: no update.xml under channel {channel!r}", file=sys.stderr)
        return 1

    failures = 0
    checked_win = 0
    checked_linux = 0
    for xml in xmls:
        # Skip Darwin if no matching MAR was provided (macOS optional in CI).
        sample = xml.read_text(encoding="utf-8", errors="replace")
        url_m = URL_RE.search(sample)
        if url_m:
            name = mar_name_from_url(url_m.group(1))
            if name and name not in mar_map and "Darwin_" in str(xml):
                print(f"SKIP Darwin (no local MAR mapped): {xml}")
                continue
        errs = validate_one_xml(
            xml,
            mar_map,
            expected_channel=expected,
            expected_buildid=args.expected_buildid,
            require_github_release_url=not args.allow_non_github_url,
        )
        if errs:
            for e in errs:
                print(f"FAIL: {e}", file=sys.stderr)
            failures += 1
        else:
            print(f"OK {xml}")
            if "/WINNT_" in str(xml).replace("\\", "/"):
                checked_win += 1
            if "/Linux_" in str(xml).replace("\\", "/"):
                checked_linux += 1

    if args.require_win_linux:
        if checked_win < 1:
            print("FAIL: no validated Windows (WINNT_*) update.xml", file=sys.stderr)
            failures += 1
        if checked_linux < 1:
            print("FAIL: no validated Linux update.xml", file=sys.stderr)
            failures += 1

    if failures:
        print(
            f"FAIL: {failures} update.xml validation error group(s)",
            file=sys.stderr,
        )
        return 1
    print("OK all staged update.xml files match signed MARs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
