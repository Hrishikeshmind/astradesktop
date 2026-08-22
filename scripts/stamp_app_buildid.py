#!/usr/bin/env python3
"""Stamp a packaged app tree with a fresh UTC MOZ_BUILD_DATE-style BuildID."""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from assert_buildid_monotonic import assert_newer  # noqa: E402

BUILDID_LINE = re.compile(r"^(BuildID=)(\d{14})\s*$", re.M)
VERSION_LINE = re.compile(r"^(Version=)(.+)$", re.M)


def utc_buildid() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")


def stamp_ini(path: Path, buildid: str, version: str | None) -> None:
    text = path.read_text(encoding="utf-8")
    if not BUILDID_LINE.search(text):
        raise ValueError(f"no BuildID= in {path}")
    text = BUILDID_LINE.sub(rf"\g<1>{buildid}", text)
    if version is not None and VERSION_LINE.search(text):
        text = VERSION_LINE.sub(rf"\g<1>{version}", text)
    path.write_text(text, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-dir", required=True, type=Path)
    parser.add_argument("--buildid", default="")
    parser.add_argument("--version", default="")
    parser.add_argument("--skip-monotonic", action="store_true")
    args = parser.parse_args()

    buildid = args.buildid or utc_buildid()
    if not args.skip_monotonic:
        assert_newer(buildid, [])

    app = args.app_dir
    inis = [app / "application.ini", app / "platform.ini"]
    for ini in inis:
        if not ini.is_file():
            raise SystemExit(f"missing {ini}")
        stamp_ini(ini, buildid, args.version or None)
        print(f"stamped {ini}: BuildID={buildid}" + (f" Version={args.version}" if args.version else ""))
    print(buildid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
