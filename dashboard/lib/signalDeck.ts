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

export type SignalDeckCard = {
  id: string;
  category: string;
  kind: "actionable" | "context";
  headline: string;
  summary: string;
  status: string;
  score: number;
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
  cards: SignalDeckCard[];
};

export type SignalDeck = {
  schema_version: "signal-deck-v0.1";
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
      schema_version: "signal-deck-v0.1",
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

  return res.json();
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
    cards: selected.cards.slice(0, Math.max(1, Math.min(5, limit)))
  };
}
