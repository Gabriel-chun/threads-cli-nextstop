#!/usr/bin/env bash
set -euo pipefail

mode="${COLLECTOR_MODE:-browser}"

case "$mode" in
  browser)
    exec node collector/collect_browser.mjs
    ;;
  http)
    exec bash collector/collect_http.sh
    ;;
  *)
    echo "unsupported COLLECTOR_MODE: $mode (expected browser or http)" >&2
    exit 2
    ;;
esac
