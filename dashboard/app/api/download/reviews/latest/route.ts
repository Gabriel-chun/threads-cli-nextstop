import { deidentifyReviewRow } from "../../../../../lib/reviewLedger";

export const dynamic = "force-dynamic";

const REVIEW_URL =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/reviews/latest.json";
const PUBLIC_BASE = "https://next-stop-live.vercel.app";

export async function GET() {
  const response = await fetch(REVIEW_URL, {
    headers: { "User-Agent": "next-stop-live-reviewed-download" },
    cache: "no-store"
  });

  if (response.status === 404) {
    return new Response(
      "Reviewed cards archive is not available yet. It is created by the daily Taipei-midnight review archive workflow.",
      { status: 404 }
    );
  }

  if (!response.ok) {
    return new Response("Latest reviewed cards JSON is temporarily unavailable.", {
      status: 502
    });
  }

  const archive = await response.json();
  const rows = Array.isArray(archive?.rows)
    ? archive.rows.map((row: any) => {
        const safe = deidentifyReviewRow(row);
        return {
          ...safe,
          evidence_url: PUBLIC_BASE + safe.evidence_url
        };
      })
    : [];

  const payload = {
    schema_version: "signal-review-public-v0.1",
    deidentified: true,
    source_archive_schema: archive?.schema_version || null,
    archive_date: archive?.archive_date || null,
    timezone: archive?.timezone || "Asia/Taipei",
    count: rows.length,
    relevant_count: rows.filter((row: any) => row.label === "relevant").length,
    irrelevant_count: rows.filter((row: any) => row.label === "irrelevant").length,
    unsure_count: rows.filter((row: any) => row.label === "unsure").length,
    rows
  };

  return new Response(JSON.stringify(payload, null, 2) + "\n", {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="next-stop-live-reviewed-cards-latest.json"',
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
