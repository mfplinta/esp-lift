#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

IDF_TARGET="${IDF_TARGET:-${ESP_BOARD:-esp32s3}}"
FLASH_SIZE="${FLASH_SIZE:-4mb}"
BUILD_DIR="${BUILD_DIR:-build/${IDF_TARGET}-${FLASH_SIZE}}"
SDKCONFIG="${SDKCONFIG:-${BUILD_DIR}/sdkconfig}"
MERGE_OUTPUT="${MERGE_OUTPUT:-build/out/${IDF_TARGET}-${FLASH_SIZE}.bin}"

case "$IDF_TARGET" in
  esp32|esp32s3) ;;
  *)
    echo "Unsupported IDF_TARGET '$IDF_TARGET' (expected esp32 or esp32s3)" >&2
    exit 1
    ;;
esac

case "$FLASH_SIZE" in
  2mb|4mb) ;;
  *)
    echo "Unsupported FLASH_SIZE '$FLASH_SIZE' (expected 2mb or 4mb)" >&2
    exit 1
    ;;
esac

abspath() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$PROJECT_DIR" "$1" ;;
  esac
}

BUILD_DIR_ABS="$(abspath "$BUILD_DIR")"
SDKCONFIG_ABS="$(abspath "$SDKCONFIG")"
MERGE_OUTPUT_ABS="$(abspath "$MERGE_OUTPUT")"
DEPENDENCIES_LOCK_ABS="${BUILD_DIR_ABS}/dependencies.lock"

mkdir -p "$BUILD_DIR_ABS" "$(dirname "$MERGE_OUTPUT_ABS")"

if [ -f dependencies.lock ] && [ ! -f "$DEPENDENCIES_LOCK_ABS" ]; then
  cp dependencies.lock "$DEPENDENCIES_LOCK_ABS"
fi

if [ ! -f cfg/settings.json ]; then
  cp cfg/settings.template.json cfg/settings.json
fi

for defaults_file in sdkconfig.defaults "sdkconfig.flash.${FLASH_SIZE}"; do
  if [ ! -f "$defaults_file" ]; then
    echo "Missing $defaults_file" >&2
    exit 1
  fi
done

sdkconfig_defaults=(
  sdkconfig.defaults
  "sdkconfig.flash.${FLASH_SIZE}"
)
SDKCONFIG_DEFAULTS="$(IFS=';'; printf '%s' "${sdkconfig_defaults[*]}")"

idf_args=(
  -B "$BUILD_DIR_ABS"
  -D "IDF_TARGET=${IDF_TARGET}"
  -D "SDKCONFIG=${SDKCONFIG_ABS}"
  -D "SDKCONFIG_DEFAULTS=${SDKCONFIG_DEFAULTS}"
  -D "ESP_LIFT_DEPENDENCIES_LOCK=${DEPENDENCIES_LOCK_ABS}"
)

echo "ESP-IDF: $(idf.py --version)"
echo "Target: ${IDF_TARGET} | Flash: ${FLASH_SIZE}"
echo "Build dir: ${BUILD_DIR}"

idf.py "${idf_args[@]}" build
idf.py "${idf_args[@]}" merge-bin --output "$MERGE_OUTPUT_ABS"
