#!/usr/bin/env bash
set -euo pipefail

ROOT_RAW_DIR="${RAW_DIR:-collector/raw}"
QUERY_FILE="${QUERY_FILE:-collector/queries.txt}"
FAILED_FILE="${FAILED_FILE:-collector/failed_queries.txt}"
BROWSER_DIR="$ROOT_RAW_DIR/_browser"
HTTP_DIR="$ROOT_RAW_DIR/_http"
BROWSER_FAILED="$ROOT_RAW_DIR/browser_failed_queries.txt"
HTTP_FAILED="$ROOT_RAW_DIR/http_failed_queries.txt"

rm -rf "$BROWSER_DIR" "$HTTP_DIR"
mkdir -p "$ROOT_RAW_DIR" "$BROWSER_DIR" "$HTTP_DIR"
: > "$FAILED_FILE"

echo "[hybrid] browser pass"
RAW_DIR="$BROWSER_DIR" FAILED_FILE="$BROWSER_FAILED"   node collector/collect_browser.mjs

echo "[hybrid] transparent HTTP pass"
RAW_DIR="$HTTP_DIR" FAILED_FILE="$HTTP_FAILED"   bash collector/collect_http.sh

# Keep browser diagnostics at the root so the production archive still captures them.
if [[ -s "$BROWSER_DIR/browser_diagnostics.json" ]]; then
  cp "$BROWSER_DIR/browser_diagnostics.json" "$ROOT_RAW_DIR/browser_diagnostics.json"
fi

# The snapshot builder reads only top-level *.jsonl files. Concatenate both public
# retrieval paths here; downstream permalink/content dedupe merges overlaps and
# preserves both retrieval_sources.
: > "$ROOT_RAW_DIR/query_hybrid.jsonl"
for file in "$BROWSER_DIR"/query_*.jsonl "$HTTP_DIR"/query_*.jsonl; do
  [[ -f "$file" ]] || continue
  cat "$file" >> "$ROOT_RAW_DIR/query_hybrid.jsonl"
done

# A query is a hard failure only when both retrieval paths explicitly failed it.
python3 - "$QUERY_FILE" "$BROWSER_FAILED" "$HTTP_FAILED" "$FAILED_FILE" "$ROOT_RAW_DIR" <<'PY'
import json
import sys
from pathlib import Path

query_file, browser_failed, http_failed, failed_out, raw_dir = map(Path, sys.argv[1:])

def lines(path):
    if not path.exists():
        return []
    return [x.strip() for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]

def count_jsonl(path):
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip().startswith("{"))

queries = [q for q in lines(query_file) if not q.startswith("#")]
bf = set(lines(browser_failed))
hf = set(lines(http_failed))
failed = [q for q in queries if q in bf and q in hf]
failed_out.write_text(("\n".join(failed) + "\n") if failed else "", encoding="utf-8")

browser_rows = sum(count_jsonl(p) for p in (raw_dir / "_browser").glob("query_*.jsonl"))
http_rows = sum(count_jsonl(p) for p in (raw_dir / "_http").glob("query_*.jsonl"))

unique = set()
merged_rows = 0
merged_file = raw_dir / "query_hybrid.jsonl"
if merged_file.exists():
    for line in merged_file.read_text(encoding="utf-8").splitlines():
        if not line.strip().startswith("{"):
            continue
        merged_rows += 1
        try:
            row = json.loads(line)
        except Exception:
            continue
        unique.add(str(row.get("permalink") or row.get("id") or line))

browser_diag = {}
diag_path = raw_dir / "browser_diagnostics.json"
if diag_path.exists():
    try:
        browser_diag = json.loads(diag_path.read_text(encoding="utf-8"))
    except Exception:
        browser_diag = {}

diag = {
    "collector_mode": "hybrid",
    "query_count": len(queries),
    "queries": queries,
    "browser_raw_rows": browser_rows,
    "http_raw_rows": http_rows,
    "merged_raw_rows": merged_rows,
    "merged_unique_candidates": len(unique),
    "hard_failed_queries": failed,
    "browser": browser_diag,
}
(raw_dir / "hybrid_diagnostics.json").write_text(
    json.dumps(diag, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print("[hybrid]", json.dumps(diag, ensure_ascii=False))
PY

echo "[hybrid] finished"
