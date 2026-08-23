#!/usr/bin/env python3
"""Validate unified-diff patch files before surfer import.

Catches corrupt hunks (wrong line counts) that make `git apply` fail after a
long Firefox download in CI.
"""

from __future__ import annotations

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent.parent
PATCH_ROOT = ROOT / "src"
PATCH_SKIP_DIRS = {"external-patches"}
HUNK_HEADER = re.compile(
    r"^@@ -(?P<old_start>\d+)(?:,(?P<old_count>\d+))? \+(?P<new_start>\d+)(?:,(?P<new_count>\d+))? @@"
)


def fail(message: str) -> None:
    print(f"[validate-patches] ERROR: {message}")
    sys.exit(1)


def count_hunk_lines(body: list[str]) -> tuple[int, int]:
    old = new = 0
    for line in body:
        if not line:
            continue
        prefix = line[0]
        if prefix == " ":
            old += 1
            new += 1
        elif prefix == "-":
            old += 1
        elif prefix == "+":
            new += 1
        elif prefix == "\\":
            continue
        else:
            fail(f"Invalid hunk line prefix {prefix!r}: {line!r}")
    return old, new


def validate_patch_section(path: Path, section: str, section_index: int) -> None:
    lines = section.splitlines()
    if not lines:
        return

    first = lines[0]
    if not (first.startswith("diff --git ") or first.startswith("--- ")):
        fail(f"{path}: section {section_index + 1} missing diff header")

    hunks: list[tuple[int, str, list[str]]] = []
    idx = 0
    while idx < len(lines):
        match = HUNK_HEADER.match(lines[idx])
        if match:
            header = lines[idx]
            idx += 1
            body: list[str] = []
            while idx < len(lines) and not HUNK_HEADER.match(lines[idx]):
                body.append(lines[idx])
                idx += 1
            hunks.append((idx - len(body), header, body))
            continue
        idx += 1

    if not hunks:
        fail(f"{path}: section {section_index + 1} has no hunks")

    rel = path.as_posix()
    for line_no, header, body in hunks:
        match = HUNK_HEADER.match(header)
        assert match
        declared_old = int(match.group("old_count") or "1")
        declared_new = int(match.group("new_count") or "1")
        actual_old, actual_new = count_hunk_lines(body)
        if declared_old != actual_old or declared_new != actual_new:
            fail(
                f"{rel}:{line_no}: hunk declares -{declared_old}/+{declared_new} "
                f"but contains -{actual_old}/+{actual_new} lines\n  {header}"
            )


def validate_patch(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "\r\n" in text:
        fail(f"{path}: CRLF line endings are not allowed in patch files")

    if text.lstrip().startswith("--- "):
        sections = [text]
    else:
        sections = re.split(r"(?=^diff --git )", text, flags=re.MULTILINE)
        sections = [section for section in sections if section.strip()]
    if not sections:
        fail(f"{path}: empty patch file")

    for index, section in enumerate(sections):
        validate_patch_section(path, section, index)


def main() -> None:
    patches = sorted(
        path
        for path in PATCH_ROOT.rglob("*.patch")
        if PATCH_SKIP_DIRS.isdisjoint(path.relative_to(PATCH_ROOT).parts)
    )
    if not patches:
        fail(f"No patch files found under {PATCH_ROOT}")

    for patch in patches:
        validate_patch(patch)

    print(f"[validate-patches] OK ({len(patches)} patches)")


if __name__ == "__main__":
    main()
