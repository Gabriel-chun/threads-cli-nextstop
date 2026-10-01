#!/usr/bin/env bash
set -euo pipefail

mode="${COLLECTOR_MODE:-hybrid}"

case "$mode" in
  hybrid)
    exec bash collector/collect_hybrid.sh
    ;;
  browser)
    exec node collector/collect_browser.mjs
    ;;
  http)
    exec bash collector/collect_http.sh
    ;;
  *)
    echo "unsupported COLLECTOR_MODE: $mode (expected hybrid, browser or http)" >&2
    exit 2
    ;;
esac
