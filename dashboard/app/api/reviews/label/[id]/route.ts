import { z } from "zod";
import { reviewAnonymousId } from "../../../../../lib/reviewLedger";
import {
  listSignalReviewsFromNotion,
  updateSignalReviewLabelInNotion
} from "../../../../../lib/signalDeckNotion.server";
import {
  rejectMutationPreflight,
  securityJson,
  validateWriteRequest
} from "../../../../../lib/writeSecurity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  label: z.enum(["relevant", "irrelevant"])
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
    return securityJson({ error: "Invalid label payload." }, 400);
  }

  const rows = await listSignalReviewsFromNotion();
  const row = rows.find((item) => reviewAnonymousId(item) === id);
  if (!row) {
    return securityJson({ error: "Review signal not found." }, 404);
  }

  try {
    const updated = await updateSignalReviewLabelInNotion(row.post_key, input.label);
    return securityJson({
      ok: true,
      label: updated.label,
      original_label: updated.original_label || updated.label,
      label_updated_at: updated.label_updated_at || null,
      archive_status: "pending_daily_archive"
    });
  } catch (error) {
    console.error("[reviews/label] server-side Notion update failed", error);
    return securityJson({ error: "分類標記更新暫時不可用，請稍後再試。" }, 503);
  }
}
