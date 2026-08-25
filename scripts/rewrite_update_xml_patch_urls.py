#!/usr/bin/env python3
"""Rewrite <patch URL> to the canonical GitHub Release asset download URL.

GitHub asset URLs are deterministic from tag + filename:

  https://github.com/<owner>/<repo>/releases/download/<tag>/<name>.mar

They do not require the Release to exist yet. Run this after copying staged
update.xml and before validation so AUS never points at the generic
github.com/<owner>/<repo>/releases page (detailsURL / leftover placeholders).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

PATCH_URL_ATTR_RE = re.compile(r'(<patch\b[^>]*\bURL=")([^"]*)(")', re.I | re.S)
PATCH_RE = re.compile(r"<patch\s", re.I)


def mar_name_for_platform(platform: str) -> str | None:
    if platform.startswith("WINNT_aarch64"):
        return "windows-arm64.mar"
    if platform.startswith("WINNT_"):
        return "windows.mar"
    if platform.startswith("Linux_aarch64"):
        return "linux-aarch64.mar"
    if platform.startswith("Linux_"):
        return "linux.mar"
    if platform.startswith("Darwin_"):
        return "macos.mar"
    return None


def canonical_mar_url(repo: str, tag: str, mar_name: str) -> str:
    repo = repo.strip().strip("/")
    tag = tag.strip().strip("/")
    return f"https://github.com/{repo}/releases/download/{tag}/{mar_name}"


def rewrite_text(text: str, url: str) -> tuple[str, bool]:
    if not PATCH_RE.search(text):
        return text, False
    if not PATCH_URL_ATTR_RE.search(text):
        return text, False

    def _replace(match: re.Match[str]) -> str:
        return f"{match.group(1)}{url}{match.group(3)}"

    updated, n = PATCH_URL_ATTR_RE.subn(_replace, text, count=1)
    return updated, n > 0 and updated != text


def iter_channel_xml(root: Path, channel: str) -> list[Path]:
    browser = root / "browser"
    if not browser.is_dir():
        return []
    return sorted(
        p for p in browser.rglob("update.xml") if p.parent.name == channel
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--xml-root",
        type=Path,
        required=True,
        help="Tree containing browser/<platform>/<channel>/update.xml",
    )
    parser.add_argument(
        "--repo",
        required=True,
        help="GitHub owner/repo, e.g. Hrishikeshmind/astradesktop",
    )
    parser.add_argument(
        "--tag",
        required=True,
        help="Release tag (displayVersion, or twilight-1 for twilight)",
    )
    parser.add_argument(
        "--channel",
        default="",
        help="AUS channel directory (default: rewrite every channel found)",
    )
    parser.add_argument(
        "--skip-darwin",
        action="store_true",
        help="Leave Darwin_* manifests untouched (macOS skipped this run)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    root = args.xml_root
    if (root / "updates" / "browser").is_dir():
        root = root / "updates"
    if not (root / "browser").is_dir():
        print(f"FAIL: no browser/ under {args.xml_root}", file=sys.stderr)
        return 2

    if args.channel:
        xmls = iter_channel_xml(root, args.channel)
    else:
        xmls = sorted((root / "browser").rglob("update.xml"))
    if not xmls:
        print(f"FAIL: no update.xml under {root}", file=sys.stderr)
        return 1

    changed = 0
    skipped = 0
    errors = 0
    for xml in xmls:
        platform = xml.parent.parent.name
        if args.skip_darwin and platform.startswith("Darwin_"):
            print(f"SKIP Darwin: {xml}")
            skipped += 1
            continue
        text = xml.read_text(encoding="utf-8")
        if not PATCH_RE.search(text):
            print(f"SKIP empty: {xml}")
            skipped += 1
            continue
        mar_name = mar_name_for_platform(platform)
        if not mar_name:
            print(f"FAIL: unknown platform {platform!r} in {xml}", file=sys.stderr)
            errors += 1
            continue
        url = canonical_mar_url(args.repo, args.tag, mar_name)
        updated, did = rewrite_text(text, url)
        if not PATCH_URL_ATTR_RE.search(text):
            print(f"FAIL: {xml} has <patch> but no URL attribute", file=sys.stderr)
            errors += 1
            continue
        if did:
            if not args.dry_run:
                xml.write_text(updated, encoding="utf-8", newline="\n")
            print(f"{'would rewrite' if args.dry_run else 'rewrote'} {xml}")
            print(f"  URL={url}")
            changed += 1
        else:
            print(f"OK already canonical: {xml}")
            print(f"  URL={url}")

    if errors:
        print(f"FAIL: {errors} update.xml rewrite error(s)", file=sys.stderr)
        return 1
    print(
        f"OK rewritten={changed} unchanged-or-skipped={skipped} "
        f"(tag={args.tag} repo={args.repo})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
