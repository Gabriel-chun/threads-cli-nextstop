import { z } from "zod";
import { reviewAnonymousId } from "../../../../../lib/reviewLedger";
import { isReviewCategory } from "../../../../../lib/reviewCategories";
import { listSignalReviewsFromNotion, updateSignalReviewCategoryInNotion } from "../../../../../lib/signalDeckNotion.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  category: z.string().min(1).max(120)
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-site category writes are not allowed." }, { status: 403 });
  }

  const { id } = await params;
  if (!/^SIG-[A-F0-9]{8}$/.test(id)) {
    return Response.json({ error: "Invalid signal id." }, { status: 400 });
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid category payload." }, { status: 400 });
  }

  if (!isReviewCategory(input.category)) {
    return Response.json({ error: "Unsupported review category." }, { status: 400 });
  }

  const rows = await listSignalReviewsFromNotion();
  const row = rows.find((item) => reviewAnonymousId(item) === id);
  if (!row) {
    return Response.json({ error: "Review signal not found." }, { status: 404 });
  }

  try {
    const updated = await updateSignalReviewCategoryInNotion(row.post_key, input.category);
    return Response.json({
      ok: true,
      category: updated.category,
      original_category: updated.original_category || updated.category,
      category_source: updated.category_source || "system",
      category_updated_at: updated.category_updated_at || null,
      archive_status: "pending_daily_archive"
    });
  } catch (error) {
    console.error("[reviews/category] server-side Notion update failed", error);
    return Response.json(
      { error: "分類更新暫時不可用，請稍後再試。" },
      { status: 503 }
    );
  }
}
