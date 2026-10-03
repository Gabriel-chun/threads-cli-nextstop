export type KeywordNetworkNode = {
  id: string;
  label: string;
  layer: "recall" | "language" | "need" | "keyword";
  count: number;
  need_node?: string;
};

export type KeywordNetworkEdge = {
  source: string;
  target: string;
  weight: number;
};

export type KeywordNetwork = {
  schema_version: "keyword-network-v0.1";
  generated_at: string;
  network_date: string;
  timezone: "Asia/Taipei";
  refresh_policy: string;
  source_master_count: number;
  source_card_count: number;
  layers: string[];
  nodes: KeywordNetworkNode[];
  edges: KeywordNetworkEdge[];
  top_keywords: Record<string, { term: string; count: number }[]>;
};

const URL =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/latest/keyword_network.json";

export async function loadKeywordNetwork(): Promise<KeywordNetwork | null> {
  const response = await fetch(URL, {
    headers: { "User-Agent": "next-stop-live-keyword-network" },
    cache: "no-store"
  });

  if (!response.ok) return null;
  return (await response.json()) as KeywordNetwork;
}
