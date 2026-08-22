#!/usr/bin/env python3
"""Sign or verify a Mozilla MAR using OpenSSL RSA-PKCS1-SHA384.

Matches modules/libmar/sign/mar_sign.c:
  SGN_NewContext(SEC_OID_PKCS1_SHA384_WITH_RSA_ENCRYPTION)
  signature algorithm ID 2
  digest input = whole MAR except the signature payload bytes
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

MAR_ID = b"MAR1"
SIGNATURE_ALGORITHM_SHA384 = 2
MAX_SIZE_OF_MAR_FILE = 524288000

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PRIMARY_CRT = ROOT / "build" / "signing" / "release_primary.crt"
DEFAULT_PRIMARY_DER = ROOT / "build" / "signing" / "release_primary.der"


def find_openssl() -> str:
    found = shutil.which("openssl")
    if found:
        return found
    for candidate in (
        Path(r"C:\Program Files\Git\usr\bin\openssl.exe"),
        Path(r"C:\Program Files (x86)\Git\usr\bin\openssl.exe"),
    ):
        if candidate.is_file():
            return str(candidate)
    raise FileNotFoundError("openssl not found on PATH")


def _run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, **kwargs)


def parse_signature_section(data: bytes) -> tuple[int, list[tuple[int, bytes]], int]:
    """Return (num_signatures, [(alg, sig), ...], offset_after_signature_section)."""
    if len(data) < 20 or data[:4] != MAR_ID:
        raise ValueError("not a MAR1 file")
    (num_signatures,) = struct.unpack(">I", data[16:20])
    pos = 20
    sigs: list[tuple[int, bytes]] = []
    for _ in range(num_signatures):
        if pos + 8 > len(data):
            raise ValueError("truncated signature block")
        alg_id, sig_len = struct.unpack(">II", data[pos : pos + 8])
        pos += 8
        if pos + sig_len > len(data):
            raise ValueError("truncated signature payload")
        sigs.append((alg_id, data[pos : pos + sig_len]))
        pos += sig_len
    return num_signatures, sigs, pos


def signature_digest_input(data: bytes) -> bytes:
    """Bytes hashed by signmar / the updater (MAR minus signature payloads)."""
    num_signatures, sigs, after = parse_signature_section(data)
    out = bytearray(data[:20])
    pos = 20
    for alg_id, sig in sigs:
        out.extend(data[pos : pos + 8])
        pos += 8 + len(sig)
        _ = alg_id
    out.extend(data[after:])
    return bytes(out)


def _adjust_index_offsets(index: bytes, delta: int) -> bytes:
    pos = 0
    out = bytearray()
    while pos < len(index):
        if pos + 12 > len(index):
            raise ValueError("truncated MAR index")
        offset, length, flags = struct.unpack(">III", index[pos : pos + 12])
        pos += 12
        end = index.find(b"\x00", pos)
        if end < 0:
            raise ValueError("unterminated name in MAR index")
        name = index[pos : end + 1]
        pos = end + 1
        out.extend(struct.pack(">III", offset + delta, length, flags))
        out.extend(name)
    if pos != len(index):
        raise ValueError("MAR index parse leftover")
    return bytes(out)


def rsa_modulus_len(openssl: str, key_pem: Path) -> int:
    out = subprocess.check_output(
        [openssl, "rsa", "-in", str(key_pem), "-modulus", "-noout"],
        text=True,
    )
    hexmod = out.split("=", 1)[1].strip()
    if not hexmod or len(hexmod) % 2:
        raise ValueError(f"could not parse RSA modulus from {key_pem}")
    return len(hexmod) // 2


def _write_key_from_env(env_name: str, dest: Path) -> None:
    raw = os.environ.get(env_name, "")
    if not raw.strip():
        raise SystemExit(f"{env_name} is missing or empty")
    dest.write_bytes(base64.b64decode(raw))


def openssl_sign_sha384(openssl: str, key_pem: Path, payload: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "payload.bin"
        sig = Path(td) / "sig.bin"
        src.write_bytes(payload)
        _run(
            [
                openssl,
                "dgst",
                "-sha384",
                "-sign",
                str(key_pem),
                "-out",
                str(sig),
                str(src),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        return sig.read_bytes()


def openssl_verify_sha384(
    openssl: str, cert_path: Path, payload: bytes, signature: bytes
) -> None:
    with tempfile.TemporaryDirectory() as td:
        pub = Path(td) / "pub.pem"
        src = Path(td) / "payload.bin"
        sig = Path(td) / "sig.bin"
        src.write_bytes(payload)
        sig.write_bytes(signature)
        inform = "DER" if cert_path.suffix.lower() == ".der" else "PEM"
        _run(
            [
                openssl,
                "x509",
                "-inform",
                inform,
                "-in",
                str(cert_path),
                "-pubkey",
                "-noout",
                "-out",
                str(pub),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        _run(
            [
                openssl,
                "dgst",
                "-sha384",
                "-verify",
                str(pub),
                "-signature",
                str(sig),
                str(src),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )


def verify_mar_signature(mar_path: Path, cert_path: Path) -> None:
    data = mar_path.read_bytes()
    num_signatures, sigs, _after = parse_signature_section(data)
    if num_signatures < 1 or not sigs:
        raise ValueError(f"{mar_path}: unsigned (numSignatures={num_signatures})")
    openssl = find_openssl()
    payload = signature_digest_input(data)
    errors: list[str] = []
    for i, (alg_id, sig) in enumerate(sigs):
        if alg_id != SIGNATURE_ALGORITHM_SHA384:
            errors.append(f"sig[{i}] algorithm {alg_id} != 2 (RSA-PKCS1-SHA384)")
            continue
        try:
            openssl_verify_sha384(openssl, cert_path, payload, sig)
            return
        except subprocess.CalledProcessError as exc:
            err = (exc.stderr or b"").decode("utf-8", errors="replace").strip()
            errors.append(f"sig[{i}] openssl verify failed: {err or exc}")
    raise ValueError(
        f"{mar_path}: signature did not verify against {cert_path}: "
        + "; ".join(errors)
    )


def sign_mar(mar_path: Path, key_pem: Path, cert_path: Path | None = None) -> None:
    data = bytearray(mar_path.read_bytes())
    if len(data) < 20 or data[:4] != MAR_ID:
        raise ValueError(f"{mar_path} is not a MAR1 file")

    openssl = find_openssl()
    num_signatures, sigs, after = parse_signature_section(bytes(data))
    if num_signatures > 0:
        if cert_path:
            verify_mar_signature(mar_path, cert_path)
            print(f"already signed and verified: {mar_path}")
            return
        raise ValueError(f"{mar_path} is already signed (numSignatures={num_signatures})")

    (offset_to_index,) = struct.unpack(">I", data[4:8])
    (size_of_mar,) = struct.unpack(">Q", data[8:16])
    if size_of_mar != len(data):
        raise ValueError(f"{mar_path}: size field {size_of_mar} != file length {len(data)}")
    if offset_to_index > len(data) - 4:
        raise ValueError(f"{mar_path}: offset_to_index out of range")

    sig_len = rsa_modulus_len(openssl, key_pem)
    extra = 8 + sig_len
    new_offset = offset_to_index + extra
    new_size = size_of_mar + extra
    if new_size > MAX_SIZE_OF_MAR_FILE:
        raise ValueError(f"{mar_path}: signed MAR would exceed MAX_SIZE_OF_MAR_FILE")

    index_len = struct.unpack(">I", data[offset_to_index : offset_to_index + 4])[0]
    index = bytes(data[offset_to_index + 4 : offset_to_index + 4 + index_len])
    if len(index) != index_len:
        raise ValueError(f"{mar_path}: truncated index")
    adjusted = _adjust_index_offsets(index, extra)

    header = bytearray()
    header.extend(MAR_ID)
    header.extend(struct.pack(">I", new_offset))
    header.extend(struct.pack(">Q", new_size))
    header.extend(struct.pack(">I", 1))
    header.extend(struct.pack(">II", SIGNATURE_ALGORITHM_SHA384, sig_len))
    placeholder_at = len(header)
    header.extend(b"\x00" * sig_len)

    body_before_index = bytes(data[after:offset_to_index])
    signed_file = bytearray()
    signed_file.extend(header)
    signed_file.extend(body_before_index)
    signed_file.extend(struct.pack(">I", index_len))
    signed_file.extend(adjusted)
    if len(signed_file) != new_size:
        raise ValueError(
            f"internal size mismatch: built {len(signed_file)} expected {new_size}"
        )

    payload = signature_digest_input(bytes(signed_file))
    signature = openssl_sign_sha384(openssl, key_pem, payload)
    if len(signature) != sig_len:
        raise ValueError(f"signature length {len(signature)} != modulus {sig_len}")
    signed_file[placeholder_at : placeholder_at + sig_len] = signature

    if cert_path:
        tmp = mar_path.with_name(mar_path.name + ".signed-tmp")
        tmp.write_bytes(signed_file)
        try:
            verify_mar_signature(tmp, cert_path)
        except Exception:
            tmp.unlink(missing_ok=True)
            raise
        tmp.replace(mar_path)
    else:
        tmp = mar_path.with_name(mar_path.name + ".signed-tmp")
        tmp.write_bytes(signed_file)
        tmp.replace(mar_path)

    print(f"signed {mar_path} (RSA-PKCS1-SHA384, sig_len={sig_len})")
    _ = sigs


def refresh_update_xml(
    mar_path: Path,
    xml_roots: list[Path],
    details_url: str = "",
) -> int:
    digest = hashlib.sha512(mar_path.read_bytes()).hexdigest()
    size = str(mar_path.stat().st_size)
    updated = 0
    for root in xml_roots:
        if not root.exists():
            continue
        paths = [root] if root.is_file() else list(root.rglob("update.xml"))
        for xml in paths:
            text = xml.read_text(encoding="utf-8")
            original = text
            text = re.sub(r'hashValue="[^"]*"', f'hashValue="{digest}"', text)
            text = re.sub(r'\ssize="[^"]*"', f' size="{size}"', text)
            if details_url and "detailsURL=" not in text:
                text = text.replace(
                    "<update ",
                    f'<update detailsURL="{details_url}" ',
                    1,
                )
            if text != original:
                xml.write_text(text, encoding="utf-8")
                updated += 1
                print(f"refreshed {xml} hash/size")
    return updated


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sign", type=Path, help="MAR to sign in place")
    parser.add_argument("--verify", type=Path, help="MAR to verify")
    parser.add_argument("--key", type=Path, help="Private key PEM")
    parser.add_argument(
        "--key-b64-env",
        default="",
        help="Env var holding base64(private key PEM)",
    )
    parser.add_argument("--cert", type=Path, default=DEFAULT_PRIMARY_CRT)
    parser.add_argument(
        "--refresh-xml",
        action="append",
        default=[],
        help="Directory or update.xml to rewrite hash/size after signing",
    )
    parser.add_argument(
        "--details-url",
        default="https://github.com/Hrishikeshmind/astradesktop/releases",
    )
    parser.add_argument(
        "--refresh-only",
        action="store_true",
        help="Rewrite update.xml hash/size for --sign without signing",
    )
    args = parser.parse_args(argv)

    if args.refresh_only:
        if not args.sign:
            parser.error("--refresh-only requires --sign <mar>")
        if not args.refresh_xml:
            parser.error("--refresh-only requires --refresh-xml")
        n = refresh_update_xml(
            args.sign,
            [Path(p) for p in args.refresh_xml],
            details_url=args.details_url,
        )
        print(f"refreshed {n} update.xml file(s)")
        return 0

    if args.verify:
        cert = args.cert if args.cert.suffix.lower() in {".der", ".crt", ".pem"} else DEFAULT_PRIMARY_DER
        if not cert.is_file():
            print(f"missing cert {cert}", file=sys.stderr)
            return 2
        try:
            verify_mar_signature(args.verify, cert)
        except (ValueError, subprocess.CalledProcessError, FileNotFoundError) as exc:
            print(f"FAIL {exc}", file=sys.stderr)
            return 1
        print(f"OK signature verifies: {args.verify}")
        return 0

    if not args.sign:
        parser.error("specify --sign or --verify")

    with tempfile.TemporaryDirectory() as td:
        key_path = args.key
        if args.key_b64_env:
            key_path = Path(td) / "private_key.pem"
            _write_key_from_env(args.key_b64_env, key_path)
        if key_path is None or not key_path.is_file():
            local = ROOT / "build" / "signing" / "private" / "astra_mar_signing_primary.key"
            if local.is_file():
                key_path = local
            else:
                print(
                    "FAIL: no private key (pass --key, --key-b64-env, or local gitignored key)",
                    file=sys.stderr,
                )
                return 2
        cert = args.cert if args.cert.is_file() else DEFAULT_PRIMARY_DER
        try:
            sign_mar(args.sign, key_path, cert if cert.is_file() else None)
        except (ValueError, subprocess.CalledProcessError, FileNotFoundError) as exc:
            print(f"FAIL {exc}", file=sys.stderr)
            return 1

    if args.refresh_xml:
        refresh_update_xml(
            args.sign,
            [Path(p) for p in args.refresh_xml],
            details_url=args.details_url,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
