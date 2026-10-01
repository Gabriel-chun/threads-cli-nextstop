import {
  loadFeedbackMap,
  loadRelevanceProfile,
  type RelevanceProfile
} from "./signalDeckFeedback";

export type SignalDeckEvidence = {
  id?: string;
  username?: string;
  text: string;
  permalink?: string;
  posted_at?: string | null;
  query?: string;
  source_queries?: string[];
  source: string;
};

export type TriageLabel = "relevant" | "irrelevant";

export type SignalDeckCard = {
  id: string;
  snapshot_id: string;
  category: string;
  kind: "actionable" | "context";
  headline: string;
  summary: string;
  status: string;
  score: number;
  base_score: number;
  feature_tags: string[];
  feature_counts?: Record<string, number>;
  ranking_delta?: number;
  triage_label?: TriageLabel | null;
  triage_reviewed_at?: string | null;
  mentions: number;
  authors: number;
  first_seen?: string | null;
  last_seen?: string | null;
  activity: number[];
  source_breakdown: { source: string; count: number }[];
  evidence: SignalDeckEvidence[];
};

export type SignalDeckWindow = {
  label: string;
  days: number;
  signal_count: number;
  card_count: number;
  display_limit?: number;
  cards: SignalDeckCard[];
};

export type SignalDeck = {
  schema_version: "signal-deck-v0.2";
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
  cards: []
});

export async function loadSignalDeck(): Promise<SignalDeck> {
  const res = await fetch(SIGNAL_DECK_URL, {
    headers: { "User-Agent": "next-stop-live-signal-deck" },
    next: { revalidate: 3600 }
  });

  if (!res.ok) {
    return {
      schema_version: "signal-deck-v0.2",
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
    [profile, feedback] = await Promise.all([
      loadRelevanceProfile(),
      loadFeedbackMap(
        Object.values(deck.windows)
          .flatMap((window) => window.cards.map((card) => card.snapshot_id))
          .filter(Boolean)
      )
    ]);
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
        const triage = feedback[card.snapshot_id];
        return {
          ...card,
          ranking_delta: rankingDelta,
          score: Number(((card.base_score ?? card.score) + rankingDelta).toFixed(3)),
          triage_label: triage?.label || null,
          triage_reviewed_at: triage?.reviewed_at || null
        };
      })
      .sort((a, b) => {
        const rank = (label?: string | null) =>
          label === "relevant" ? 0 : label === "irrelevant" ? 2 : 1;
        const triageOrder = rank(a.triage_label) - rank(b.triage_label);
        if (triageOrder !== 0) return triageOrder;
        return b.score - a.score || b.mentions - a.mentions;
      });
  }

  return deck;
}

export function selectSignalDeckWindow(
  deck: SignalDeck,
  window: "1d" | "3d" | "5d",
  limit = 5
) {
  const selected = deck.windows[window];
  return {
    schemaVersion: deck.schema_version,
    generatedAt: deck.generated_at,
    refreshPolicy: deck.refresh_policy,
    window,
    label: selected.label,
    signalCount: selected.signal_count,
    profileApplied: selected.cards.some((card) => Boolean(card.ranking_delta)),
    cards: selected.cards.slice(0, Math.max(1, Math.min(5, limit)))
  };
}
