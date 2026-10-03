import { z } from "zod";
import { reviewAnonymousId } from "../../../../../lib/reviewLedger";
import { isReviewCategory } from "../../../../../lib/reviewCategories";
import {
  listSignalReviewsFromNotion,
  updateSignalReviewCategoryInNotion
} from "../../../../../lib/signalDeckNotion.server";
import {
  rejectMutationPreflight,
  securityJson,
  validateWriteRequest
} from "../../../../../lib/writeSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  category: z.string().min(1).max(120)
}).strict();

export async function OPTIONS() {
  return rejectMutationPreflight("PATCH");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = validateWriteRequest(request);
  if (denied) return denied;

  const { id } = await params;
  if (!/^SIG-[A-F0-9]{8}$/.test(id)) {
    return securityJson({ error: "Invalid signal id." }, 400);
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch {
    return securityJson({ error: "Invalid category payload." }, 400);
  }

  if (!isReviewCategory(input.category)) {
    return securityJson({ error: "Unsupported review category." }, 400);
  }

  const rows = await listSignalReviewsFromNotion();
  const row = rows.find((item) => reviewAnonymousId(item) === id);
  if (!row) {
    return securityJson({ error: "Review signal not found." }, 404);
  }

  try {
    const updated = await updateSignalReviewCategoryInNotion(row.post_key, input.category);
    return securityJson({
      ok: true,
      category: updated.category,
      original_category: updated.original_category || updated.category,
      category_source: updated.category_source || "system",
      category_updated_at: updated.category_updated_at || null,
      archive_status: "pending_daily_archive"
    });
  } catch (error) {
    console.error("[reviews/category] server-side Notion update failed", error);
    return securityJson({ error: "分類更新暫時不可用，請稍後再試。" }, 503);
  }
}
