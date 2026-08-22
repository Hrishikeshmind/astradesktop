#!/usr/bin/env bash
# Build a complete MAR from an already-packaged app directory (not a zip).
# Used by CI (after unpacking the dist zip) and by the emergency rebuild path.
set -euo pipefail

APP_DIR="${1:?app-dir}"
OUT_MAR="${2:?output.mar}"
VERSION="${3:?display-version}"
BRAND="${4:?brand/channel}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

eval "$(python scripts/astra_channel.py --brand "${BRAND}" --export)"
export MOZ_PRODUCT_VERSION="${VERSION}"
export MAR_CHANNEL_ID
export ACCEPTED_MAR_CHANNEL_IDS
echo "MAR_CHANNEL_ID=${MAR_CHANNEL_ID}"
echo "ACCEPTED_MAR_CHANNEL_IDS=${ACCEPTED_MAR_CHANNEL_IDS}"

if [[ ! -f "${APP_DIR}/astra.exe" && ! -f "${APP_DIR}/firefox.exe" && ! -d "${APP_DIR}/astra" ]]; then
  if [[ ! -f "${APP_DIR}/precomplete" ]]; then
    echo "::error::${APP_DIR} does not look like a packaged app (no precomplete)"
    ls -la "${APP_DIR}" || true
    exit 1
  fi
fi
if [[ ! -f "${APP_DIR}/precomplete" ]]; then
  echo "::error::precomplete missing under ${APP_DIR}"
  exit 1
fi
if [[ ! -f "${APP_DIR}/update-settings.ini" ]]; then
  echo "::error::update-settings.ini missing under ${APP_DIR}"
  exit 1
fi

accepted="$(
  python -c '
import pathlib, sys, re
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
m = re.search(r"^ACCEPTED_MAR_CHANNEL_IDS\s*=\s*(.+)$", text, re.M)
if not m:
    raise SystemExit("ACCEPTED_MAR_CHANNEL_IDS missing")
print(m.group(1).strip())
' "${APP_DIR}/update-settings.ini"
)"
if [[ "${accepted}" != "${ACCEPTED_MAR_CHANNEL_IDS}" ]]; then
  echo "::error::update-settings.ini ACCEPTED_MAR_CHANNEL_IDS=${accepted} != SSOT ${ACCEPTED_MAR_CHANNEL_IDS}"
  echo "Refusing to loosen or mismatch the accepted channel list."
  exit 1
fi

to_msys() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$p"
    return
  fi
  python -c 'import sys; p=sys.argv[1].replace("\\","/"); print("/"+p[0].lower()+p[2:] if len(p)>=2 and p[1]==":" else p)' "$p"
}

MAR_EXE="${MAR:-}"
if [[ -z "${MAR_EXE}" || ! -f "${MAR_EXE}" ]]; then
  if [[ -f "engine/obj-x86_64-pc-windows-msvc/dist/host/bin/mar.exe" ]]; then
    MAR_EXE="engine/obj-x86_64-pc-windows-msvc/dist/host/bin/mar.exe"
  elif [[ -f "build/windows/mar.exe" ]]; then
    MAR_EXE="build/windows/mar.exe"
  fi
fi
if [[ -z "${MAR_EXE}" || ! -f "${MAR_EXE}" ]]; then
  echo "::error::mar.exe not found"
  exit 1
fi

MAKE_FULL_UPDATE="engine/tools/update-packaging/make_full_update.sh"
if [[ ! -f "${MAKE_FULL_UPDATE}" ]]; then
  echo "::error::${MAKE_FULL_UPDATE} not found"
  exit 1
fi

ROOT_UNIX="$(to_msys "$(pwd)")"
python scripts/patch_make_full_update_arg_max.py "${MAKE_FULL_UPDATE}" "${ROOT_UNIX}"

mkdir -p "$(dirname "${OUT_MAR}")"
rm -f "${OUT_MAR}"
APP_UNIX="$(to_msys "$(cd "${APP_DIR}" && pwd)")"
OUT_UNIX="$(to_msys "$(cd "$(dirname "${OUT_MAR}")" && pwd)/$(basename "${OUT_MAR}")")"
MAR_UNIX="$(to_msys "$(cd "$(dirname "${MAR_EXE}")" && pwd)/$(basename "${MAR_EXE}")")"
export MAR="${MAR_UNIX}"

# Git-for-Windows ships xz in usr/bin; make_full_update.sh requires it.
if ! command -v xz >/dev/null 2>&1; then
  if [[ -x "/usr/bin/xz" ]]; then
    export PATH="/usr/bin:${PATH}"
  elif [[ -x "/c/Program Files/Git/usr/bin/xz.exe" ]]; then
    export PATH="/c/Program Files/Git/usr/bin:${PATH}"
  fi
fi
if ! command -v xz >/dev/null 2>&1; then
  echo "::error::xz not found on PATH (needed by make_full_update.sh)"
  exit 1
fi

echo "Creating MAR from ${APP_DIR}"
echo "  MAR=${MAR}"
echo "  OUT=${OUT_UNIX}"
bash "${MAKE_FULL_UPDATE}" "${OUT_UNIX}" "${APP_UNIX}"
test -s "${OUT_MAR}"

MAR_BYTES="$(wc -c < "${OUT_MAR}" | tr -d ' ')"
MIN_MAR_BYTES=10485760
if [ "${MAR_BYTES}" -lt "${MIN_MAR_BYTES}" ]; then
  echo "::error::${OUT_MAR} is only ${MAR_BYTES} bytes (min ${MIN_MAR_BYTES})"
  exit 1
fi

python scripts/verify_mar_product_info.py "${OUT_MAR}" --brand "${BRAND}" --assert-channel --dump
# Signing happens in the platform release workflows (mar_sign.sh -s) before
# --assert-signed. This helper only builds the unsigned archive.
echo "Created $(du -h "${OUT_MAR}" | awk '{print $1}') (${MAR_BYTES} bytes) MAR at ${OUT_MAR}"
