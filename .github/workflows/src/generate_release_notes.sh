#!/usr/bin/env bash
# Generate GitHub Release notes for Astra. Never fetch Zen Browser changelogs.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

OUT="${RELEASE_NOTES_OUT:-release_notes.md}"
RELEASE_BRANCH="${RELEASE_BRANCH:-release}"
REPO="${GITHUB_REPOSITORY:-Hrishikeshmind/astradesktop}"
MANUAL_NOTES="${RELEASE_NOTES_FILE:-}"

if [[ -z "$MANUAL_NOTES" ]]; then
  if [[ -f "$REPO_ROOT/docs/release-notes.md" ]]; then
    MANUAL_NOTES="$REPO_ROOT/docs/release-notes.md"
  elif [[ -f "$REPO_ROOT/CHANGELOG.md" ]]; then
    MANUAL_NOTES="$REPO_ROOT/CHANGELOG.md"
  fi
fi

pick_python() {
  local c
  for c in python3 python py; do
    if command -v "$c" >/dev/null 2>&1; then
      if "$c" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)" >/dev/null 2>&1; then
        printf '%s\n' "$c"
        return 0
      fi
    fi
  done
  echo "Error: Python 3.9+ not found (python3/python/py)." >&2
  exit 1
}

read_surfer() {
  "$(pick_python)" - "$REPO_ROOT/surfer.json" "$RELEASE_BRANCH" <<'PY'
import json, sys
path, brand = sys.argv[1], sys.argv[2]
cfg = json.loads(open(path, encoding="utf-8").read())
display = cfg["brands"][brand]["release"]["displayVersion"]
ff = cfg["version"]["version"]
print(f"{display}\t{ff}")
PY
}

SURFER_LINE="$(read_surfer)"
SURFER_VERSION="${SURFER_LINE%%$'\t'*}"
FIREFOX_VERSION="${SURFER_LINE#*$'\t'}"
VERSION="${RELEASE_VERSION:-$SURFER_VERSION}"

if [[ "$RELEASE_BRANCH" == "twilight" ]]; then
  RELEASE_TYPE="Twilight"
  PRODUCT="Astra Nova"
else
  RELEASE_TYPE="Stable"
  PRODUCT="Astra Browser"
fi

{
  echo "# ${PRODUCT} ${VERSION}"
  echo
  echo "${PRODUCT} **${VERSION}** (${RELEASE_TYPE}), based on Firefox **${FIREFOX_VERSION}**."
  echo

  if [[ "$RELEASE_TYPE" == "Twilight" ]]; then
    echo "> [!NOTE]"
    echo "> You're currently on Astra Nova (beta): latest experimental Astra features."
    echo ">"
    echo "> If you encounter issues, please report them on the [issues page](https://github.com/${REPO}/issues)."
    echo
  fi

  if [[ -n "${MANUAL_NOTES}" && -s "${MANUAL_NOTES}" ]]; then
    cat "${MANUAL_NOTES}"
    echo
  else
    echo "A curated changelog is not published for this tag. See the"
    echo "[commit history](https://github.com/${REPO}/commits) for source changes."
    echo
  fi

  if [[ "${SKIP_MACOS:-}" == "true" ]]; then
    echo "This cut publishes **Windows and Linux**. macOS is not included."
    echo
  fi

  echo "- Issues: https://github.com/${REPO}/issues"
  echo "- Downloads: this GitHub Release"
} > "${OUT}"

# Fail closed if Zen changelog text leaked in (or the file is empty).
if [[ ! -s "${OUT}" ]]; then
  echo "Error: ${OUT} is empty" >&2
  exit 1
fi
if grep -Eiq 'zen-browser|Zen Browser' "${OUT}"; then
  echo "Error: ${OUT} contains Zen Browser content; refusing to publish" >&2
  cat "${OUT}" >&2
  exit 1
fi

echo "Release notes generated: ${OUT}"
cat "${OUT}"
