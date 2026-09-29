import { strToU8, zipSync } from "fflate";

export const dynamic = "force-dynamic";

const MASTER_URL =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/latest/master.json";

export async function GET() {
  const response = await fetch(MASTER_URL, {
    headers: { "User-Agent": "next-stop-live-download" },
    cache: "no-store"
  });

  if (!response.ok) {
    return new Response("Latest master.json is temporarily unavailable.", {
      status: 502
    });
  }

  const json = await response.text();
  const zip = zipSync({
    "master.json": strToU8(json)
  }, { level: 6 });

  return new Response(zip, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="next-stop-live-master-latest.zip"',
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
