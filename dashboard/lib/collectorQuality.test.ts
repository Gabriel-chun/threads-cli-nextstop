import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTimestamp, sourceUsable, trendSegments, trendTimeTicks } from "./collectorQuality";
import { loadTrendHistory, collectorHealth, loadHomeObservation } from "./signals";

test("source gaps differ from a valid all-resale zero", () => {
  assert.equal(sourceUsable({status:"Success", raw_rows:34, dedupe_unique_signals:0, unique_signals:0}), false);
  assert.equal(sourceUsable({status:"Success", raw_rows:34, dedupe_unique_signals:4, unique_signals:0}), true);
  for (const coverage_status of ["stale", "degraded", "partial"]) {
    assert.equal(sourceUsable({status:"Success",coverage_status}), false);
  }
  assert.equal(sourceUsable({status:"Partial"}), false);
});
test("health rejects overdue and future-dated observations", () => {
  const now = Date.parse("2026-10-23T06:00:00Z");
  assert.equal(freshTimestamp("2026-10-23T04:00:00Z",now),true);
  assert.equal(freshTimestamp("2026-10-23T02:59:00Z",now),false);
  assert.equal(freshTimestamp("2026-10-24T06:00:00Z",now),false);
});
test("lines break at failures, missing intervals and method changes; real zero remains", () => {
  const row = (h:number, sourceUsable=true, pipelineVersion="v1", value=0) => ({runAt:`2026-10-23T${String(h).padStart(2,"0")}:00:00Z`,sourceUsable,pipelineVersion,value});
  const rows=[row(0),row(2),row(4,false),row(6),row(10),row(12,true,"v2"),row(14,true,"v2",NaN)];
  assert.deepEqual(trendSegments(rows,r=>r.value).map(s=>s.length),[2,1,1,1]);
});
test("history preserves Partial and Failed markers and health reports sync failure",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json([
    {run_at:"2026-10-23T02:00:00Z",status:"Success",raw_rows:34,dedupe_unique_signals:0,unique_signals:0},
    {run_at:"2026-10-23T04:00:00Z",status:"Partial",coverage_status:"stale"},
    {run_at:new Date().toISOString(),status:"Failed"}
  ]);
  try {
    const rows=await loadTrendHistory();
    assert.deepEqual(rows.map(r=>r.status),["Success","Partial","Failed"]);
    assert.ok(rows.every(r=>!r.sourceUsable));
    assert.ok(Number.isNaN(rows[1].new3h));
    assert.equal((await collectorHealth()).healthy,false);
    globalThis.fetch=async()=>Response.json([{run_at:new Date().toISOString(),status:"Success",coverage_status:"observed",notion_sync_status:"failure"}]);
    assert.equal((await collectorHealth()).status,"failure");
  } finally {globalThis.fetch=original;}
});

test("home distinguishes failed source from downstream sync failure and real zero",async()=>{
  const original=globalThis.fetch;
  const bundle={run:{run_at:new Date().toISOString(),status:"Success",coverage_status:"observed",notion_sync_status:"success"},deterministic_facts:{current:{raw_rows:34,dedupe_unique:0,clean_signals:0}}};
  globalThis.fetch=async()=>Response.json(bundle);
  try {
    assert.equal((await loadHomeObservation()).sourceValid,false);
    bundle.deterministic_facts.current.dedupe_unique=4;
    bundle.run.notion_sync_status="failure";
    const valid=await loadHomeObservation();
    assert.equal(valid.sourceValid,true);
    assert.equal(valid.cleanCount,0);
    assert.equal(valid.health.status,"failure");
    globalThis.fetch=async()=>new Response("Unavailable",{status:503});
    assert.equal((await loadHomeObservation()).sourceValid,false);
  } finally { globalThis.fetch=original; }
});

test("irregular collection times use the temporal midpoint for axis labels",()=>{
  assert.deepEqual(trendTimeTicks(Date.parse("2026-10-23T00:00:00Z"),Date.parse("2026-10-23T20:00:00Z")),
    ["2026-10-23T00:00:00.000Z","2026-10-23T10:00:00.000Z","2026-10-23T20:00:00.000Z"]);
});
