import { z } from "zod";
import { listSignalReviewsFromNotion } from "../../../../lib/signalDeckNotion.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.array(z.string().min(1).max(160)).max(200);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(url.searchParams.getAll("post_key").filter(Boolean));
  if (!parsed.success) return Response.json({ error: "Invalid post keys." }, { status: 400 });

  try {
    const rows = await listSignalReviewsFromNotion();
    const keySet = parsed.data.length ? new Set(parsed.data) : null;
    const feedback = Object.fromEntries(
      rows
        .filter((row) => !keySet || keySet.has(row.post_key))
        .map((row) => [row.post_key, { label: row.label, reviewed_at: row.reviewed_at }])
    );
    return Response.json({ feedback });
  } catch (error) {
    console.error("[signal-deck/feedback] server-side Notion read failed", error);
    return Response.json({ error: "Review state 暂时不可用。" }, { status: 503 });
  }
}
