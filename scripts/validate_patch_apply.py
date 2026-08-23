#!/usr/bin/env python3
"""Dry-run all git patches against a downloaded Firefox engine tree.

Run after `npm run download` and before `npm run import` to catch patches whose
context no longer matches upstream (stale hunks), without waiting for surfer to
fail mid-import.
"""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engine"
PATCH_ROOT = ROOT / "src"
PATCH_SKIP_DIRS = {"external-patches"}


def fail(message: str) -> None:
    print(f"[validate-patch-apply] ERROR: {message}")
    sys.exit(1)


def main() -> None:
    if not (ENGINE / "browser").is_dir():
        fail(
            "Missing engine/ tree. Run `npm run download` first, then retry "
            "`npm run validate:apply`."
        )

    patches = sorted(
        path
        for path in PATCH_ROOT.rglob("*.patch")
        if PATCH_SKIP_DIRS.isdisjoint(path.relative_to(PATCH_ROOT).parts)
    )
    if not patches:
        fail(f"No patch files found under {PATCH_ROOT}")

    failed: list[str] = []
    for patch in patches:
        result = subprocess.run(
            [
                "git",
                "apply",
                "--check",
                "--ignore-space-change",
                "--ignore-whitespace",
                str(patch),
            ],
            cwd=ENGINE,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "patch does not apply").strip()
            failed.append(f"{patch.relative_to(ROOT)}: {detail.splitlines()[-1]}")

    if failed:
        print("[validate-patch-apply] The following patches do not apply cleanly:")
        for line in failed:
            print(f"  - {line}")
        fail(f"{len(failed)} patch(es) failed dry-run apply against engine/")

    print(f"[validate-patch-apply] OK ({len(patches)} patches apply cleanly)")


if __name__ == "__main__":
    main()
