#!/usr/bin/env bash
set -u

TH_BIN="${TH_BIN:-./bin/th}"
QUERY_FILE="${QUERY_FILE:-collector/queries.txt}"
RAW_DIR="${RAW_DIR:-collector/raw}"
FAILED_FILE="${FAILED_FILE:-collector/failed_queries.txt}"
SLEEP_SECONDS="${SLEEP_SECONDS:-6}"
SEARCH_DEPTH="${COLLECTOR_SEARCH_DEPTH:-3}"
SEARCH_TYPE="${COLLECTOR_SEARCH_TYPE:-top}"
GOOGLE_FALLBACK="${COLLECTOR_GOOGLE_FALLBACK:-false}"
# Recent search is one public SSR window: keep failures bounded rather than
# multiplying shell retries by the CLI retry budget.
DEFAULT_QUERY_ATTEMPTS=2
DEFAULT_CLIENT_RETRIES=8
if [[ "$SEARCH_TYPE" == "recent" ]]; then
  DEFAULT_QUERY_ATTEMPTS=1
  DEFAULT_CLIENT_RETRIES=1
fi
QUERY_ATTEMPTS="${COLLECTOR_QUERY_ATTEMPTS:-$DEFAULT_QUERY_ATTEMPTS}"
CLIENT_RETRIES="${COLLECTOR_CLIENT_RETRIES:-$DEFAULT_CLIENT_RETRIES}"
RETRY_SLEEP_SECONDS="${COLLECTOR_RETRY_SLEEP_SECONDS:-20}"

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
  [[ -z "$query" || "$query" == \#* ]] && continue

  i=$((i + 1))
  outfile="$RAW_DIR/query_$(printf '%02d' "$i").jsonl"
  logfile="$RAW_DIR/query_$(printf '%02d' "$i").log"

  echo "[collector] ($i) $query"

  search_args=(search --type "$SEARCH_TYPE" --depth "$SEARCH_DEPTH" --diagnostics-file "$RAW_DIR/query_$(printf '%02d' "$i")_source_diagnostics.json")
  if [[ "$GOOGLE_FALLBACK" == "true" ]]; then
    search_args+=(--google-fallback)
  fi
  search_args+=("$query")

  client_args=()
  if [[ "$SEARCH_TYPE" == "recent" ]]; then
    client_args+=(--no-cache --user-agent "NextStopLive/1.0 (+https://github.com/Gabriel-chun/threads-cli-nextstop)")
  fi

  success=false
  status=0
  attempt=1

  while [[ "$attempt" -le "$QUERY_ATTEMPTS" ]]; do
    echo "[collector] query attempt $attempt/$QUERY_ATTEMPTS: $query"

    if "$TH_BIN" "${client_args[@]}" \
        --delay 5s \
        --retries "$CLIENT_RETRIES" \
        --timeout 45s \
        --quiet \
        -o jsonl \
        -n 0 \
        "${search_args[@]}" \
        > "$outfile" 2> "$logfile"; then
      success=true
      break
    else
      status=$?
      echo "[collector] attempt $attempt failed (exit $status): $query" >&2
      if [[ "$attempt" -lt "$QUERY_ATTEMPTS" ]]; then
        sleep "$RETRY_SLEEP_SECONDS"
      fi
    fi

    attempt=$((attempt + 1))
  done

  if [[ "$success" != "true" ]]; then
    printf '%s\n' "$query" >> "$FAILED_FILE"
    echo "[collector] query failed after $QUERY_ATTEMPTS attempts (last exit $status): $query" >&2
  fi

  sleep "$SLEEP_SECONDS"
done < "$QUERY_FILE"

echo "[collector] finished $i queries"
if [[ -s "$FAILED_FILE" ]]; then
  echo "[collector] some queries failed:"
  cat "$FAILED_FILE"
fi
