import { get, list, put } from "@vercel/blob";
import { createHash } from "node:crypto";

export type TriageLabel = "relevant" | "irrelevant";

export type SignalDeckFeedback = {
  id: string;
  post_key: string;
  post_id?: string | null;
  permalink?: string | null;
  snapshot_id: string;
  window: "1d" | "3d" | "5d";
  label: TriageLabel;
  category: string;
  text_excerpt: string;
  feature_tags: string[];
  base_score: number;
  deck_generated_at: string;
  reviewed_at: string;
};

export type RelevanceProfile = {
  schema_version: "relevance-profile-v0.2";
  generated_at: string;
  feedback_count: number;
  relevant_count: number;
  irrelevant_count: number;
  feature_weights: Record<string, number>;
  category_weights: Record<string, number>;
  feature_stats: Record<string, { relevant: number; irrelevant: number; weight: number }>;
  category_stats: Record<string, { relevant: number; irrelevant: number; weight: number }>;
};

const ROOT = "signal-deck/v0.3";
const PROFILE_PATH = ROOT + "/relevance-profile/latest.json";

async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return JSON.parse(await new Response(result.stream).text()) as T;
  } catch {
    return null;
  }
}

async function putJson(pathname: string, value: unknown) {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json"
  });
}

function safeKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function feedbackPath(postKey: string) {
  return ROOT + "/feedback/" + safeKey(postKey) + ".json";
}

export async function putSignalDeckFeedback(
  input: Omit<SignalDeckFeedback, "id" | "reviewed_at">
): Promise<SignalDeckFeedback> {
  const record: SignalDeckFeedback = {
    ...input,
    id: "fb_" + safeKey(input.post_key),
    reviewed_at: new Date().toISOString()
  };
  await putJson(feedbackPath(input.post_key), record);
  return record;
}

export async function listSignalDeckFeedback(): Promise<SignalDeckFeedback[]> {
  const paths: string[] = [];
  let cursor: string | undefined;

  try {
    do {
      const page = await list({
        prefix: ROOT + "/feedback/",
        cursor,
        limit: 1000
      });
      paths.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch {
    return [];
  }

  const rows = await Promise.all(paths.map((path) => readJson<SignalDeckFeedback>(path)));
  return rows
    .filter((row): row is SignalDeckFeedback => Boolean(row))
    .sort((a, b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at));
}

export async function loadFeedbackMap(postKeys?: string[]) {
  const rows = await listSignalDeckFeedback();
  const filter = postKeys ? new Set(postKeys) : null;
  return Object.fromEntries(
    rows
      .filter((row) => !filter || filter.has(row.post_key))
      .map((row) => [row.post_key, row])
  );
}

function weight(rel: number, irr: number, scale: number) {
  const total = rel + irr;
  if (!total) return 0;
  return Number((((rel - irr) / (total + 2)) * scale).toFixed(3));
}

export function buildRelevanceProfile(
  rows: SignalDeckFeedback[],
  now = new Date()
): RelevanceProfile {
  const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  const recent = rows.filter((row) => Date.parse(row.reviewed_at) >= cutoff);

  const featureCounts = new Map<string, { relevant: number; irrelevant: number }>();
  const categoryCounts = new Map<string, { relevant: number; irrelevant: number }>();

  for (const row of recent) {
    const category = categoryCounts.get(row.category) || { relevant: 0, irrelevant: 0 };
    category[row.label] += 1;
    categoryCounts.set(row.category, category);

    for (const tag of new Set(row.feature_tags || [])) {
      const stats = featureCounts.get(tag) || { relevant: 0, irrelevant: 0 };
      stats[row.label] += 1;
      featureCounts.set(tag, stats);
    }
  }

  const feature_stats = Object.fromEntries(
    [...featureCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tag, stats]) => [
        tag,
        { ...stats, weight: weight(stats.relevant, stats.irrelevant, 12) }
      ])
  );

  // Category is deliberately a weak prior. Post-level text features carry most of
  // the weekly learning so one irrelevant fandom post cannot suppress a whole topic.
  const category_stats = Object.fromEntries(
    [...categoryCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, stats]) => [
        category,
        { ...stats, weight: weight(stats.relevant, stats.irrelevant, 2) }
      ])
  );

  return {
    schema_version: "relevance-profile-v0.2",
    generated_at: now.toISOString(),
    feedback_count: recent.length,
    relevant_count: recent.filter((row) => row.label === "relevant").length,
    irrelevant_count: recent.filter((row) => row.label === "irrelevant").length,
    feature_weights: Object.fromEntries(
      Object.entries(feature_stats).map(([tag, stats]) => [tag, stats.weight])
    ),
    category_weights: Object.fromEntries(
      Object.entries(category_stats).map(([category, stats]) => [category, stats.weight])
    ),
    feature_stats,
    category_stats
  };
}

export async function saveRelevanceProfile(profile: RelevanceProfile) {
  await putJson(PROFILE_PATH, profile);
}

export async function loadRelevanceProfile(): Promise<RelevanceProfile | null> {
  return readJson<RelevanceProfile>(PROFILE_PATH);
}
