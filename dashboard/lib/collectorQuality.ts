/** Source availability is separate from a legitimate zero clean-signal count. */
export type QualityRow = {
  status?: string; coverage_status?: string; raw_rows?: number;
  dedupe_unique_signals?: number; unique_signals?: number;
  source_failure_count?: number; accepted_raw_rows?: number;
};
export function sourceUsable(row: QualityRow): boolean {
  if (row.status?.toLowerCase() !== "success") return false;
  if (row.coverage_status && row.coverage_status !== "observed") return false;
  if (Number(row.source_failure_count || 0) > 0 || row.accepted_raw_rows === 0) return false;
  // Before quality diagnostics existed, stale candidates were labelled observed.
  if (Number(row.raw_rows) > 0 && row.dedupe_unique_signals === 0 && row.unique_signals === 0) return false;
  return true;
}
export function freshTimestamp(value: string | null | undefined, now = Date.now()): boolean {
  const age = now - Date.parse(value || "");
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= 180 * 60_000;
}
export type ChartSample = {
  runAt: string; pipelineVersion: string | null; sourceUsable: boolean;
};
/** Split at source gaps, missed intervals, and changes in collection method. */
export function trendSegments<T extends ChartSample>(rows: T[], value: (row: T) => number): T[][] {
  const result: T[][] = [];
  let current: T[] = [];
  for (const row of rows) {
    const valid = row.sourceUsable && Number.isFinite(Date.parse(row.runAt)) && Number.isFinite(value(row));
    const prior = current.at(-1);
    if (!valid || (prior && (Date.parse(row.runAt) - Date.parse(prior.runAt) > 180 * 60_000 || row.pipelineVersion !== prior.pipelineVersion))) {
      if (current.length) result.push(current);
      current = [];
    }
    if (valid) current.push(row);
  }
  if (current.length) result.push(current);
  return result;
}
