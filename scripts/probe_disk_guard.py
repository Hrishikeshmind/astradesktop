#!/usr/bin/env python3
"""Pre-flight disk checks + stale .tmp-* cleanup for Marionette/probe scripts."""

from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

# Fail fast before omni.ja patch / Marionette profiles fill the disk.
MIN_FREE_GB = 10.0
TMP_MAX_AGE_HOURS = 24


def free_disk_gb(path: Path) -> float:
    """Return free space in GiB for the volume containing path."""
    usage = shutil.disk_usage(path.resolve())
    return usage.free / (1024**3)


def cleanup_stale_tmp_dirs(
    root: Path,
    *,
    max_age_hours: float = TMP_MAX_AGE_HOURS,
    protect: set[str] | None = None,
) -> list[str]:
    """
    Remove repo-root .tmp-* directories older than max_age_hours.
    Returns list of removed directory names.
    """
    protect = protect or set()
    cutoff = time.time() - max_age_hours * 3600
    removed: list[str] = []
    for entry in sorted(root.glob(".tmp-*")):
        if not entry.is_dir():
            continue
        if entry.name in protect:
            continue
        try:
            if entry.stat().st_mtime >= cutoff:
                continue
        except OSError:
            continue
        try:
            shutil.rmtree(entry)
            removed.append(entry.name)
            print(f"[disk-guard] removed stale {entry.name}", flush=True)
        except OSError as exc:
            print(f"[disk-guard] could not remove {entry.name}: {exc}", flush=True)
    return removed


def ensure_disk_space(
    path: Path,
    *,
    min_free_gb: float = MIN_FREE_GB,
    label: str = "probe",
) -> float:
    """Exit with a clear message if free space is below min_free_gb."""
    free_gb = free_disk_gb(path)
    if free_gb < min_free_gb:
        raise SystemExit(
            f"[disk-guard] {label}: need at least {min_free_gb:.0f} GiB free on "
            f"{path.drive or path.anchor}; only {free_gb:.2f} GiB available. "
            f"Remove stale .tmp-* dirs under {path} and retry."
        )
    return free_gb


def prepare_probe_workspace(
    root: Path,
    *,
    protect_dir_names: set[str] | None = None,
    min_free_gb: float = MIN_FREE_GB,
    max_age_hours: float = TMP_MAX_AGE_HOURS,
    label: str = "probe",
) -> float:
    """
    Auto-clean old .tmp-* artifacts, then verify there is enough free disk.
    Call at the very start of verify/probe scripts before patching omni.ja.
    """
    protect = protect_dir_names or set()
    cleanup_stale_tmp_dirs(root, max_age_hours=max_age_hours, protect=protect)
    free_gb = ensure_disk_space(root, min_free_gb=min_free_gb, label=label)
    print(
        f"[disk-guard] {label}: {free_gb:.2f} GiB free "
        f"(threshold {min_free_gb:.0f} GiB, tmp age {max_age_hours:.0f}h)",
        flush=True,
    )
    return free_gb


def main() -> None:
    """CLI: python probe_disk_guard.py [repo_root]"""
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
    prepare_probe_workspace(root, label="manual-check")


if __name__ == "__main__":
    main()
