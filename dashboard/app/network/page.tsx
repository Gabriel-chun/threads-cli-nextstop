import { KeywordNetworkView } from "../../components/KeywordNetworkView";
import { LocaleDate, T } from "../../components/I18nProvider";
import { loadKeywordNetwork, loadKeywordNetworkIndex } from "../../lib/keywordNetwork";

export const dynamic = "force-dynamic";

export default async function NetworkPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const params=await searchParams;
  const index=await loadKeywordNetworkIndex();
  const availableDates=index?.snapshots.map(item=>item.network_date)||[];
  const requestedDate=params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)?params.date:undefined;
  const selectedDate=requestedDate && availableDates.includes(requestedDate)?requestedDate:availableDates[0];
  const data=await loadKeywordNetwork(selectedDate);

  return <main className="networkWorkspace">
    <header className="workspaceHeader">
      <div>
        <p className="eyebrow"><T k="network.eyebrow" /></p>
        <h1><T k="network.title" /></h1>
        <p className="lead"><T k="network.lead" /></p>
      </div>
    </header>
    <div className="workspaceRule" />

    {availableDates.length?<nav className="networkDateStrip" aria-label="Keyword Network snapshot dates">
      {availableDates.map(date=><a key={date} href={"/network?date="+date} className={date===selectedDate?"active":""}>
        <strong>{date.slice(5).replace("-","/")}</strong>
        <small>{index?.snapshots.find(item=>item.network_date===date)?.source_card_count||0} <T k="common.cards" /></small>
      </a>)}
    </nav>:null}

    {!data?<section className="panel"><p className="muted"><T k="network.notGenerated" /></p></section>:<>
      <section className="metrics">
        <article><span><T k="network.metric.date" /></span><strong>{data.network_date.slice(5)}</strong><small>Asia/Taipei</small></article>
        <article><span><T k="network.metric.sourceCards" /></span><strong>{data.source_card_count}</strong><small>1d <T k="common.classifiedCandidates" /></small></article>
        <article><span><T k="network.metric.nodes" /></span><strong>{data.nodes.filter(node=>node.count>0).length}</strong><small><T k="network.metric.activeNodes" /></small></article>
        <article className="accent"><span><T k="network.metric.edges" /></span><strong>{data.edges.length}</strong><small><T k="network.metric.dailyCooccurrence" /></small></article>
      </section>

      <section className="panel networkPanel">
        <div className="panelHead"><div><p className="kicker"><T k="network.snapshot" /></p><h2><T k="network.searchNeed" /></h2></div><p className="muted"><T k="common.updated" values={{date:""}} /> <LocaleDate value={data.generated_at} /></p></div>
        <KeywordNetworkView data={data} />
      </section>
    </>}

    <footer><span>Next Stop Live · <T k="network.footerTitle" /></span><span><T k="network.footer" /></span></footer>
  </main>;
}
