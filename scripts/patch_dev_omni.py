#!/usr/bin/env python3
"""Patch local dev omni.ja with current Astra source overrides."""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PATCHES: dict[str, Path] = {
    "chrome/browser/content/browser/zen-styles/zen-tabs/vertical-tabs.css": ROOT
    / "src"
    / "zen"
    / "tabs"
    / "zen-tabs"
    / "vertical-tabs.css",
    "chrome/browser/content/browser/ZenUIManager.mjs": ROOT
    / "src"
    / "zen"
    / "common"
    / "modules"
    / "ZenUIManager.mjs",
}


def patch_omni() -> Path:
    omni = ROOT / ".tmp-content-scheme" / "astra-run" / "browser" / "omni.ja"
    run = ROOT / ".tmp-content-scheme" / "astra-run"
    if not omni.is_file():
        if not run.is_dir():
            shutil.copytree(r"C:\Program Files\Astra Browser", run, dirs_exist_ok=True)
    payload = {rel: src.read_bytes() for rel, src in PATCHES.items()}
    tmp = omni.with_suffix(".tmp")
    with zipfile.ZipFile(omni, "r") as zin, zipfile.ZipFile(
        tmp, "w", compression=zipfile.ZIP_STORED
    ) as zout:
        for info in zin.infolist():
            data = payload.get(info.filename, zin.read(info.filename))
            ni = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
            ni.compress_type = zipfile.ZIP_STORED
            ni.external_attr = info.external_attr
            zout.writestr(ni, data)
    tmp.replace(omni)
    return omni


if __name__ == "__main__":
    path = patch_omni()
    print(f"patched {path}")
