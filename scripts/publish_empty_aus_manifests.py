#!/usr/bin/env python3
"""Write empty AUS update.xml manifests (no update offered).

Firefox/AUS treats an empty <updates/> document as "up to date". Use this when:
  - Publish is paused and live Pages still advertise a broken/stale MAR
  - You need to stop false "update available" loops without disabling updates

Default targets match every platform path currently on the `updates` branch.
Does not clear twilight unless --include-twilight is passed.

Examples:
  # Dry-run against a local checkout of the updates branch
  python scripts/publish_empty_aus_manifests.py --root ./updates-checkout --dry-run

  # Write empty release manifests in-place
  python scripts/publish_empty_aus_manifests.py --root ./updates-checkout

  # Also clear twilight channel
  python scripts/publish_empty_aus_manifests.py --root ./updates-checkout --include-twilight
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

EMPTY_XML = """\
<?xml version="1.0" encoding="UTF-8"?>
<updates>
</updates>
"""

# Platforms currently published on hrishikeshmind.github.io/astradesktop
PLATFORMS = [
    "Darwin_aarch64-gcc3",
    "Darwin_x86-gcc3",
    "Darwin_x86-gcc3-u-i386-x86_64",
    "Darwin_x86_64-gcc3",
    "Darwin_x86_64-gcc3-u-i386-x86_64",
    "Linux_aarch64-gcc3",
    "Linux_x86_64-gcc3",
    "WINNT_aarch64-msvc-aarch64",
    "WINNT_x86_64-msvc",
    "WINNT_x86_64-msvc-x64",
]


def manifest_paths(root: Path, channels: list[str]) -> list[Path]:
    paths: list[Path] = []
    for platform in PLATFORMS:
        for channel in channels:
            paths.append(root / "browser" / platform / channel / "update.xml")
    return paths


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        required=True,
        help="Updates tree root (contains browser/<platform>/<channel>/update.xml). "
        "Often the checkout of the GitHub Pages `updates` branch with path /.",
    )
    parser.add_argument(
        "--include-twilight",
        action="store_true",
        help="Also empty twilight channel manifests (default: release only)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print paths that would be written without modifying files",
    )
    parser.add_argument(
        "--create",
        action="store_true",
        help="Create browser/<platform>/<channel>/ if the tree does not exist yet",
    )
    args = parser.parse_args(argv)

    root = args.root
    # Accept either `updates/` or a Pages root that already contains `browser/`
    if (root / "updates" / "browser").is_dir():
        root = root / "updates"
    elif root.name == "browser":
        root = root.parent
    elif not (root / "browser").is_dir():
        if not args.create:
            print(
                f"FAIL: {args.root} does not look like an updates tree "
                "(expected browser/ or updates/browser/). Pass --create to start one.",
                file=sys.stderr,
            )
            return 2
        root.mkdir(parents=True, exist_ok=True)

    channels = ["release"]
    if args.include_twilight:
        channels.append("twilight")

    written = 0
    for path in manifest_paths(root, channels):
        rel = path
        try:
            rel = path.relative_to(args.root.resolve())
        except ValueError:
            pass
        if args.dry_run:
            print(f"would write empty: {rel}")
            written += 1
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(EMPTY_XML, encoding="utf-8", newline="\n")
        print(f"wrote empty: {rel}")
        written += 1

    print(f"{'would write' if args.dry_run else 'wrote'} {written} empty update.xml file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
