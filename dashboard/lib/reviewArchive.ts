import type { SignalDeckFeedback } from "./signalDeckFeedback";

export type DailyReviewArchive = {
  schema_version: "signal-review-archive-v0.1";
  archive_date: string;
  timezone: "Asia/Taipei";
  generated_at: string;
  source: "vercel_blob:signal-deck/v0.3/feedback";
  count: number;
  relevant_count: number;
  irrelevant_count: number;
  rows: SignalDeckFeedback[];
};

export function taipeiCalendarDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function buildDailyReviewArchive(
  rows: SignalDeckFeedback[],
  archiveDate: string,
  generatedAt = new Date()
): DailyReviewArchive {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archiveDate)) {
    throw new Error("archive_date must be YYYY-MM-DD");
  }

  const selected = rows
    .filter((row) => taipeiCalendarDate(row.reviewed_at) === archiveDate)
    .sort((a, b) => Date.parse(a.reviewed_at) - Date.parse(b.reviewed_at));

  return {
    schema_version: "signal-review-archive-v0.1",
    archive_date: archiveDate,
    timezone: "Asia/Taipei",
    generated_at: generatedAt.toISOString(),
    source: "vercel_blob:signal-deck/v0.3/feedback",
    count: selected.length,
    relevant_count: selected.filter((row) => row.label === "relevant").length,
    irrelevant_count: selected.filter((row) => row.label === "irrelevant").length,
    rows: selected
  };
}
