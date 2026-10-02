import { listSignalReviewsFromNotion } from "../../../../../lib/signalDeckNotion.server";
import { reviewAnonymousId } from "../../../../../lib/reviewLedger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeThreadsUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "threads.com" || host.endsWith(".threads.com")) return url.toString();
  } catch {}
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^SIG-[A-F0-9]{8}$/.test(id)) {
    return new Response("Invalid signal id.", { status: 400 });
  }

  const rows = await listSignalReviewsFromNotion();
  const row = rows.find((item) => reviewAnonymousId(item) === id);
  const target = safeThreadsUrl(row?.permalink);

  if (!target) {
    return new Response("Source link is unavailable.", { status: 404 });
  }

  return Response.redirect(target, 302);
}
