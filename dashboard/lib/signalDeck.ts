import { buildRelevanceProfile, type RelevanceProfile } from "./signalDeckFeedback";
import { listSignalReviewsFromNotion } from "./signalDeckNotion";

export type TriageLabel = "relevant" | "irrelevant";

export type SignalPostCard = {
  id: string;
  post_key: string;
  snapshot_id: string;
  post_id?: string | null;
  category: string;
  kind: "actionable" | "context";
  status: string;
  score: number;
  base_score: number;
  feature_tags: string[];
  username?: string | null;
  text: string;
  summary: string;
  permalink?: string | null;
  posted_at?: string | null;
  media_type?: string | null;
  query?: string | null;
  source_queries?: string[];
  retrieval_sources?: string[];
  source: string;
  ranking_delta?: number;
  triage_label?: TriageLabel | null;
  triage_reviewed_at?: string | null;
};

export type RelevantCluster = {
  category: string;
  kind: "actionable" | "context";
  count: number;
  top_features: string[];
};

export type SignalDeckWindow = {
  label: string;
  days: number;
  signal_count: number;
  card_count: number;
  default_review_limit?: number;
  extend_step?: number;
  display_limit?: number;
  cards: SignalPostCard[];
  relevant_clusters?: RelevantCluster[];
};

export type SignalDeck = {
  schema_version: "signal-deck-v0.3";
  card_granularity: "post";
  generated_at: string;
  refresh_policy: "daily";
  source: string;
  source_master_count: number;
  windows: Record<"1d" | "3d" | "5d", SignalDeckWindow>;
};

const SIGNAL_DECK_URL =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/latest/signal_deck.json";

const emptyWindow = (label: string, days: number): SignalDeckWindow => ({
  label,
  days,
  signal_count: 0,
  card_count: 0,
  default_review_limit: 40,
  extend_step: 10,
  display_limit: 5,
  cards: [],
  relevant_clusters: []
});

function relevantClusters(cards: SignalPostCard[]): RelevantCluster[] {
  const grouped = new Map<
    string,
    { category: string; kind: "actionable" | "context"; count: number; features: Map<string, number> }
  >();

  for (const card of cards.filter((item) => item.triage_label === "relevant")) {
    const current = grouped.get(card.category) || {
      category: card.category,
      kind: card.kind,
      count: 0,
      features: new Map<string, number>()
    };
    current.count += 1;
    for (const tag of card.feature_tags || []) {
      current.features.set(tag, (current.features.get(tag) || 0) + 1);
    }
    grouped.set(card.category, current);
  }

  return [...grouped.values()]
    .map((cluster) => ({
      category: cluster.category,
      kind: cluster.kind,
      count: cluster.count,
      top_features: [...cluster.features.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([tag]) => tag)
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

export async function loadSignalDeck(): Promise<SignalDeck> {
  const res = await fetch(SIGNAL_DECK_URL, {
    headers: { "User-Agent": "next-stop-live-signal-deck" },
    cache: "no-store"
  });

  if (!res.ok) {
    return {
      schema_version: "signal-deck-v0.3",
      card_granularity: "post",
      generated_at: "",
      refresh_policy: "daily",
      source: SIGNAL_DECK_URL,
      source_master_count: 0,
      windows: {
        "1d": emptyWindow("1日", 1),
        "3d": emptyWindow("3日", 3),
        "5d": emptyWindow("5日", 5)
      }
    };
  }

  const deck = (await res.json()) as SignalDeck;

  let profile: RelevanceProfile | null = null;
  let feedback: Record<string, any> = {};
  try {
    const keys = [
      ...new Set(
        Object.values(deck.windows)
          .flatMap((window) => window.cards.map((card) => card.post_key))
          .filter(Boolean)
      )
    ];
    const rows = await listSignalReviewsFromNotion();
    profile = buildRelevanceProfile(rows);
    const keySet = new Set(keys);
    feedback = Object.fromEntries(rows.filter((row) => keySet.has(row.post_key)).map((row) => [row.post_key, row]));
  } catch {}

  for (const window of Object.values(deck.windows)) {
    window.cards = window.cards
      .map((card) => {
        const categoryDelta = profile?.category_weights?.[card.category] || 0;
        const featureDelta = (card.feature_tags || []).reduce(
          (sum, tag) => sum + (profile?.feature_weights?.[tag] || 0),
          0
        );
        const rankingDelta = Number((categoryDelta + featureDelta).toFixed(3));
        const triage = feedback[card.post_key];

        return {
          ...card,
          ranking_delta: rankingDelta,
          score: Number(((card.base_score ?? card.score) + rankingDelta).toFixed(3)),
          triage_label: triage?.label || null,
          triage_reviewed_at: triage?.reviewed_at || null
        };
      })
      .sort((a, b) => b.score - a.score || a.post_key.localeCompare(b.post_key));

    window.relevant_clusters = relevantClusters(window.cards);
  }

  return deck;
}

export function selectSignalDeckWindow(
  deck: SignalDeck,
  window: "1d" | "3d" | "5d",
  limit = 5
) {
  const selected = deck.windows[window];
  const defaultLimit = selected.default_review_limit ?? Math.min(40, selected.card_count);
  const defaultCards = selected.cards.slice(0, defaultLimit);
  const queue = defaultCards.filter((card) => !card.triage_label);
  const relevant = defaultCards.filter((card) => card.triage_label === "relevant");
  const irrelevant = defaultCards.filter((card) => card.triage_label === "irrelevant");

  return {
    schemaVersion: deck.schema_version,
    cardGranularity: deck.card_granularity,
    generatedAt: deck.generated_at,
    refreshPolicy: deck.refresh_policy,
    window,
    label: selected.label,
    signalCount: selected.signal_count,
    candidateCount: selected.card_count,
    defaultReviewLimit: defaultLimit,
    reserveCount: Math.max(0, selected.card_count - defaultLimit),
    extendStep: selected.extend_step ?? 10,
    profileApplied: selected.cards.some((card) => Boolean(card.ranking_delta)),
    reviewCounts: {
      unreviewed: queue.length,
      relevant: relevant.length,
      irrelevant: irrelevant.length
    },
    relevantClusters: selected.relevant_clusters || [],
    cards: queue.slice(0, Math.max(1, Math.min(5, limit)))
  };
}
