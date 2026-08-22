#!/usr/bin/env python3
"""Single source of truth for Astra MAR channel IDs.

Reads `.astra/channel.env` (brand=MAR_CHANNEL_ID). Every MAR build/verify
path must go through this module instead of hardcoding channel strings.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANNEL_FILE = ROOT / ".astra" / "channel.env"


def load_channel_map(path: Path | None = None) -> dict[str, str]:
    src = path or CHANNEL_FILE
    if not src.is_file():
        raise FileNotFoundError(f"MAR channel SSOT missing: {src}")
    mapping: dict[str, str] = {}
    for raw in src.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"invalid channel.env line: {raw!r}")
        brand, channel = line.split("=", 1)
        brand = brand.strip()
        channel = channel.strip()
        if not brand or not channel:
            raise ValueError(f"invalid channel.env line: {raw!r}")
        mapping[brand] = channel
    if not mapping:
        raise ValueError(f"no brand mappings in {src}")
    return mapping


def mar_channel_id(brand: str, path: Path | None = None) -> str:
    mapping = load_channel_map(path)
    if brand not in mapping:
        known = ", ".join(sorted(mapping))
        raise KeyError(f"unknown brand {brand!r}; channel.env has: {known}")
    return mapping[brand]


def accepted_mar_channel_ids(brand: str, path: Path | None = None) -> str:
    # Intentionally a single ID — never a comma-separated widening.
    return mar_channel_id(brand, path)


def export_env(brand: str) -> str:
    channel = mar_channel_id(brand)
    accepted = accepted_mar_channel_ids(brand)
    if channel != accepted:
        raise ValueError(
            f"MAR_CHANNEL_ID ({channel}) must equal "
            f"ACCEPTED_MAR_CHANNEL_IDS ({accepted})"
        )
    return (
        f"export MAR_CHANNEL_ID={channel}\n"
        f"export ACCEPTED_MAR_CHANNEL_IDS={accepted}\n"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand", required=True, help="Surfer brand / AUS channel")
    parser.add_argument(
        "--export",
        action="store_true",
        help="Print shell assignments for eval/source",
    )
    parser.add_argument(
        "--print-id",
        action="store_true",
        help="Print MAR_CHANNEL_ID only",
    )
    args = parser.parse_args(argv)
    if args.export:
        sys.stdout.write(export_env(args.brand))
        return 0
    sys.stdout.write(mar_channel_id(args.brand) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
