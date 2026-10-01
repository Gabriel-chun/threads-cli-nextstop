import { createHash } from "node:crypto";
import {
  listSignalDeckFeedback,
  type SignalDeckFeedback,
  type TriageLabel
} from "./signalDeckFeedback";

export type DeidentifiedReviewRow = {
  anonymous_id: string;
  label: TriageLabel;
  category: string;
  excerpt: string;
  source_url: string | null;
  posted_at: string | null;
  reviewed_at: string;
  window: "1d" | "3d" | "5d";
  feature_tags: string[];
  base_score: number | null;
};

type ReviewRecordLike = Partial<SignalDeckFeedback> & {
  label?: string;
  category?: string;
  text_excerpt?: string;
  permalink?: string | null;
  reviewed_at?: string;
  posted_at?: string | null;
  feature_tags?: string[];
  base_score?: number | null;
};

function anonymousId(row: ReviewRecordLike) {
  const source = String(row.post_key || row.post_id || row.permalink || row.id || "");
  return "SIG-" + createHash("sha256").update(source).digest("hex").slice(0, 8).toUpperCase();
}

export function deidentifyReviewText(value: string) {
  return String(value || "")
    .replace(/@[A-Za-z0-9._]+/g, "@user")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\s+/g, " ")
    .trim();
}

function threadsUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "threads.com" || host.endsWith(".threads.com")) return url.toString();
  } catch {}
  return null;
}

export function deidentifyReviewRow(row: ReviewRecordLike): DeidentifiedReviewRow {
  return {
    anonymous_id: anonymousId(row),
    label: row.label === "relevant" ? "relevant" : "irrelevant",
    category: String(row.category || "Uncategorized"),
    excerpt: deidentifyReviewText(String(row.text_excerpt || "")).slice(0, 420),
    source_url: threadsUrl(row.permalink),
    posted_at: row.posted_at ? String(row.posted_at) : null,
    reviewed_at: String(row.reviewed_at || ""),
    window: row.window === "1d" || row.window === "5d" ? row.window : "3d",
    feature_tags: Array.isArray(row.feature_tags)
      ? row.feature_tags.map(String).slice(0, 12)
      : [],
    base_score:
      row.base_score === null || row.base_score === undefined
        ? null
        : Number(row.base_score)
  };
}

export async function loadDeidentifiedReviewRows(): Promise<DeidentifiedReviewRow[]> {
  const rows = await listSignalDeckFeedback();
  return rows.map(deidentifyReviewRow);
}
