import { z } from "zod";
import { loadSignalDeckWindow } from "../../../../../lib/signalDeck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const windowSchema = z.enum(["1d", "3d", "5d"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ window: string }> }
) {
  const { window } = await params;
  const parsed = windowSchema.safeParse(window);
  if (!parsed.success) {
    return Response.json({ error: "Invalid signal deck window." }, { status: 400 });
  }

  try {
    const data = await loadSignalDeckWindow(parsed.data);
    return Response.json({ window_key: parsed.data, window: data }, {
      headers: { "Cache-Control": "private, max-age=60" }
    });
  } catch (error) {
    console.error("[signal-deck/window] load failed", error);
    return Response.json({ error: "Signal Deck window unavailable." }, { status: 503 });
  }
}
