export type ObservationBundle = Record<string, any>;

const ARCHIVE_BASE =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive";

const RUN_ID = /^\d{4}-\d{2}-\d{2}_\d{6}Z$/;

export async function loadObservationBundle(
  runId?: string,
  evidenceLimit = 16
): Promise<ObservationBundle> {
  if (runId && !RUN_ID.test(runId)) {
    throw new Error("Invalid observation run_id.");
  }

  const url = runId
    ? `${ARCHIVE_BASE}/observations/${runId}.json`
    : `${ARCHIVE_BASE}/latest/observation.json`;

  const res = await fetch(url, {
    headers: { "User-Agent": "next-stop-live-mcp" },
    next: { revalidate: runId ? 3600 : 120 }
  });

  if (!res.ok) {
    throw new Error(
      runId
        ? `Observation bundle not found for run ${runId}.`
        : "Latest observation bundle is not available yet."
    );
  }

  const bundle = (await res.json()) as ObservationBundle;
  const requested = Math.max(1, Math.min(50, Math.trunc(evidenceLimit)));
  const items = Array.isArray(bundle?.evidence?.items) ? bundle.evidence.items : [];
  const limitedItems = items.slice(0, requested);

  return {
    ...bundle,
    evidence: {
      ...(bundle.evidence || {}),
      archive_limit: bundle?.evidence?.limit ?? items.length,
      requested_limit: requested,
      returned: limitedItems.length,
      items: limitedItems
    }
  };
}
