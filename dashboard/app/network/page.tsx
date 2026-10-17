import { KeywordNetworkView } from "../../components/KeywordNetworkView";
import { LocaleDate, T } from "../../components/I18nProvider";
import { aggregateKeywordNetworks, calendarNetworkDate } from "../../lib/keywordNetworkHistory";
import { loadKeywordNetwork, loadKeywordNetworkIndex } from "../../lib/keywordNetwork";

export const dynamic = "force-dynamic";

export default async function NetworkPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const params=await searchParams;
  const index=await loadKeywordNetworkIndex();
  const availableDates=index?.snapshots.map(item=>item.network_date)||[];
  const requestedDate=params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)?params.date:undefined;
  const selectedDate=requestedDate && availableDates.includes(requestedDate)?requestedDate:availableDates[0];
  const data=await loadKeywordNetwork(selectedDate);
  const anchor=selectedDate||data?.network_date;
  const snapshots=anchor?await Promise.all(Array.from({length:7},(_,i)=>{
    const date=calendarNetworkDate(anchor,-i);
    return availableDates.includes(date)
      ? loadKeywordNetwork(date).then(snapshot=>({date,snapshot}))
      : Promise.resolve({date,snapshot:null});
  })):[];
  const overlays=anchor?({
    1:aggregateKeywordNetworks(snapshots,anchor,1),
    3:aggregateKeywordNetworks(snapshots,anchor,3),
    7:aggregateKeywordNetworks(snapshots,anchor,7)
  }):null;

  return <main className="networkWorkspace quietWorkspace">
    <header className="workspaceHeader quietWorkspaceHeader">
      <div>
        <p className="eyebrow"><T k="network.eyebrow" /></p>
        <h1><T k="network.title" /></h1>
      </div>
    </header>

    {availableDates.length?<details className="networkHistoryDetails">
      <summary><T k="nav.historySnapshots" /></summary>
      <nav className="networkDateStrip quietDateStrip" aria-labelledby="networkSnapshotDatesLabel"><span id="networkSnapshotDatesLabel" className="srOnly"><T k="network.snapshotDatesAria" /></span>
      {availableDates.map(date=><a key={date} href={"/network?date="+date} className={date===selectedDate?"active":""}>
        <strong>{date.slice(5).replace("-","/")}</strong>
      </a>)}
      </nav>
    </details>:null}

    {!data?<section className="quietEmpty"><p className="muted"><T k="network.notGenerated" /></p></section>:<>
      <section className="quietMainSurface">
        <KeywordNetworkView data={data} overlays={overlays} />
      </section>

      <details className="quietDetails">
        <summary>
          <span><T k="network.details" /></span>
          <small>{data.network_date}</small>
        </summary>
        <div className="quietDetailsBody">
          <section className="metrics quietMetricCards">
            <article><span><T k="network.metric.date" /></span><strong>{data.network_date.slice(5)}</strong><small>Asia/Taipei</small></article>
            <article><span><T k="network.metric.sourceCards" /></span><strong>{data.source_card_count}</strong><small>1d <T k="common.classifiedCandidates" /></small></article>
            <article><span><T k="network.metric.nodes" /></span><strong>{data.nodes.filter(node=>node.count>0).length}</strong><small><T k="network.metric.activeNodes" /></small></article>
            <article><span><T k="network.metric.edges" /></span><strong>{data.edges.length}</strong><small><T k="network.metric.dailyCooccurrence" /></small></article>
          </section>
        </div>
      </details>
    </>}

    <footer><span>Next Stop Live · <T k="network.footerTitle" /></span><span><T k="network.footer" /></span></footer>
  </main>;
}
