import { buildRelevanceProfile } from "../../../../../lib/signalDeckFeedback";
import { listSignalReviewsFromNotion } from "../../../../../lib/signalDeckNotion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }
  return request.headers.get("x-vercel-cron-schedule") === "25 0 * * 1";
}

export async function GET(request: Request) {
  if (!authorizedCron(request)) {
    return Response.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  const rows = await listSignalReviewsFromNotion();
  const profile = buildRelevanceProfile(rows);

  return Response.json({
    ok: true,
    generated_at: profile.generated_at,
    feedback_count: profile.feedback_count,
    relevant_count: profile.relevant_count,
    irrelevant_count: profile.irrelevant_count,
    feature_count: Object.keys(profile.feature_weights).length,
    category_count: Object.keys(profile.category_weights).length
  });
}
