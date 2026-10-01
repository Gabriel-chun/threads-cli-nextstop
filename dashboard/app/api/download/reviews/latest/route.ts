export const dynamic = "force-dynamic";

const REVIEW_URL =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/reviews/latest.json";

export async function GET() {
  const response = await fetch(REVIEW_URL, {
    headers: { "User-Agent": "next-stop-live-reviewed-download" },
    cache: "no-store"
  });

  if (response.status === 404) {
    return new Response(
      "Reviewed cards archive is not available yet. It is created by the daily Taipei-midnight review archive workflow.",
      { status: 404 }
    );
  }

  if (!response.ok) {
    return new Response("Latest reviewed cards JSON is temporarily unavailable.", {
      status: 502
    });
  }

  const json = await response.text();

  return new Response(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="next-stop-live-reviewed-cards-latest.json"',
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
