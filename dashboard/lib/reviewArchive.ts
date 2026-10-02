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
    .filter((row) => {
      const reviewedToday = taipeiCalendarDate(row.reviewed_at) === archiveDate;
      const categoryEditedToday = row.category_updated_at
        ? taipeiCalendarDate(row.category_updated_at) === archiveDate
        : false;
      const labelEditedToday = row.label_updated_at
        ? taipeiCalendarDate(row.label_updated_at) === archiveDate
        : false;
      return reviewedToday || categoryEditedToday || labelEditedToday;
    })
    .sort((a, b) => {
      const aTouched = Math.max(
        Date.parse(a.reviewed_at),
        Date.parse(a.category_updated_at || "1970-01-01T00:00:00Z"),
        Date.parse(a.label_updated_at || "1970-01-01T00:00:00Z")
      );
      const bTouched = Math.max(
        Date.parse(b.reviewed_at),
        Date.parse(b.category_updated_at || "1970-01-01T00:00:00Z"),
        Date.parse(b.label_updated_at || "1970-01-01T00:00:00Z")
      );
      return aTouched - bTouched;
    });

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
