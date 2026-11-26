#!/usr/bin/env bash
# Stages the LVGL renderer (espos-p4-cockpit-wasm) into webapp/public/wasm/
# so Vite ships it with the page. Run before `vite build`.
#
# Source, in order (a release build only uses the last):
#   1. JLP_WASM_DIR, a local directory holding jlp_wasm.{js,wasm}
#   2. ../espos-p4-cockpit-wasm/public, a sibling checkout
#   3. the wasm repository at JLP_WASM_REF, fetched over HTTPS
#
# JLP_WASM_REF is a pinned commit, not main: a release ships the renderer
# this page was written against, and taking a newer one is a commit here.
#
# Only a release build (REQUIRE_WASM=1) fails without a bundle. The Signal K
# plugin registry builds with no network, and its tests never load the
# renderer, so every other build goes on and the page reports it missing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${JLP_WASM_DIR:-${REPO_ROOT}/../espos-p4-cockpit-wasm/public}"
DEST="${REPO_ROOT}/webapp/public/wasm"
JLP_WASM_REF="${JLP_WASM_REF:-5d0ceec27fca2be97f6ffef0ac3f844e810e5f83}"
RAW_BASE="${JLP_WASM_URL:-https://raw.githubusercontent.com/dirkwa/espos-p4-cockpit-wasm/${JLP_WASM_REF}/public}"

flag="$(printf '%s' "${REQUIRE_WASM:-}" | tr '[:upper:]' '[:lower:]')"
required() { [[ "${flag}" =~ ^(1|true|yes|on)$ ]]; }

mkdir -p "${DEST}"

# A release takes the pinned bundle only, never a local working tree.
if ! required && [[ -f "${SRC}/jlp_wasm.js" && -f "${SRC}/jlp_wasm.wasm" ]]; then
  cp -f "${SRC}/jlp_wasm.js" "${SRC}/jlp_wasm.wasm" "${DEST}/"
  echo "[copy-wasm] copied the renderer from ${SRC}"
  exit 0
fi

# Both files land beside the target and move into place together, so a
# failed fetch never leaves half a bundle or removes an earlier one.
fetch() {
  curl -fsSL --connect-timeout 10 --max-time 120 "${RAW_BASE}/$1" -o "${DEST}/$1.part"
}
if fetch jlp_wasm.js && fetch jlp_wasm.wasm; then
  mv -f "${DEST}/jlp_wasm.js.part" "${DEST}/jlp_wasm.js"
  mv -f "${DEST}/jlp_wasm.wasm.part" "${DEST}/jlp_wasm.wasm"
  echo "[copy-wasm] fetched the renderer at ${JLP_WASM_REF}"
  exit 0
fi
rm -f "${DEST}/jlp_wasm.js.part" "${DEST}/jlp_wasm.wasm.part"

if required; then
  echo "[copy-wasm] could not get the renderer from ${RAW_BASE}, which a release needs" >&2
  exit 1
fi
if [[ -f "${DEST}/jlp_wasm.js" && -f "${DEST}/jlp_wasm.wasm" ]]; then
  echo "[copy-wasm] fetch failed; keeping the renderer already staged" >&2
  exit 0
fi
echo "[copy-wasm] no renderer: the display page will say so" >&2
