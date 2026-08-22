#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# MAR signing helper.
#   -g  Generate primary + backup RSA-4096 / SHA-384 certs (local; private keys
#       stay under gitignored build/signing/private/)
#   -i  Copy public DERs into engine/toolkit/mozapps/update/updater/ before
#       compiling updater.exe (primary -> release_primary.der, backup ->
#       release_secondary.der). Fail closed if the engine tree is missing.
#   -s  [mar ...]  Sign MAR(s) with the primary private key. If no paths are
#       given, sign the usual platform artifact names. Uses OpenSSL
#       RSA-PKCS1-SHA384 (same algorithm ID 2 that signmar/the updater expect).

set -euo pipefail

CERT_PATH_DIR=build/signing
PRIVATE_DIR="$CERT_PATH_DIR/private"
UPDATER_CERT_DIR="engine/toolkit/mozapps/update/updater"

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
PYTHON="$(pick_python)"

generate_certs() {
  mkdir -p "$PRIVATE_DIR" "$CERT_PATH_DIR"
  openssl genrsa -out "$PRIVATE_DIR/astra_mar_signing_primary.key" 4096
  openssl req -new -x509 -sha384 \
      -key "$PRIVATE_DIR/astra_mar_signing_primary.key" \
      -out "$PRIVATE_DIR/astra_mar_signing_primary.crt" \
      -days 7300 \
      -subj "/CN=Astra MAR Signing Primary"
  openssl genrsa -out "$PRIVATE_DIR/astra_mar_signing_backup.key" 4096
  openssl req -new -x509 -sha384 \
      -key "$PRIVATE_DIR/astra_mar_signing_backup.key" \
      -out "$PRIVATE_DIR/astra_mar_signing_backup.crt" \
      -days 7300 \
      -subj "/CN=Astra MAR Signing Backup"

  openssl x509 -in "$PRIVATE_DIR/astra_mar_signing_primary.crt" -outform DER \
      -out "$CERT_PATH_DIR/release_primary.der"
  openssl x509 -in "$PRIVATE_DIR/astra_mar_signing_backup.crt" -outform DER \
      -out "$CERT_PATH_DIR/release_backup.der"
  cp "$PRIVATE_DIR/astra_mar_signing_primary.crt" "$CERT_PATH_DIR/release_primary.crt"
  cp "$PRIVATE_DIR/astra_mar_signing_backup.crt" "$CERT_PATH_DIR/release_backup.crt"
  cp "$CERT_PATH_DIR/release_primary.der" "$CERT_PATH_DIR/public_key.der"

  echo "Public certs written to $CERT_PATH_DIR (safe to commit)."
  echo "PRIVATE keys are in $PRIVATE_DIR (gitignored). Store the backup key"
  echo "offline / in a password manager — not as another GitHub secret."
  openssl x509 -in "$CERT_PATH_DIR/release_primary.crt" -noout -fingerprint -sha256
  openssl x509 -in "$CERT_PATH_DIR/release_backup.crt" -noout -fingerprint -sha256
}

import_cert() {
  local primary="$CERT_PATH_DIR/release_primary.der"
  local backup="$CERT_PATH_DIR/release_backup.der"
  if [ ! -f "$primary" ]; then
    echo "Error: $primary not found. Generate or check out the committed DER." >&2
    exit 1
  fi
  if [ ! -f "$backup" ]; then
    echo "Error: $backup not found. Generate or check out the committed DER." >&2
    exit 1
  fi
  if [ ! -d "$UPDATER_CERT_DIR" ]; then
    echo "Error: $UPDATER_CERT_DIR is missing. Import Firefox sources before -i." >&2
    exit 1
  fi

  local primary_dests=(
    "$UPDATER_CERT_DIR/release_primary.der"
    "$UPDATER_CERT_DIR/dep1.der"
    "$UPDATER_CERT_DIR/xpcshellCertificate.der"
  )
  local backup_dests=(
    "$UPDATER_CERT_DIR/release_secondary.der"
    "$UPDATER_CERT_DIR/dep2.der"
  )
  local file
  for file in "${primary_dests[@]}" "${backup_dests[@]}"; do
    if [ ! -f "$file" ]; then
      echo "Error: $file not found. Make sure the updater certificates exist." >&2
      exit 1
    fi
  done
  for file in "${primary_dests[@]}"; do
    echo "Copying $primary to $file"
    cp "$primary" "$file"
  done
  for file in "${backup_dests[@]}"; do
    echo "Copying $backup to $file"
    cp "$backup" "$file"
  done
  echo "Done. Rebuild the updater to embed primary + backup public keys."
}

update_manifests() {
  local xml_roots=()
  local mar_file
  mar_file=$(basename "$1")
  if [ -d "dist/update" ]; then
    xml_roots+=("dist/update")
  fi
  if [[ "$mar_file" == "linux.mar" ]]; then
    xml_roots+=("linux_update_manifest_x86_64")
  elif [[ "$mar_file" == "linux-aarch64.mar" ]]; then
    xml_roots+=("linux_update_manifest_aarch64")
  elif [[ "$mar_file" == "windows.mar" ]]; then
    xml_roots+=(".github/workflows/object/windows-x64-signed-x86_64/update_manifest")
    xml_roots+=("windows_update_manifest_x86_64")
  elif [[ "$mar_file" == "windows-arm64.mar" ]]; then
    xml_roots+=(".github/workflows/object/windows-x64-signed-arm64/update_manifest")
    xml_roots+=("windows_update_manifest_arm64")
  elif [[ "$mar_file" == "macos.mar" ]]; then
    xml_roots+=("macos_update_manifest")
  fi
  local args=()
  local root
  for root in "${xml_roots[@]}"; do
    if [ -e "$root" ]; then
      args+=(--refresh-xml "$root")
    fi
  done
  if [ "${#args[@]}" -gt 0 ]; then
    "$PYTHON" scripts/mar_sign_openssl.py --refresh-only --sign "$1" "${args[@]}"
  fi
}

sign_one() {
  local mar="$1"
  if [ ! -f "$mar" ]; then
    echo "Error: MAR not found: $mar" >&2
    exit 1
  fi
  echo ""
  echo "Signing $mar with primary key (RSA-PKCS1-SHA384)..."
  "$PYTHON" scripts/mar_sign_openssl.py \
      --sign "$mar" \
      --key-b64-env ZEN_SIGNING_PRIVATE_KEY_PEM_BASE64 \
      --cert "$CERT_PATH_DIR/release_primary.crt"
}

require_private_key() {
  if [ -n "${ZEN_SIGNING_PRIVATE_KEY_PEM_BASE64:-}" ]; then
    return 0
  fi
  local local_key="$PRIVATE_DIR/astra_mar_signing_primary.key"
  if [ -f "$local_key" ]; then
    echo "ZEN_SIGNING_PRIVATE_KEY_PEM_BASE64 unset; using local gitignored $local_key"
    ZEN_SIGNING_PRIVATE_KEY_PEM_BASE64="$("$PYTHON" -c "import base64,pathlib; print(base64.b64encode(pathlib.Path(r'''$local_key''').read_bytes()).decode())")"
    export ZEN_SIGNING_PRIVATE_KEY_PEM_BASE64
    return 0
  fi
  echo "Error: ZEN_SIGNING_PRIVATE_KEY_PEM_BASE64 is missing." >&2
  echo "Shipped updater.exe is built with MOZ_VERIFY_MAR_SIGNATURE and rejects unsigned MARs." >&2
  echo "Add the primary private key that matches build/signing/release_primary.der." >&2
  exit 1
}

sign_mars() {
  require_private_key

  if [ "$#" -gt 0 ]; then
    local mar
    for mar in "$@"; do
      sign_one "$mar"
      update_manifests "$mar"
    done
    return 0
  fi

  local folders=(
    linux.mar
    linux-aarch64.mar
    macos.mar
  )
  if [ -d ".github/workflows/object/windows-x64-signed-x86_64" ]; then
    folders+=(".github/workflows/object/windows-x64-signed-x86_64")
    folders+=(".github/workflows/object/windows-x64-signed-arm64")
  else
    folders+=("windows.mar")
    folders+=("windows-arm64.mar")
  fi

  local folder mar_file
  for folder in "${folders[@]}"; do
    if [ -d "$folder" ]; then
      local found=0
      for mar_file in "$folder"/*.mar; do
        if [ -f "$mar_file" ]; then
          found=1
          sign_one "$mar_file"
          update_manifests "$mar_file"
        fi
      done
      if [ "$found" -eq 0 ]; then
        echo "No .mar files found in $folder, skipping." >&2
        exit 1
      fi
    elif [ -f "$folder" ]; then
      sign_one "$folder"
      update_manifests "$folder"
    else
      echo "Directory $folder not found, skipping." >&2
      exit 1
    fi
  done
}

case "${1:-}" in
  -g)
    generate_certs
    ;;
  -i)
    import_cert
    ;;
  -s)
    shift
    sign_mars "$@"
    ;;
  *)
    echo "Usage: $0 [-g] [-i] [-s [mar ...]]" >&2
    echo "  -g    Generate primary + backup MAR signing certificates" >&2
    echo "  -i    Import public DERs into the updater (release_primary + release_secondary)" >&2
    echo "  -s    Sign the given MAR(s), or the default platform artifacts" >&2
    exit 1
    ;;
esac
