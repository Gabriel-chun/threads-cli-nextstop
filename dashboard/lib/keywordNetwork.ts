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

const RAW_BASE =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive";

export type KeywordNetworkIndex = {
  schema_version: "keyword-network-index-v0.1";
  updated_at: string;
  timezone: "Asia/Taipei";
  snapshots: Array<{
    network_date: string;
    generated_at?: string | null;
    source_card_count: number;
    active_node_count: number;
    edge_count: number;
  }>;
};

async function readJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": "next-stop-live-keyword-network" },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

export async function loadKeywordNetwork(date?: string): Promise<KeywordNetwork | null> {
  const safeDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const url = safeDate
    ? `${RAW_BASE}/networks/${safeDate}.json`
    : `${RAW_BASE}/latest/keyword_network.json`;
  return readJson<KeywordNetwork>(url);
}

export async function loadKeywordNetworkIndex(): Promise<KeywordNetworkIndex | null> {
  return readJson<KeywordNetworkIndex>(`${RAW_BASE}/networks/index.json`);
}
