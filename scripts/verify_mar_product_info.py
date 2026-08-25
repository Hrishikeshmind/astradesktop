#!/usr/bin/env python3
"""Parse a Mozilla MAR product-information block and assert channel + version.

MAR format (https://wiki.mozilla.org/Software_Update:MAR):
  4  MAR1
  4  offset_to_index (BE)
  8  size_of_entire_MAR (BE)
  4  numSignatures (BE)
  [signatures...]
  4  numAdditionalSections (BE)
  additional section 1 (product info, id=1):
    4 size, 4 id, channel\\0, version\\0, padding
"""

from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from astra_channel import mar_channel_id  # noqa: E402
from mar_sign_openssl import (  # noqa: E402
    DEFAULT_PRIMARY_DER,
    verify_mar_signature,
)

MAR_ID = b"MAR1"
PRODUCT_INFO_BLOCK_ID = 1
PIB_MAX_MAR_CHANNEL_ID_SIZE = 63
PIB_MAX_PRODUCT_VERSION_SIZE = 31


class MarProductInfo:
    def __init__(
        self,
        path: Path,
        channel_id: str,
        product_version: str,
        num_signatures: int,
        size: int,
    ):
        self.path = path
        self.channel_id = channel_id
        self.product_version = product_version
        self.num_signatures = num_signatures
        self.size = size

    def header_ascii(self) -> str:
        return self.channel_id

    def header_hex_prefix(self, nbytes: int = 80) -> str:
        data = self.path.read_bytes()[:nbytes]
        return data.hex()


def _cstr(buf: bytes) -> str:
    return buf.split(b"\x00", 1)[0].decode("ascii")


def parse_mar_product_info(path: Path) -> MarProductInfo:
    if not path.is_file():
        raise ValueError(f"{path} is not a MAR file (got a directory or missing path)")
    data = path.read_bytes()
    if len(data) < 24 or data[:4] != MAR_ID:
        raise ValueError(f"{path} is not a MAR1 file")
    offset_to_index, mar_size, num_signatures = struct.unpack(">IQI", data[4:20])
    pos = 20
    for _ in range(num_signatures):
        if pos + 8 > len(data):
            raise ValueError(f"{path}: truncated signature block")
        alg_id, sig_len = struct.unpack(">II", data[pos : pos + 8])
        pos += 8 + sig_len
        _ = alg_id
    if pos + 4 > len(data):
        raise ValueError(f"{path}: truncated additional-sections count")
    (num_sections,) = struct.unpack(">I", data[pos : pos + 4])
    pos += 4
    if num_sections < 1:
        raise ValueError(f"{path}: no additional sections (missing product info)")
    sec_size, sec_id = struct.unpack(">II", data[pos : pos + 8])
    if sec_id != PRODUCT_INFO_BLOCK_ID:
        raise ValueError(f"{path}: first extra section id {sec_id}, expected {PRODUCT_INFO_BLOCK_ID}")
    block = data[pos + 8 : pos + sec_size]
    channel = _cstr(block[: PIB_MAX_MAR_CHANNEL_ID_SIZE + 1])
    rest = block[len(channel) + 1 :]
    version = _cstr(rest[: PIB_MAX_PRODUCT_VERSION_SIZE + 1])
    _ = offset_to_index
    return MarProductInfo(path, channel, version, num_signatures, mar_size)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mar", type=Path)
    parser.add_argument("--brand", help="Surfer brand; required with --assert-channel")
    parser.add_argument(
        "--assert-channel",
        action="store_true",
        help="Fail unless MAR channel equals SSOT for --brand",
    )
    parser.add_argument("--expect-version", default="", help="Optional product version")
    parser.add_argument("--dump", action="store_true", help="Print channel/version/hex")
    parser.add_argument(
        "--assert-signed",
        action="store_true",
        help="Fail unless numSignatures >= 1",
    )
    parser.add_argument(
        "--verify-cert",
        type=Path,
        default=None,
        help="DER/PEM cert that must verify the embedded signature "
        "(default: build/signing/release_primary.der when --assert-signed)",
    )
    args = parser.parse_args(argv)

    info = parse_mar_product_info(args.mar)
    if args.dump:
        print(f"path={args.mar}")
        print(f"size={info.size}")
        print(f"numSignatures={info.num_signatures}")
        print(f"MAR_CHANNEL_ID={info.channel_id}")
        print(f"PRODUCT_VERSION={info.product_version}")
        print(f"header_hex={info.header_hex_prefix()}")

    if args.assert_signed or args.verify_cert is not None:
        if info.num_signatures < 1:
            print(
                f"FAIL {args.mar}: unsigned (numSignatures={info.num_signatures}); "
                "channel-correct unsigned MARs are rejected the same as a channel mismatch",
                file=sys.stderr,
            )
            return 1
        cert = args.verify_cert or DEFAULT_PRIMARY_DER
        if not cert.is_file():
            print(f"FAIL missing signing cert {cert}", file=sys.stderr)
            return 2
        try:
            verify_mar_signature(args.mar, cert)
        except (ValueError, OSError) as exc:
            print(f"FAIL {args.mar}: {exc}", file=sys.stderr)
            return 1
        print(f"OK {args.mar}: signature verifies against {cert}")

    if args.assert_channel:
        if not args.brand:
            print("--assert-channel requires --brand", file=sys.stderr)
            return 2
        expected = mar_channel_id(args.brand)
        if info.channel_id != expected:
            print(
                f"FAIL {args.mar}: MAR channel {info.channel_id!r} != SSOT {expected!r}",
                file=sys.stderr,
            )
            return 1
        print(f"OK {args.mar}: MAR channel {info.channel_id!r}")

    if args.expect_version and info.product_version != args.expect_version:
        print(
            f"FAIL {args.mar}: product version {info.product_version!r} "
            f"!= {args.expect_version!r}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
