import { KeywordNetworkView } from "../../components/KeywordNetworkView";
import {
  loadKeywordNetwork,
  loadKeywordNetworkIndex
} from "../../lib/keywordNetwork";

export const dynamic = "force-dynamic";

function fmt(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${month}/${day}`;
}

export default async function NetworkPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const index = await loadKeywordNetworkIndex();
  const availableDates = index?.snapshots.map((item) => item.network_date) || [];
  const requestedDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : undefined;

  const selectedDate =
    requestedDate && availableDates.includes(requestedDate)
      ? requestedDate
      : availableDates[0];

  const data = await loadKeywordNetwork(selectedDate);

  return (
    <main className="networkWorkspace">
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">NEXT STOP LIVE · KEYWORD NETWORK</p>
          <h1>Daily Keyword Network</h1>
          <p className="lead">
            每天 00:00 Asia/Taipei 固定生成一张 Search / Need Network Snapshot；
            可切换 Table 与 Network 视图，并追踪每天 node / link 的变化。
          </p>
        </div>
        <a className="backButton" href="/">← Signal Desk</a>
      </header>

      <div className="workspaceRule" />

      {availableDates.length ? (
        <nav className="networkDateStrip" aria-label="Keyword Network snapshot dates">
          {availableDates.map((date) => (
            <a
              key={date}
              href={"/network?date=" + date}
              className={date === selectedDate ? "active" : ""}
            >
              <strong>{shortDate(date)}</strong>
              <small>
                {index?.snapshots.find((item) => item.network_date === date)?.source_card_count || 0} cards
              </small>
            </a>
          ))}
        </nav>
      ) : null}

      {!data ? (
        <section className="panel">
          <p className="muted">
            Keyword Network 尚未生成。每日 00:00 建立；若 GitHub cron 漏掉，當天第一個成功 Collector 會補建。
          </p>
        </section>
      ) : (
        <>
          <section className="metrics">
            <article>
              <span>Network Date</span>
              <strong>{data.network_date.slice(5)}</strong>
              <small>Asia/Taipei</small>
            </article>
            <article>
              <span>Source Cards</span>
              <strong>{data.source_card_count}</strong>
              <small>1d classified candidates</small>
            </article>
            <article>
              <span>Nodes</span>
              <strong>{data.nodes.filter((node) => node.count > 0).length}</strong>
              <small>active nodes</small>
            </article>
            <article className="accent">
              <span>Edges</span>
              <strong>{data.edges.length}</strong>
              <small>daily co-occurrence</small>
            </article>
          </section>

          <section className="panel networkPanel">
            <div className="panelHead">
              <div>
                <p className="kicker">DAILY SNAPSHOT</p>
                <h2>Search / Need Network</h2>
              </div>
              <p className="muted">Updated {fmt(data.generated_at)}</p>
            </div>
            <KeywordNetworkView data={data} />
          </section>
        </>
      )}

      <footer>
        <span>Next Stop Live · Keyword Network</span>
        <span>00:00 daily · historical snapshots retained</span>
      </footer>
    </main>
  );
}
