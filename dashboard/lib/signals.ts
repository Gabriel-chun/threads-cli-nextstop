export type RawPost = {
  id: string;
  query?: string;
  source_queries?: string[];
  text: string;
  username: string;
  permalink: string;
  timestamp?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  seen_count?: number;
  relevance_score?: number;
  dedupe_counted?: boolean;
  signal_counted?: boolean;
  clean_exclusion_reason?: string;
};

export type SignalKind = "actionable" | "context" | "noise";

export type Signal = RawPost & {
  category: string;
  kind: SignalKind;
};

const MASTER_URL =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/latest/master.json";
const RUNS_URL =
  "https://api.github.com/repos/Gabriel-chun/threads-cli-nextstop/actions/workflows/nextstop-collector.yml/runs?branch=main&per_page=5";
const HISTORY_URL =
  "https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/latest/history.json";

const preserveTicketFriction =
  /Pia帳號|日本門號|本人確認|本確|護照|退票|客服|換票[？?]讓票[？?]退票|實名制|黃牛.*搶不到|買不到票|抽選|公售|現場再換票|愛心席|入場|手環|購票紀錄/i;

const transactionPatterns = [
  /讓票/i,
  /出票/i,
  /售票/i,
  /原價讓/i,
  /原價出/i,
  /代友原價讓/i,
  /多搶到/i,
  /搶多了/i,
  /多搶一張/i,
  /轉讓/i,
  /降價賣/i,
  /降售/i,
  /#售/i,
  /pm\s*帶價/i,
  /帶價/i,
  /可拆/i,
  /票.*私訊/i,
  /私訊.*票/i,
  /求售/i,
  /現場給票/i
];

export function isTransaction(text: string) {
  if (preserveTicketFriction.test(text)) return false;
  if (transactionPatterns.some((re) => re.test(text))) return true;

  const ticketContext = /演唱會|concert|門票|票種|小巨蛋|巨蛋|演唱會飛/i.test(text);
  const saleContext =
    /連號|連坐|面交|匯款|原價|票價|有意|兩張|2張|一張可賣|付款|僅一張|兩人券/i.test(text);

  return ticketContext && saleContext;
}

export function classify(text: string): { category: string; kind: SignalKind } {
  if (
    /Pia帳號|日本門號|本人確認|本確|護照|trip.*門票|現場再換票|抽選|公售|實名制|黃牛.*搶不到|愛心席|退票|客服|手環|購票紀錄|重新買一張票/i.test(
      text
    )
  ) {
    return { category: "票務／入場摩擦", kind: "actionable" };
  }

  if (/中止|取消|淹水|機票|計程車|捷運|行李|趕場|交通|出發/i.test(text)) {
    return { category: "取消／交通／行程風險", kind: "actionable" };
  }

  if (/節目冊|聯名T|周邊|代購費|缺貨|貨.*充足|戰袍/i.test(text)) {
    return { category: "周邊／現場商品", kind: "actionable" };
  }

  if (/一個睇|一個人|找個伴|一起走|同行|第一次看演唱會/i.test(text)) {
    return { category: "陪同／Solo Attendance", kind: "actionable" };
  }

  if (/拍攝|錄音|謝幕.*可以拍|不能拍|唔可以影/i.test(text)) {
    return { category: "拍攝／現場規則", kind: "actionable" };
  }

  if (/搖滾區|站起來|坐下|工作人員|應援|encore|字幕|翻譯|視線|被擠|超空|外國人.*比例|東南亞人/i.test(text)) {
    return { category: "場館／現場體驗", kind: "context" };
  }

  if (/徵.*影片|影片.*糊|找.*影片|桌布|找人|哀居|IG/i.test(text)) {
    return { category: "演後社群／內容需求", kind: "context" };
  }

  if (/海底撈|散場.*吃|演唱會結束.*吃/i.test(text)) {
    return { category: "散場後消費", kind: "actionable" };
  }

  if (/市長|政見|參選|唯一支持|政治/i.test(text)) {
    return { category: "關鍵詞雜訊", kind: "noise" };
  }

  if (/同框|YG fam|關係逐漸微妙|CP|哥哥們碰面/i.test(text)) {
    return { category: "關鍵詞雜訊", kind: "noise" };
  }

  if (/請問|想問|有人有相關經驗|怎麼|如何|為什麼|有沒有人/i.test(text)) {
    return { category: "其他問題／需求", kind: "context" };
  }

  return { category: "粉絲心得／現場紀錄", kind: "noise" };
}

export async function loadMaster(): Promise<RawPost[]> {
  const res = await fetch(MASTER_URL, {
    headers: { "User-Agent": "next-stop-live-dashboard" },
    next: { revalidate: 300 }
  });
  if (!res.ok) throw new Error(`master fetch failed: ${res.status}`);
  return res.json();
}

export function concertPosts(posts: RawPost[]) {
  return posts.filter((post) =>
    post.query === "演唱會" || post.source_queries?.includes("演唱會")
  );
}

function hasUnifiedCleanState(post: RawPost) {
  return (
    Object.prototype.hasOwnProperty.call(post, "dedupe_counted") ||
    Object.prototype.hasOwnProperty.call(post, "clean_exclusion_reason")
  );
}

export function cleanSignals(posts: RawPost[]): Signal[] {
  return concertPosts(posts)
    .filter((post) =>
      hasUnifiedCleanState(post)
        ? Boolean(post.signal_counted)
        : !isTransaction(post.text || "")
    )
    .map((post) => ({ ...post, ...classify(post.text || "") }))
    .sort((a, b) => {
      const at = new Date(a.timestamp || a.first_seen_at || 0).getTime();
      const bt = new Date(b.timestamp || b.first_seen_at || 0).getTime();
      return bt - at;
    });
}

export function clusterCounts(signals: Signal[]) {
  const counts = new Map<string, { category: string; kind: SignalKind; count: number }>();
  for (const signal of signals) {
    const key = `${signal.kind}:${signal.category}`;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { category: signal.category, kind: signal.kind, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export async function collectorHealth() {
  const res = await fetch(RUNS_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "next-stop-live-dashboard"
    },
    next: { revalidate: 120 }
  });
  if (!res.ok) throw new Error(`workflow fetch failed: ${res.status}`);
  const data = await res.json();
  const runs = data.workflow_runs || [];
  const latest = runs[0];
  return {
    healthy: latest?.conclusion === "success",
    status: latest?.conclusion || latest?.status || "unknown",
    runNumber: latest?.run_number ?? null,
    updatedAt: latest?.updated_at ?? null,
    url: latest?.html_url ?? null
  };
}

export async function snapshot() {
  const posts = await loadMaster();
  const concert = concertPosts(posts);
  const signals = cleanSignals(posts);
  const clusters = clusterCounts(signals);
  const actionable = signals.filter((s) => s.kind === "actionable").length;
  const context = signals.filter((s) => s.kind === "context").length;
  const noise = signals.filter((s) => s.kind === "noise").length;

  let health = {
    healthy: false,
    status: "unknown",
    runNumber: null as number | null,
    updatedAt: null as string | null,
    url: null as string | null
  };
  try {
    health = await collectorHealth();
  } catch {}

  return {
    generatedAt: new Date().toISOString(),
    source: MASTER_URL,
    masterCount: posts.length,
    concertRaw: concert.length,
    cleanCount: signals.length,
    excludedTransactions: concert.some(hasUnifiedCleanState)
      ? concert.filter((post) => post.clean_exclusion_reason === "ticket_resale").length
      : concert.length - signals.length,
    actionable,
    context,
    noise,
    clusters,
    health,
    signals
  };
}

export function compact(signal: Signal) {
  return {
    id: signal.id,
    username: signal.username,
    text: signal.text,
    permalink: signal.permalink,
    timestamp: signal.timestamp,
    seenCount: signal.seen_count || 1,
    category: signal.category,
    kind: signal.kind
  };
}

export type TrendPoint = {
  runAt: string;
  runStamp: string;
  pipelineVersion: string | null;
  rawRows: number;
  dedupeUnique: number;
  cleanSignals: number;
  excludedTransactions: number;
  cleanRatePct: number;
  new3h: number;
  new12h: number;
  masterCount: number;
  status: "Success" | "Failed";
};

type TrendRow = {
  run_at?: string;
  run_stamp?: string;
  pipeline_version?: string | null;
  raw_rows?: number;
  dedupe_unique_signals?: number;
  unique_signals?: number;
  excluded_transactions?: number;
  clean_rate_pct?: number;
  new_3h?: number;
  new_12h?: number;
  master_unique_rows?: number;
  status?: "Success" | "Failed";
};

export async function loadTrendHistory(limit = 36, includeFailed = false): Promise<TrendPoint[]> {
  const res = await fetch(HISTORY_URL, {
    headers: { "User-Agent": "next-stop-live-dashboard" },
    next: { revalidate: 300 }
  });
  if (!res.ok) return [];

  const rows = (await res.json()) as TrendRow[];
  return rows
    .map((row): TrendPoint => ({
      runAt: row.run_at || "",
      runStamp: row.run_stamp || "",
      pipelineVersion: row.pipeline_version ?? null,
      rawRows: Number(row.raw_rows || 0),
      dedupeUnique: Number(row.dedupe_unique_signals || 0),
      cleanSignals: Number(row.unique_signals || 0),
      excludedTransactions: Number(row.excluded_transactions || 0),
      cleanRatePct: Number(row.clean_rate_pct || 0),
      new3h: Number(row.new_3h || 0),
      new12h: Number(row.new_12h || 0),
      masterCount: Number(row.master_unique_rows || 0),
      status: row.status === "Failed" ? "Failed" : "Success"
    }))
    .filter((row) => Boolean(row.runAt) && (includeFailed || row.status === "Success"))
    .slice(-Math.max(1, Math.min(84, limit)));
}
