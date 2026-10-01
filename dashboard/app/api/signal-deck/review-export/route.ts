import { listSignalDeckFeedback } from "../../../../lib/signalDeckFeedback";
import { buildDailyReviewArchive } from "../../../../lib/reviewArchive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const token = process.env.NEXTSTOP_EVENT_EMIT_TOKEN;
  if (!token) return false;
  return request.headers.get("authorization") === `Bearer ${token}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const archiveDate = url.searchParams.get("date") || "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) {
    return Response.json(
      { error: "date must be YYYY-MM-DD in Asia/Taipei" },
      { status: 400 }
    );
  }

  const rows = await listSignalDeckFeedback();
  const archive = buildDailyReviewArchive(rows, archiveDate);

  return Response.json(archive, {
    headers: { "Cache-Control": "no-store" }
  });
}
