#!/usr/bin/env bash
set -u

TH_BIN="${TH_BIN:-./bin/th}"
QUERY_FILE="${QUERY_FILE:-collector/queries.txt}"
RAW_DIR="${RAW_DIR:-collector/raw}"
FAILED_FILE="${FAILED_FILE:-collector/failed_queries.txt}"
SLEEP_SECONDS="${SLEEP_SECONDS:-6}"
SEARCH_DEPTH="${COLLECTOR_SEARCH_DEPTH:-3}"
GOOGLE_FALLBACK="${COLLECTOR_GOOGLE_FALLBACK:-false}"

mkdir -p "$RAW_DIR"
: > "$FAILED_FILE"

if [[ ! -x "$TH_BIN" ]]; then
  echo "th binary not found or not executable: $TH_BIN" >&2
  exit 1
fi

if [[ ! -f "$QUERY_FILE" ]]; then
  echo "query file not found: $QUERY_FILE" >&2
  exit 1
fi

i=0
while IFS= read -r query || [[ -n "$query" ]]; do
  query="$(printf '%s' "$query" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -z "$query" ]] && continue

  i=$((i + 1))
  outfile="$RAW_DIR/query_$(printf '%02d' "$i").jsonl"
  logfile="$RAW_DIR/query_$(printf '%02d' "$i").log"

  echo "[collector] ($i) $query"

  search_args=(search --depth "$SEARCH_DEPTH")
  if [[ "$GOOGLE_FALLBACK" == "true" ]]; then
    search_args+=(--google-fallback)
  fi
  search_args+=("$query")

  if "$TH_BIN" \
      --delay 5s \
      --retries 8 \
      --timeout 45s \
      --quiet \
      -o jsonl \
      -n 0 \
      "${search_args[@]}" \
      > "$outfile" 2> "$logfile"; then
    :
  else
    status=$?
    printf '%s\n' "$query" >> "$FAILED_FILE"
    echo "[collector] query failed (exit $status): $query" >&2
  fi

  sleep "$SLEEP_SECONDS"
done < "$QUERY_FILE"

echo "[collector] finished $i queries"
if [[ -s "$FAILED_FILE" ]]; then
  echo "[collector] some queries failed:"
  cat "$FAILED_FILE"
fi
