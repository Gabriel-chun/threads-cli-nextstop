import { snapshot, compact, loadTrendHistory } from "../lib/signals";
import { TrendChart } from "../components/TrendChart";
import { SignalReel } from "../components/SignalReel";
import { loadSignalDeck } from "../lib/signalDeck";

export const revalidate = 300;

function fmtDate(value: string | null) {
  if (!value) return "尚未取得";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export default async function Page() {
  const [data, history, signalDeck] = await Promise.all([
    snapshot(),
    loadTrendHistory(36),
    loadSignalDeck()
  ]);
  const top = data.clusters.slice(0, 7);
  const latestTrend = history[history.length - 1];
  const evidence = data.signals
    .filter((s) => s.kind !== "noise")
    .slice(0, 8)
    .map(compact);

  return (
    <main>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">NEXT STOP LIVE · SIGNAL DESK</p>
          <h1>Signal Desk</h1>
          <p className="lead">
            從 Threads 自然語料整理出現場需求、背景脈絡與可行動訊號。
          </p>
        </div>
        <div className={`health ${data.health.healthy ? "ok" : "warn"}`}>
          <span className="dot" />
          <div>
            <strong>{data.health.healthy ? "Collector 正常" : `Collector ${data.health.status}`}</strong>
            <small>{fmtDate(data.health.updatedAt)}</small>
          </div>
        </div>
      </header>

      <div className="workspaceRule" />

      <section className="metrics">
        <article><span>Master</span><strong>{data.masterCount}</strong><small>GitHub archive</small></article>
        <article><span>演唱會 Raw</span><strong>{data.concertRaw}</strong><small>broad query</small></article>
        <article><span>Clean Signal</span><strong>{data.cleanCount}</strong><small>resale excluded</small></article>
        <article className="accent"><span>Actionable</span><strong>{data.actionable}</strong><small>可轉內容／服務</small></article>
      </section>

      <SignalReel deck={signalDeck} />

      <section className="trendGrid">
        <div className="panel trendPanel">
          <div className="panelHead">
            <div>
              <p className="kicker">SIGNAL VELOCITY</p>
              <h2>3h / 12h Clean Trend</h2>
            </div>
            <p className="trendValue">{latestTrend ? `${latestTrend.new3h} / ${latestTrend.new12h}` : "—"}</p>
          </div>
          <TrendChart
            data={history}
            series={[
              { key: "new3h", label: "Rolling 3h", className: "trendA" },
              { key: "new12h", label: "Rolling 12h", className: "trendB" }
            ]}
          />
        </div>

        <div className="panel trendPanel">
          <div className="panelHead">
            <div>
              <p className="kicker">PIPELINE QUALITY</p>
              <h2>Clean / Resale Trend</h2>
            </div>
            <p className="trendValue">{latestTrend ? `${latestTrend.cleanRatePct}%` : "—"}</p>
          </div>
          <TrendChart
            data={history}
            series={[
              { key: "cleanSignals", label: "Clean", className: "trendA" },
              { key: "excludedTransactions", label: "Resale excluded", className: "trendC" }
            ]}
          />
        </div>
      </section>

      <section className="grid">
        <div className="panel wide">
          <div className="panelHead">
            <div>
              <p className="kicker">DEMAND MAP</p>
              <h2>目前訊號結構</h2>
            </div>
            <p className="muted">Collector clean-v2.1 + intent；技術 coverage 不進主視圖</p>
          </div>
          <div className="bars">
            {top.map((item) => (
              <div className="barRow" key={item.category}>
                <div className="barLabel">
                  <span>{item.category}</span>
                  <em>{item.kind}</em>
                </div>
                <div className="barTrack">
                  <div
                    className={`barFill ${item.kind}`}
                    style={{ width: `${Math.max(10, (item.count / Math.max(1, top[0]?.count || 1)) * 100)}%` }}
                  />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel split">
          <p className="kicker">PIPELINE</p>
          <h2>三層資料</h2>
          <div className="layer actionable">
            <span>A</span><div><strong>{data.actionable} Actionable</strong><small>票務、交通、周邊、同行</small></div>
          </div>
          <div className="layer context">
            <span>B</span><div><strong>{data.context} Context</strong><small>場館、現場、演後社群</small></div>
          </div>
          <div className="layer noise">
            <span>C</span><div><strong>{data.noise} Noise</strong><small>粉絲心得、關鍵詞雜訊</small></div>
          </div>
        </aside>
      </section>

      <section className="grid">
        <div className="panel wide">
          <div className="panelHead">
            <div>
              <p className="kicker">EVIDENCE</p>
              <h2>值得繼續看的原始訊號</h2>
            </div>
            <a href="https://github.com/Gabriel-chun/threads-cli-nextstop" target="_blank">GitHub ↗</a>
          </div>
          <div className="signals">
            {evidence.map((item) => (
              <a className="signal" href={item.permalink} target="_blank" key={item.id}>
                <div className="signalMeta">
                  <span className={item.kind}>{item.category}</span>
                  <small>@{item.username}</small>
                </div>
                <p>{item.text.length > 170 ? item.text.slice(0, 170) + "…" : item.text}</p>
              </a>
            ))}
          </div>
        </div>

        <aside className="panel mcp">
          <p className="kicker">SYSTEM ACCESS</p>
          <h2>MCP / Data Access</h2>
          <p className="muted">趨勢、clean signals、health 與最新版資料下載都集中在這裡。</p>
          <code>/api/mcp</code>
          <ul>
            <li>get_recent_signals</li>
            <li>get_demand_clusters</li>
            <li>get_signal_detail</li>
            <li>get_collector_health</li>
            <li>get_trend_history</li>
            <li>get_latest_download</li>
          </ul>
          <a className="downloadButton" href="/api/download/latest">
            <span>⬇️</span>
            <div>
              <strong>下載最新 JSON ZIP</strong>
              <small>即時打包最新 master.json</small>
            </div>
          </a>
          <div className="sourceNote">
            <strong>Source of truth</strong>
            <span>GitHub archive + Collector runs</span>
          </div>
        </aside>
      </section>

      <footer>
        <span>Next Stop Live · Data / Review / Signal</span>
        <span>Updated {fmtDate(data.generatedAt)}</span>
      </footer>
    </main>
  );
}
