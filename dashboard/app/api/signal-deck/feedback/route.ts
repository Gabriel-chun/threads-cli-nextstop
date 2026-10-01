import { z } from "zod";
import {
  loadFeedbackMap,
  putSignalDeckFeedback
} from "../../../../lib/signalDeckFeedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  snapshot_id: z.string().min(1).max(160),
  card_id: z.string().min(1).max(100),
  window: z.enum(["1d", "3d", "5d"]),
  label: z.enum(["relevant", "irrelevant"]),
  category: z.string().min(1).max(120),
  headline: z.string().min(1).max(240),
  summary: z.string().max(1000),
  feature_tags: z.array(z.string().min(1).max(80)).max(30),
  base_score: z.number().finite(),
  deck_generated_at: z.string().min(1).max(80)
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = url.searchParams.getAll("snapshot_id").filter(Boolean).slice(0, 100);
  const feedback = await loadFeedbackMap(ids.length ? ids : undefined);
  return Response.json({ feedback });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-site feedback writes are not allowed." }, { status: 403 });
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid feedback payload." }, { status: 400 });
  }

  try {
    const record = await putSignalDeckFeedback(input);
    return Response.json({ ok: true, feedback: record });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Feedback store unavailable." },
      { status: 503 }
    );
  }
}
