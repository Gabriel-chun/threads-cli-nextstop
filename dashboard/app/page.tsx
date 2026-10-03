import { snapshot, compact, loadTrendHistory } from "../lib/signals";
import { TrendChart } from "../components/TrendChart";
import { SignalReel } from "../components/SignalReel";
import { loadSignalDeck } from "../lib/signalDeck";
import { DataLabel, LocaleDate, T } from "../components/I18nProvider";

export const dynamic = "force-dynamic";

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
    <main className="signalWorkspace quietWorkspace">
      <header className="workspaceHeader quietWorkspaceHeader">
        <div>
          <p className="eyebrow"><T k="signal.eyebrow" /></p>
          <h1><T k="signal.title" /></h1>
        </div>
        <div className={`health quietHealth ${data.health.healthy ? "ok" : "warn"}`}>
          <span className="dot" />
          <div>
            <strong>{data.health.healthy ? <T k="signal.collectorHealthy" /> : <T k={"signal.health."+data.health.status} />}</strong>
            <small><T k="signal.lastCollection" /> · <LocaleDate value={latestTrend?.runAt || null} /></small>
          </div>
        </div>
      </header>

      <div className="quietStats" aria-label="Signal summary">
        <span><strong>{data.actionable}</strong> <T k="signal.metric.actionable" /></span>
        <span><strong>{data.cleanCount}</strong> <T k="signal.metric.clean" /></span>
        <span><strong>{data.concertRaw}</strong> <T k="signal.metric.concertRaw" /></span>
      </div>

      <section className="quietTrendStrip" aria-label="Signal trend">
        <div className="quietTrendStripHead">
          <div>
            <span><T k="signal.velocity" /></span>
            <strong>{latestTrend ? `3h ${latestTrend.new3h} · 12h ${latestTrend.new12h}` : "—"}</strong>
          </div>
          <small><T k="signal.chart.trendWindow" /></small>
        </div>
        <TrendChart
          compact
          data={history}
          series={[
            { key: "new3h", labelKey: "signal.chart.rolling3h", className: "trendA" },
            { key: "new12h", labelKey: "signal.chart.rolling12h", className: "trendB" }
          ]}
        />
      </section>

      <SignalReel deck={signalDeck} />

      <details className="quietDetails">
        <summary>
          <span><T k="signal.details" /></span>
          <small><T k="common.updated" values={{date:""}} /> <LocaleDate value={data.generatedAt} /></small>
        </summary>

        <div className="quietDetailsBody">
          <section className="metrics quietMetricCards">
            <article><span><T k="signal.metric.master" /></span><strong>{data.masterCount}</strong><small><T k="signal.metric.masterHelp" /></small></article>
            <article><span><T k="signal.metric.concertRaw" /></span><strong>{data.concertRaw}</strong><small><T k="signal.metric.rawHelp" /></small></article>
            <article><span><T k="signal.metric.clean" /></span><strong>{data.cleanCount}</strong><small><T k="signal.metric.cleanHelp" /></small></article>
            <article><span><T k="signal.metric.actionable" /></span><strong>{data.actionable}</strong><small><T k="signal.metric.actionableHelp" /></small></article>
          </section>

          <section className="trendGrid">
            <div className="panel trendPanel">
              <div className="panelHead">
                <div><p className="kicker"><T k="signal.pipelineQuality" /></p><h2><T k="signal.cleanResale" /></h2></div>
                <p className="trendValue">{latestTrend ? `${latestTrend.cleanRatePct}%` : "—"}</p>
              </div>
              <TrendChart data={history} series={[
                { key: "cleanSignals", labelKey: "signal.chart.clean", className: "trendA" },
                { key: "excludedTransactions", labelKey: "signal.chart.resaleExcluded", className: "trendC" }
              ]} />
            </div>
          </section>

          <section className="grid">
            <div className="panel wide">
              <div className="panelHead">
                <div><p className="kicker"><T k="signal.demandMap" /></p><h2><T k="signal.structure" /></h2></div>
              </div>
              <div className="bars">
                {top.map((item) => (
                  <div className="barRow" key={item.category}>
                    <div className="barLabel"><span><DataLabel value={item.category} /></span><em><T k={"signal.kind."+item.kind} /></em></div>
                    <div className="barTrack"><div className={`barFill ${item.kind}`} style={{ width: `${Math.max(10, (item.count / Math.max(1, top[0]?.count || 1)) * 100)}%` }} /></div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>

            <aside className="panel split">
              <p className="kicker"><T k="signal.pipeline" /></p>
              <h2><T k="signal.threeLayers" /></h2>
              <div className="layer actionable"><span>A</span><div><strong>{data.actionable} <T k="signal.layer.actionable" /></strong><small><T k="signal.actionableHelp2" /></small></div></div>
              <div className="layer context"><span>B</span><div><strong>{data.context} <T k="signal.layer.context" /></strong><small><T k="signal.contextHelp" /></small></div></div>
              <div className="layer noise"><span>C</span><div><strong>{data.noise} <T k="signal.layer.noise" /></strong><small><T k="signal.noiseHelp" /></small></div></div>
            </aside>
          </section>

          <section className="grid">
            <div className="panel wide">
              <div className="panelHead">
                <div><p className="kicker"><T k="signal.rawEvidence" /></p><h2><T k="signal.keepWatching" /></h2></div>
                <a href="https://github.com/Gabriel-chun/threads-cli-nextstop" target="_blank">GitHub ↗</a>
              </div>
              <div className="signals">
                {evidence.map((item) => (
                  <a className="signal" href={item.permalink} target="_blank" key={item.id}>
                    <div className="signalMeta"><span className={item.kind}><DataLabel value={item.category} /></span><small>@{item.username}</small></div>
                    <p>{item.text.length > 170 ? item.text.slice(0, 170) + "…" : item.text}</p>
                  </a>
                ))}
              </div>
            </div>

            <aside className="panel mcp">
              <p className="kicker"><T k="signal.systemAccess" /></p>
              <h2><T k="signal.dataAccess" /></h2>
              <p className="muted"><T k="signal.dataAccessHelp" /></p>
              <code>/api/mcp</code>
              <ul>
                <li>get_recent_signals</li><li>get_demand_clusters</li><li>get_signal_detail</li>
                <li>get_collector_health</li><li>get_trend_history</li><li>get_observation_bundle</li>
                <li>get_signal_deck</li><li>get_keyword_network</li><li>get_trend_radar</li>
                <li>get_trend_observation</li><li>get_trend_connections</li><li>get_event_watch</li><li>get_trend_evidence</li>
                <li>get_latest_download</li><li>get_reviewed_cards_download</li>
              </ul>
              <a className="downloadButton" href="/api/download/latest"><span>↓</span><div><strong><T k="signal.downloadLatest" /></strong><small><T k="signal.downloadLatestHelp" /></small></div></a>
              <a className="downloadButton" href="/reviews"><span>↗</span><div><strong><T k="signal.openReviews" /></strong><small><T k="signal.openReviewsHelp" /></small></div></a>
              <a className="downloadButton" href="/network"><span>↗</span><div><strong><T k="signal.openNetwork" /></strong><small><T k="signal.openNetworkHelp" /></small></div></a>
              <a className="downloadButton" href="/trends"><span>↗</span><div><strong><T k="signal.openTrends" /></strong><small><T k="signal.openTrendsHelp" /></small></div></a>
            </aside>
          </section>
        </div>
      </details>

      <footer><span>Next Stop Live · <T k="signal.footer" /></span></footer>
    </main>
  );
}
