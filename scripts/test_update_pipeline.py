#!/usr/bin/env python3
"""Unit tests for MAR channel SSOT, header parsing, and buildID guards."""

from __future__ import annotations

from probe_disk_guard import prepare_probe_workspace
import struct
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from astra_channel import load_channel_map, mar_channel_id  # noqa: E402
from assert_buildid_monotonic import assert_newer, parse_buildid  # noqa: E402
from mar_create_from_filelist import create_mar  # noqa: E402
from mar_sign_openssl import sign_mar, verify_mar_signature  # noqa: E402
from verify_mar_product_info import main as verify_main  # noqa: E402
from verify_mar_product_info import parse_mar_product_info  # noqa: E402
from publish_empty_aus_manifests import EMPTY_XML, main as empty_aus_main  # noqa: E402
from rewrite_update_xml_patch_urls import (  # noqa: E402
    canonical_mar_url,
    main as rewrite_urls_main,
    mar_name_for_platform,
    rewrite_text,
)
from validate_update_xml import main as validate_xml_main  # noqa: E402
from validate_update_xml import patch_url_from_xml, sha512_file  # noqa: E402


class ChannelSSotTests(unittest.TestCase):
    def test_release_and_twilight_are_brand_names(self):
        mapping = load_channel_map()
        self.assertEqual(mapping["release"], "release")
        self.assertEqual(mapping["twilight"], "twilight")
        self.assertEqual(mar_channel_id("release"), "release")
        self.assertNotIn("firefox-mozilla-central", mapping.values())

    def test_unknown_brand_fails(self):
        with self.assertRaises(KeyError):
            mar_channel_id("nightly")


class BuildIdTests(unittest.TestCase):
    def test_parse_rejects_short(self):
        with self.assertRaises(ValueError):
            parse_buildid("20260819", "x")

    def test_monotonic_against_ledger(self):
        with self.assertRaises(ValueError):
            assert_newer("20260816124354", [])
        with self.assertRaises(ValueError):
            assert_newer("20260819052941", [])
        prev, known = assert_newer("20260821170000", [])
        self.assertEqual(prev, "20260819052941")
        self.assertIn("20260819052941", known)


class MarHeaderTests(unittest.TestCase):
    def test_live_windows_mar_is_wrong_channel(self):
        mar = ROOT / ".tmp-update-apply" / "windows.mar"
        if not mar.is_file() or mar.stat().st_size < 10_000_000:
            self.skipTest("published windows.mar fixture not present")
        info = parse_mar_product_info(mar)
        self.assertEqual(info.channel_id, "firefox-mozilla-central")
        self.assertEqual(info.num_signatures, 0)
        self.assertNotEqual(info.channel_id, mar_channel_id("release"))

    def test_synthetic_release_header(self):
        # Minimal MAR1 + unsigned product-info block, no members.
        channel = b"release\0"
        version = b"1.19.9b\0"
        unused = b"\0" * (104 - 8 - len(channel) - len(version))
        block = struct.pack(">II", 104, 1) + channel + version + unused
        header = (
            b"MAR1"
            + struct.pack(">I", 24 + 104)
            + struct.pack(">Q", 24 + 104)
            + struct.pack(">I", 0)  # signatures
            + struct.pack(">I", 1)  # sections
            + block
        )
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "t.mar"
            path.write_bytes(header)
            info = parse_mar_product_info(path)
            self.assertEqual(info.channel_id, "release")
            self.assertEqual(info.product_version, "1.19.9b")


class MarSignatureTests(unittest.TestCase):
    def _tiny_mar(self, td: Path) -> Path:
        work = td / "app"
        work.mkdir()
        (work / "hello.txt").write_text("astra", encoding="utf-8")
        (td / "files.txt").write_text("hello.txt\n", encoding="utf-8")
        mar = td / "t.mar"
        create_mar(mar, work, ["hello.txt"], "release", "1.19.9b")
        return mar

    def _ephemeral_cert(self, td: Path, cn: str) -> tuple[Path, Path, Path]:
        import shutil
        import subprocess

        openssl = shutil.which("openssl") or r"C:\Program Files\Git\usr\bin\openssl.exe"
        key = td / "k.key"
        crt = td / "c.crt"
        der = td / "c.der"
        subprocess.check_call(
            [openssl, "genrsa", "-out", str(key), "2048"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.check_call(
            [
                openssl,
                "req",
                "-new",
                "-x509",
                "-sha384",
                "-key",
                str(key),
                "-out",
                str(crt),
                "-days",
                "2",
                "-subj",
                f"/CN={cn}",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.check_call(
            [openssl, "x509", "-in", str(crt), "-outform", "DER", "-out", str(der)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return key, crt, der

    def test_unsigned_fails_assert_signed(self):
        with tempfile.TemporaryDirectory() as raw:
            td = Path(raw)
            mar = self._tiny_mar(td)
            info = parse_mar_product_info(mar)
            self.assertEqual(info.num_signatures, 0)
            self.assertEqual(info.channel_id, "release")
            rc = verify_main([str(mar), "--brand", "release", "--assert-channel", "--assert-signed"])
            self.assertEqual(rc, 1)

    def test_sign_and_verify_against_matching_cert(self):
        with tempfile.TemporaryDirectory() as raw:
            td = Path(raw)
            mar = self._tiny_mar(td)
            key, crt, der = self._ephemeral_cert(td, "Astra Test MAR")
            sign_mar(mar, key, crt)
            info = parse_mar_product_info(mar)
            self.assertEqual(info.num_signatures, 1)
            self.assertEqual(info.channel_id, "release")
            verify_mar_signature(mar, der)
            rc = verify_main(
                [
                    str(mar),
                    "--brand",
                    "release",
                    "--assert-channel",
                    "--assert-signed",
                    "--verify-cert",
                    str(der),
                    "--dump",
                ]
            )
            self.assertEqual(rc, 0)

    def test_wrong_cert_does_not_verify(self):
        with tempfile.TemporaryDirectory() as raw:
            td = Path(raw)
            mar = self._tiny_mar(td)
            key, crt, _der = self._ephemeral_cert(td, "Astra Test MAR A")
            other = td / "other"
            other.mkdir()
            _k2, _c2, der2 = self._ephemeral_cert(other, "Astra Test MAR B")
            sign_mar(mar, key, crt)
            with self.assertRaises(ValueError):
                verify_mar_signature(mar, der2)
            rc = verify_main(
                [str(mar), "--assert-signed", "--verify-cert", str(der2)]
            )
            self.assertEqual(rc, 1)

    def test_repo_primary_keypair_if_present(self):
        key = ROOT / "build" / "signing" / "private" / "astra_mar_signing_primary.key"
        der = ROOT / "build" / "signing" / "release_primary.der"
        backup = ROOT / "build" / "signing" / "release_backup.der"
        if not key.is_file() or not der.is_file():
            self.skipTest("primary private key not on this machine")
        with tempfile.TemporaryDirectory() as raw:
            td = Path(raw)
            mar = self._tiny_mar(td)
            sign_mar(mar, key, ROOT / "build" / "signing" / "release_primary.crt")
            verify_mar_signature(mar, der)
            if backup.is_file():
                with self.assertRaises(ValueError):
                    verify_mar_signature(mar, backup)


class EmptyAusManifestTests(unittest.TestCase):
    def test_writes_empty_release_xml(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            rc = empty_aus_main(["--root", str(root), "--create"])
            self.assertEqual(rc, 0)
            xml = root / "browser" / "WINNT_x86_64-msvc-x64" / "release" / "update.xml"
            self.assertTrue(xml.is_file())
            text = xml.read_text(encoding="utf-8")
            self.assertEqual(text, EMPTY_XML)
            self.assertNotIn("<patch", text)
            twilight = root / "browser" / "WINNT_x86_64-msvc-x64" / "twilight" / "update.xml"
            self.assertFalse(twilight.exists())

    def test_include_twilight(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            rc = empty_aus_main(["--root", str(root), "--include-twilight", "--create"])
            self.assertEqual(rc, 0)
            twilight = root / "browser" / "Linux_x86_64-gcc3" / "twilight" / "update.xml"
            self.assertTrue(twilight.is_file())
            self.assertNotIn("<patch", twilight.read_text(encoding="utf-8"))


class ValidateUpdateXmlTests(unittest.TestCase):
    def test_rejects_empty_xml(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "updates"
            xml = root / "browser" / "WINNT_x86_64-msvc-x64" / "release" / "update.xml"
            xml.parent.mkdir(parents=True)
            xml.write_text(EMPTY_XML, encoding="utf-8")
            rc = validate_xml_main(
                [
                    "--brand",
                    "release",
                    "--xml-root",
                    str(root),
                    "--mar",
                    "windows.mar=/dev/null",
                ]
            )
            self.assertEqual(rc, 1)

    def test_rejects_stale_hash_after_sign(self):
        """XML hashed before signing must not pass validation."""
        with tempfile.TemporaryDirectory() as raw:
            td = Path(raw)
            work = td / "app"
            work.mkdir()
            (work / "hello.txt").write_text("astra", encoding="utf-8")
            unsigned = td / "unsigned.mar"
            create_mar(unsigned, work, ["hello.txt"], "release", "1.19.9b")
            stale_hash = sha512_file(unsigned)
            stale_size = unsigned.stat().st_size

            key = ROOT / "build" / "signing" / "private" / "astra_mar_signing_primary.key"
            crt = ROOT / "build" / "signing" / "release_primary.crt"
            if not key.is_file():
                self.skipTest("primary private key not on this machine")
            signed = td / "windows.mar"
            signed.write_bytes(unsigned.read_bytes())
            sign_mar(signed, key, crt)
            self.assertNotEqual(sha512_file(signed), stale_hash)
            self.assertNotEqual(signed.stat().st_size, stale_size)

            root = td / "aus"
            for plat, mar_name in (
                ("WINNT_x86_64-msvc-x64", "windows.mar"),
                ("Linux_x86_64-gcc3", "linux.mar"),
            ):
                d = root / "browser" / plat / "release"
                d.mkdir(parents=True)
                (d / "update.xml").write_text(
                    f"""<?xml version="1.0" encoding="UTF-8"?>
<updates>
  <update type="minor" displayVersion="1.19.9b" appVersion="1.19.9b" platformVersion="153.0.4" buildID="20260824120000" detailsURL="https://github.com/Hrishikeshmind/astradesktop/releases">
    <patch type="complete" URL="https://github.com/Hrishikeshmind/astradesktop/releases/download/1.19.9b/{mar_name}" hashFunction="sha512" hashValue="{stale_hash}" size="{stale_size}"/>
  </update>
</updates>
""",
                    encoding="utf-8",
                )
            linux = td / "linux.mar"
            linux.write_bytes(signed.read_bytes())
            rc = validate_xml_main(
                [
                    "--brand",
                    "release",
                    "--expected-buildid",
                    "20260824120000",
                    "--xml-root",
                    str(root),
                    f"--mar=windows.mar={signed}",
                    f"--mar=linux.mar={linux}",
                    "--require-win-linux",
                ]
            )
            self.assertEqual(rc, 1)

    def test_patch_url_is_not_details_url(self):
        """Run #136: naive URL= regex captured detailsURL (generic releases page)."""
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<updates>
  <update type="minor" displayVersion="1.19.9b" appVersion="1.19.9b" platformVersion="153.0.4" buildID="20260824120000" detailsURL="https://github.com/Hrishikeshmind/astradesktop/releases">
    <patch type="complete" URL="https://github.com/Hrishikeshmind/astradesktop/releases/download/1.19.9b/windows.mar" hashFunction="sha512" hashValue="abc" size="1"/>
  </update>
</updates>
"""
        url = patch_url_from_xml(xml)
        self.assertEqual(
            url,
            "https://github.com/Hrishikeshmind/astradesktop/releases/download/1.19.9b/windows.mar",
        )
        self.assertNotEqual(
            url, "https://github.com/Hrishikeshmind/astradesktop/releases"
        )

    def test_skips_empty_darwin_when_macos_mar_not_mapped(self):
        import io
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "updates"
            darwin = root / "browser" / "Darwin_aarch64-gcc3" / "release"
            darwin.mkdir(parents=True)
            (darwin / "update.xml").write_text(EMPTY_XML, encoding="utf-8")
            win = root / "browser" / "WINNT_x86_64-msvc-x64" / "release"
            win.mkdir(parents=True)
            (win / "update.xml").write_text(EMPTY_XML, encoding="utf-8")
            stdout = io.StringIO()
            stderr = io.StringIO()
            with patch("sys.stdout", stdout), patch("sys.stderr", stderr):
                rc = validate_xml_main(
                    [
                        "--brand",
                        "release",
                        "--xml-root",
                        str(root),
                        "--mar",
                        "windows.mar=/dev/null",
                    ]
                )
            self.assertEqual(rc, 1)
            self.assertIn("SKIP Darwin", stdout.getvalue())
            self.assertNotIn("Darwin_", stderr.getvalue())


class RewritePatchUrlTests(unittest.TestCase):
    def test_platform_mar_names(self):
        self.assertEqual(mar_name_for_platform("WINNT_x86_64-msvc-x64"), "windows.mar")
        self.assertEqual(
            mar_name_for_platform("WINNT_aarch64-msvc-aarch64"), "windows-arm64.mar"
        )
        self.assertEqual(mar_name_for_platform("Linux_x86_64-gcc3"), "linux.mar")
        self.assertEqual(
            mar_name_for_platform("Linux_aarch64-gcc3"), "linux-aarch64.mar"
        )
        self.assertEqual(mar_name_for_platform("Darwin_x86_64-gcc3"), "macos.mar")

    def test_rewrites_generic_releases_page_to_asset_url(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<updates>
  <update type="minor" displayVersion="1.19.9b" appVersion="1.19.9b" platformVersion="153.0.4" buildID="20260824120000" detailsURL="https://github.com/Hrishikeshmind/astradesktop/releases">
    <patch type="complete" URL="https://github.com/Hrishikeshmind/astradesktop/releases" hashFunction="sha512" hashValue="abc" size="1"/>
  </update>
</updates>
"""
        want = canonical_mar_url(
            "Hrishikeshmind/astradesktop", "1.19.9b", "windows.mar"
        )
        updated, did = rewrite_text(xml, want)
        self.assertTrue(did)
        self.assertEqual(patch_url_from_xml(updated), want)
        self.assertIn(
            'detailsURL="https://github.com/Hrishikeshmind/astradesktop/releases"',
            updated,
        )

    def test_rewrite_cli_win_linux_and_skip_darwin(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw) / "updates"
            for plat in ("WINNT_x86_64-msvc-x64", "Linux_x86_64-gcc3"):
                d = root / "browser" / plat / "release"
                d.mkdir(parents=True)
                (d / "update.xml").write_text(
                    """<?xml version="1.0" encoding="UTF-8"?>
<updates>
  <update type="minor" displayVersion="1.19.9b" appVersion="1.19.9b" platformVersion="153.0.4" buildID="20260824120000" detailsURL="https://github.com/Hrishikeshmind/astradesktop/releases">
    <patch type="complete" URL="https://github.com/Hrishikeshmind/astradesktop/releases" hashFunction="sha512" hashValue="abc" size="1"/>
  </update>
</updates>
""",
                    encoding="utf-8",
                )
            darwin = root / "browser" / "Darwin_aarch64-gcc3" / "release"
            darwin.mkdir(parents=True)
            (darwin / "update.xml").write_text(EMPTY_XML, encoding="utf-8")
            rc = rewrite_urls_main(
                [
                    "--xml-root",
                    str(root),
                    "--repo",
                    "Hrishikeshmind/astradesktop",
                    "--tag",
                    "1.19.9b",
                    "--channel",
                    "release",
                    "--skip-darwin",
                ]
            )
            self.assertEqual(rc, 0)
            win = (
                root
                / "browser"
                / "WINNT_x86_64-msvc-x64"
                / "release"
                / "update.xml"
            ).read_text(encoding="utf-8")
            linux = (
                root / "browser" / "Linux_x86_64-gcc3" / "release" / "update.xml"
            ).read_text(encoding="utf-8")
            self.assertEqual(
                patch_url_from_xml(win),
                "https://github.com/Hrishikeshmind/astradesktop/releases/download/1.19.9b/windows.mar",
            )
            self.assertEqual(
                patch_url_from_xml(linux),
                "https://github.com/Hrishikeshmind/astradesktop/releases/download/1.19.9b/linux.mar",
            )
            self.assertNotIn(
                "<patch",
                (darwin / "update.xml").read_text(encoding="utf-8"),
            )


class PostPublishPagesRetryTests(unittest.TestCase):
    def test_cache_bust_appends_query(self):
        from post_publish_mar_header_check import cache_bust_url

        self.assertEqual(
            cache_bust_url("https://example.com/update.xml", nonce=123),
            "https://example.com/update.xml?_=123",
        )
        self.assertEqual(
            cache_bust_url("https://example.com/x?a=1", nonce=9),
            "https://example.com/x?a=1&_=9",
        )

    def test_retries_empty_then_succeeds(self):
        from post_publish_mar_header_check import fetch_pages_update_xml

        bodies = [
            b'<?xml version="1.0"?><updates></updates>\n',
            b'<?xml version="1.0"?><updates></updates>\n',
            b'<?xml version="1.0"?><updates><patch type="complete" URL="https://x/a.mar"/></updates>\n',
        ]
        sleeps: list[float] = []
        busted: list[bool] = []

        def fake_fetch(url, max_bytes=None, *, cache_bust=False):
            busted.append(cache_bust)
            return bodies.pop(0)

        xml, used, _elapsed, err = fetch_pages_update_xml(
            "https://example.com/update.xml",
            attempts=6,
            backoff_s=10,
            wait_for_patch=True,
            fetch_bytes=fake_fetch,
            sleep=sleeps.append,
        )
        self.assertIn("<patch ", xml)
        self.assertEqual(used, 3)
        self.assertIsNone(err)
        self.assertEqual(sleeps, [10, 10])
        self.assertEqual(busted, [True, True, True])

    def test_exhausted_empty_reports_attempts(self):
        from post_publish_mar_header_check import (
            _no_patch_message,
            fetch_pages_update_xml,
        )

        def fake_fetch(url, max_bytes=None, *, cache_bust=False):
            return b'<?xml version="1.0"?><updates></updates>\n'

        xml, used, elapsed, err = fetch_pages_update_xml(
            "https://example.com/update.xml",
            attempts=3,
            backoff_s=0,
            wait_for_patch=True,
            fetch_bytes=fake_fetch,
            sleep=lambda _s: None,
        )
        self.assertNotIn("<patch ", xml)
        self.assertEqual(used, 3)
        self.assertIsNone(err)
        msg = _no_patch_message(
            "https://example.com/update.xml",
            attempts_used=used,
            attempts_limit=3,
            elapsed_s=elapsed,
            last_error=err,
        )
        self.assertIn("still empty after 3 attempts", msg)
        self.assertIn("GitHub Pages lag/cache race", msg)

    def test_first_attempt_message_when_no_retry(self):
        from post_publish_mar_header_check import _no_patch_message

        msg = _no_patch_message(
            "https://example.com/update.xml",
            attempts_used=1,
            attempts_limit=1,
            elapsed_s=0.2,
            last_error=None,
        )
        self.assertEqual(msg, "FAIL: https://example.com/update.xml has no patch")
        self.assertNotIn("still empty", msg)

    def test_paused_empty_does_not_retry(self):
        from post_publish_mar_header_check import fetch_pages_update_xml

        calls = {"n": 0}

        def fake_fetch(url, max_bytes=None, *, cache_bust=False):
            calls["n"] += 1
            return b'<?xml version="1.0"?><updates></updates>\n'

        xml, used, _elapsed, err = fetch_pages_update_xml(
            "https://example.com/update.xml",
            attempts=6,
            backoff_s=10,
            wait_for_patch=False,
            fetch_bytes=fake_fetch,
            sleep=lambda _s: self.fail("should not sleep while paused"),
        )
        self.assertNotIn("<patch ", xml)
        self.assertEqual(used, 1)
        self.assertEqual(calls["n"], 1)
        self.assertIsNone(err)


class FindMarsSkipsArtifactDirectories(unittest.TestCase):
    def test_rglob_does_not_return_directories_named_mar(self):
        from ci_guard_update_publish import find_mars

        with tempfile.TemporaryDirectory() as raw:
            td = Path(raw)
            artifact_dir = td / "windows-arm64.mar"
            artifact_dir.mkdir()
            mar_file = artifact_dir / "windows-arm64.mar"
            mar_file.write_bytes(b"MAR1" + b"\x00" * 64)
            (td / "windows.mar").mkdir()
            (td / "windows.mar" / "windows.mar").write_bytes(b"MAR1" + b"\x00" * 64)
            found = find_mars([td, artifact_dir])
            resolved = {p.resolve() for p in found}
            self.assertIn(mar_file.resolve(), resolved)
            self.assertNotIn(artifact_dir.resolve(), resolved)
            for path in found:
                self.assertTrue(path.is_file(), msg=f"expected file, got {path}")


if __name__ == "__main__":
    prepare_probe_workspace(Path(__file__).resolve().parents[1], label="test_update_pipeline")
    unittest.main()
