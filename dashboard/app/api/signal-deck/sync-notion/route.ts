import { z } from "zod";
import { syncSignalReviewsToNotion } from "../../../../lib/signalDeckNotion.server";
import type { SignalDeckFeedback } from "../../../../lib/signalDeckFeedback";
import {
  rejectMutationPreflight,
  securityJson,
  validateWriteRequest
} from "../../../../lib/writeSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nullableText = (max: number) => z.string().max(max).nullable().optional();
const nullableDateText = z.string().max(80).nullable().optional();

const feedbackSchema = z.object({
  id: z.string().min(1).max(600),
  post_key: z.string().min(1).max(500),
  post_id: nullableText(240),
  permalink: nullableText(1200),
  snapshot_id: z.string().min(1).max(240),
  window: z.enum(["1d", "3d", "5d"]),
  label: z.enum(["relevant", "irrelevant"]),
  original_label: z.enum(["relevant", "irrelevant"]).nullable().optional(),
  label_updated_at: nullableDateText,
  category: z.string().min(1).max(120),
  original_category: nullableText(120),
  category_source: z.enum(["system", "human_override"]).optional(),
  category_updated_at: nullableDateText,
  username: nullableText(200),
  posted_at: nullableDateText,
  query: nullableText(1200),
  text_excerpt: z.string().max(1200),
  feature_tags: z.array(z.string().min(1).max(80)).max(24),
  base_score: z.number().finite(),
  deck_generated_at: z.string().min(1).max(80),
  reviewed_at: z.string().min(1).max(80)
}).strict();

const bodySchema = z.object({
  rows: z.array(feedbackSchema).min(1).max(10)
}).strict();

export async function OPTIONS() {
  return rejectMutationPreflight("POST");
}

export async function POST(request: Request) {
  const denied = validateWriteRequest(request);
  if (denied) return denied;

  let rows: SignalDeckFeedback[];
  try {
    rows = bodySchema.parse(await request.json()).rows as SignalDeckFeedback[];
  } catch {
    return securityJson({ error: "Invalid review sync payload." }, 400);
  }

  try {
    return securityJson({
      ok: true,
      ...(await syncSignalReviewsToNotion(rows)),
      archive_status: "pending_daily_github_archive"
    });
  } catch (error) {
    console.error("[signal-deck/sync-notion] server-side Notion sync failed", error);
    return securityJson({ error: "Notion 同步暫時不可用，請稍後再試。" }, 503);
  }
}
