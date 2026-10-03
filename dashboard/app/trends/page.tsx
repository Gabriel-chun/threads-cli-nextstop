import { loadTrendIndex, loadTrendRadar } from "../../lib/trendRadar";
export const dynamic="force-dynamic";

function fmt(v:string){
  return new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v));
}

export default async function TrendsPage({searchParams}:{searchParams:Promise<{date?:string}>}){
  const params=await searchParams;
  const index=await loadTrendIndex();
  const dates=[...new Set((index?.snapshots||[]).map(x=>x.run_stamp.slice(0,10)))];
  const selected=params.date && dates.includes(params.date) ? params.date : dates[0];
  const data=await loadTrendRadar(selected);
  return <main className="networkWorkspace">
    <header className="workspaceHeader"><div>
      <p className="eyebrow">NEXT STOP LIVE · TREND RADAR</p>
      <h1>Trend Radar</h1>
      <p className="lead">觀察哪一場 Event 開始形成交通、住宿、散場與 Timing-related demand；排行榜只作 Candidate Prior。</p>
    </div><a className="backButton" href="/">← Signal Desk</a></header>
    <div className="workspaceRule" />
    {dates.length ? <nav className="networkDateStrip">{dates.slice(0,14).map(d=><a key={d} href={"/trends?date="+d} className={d===selected?"active":""}><strong>{d.slice(5)}</strong><small>snapshot</small></a>)}</nav>:null}
    {!data ? <section className="panel"><p className="muted">Trend snapshot 尚未生成。</p></section> : <>
      <section className="metrics">
        <article><span>Artist Seeds</span><strong>{data.artist_seed_count}</strong><small>candidate prior</small></article>
        <article><span>Events</span><strong>{data.event_candidate_count}</strong><small>upcoming window</small></article>
        <article><span>Need Edges</span><strong>{data.active_edge_count}</strong><small>deduped co-occurrence</small></article>
        <article className="accent"><span>Active / Watch</span><strong>{data.status_counts.active} / {data.status_counts.watch}</strong><small>cross-snapshot state</small></article>
      </section>
      <section className="grid">
        <div className="panel wide"><div className="panelHead"><div><p className="kicker">WATCH EVENTS</p><h2>Trending / Watch Events</h2></div><p className="muted">Updated {fmt(data.generated_at)}</p></div>
          <div className="signals">{data.events.map(e=><a className="signal" href={"/trends?date="+selected+"#"+e.event_id} id={e.event_id} key={e.event_id}>
            <div className="signalMeta"><span className={e.trend_status==="active"?"actionable":e.trend_status==="watch"?"context":"noise"}>{e.trend_status.toUpperCase()}</span><small>{e.event_date} · {e.city}</small></div>
            <p><strong>{e.artist_name}</strong>｜{e.event_name}</p><small>{e.venue_name} · {e.signal_count} signals · {e.need_edge_count} need edges</small>
          </a>)}</div>
        </div>
        <aside className="panel split"><p className="kicker">RUN QUALITY</p><h2>Snapshot</h2>
          <div className="layer actionable"><span>Q</span><div><strong>{data.query_count} queries</strong><small>bounded budget</small></div></div>
          <div className="layer context"><span>R</span><div><strong>{data.raw_result_count} raw</strong><small>{data.clean_result_count} after dedupe</small></div></div>
          <div className="layer noise"><span>E</span><div><strong>{data.active_edge_count} edges</strong><small>unique-author aware</small></div></div>
        </aside>
      </section>
      <section className="panel"><div className="panelHead"><div><p className="kicker">NEED CONNECTIONS</p><h2>Event → Need → Evidence</h2></div></div>
        <div className="signals">{data.edges.map(edge=><div className="signal" key={edge.source_entity+edge.target_need}>
          <div className="signalMeta"><span className="actionable">{edge.target_label}</span><small>{edge.signal_count} signals · {edge.unique_author_count} authors · persistence {edge.snapshot_persistence}</small></div>
          {edge.supporting_posts.slice(0,3).map(p=><a href={p.permalink} target="_blank" key={p.id}><p>{p.text.length>180?p.text.slice(0,180)+"…":p.text}</p><small>@{p.username}</small></a>)}
        </div>)}</div>
      </section>
    </>}
    <footer><span>Next Stop Live · Trend Tracking V0.1</span><span>Read-only · GitHub archive source of truth</span></footer>
  </main>
}
