"use client";

import { useMemo, useState } from "react";
import type { EventWatchRow, ReviewIntelligence, ReviewIntelligenceCluster, TrendEvidence, TrendIndexRow, TrendLink, TrendRadar } from "../lib/trendRadar";
import { isTrendObservation } from "../lib/trendRadar";
import { matchingAffiliateProducts, type AffiliateProduct } from "../lib/affiliateCatalog";
import { useI18n } from "./I18nProvider";

type View = "observation"|"connections"|"eventWatch"|"reviewIntelligence";

function stateKey(state:string){ return "trend.state."+state; }

export function TrendObservationView({data,snapshots,reviewIntelligence,affiliateProducts}:{data:TrendRadar|null;snapshots:TrendIndexRow[];reviewIntelligence:ReviewIntelligence|null;affiliateProducts:AffiliateProduct[]}){
  const {t,formatDate,formatCount}=useI18n();
  const [view,setView]=useState<View>("observation");
  const [selectedLink,setSelectedLink]=useState<TrendLink|null>(null);
  const [selectedEvent,setSelectedEvent]=useState<EventWatchRow|null>(null);
  const [selectedReviewCluster,setSelectedReviewCluster]=useState<ReviewIntelligenceCluster|null>(null);
  const v02=isTrendObservation(data);

  const evidence=useMemo<TrendEvidence[]>(()=>v02?data.evidence:[],[data,v02]);
  const evidenceMap=useMemo(()=>new Map(evidence.map(row=>[row.evidence_id,row])),[evidence]);
  const links=useMemo<TrendLink[]>(()=>v02?data.links:[],[data,v02]);
  const eventWatch=useMemo<EventWatchRow[]>(()=>v02?data.event_watch:(data?.events||[]).map((row:any)=>({
    event_id:row.event_id,artist_id:row.artist_id,artist_name:row.artist_name,event_name:row.event_name,event_date:row.event_date,
    venue_id:row.venue_id,venue_name:row.venue_name,city:row.city,source:row.source,status:row.status,linked_evidence:[],linked_mobility:[],linked_timing:[],linked_stay:[]
  })),[data,v02]);

  const currentEvidenceForLink=selectedLink ? (selectedLink.supporting_evidence?.length ? selectedLink.supporting_evidence : selectedLink.evidence_ids.map(id=>evidenceMap.get(id)).filter(Boolean) as TrendEvidence[]) : [];
  const eventEvidence=selectedEvent ? selectedEvent.linked_evidence.map(id=>evidenceMap.get(id)).filter(Boolean) as TrendEvidence[] : [];
  const drawerEvidence=selectedLink?currentEvidenceForLink:eventEvidence;

  const entities=v02?data.entities:[];
  const countType=(type:string)=>entities.filter(e=>e.entity_type===type).length;
  const needCount=(axis:string)=>evidence.filter(e=>(e.annotation as any)[axis]?.length).length;
  const sample=v02?data.sample:null;

  function selectSnapshot(runStamp:string){
    const url=new URL(globalThis.location.href);
    url.searchParams.set("snapshot",runStamp);
    url.searchParams.delete("date");
    globalThis.location.assign(url.toString());
  }

  const stateCounts=v02 ? {
    new:data.links.filter(link=>link.state==="new").length,
    repeated:data.links.filter(link=>link.state==="repeated").length,
    persistent:data.links.filter(link=>link.state==="persistent").length,
    expanding:data.links.filter(link=>link.state==="expanding").length,
    dormant:data.links.filter(link=>link.state==="dormant").length
  } : {new:0,repeated:0,persistent:0,expanding:0,dormant:0};

  return <main className="networkWorkspace quietWorkspace">
    <header className="workspaceHeader quietWorkspaceHeader">
      <div>
        <p className="eyebrow">{t("trend.eyebrow")}</p>
        <h1>{t("trend.title")}</h1>
      </div>
      <label>
        <span className="srOnly">{t("trend.selectSnapshot")}</span>
        <select className="trendSnapshotSelect quietSelect" value={data?.run_stamp||""} onChange={e=>selectSnapshot(e.target.value)}>
          {snapshots.map(row=><option key={row.run_stamp} value={row.run_stamp}>{formatDate(row.generated_at)} · {row.sampling_strategy||row.schema_version||""}</option>)}
        </select>
      </label>
    </header>

    <div className="trendTabs quietTabs" role="tablist">
      <button type="button" className={view==="observation"?"active":""} onClick={()=>setView("observation")}>{t("trend.tab.observation")}</button>
      <button type="button" className={view==="connections"?"active":""} onClick={()=>setView("connections")}>{t("trend.tab.connections")}</button>
      <button type="button" className={view==="eventWatch"?"active":""} onClick={()=>setView("eventWatch")}>{t("trend.tab.eventWatch")}</button>
      <button type="button" className={view==="reviewIntelligence"?"active":""} onClick={()=>setView("reviewIntelligence")}>{t("trend.tab.reviewIntelligence")}</button>
    </div>

    {!data ? <section className="quietEmpty"><p className="muted">{t("common.noData")}</p></section> : null}

    {data && view==="observation" ? <>
      <div className="quietStats trendQuietStats">
        <span><strong>{formatCount(links.length,"connection")}</strong></span>
        <span><strong>{formatCount(evidence.length,"evidence")}</strong></span>
        {stateCounts.repeated>0?<span>{stateCounts.repeated} {t("trend.state.repeated")}</span>:null}
        {stateCounts.persistent>0?<span>{stateCounts.persistent} {t("trend.state.persistent")}</span>:null}
      </div>

      <section className="quietPrimaryList">
        {links.length ? links.slice(0,8).map(link=><button type="button" className="quietConnectionRow" key={link.link_id} onClick={()=>{setSelectedEvent(null);setSelectedLink(link);}}>
          <span className="quietConnectionNames"><strong>{link.source_label}</strong><i>↔</i><strong>{link.target_label}</strong></span>
          <span className="quietConnectionMeta">{formatCount(link.evidence_count,"evidence")} · {t(stateKey(link.state))}</span>
        </button>) : <p className="muted">{t("trend.noEvidence")}</p>}
      </section>

      <details className="quietDetails trendQuietDetails">
        <summary>
          <span>{t("trend.details")}</span>
          <small>{formatDate(data.generated_at)}</small>
        </summary>
        <div className="quietDetailsBody">
          <section className="metrics quietMetricCards">
            <article><span>{t("trend.queriesExecuted")}</span><strong>{data.query_count}</strong><small>{sample?.sampling_strategy ? t("trend.sampling."+sample.sampling_strategy) : t("trend.baselineStrategy")}</small></article>
            <article><span>{t("trend.raw")}</span><strong>{sample?.raw_count??data.raw_result_count}</strong><small>{formatCount(sample?.raw_count??data.raw_result_count,"sample")}</small></article>
            <article><span>{t("trend.clean")}</span><strong>{sample?.clean_count??data.clean_result_count}</strong><small>{formatCount(evidence.length,"evidence")}</small></article>
            <article><span>{t("trend.observedEntities")}</span><strong>{entities.length}</strong><small>{countType("artist")} / {countType("event")} / {countType("venue")}</small></article>
          </section>

          <section className="grid">
            <div className="panel wide quietPanel">
              <div className="panelHead"><div><p className="kicker">{t("trend.languageDistribution")}</p><h2>{t("trend.currentSample")}</h2></div></div>
              <div className="bars">{Object.entries(v02?data.language_distribution:{}).map(([language,count])=><div className="barRow" key={language}><div className="barLabel"><span>{language}</span></div><div className="barTrack"><div className="barFill" style={{width:String(Math.max(8,(count/Math.max(1,evidence.length))*100))+"%"}} /></div><strong>{count}</strong></div>)}</div>
            </div>
            <aside className="panel quietPanel">
              <p className="kicker">{t("trend.observedNeeds")}</p>
              <div className="quietNeedRows">
                <span><strong>{needCount("mobility")}</strong>{t("trend.mobilityObservations")}</span>
                <span><strong>{needCount("timing")}</strong>{t("trend.timingObservations")}</span>
                <span><strong>{needCount("stay")}</strong>{t("trend.stayObservations")}</span>
              </div>
            </aside>
          </section>

          {v02?<section className="panel quietPanel">
            <div className="panelHead"><div><p className="kicker">{t("trend.snapshotComparison")}</p><h2>{t("trend.currentVsPrevious")}</h2></div></div>
            <div className="trendCompareGrid">
              <div><strong>{data.comparison.new_entities.length}</strong><small>{t("trend.newEntities")}</small></div>
              <div><strong>{data.comparison.repeated_entities.length}</strong><small>{t("trend.repeatedEntities")}</small></div>
              <div><strong>{data.comparison.dormant_links.length}</strong><small>{t("trend.dormantConnections")}</small></div>
            </div>
          </section>:null}
        </div>
      </details>
    </> : null}

    {data && view==="connections" ? <section className="quietPrimaryList">
      {links.length ? links.map(link=><button type="button" className="quietConnectionRow" key={link.link_id} onClick={()=>{setSelectedEvent(null);setSelectedLink(link);}}>
        <span className="quietConnectionNames"><strong>{link.source_label}</strong><i>↔</i><strong>{link.target_label}</strong></span>
        <span className="quietConnectionMeta">{formatCount(link.sample_count,"sample")} · {formatCount(link.evidence_count,"evidence")} · {t(stateKey(link.state))}</span>
      </button>):<p className="muted">{t("trend.noEvidence")}</p>}
    </section>:null}

    {data && view==="eventWatch" ? <section className="quietPrimaryList">
      {eventWatch.map(event=><button type="button" className="quietEventRow" key={event.event_id} onClick={()=>{setSelectedLink(null);setSelectedEvent(event);}}>
        <span><strong>{event.artist_name}</strong><small>{event.event_name} · {event.event_date} · {event.venue_name}</small></span>
        <span className="quietConnectionMeta">{event.linked_evidence.length?formatCount(event.linked_evidence.length,"evidence"):t("trend.eventNoEvidence")}</span>
      </button>)}
    </section>:null}

    {view==="reviewIntelligence" ? <ReviewIntelligenceView
      data={reviewIntelligence}
      affiliateProducts={affiliateProducts}
      onSelectCluster={(cluster)=>{setSelectedLink(null);setSelectedEvent(null);setSelectedReviewCluster(cluster);}}
    /> : null}

    {(selectedLink||selectedEvent||selectedReviewCluster) ? <aside className="trendEvidenceDrawer quietDrawer" aria-live="polite">
      <div className="trendDrawerHead"><div><p className="kicker">{t("trend.supportingEvidence")}</p><h2>{selectedLink?selectedLink.source_label+" ↔ "+selectedLink.target_label:selectedEvent?.event_name || (selectedReviewCluster ? t("trend.review.cluster."+selectedReviewCluster.cluster_id) : "")}</h2></div><button type="button" onClick={()=>{setSelectedLink(null);setSelectedEvent(null);setSelectedReviewCluster(null);}}>{t("common.close")}</button></div>
      {selectedLink?<div className="trendEvidenceMeta">
        <span>{t("common.firstSeen")}</span><strong>{formatDate(selectedLink.first_seen)}</strong>
        <span>{t("common.lastSeen")}</span><strong>{formatDate(selectedLink.last_seen)}</strong>
        <span>{t("trend.sampleCount")}</span><strong>{selectedLink.sample_count}</strong>
        <span>{t("trend.evidenceCount")}</span><strong>{selectedLink.evidence_count}</strong>
        <span>{t("trend.uniqueAuthors")}</span><strong>{selectedLink.unique_author_count}</strong>
        <span>{t("trend.resolutionConfidence")}</span><strong>{t("trend.confidence."+selectedLink.resolution_confidence)}</strong>
      </div>:null}
      {selectedReviewCluster ? <>
        <div className="trendEvidenceMeta reviewClusterMeta">
          <span>{t("trend.review.affiliateFit")}</span><strong>{t("deck.affiliateFit."+selectedReviewCluster.affiliate_fit)}</strong>
          <span>{t("trend.review.relevantEvidence")}</span><strong>{selectedReviewCluster.relevant_count}</strong>
          <span>{t("trend.review.irrelevantOverlap")}</span><strong>{selectedReviewCluster.irrelevant_count}</strong>
        </div>
        <AffiliateProductMatches products={matchingAffiliateProducts(affiliateProducts,selectedReviewCluster.cluster_id)} />
        {selectedReviewCluster.solution_map.length?<div className="trendChipList">{selectedReviewCluster.solution_map.map(item=><span key={item}>{item}</span>)}</div>:null}
        {selectedReviewCluster.evidence.length?selectedReviewCluster.evidence.map(item=><article className="trendEvidenceCard quietEvidenceCard" key={item.post_key}>
          <p>{item.text}</p>
          <div className="trendEvidenceMeta"><span>{t("trend.review.category")}</span><strong>{item.category}</strong><span>{t("trend.review.reviewedAt")}</span><strong>{formatDate(item.reviewed_at)}</strong></div>
        </article>):<p className="muted">{t("trend.eventNoEvidence")}</p>}
      </> : <>
        {drawerEvidence.length?drawerEvidence.map(ev=><EvidenceCard key={ev.evidence_id} evidence={ev}/>):<p className="muted">{t("trend.eventNoEvidence")}</p>}
        {selectedEvent?.source?<a className="quietTextLink" href={selectedEvent.source} target="_blank" rel="noreferrer">{t("common.openSource")}</a>:null}
      </>}
    </aside>:null}

    <footer><span>Next Stop Live · {t("trend.footerSystem")}</span><span>{t("trend.readOnly")}</span></footer>
  </main>;
}

function ReviewIntelligenceView({data,onSelectCluster,affiliateProducts}:{data:ReviewIntelligence|null;onSelectCluster:(cluster:ReviewIntelligenceCluster)=>void;affiliateProducts:AffiliateProduct[]}){
  const {t}=useI18n();
  if(!data) return <section className="quietEmpty"><p className="muted">{t("trend.review.noData")}</p></section>;

  const ready=data.demand_clusters.filter(row=>row.affiliate_fit==="ready");
  const adjacent=data.demand_clusters.filter(row=>row.affiliate_fit==="adjacent");
  const topPositive=Object.entries(data.positive_patterns)
    .map(([key,value])=>({key,...value,delta:(value.relevant/Math.max(1,data.review_counts.relevant))-(value.irrelevant/Math.max(1,data.review_counts.irrelevant))}))
    .sort((a,b)=>b.delta-a.delta)
    .slice(0,4);
  const topNegative=Object.entries(data.negative_patterns)
    .map(([key,value])=>({key,...value,delta:(value.irrelevant/Math.max(1,data.review_counts.irrelevant))-(value.relevant/Math.max(1,data.review_counts.relevant))}))
    .sort((a,b)=>b.delta-a.delta)
    .slice(0,4);

  return <section className="reviewIntelligence">
    <div className="quietStats trendQuietStats reviewIntelligenceStats">
      <span><strong>{data.review_counts.relevant}</strong>{t("deck.relevant")}</span>
      <span><strong>{data.review_counts.irrelevant}</strong>{t("deck.irrelevant")}</span>
      <span><strong>{ready.length}</strong>{t("trend.review.readyClusters")}</span>
      <span><strong>{adjacent.length}</strong>{t("trend.review.adjacentClusters")}</span>
    </div>

    <div className="reviewContrastGrid">
      <section className="reviewContrastColumn">
        <p className="kicker">{t("trend.review.positivePatterns")}</p>
        {topPositive.map(row=><div className="reviewContrastRow" key={row.key}><span>{t("trend.review.pattern."+row.key)}</span><strong>{row.relevant}</strong><small>{t("deck.relevant")}</small></div>)}
      </section>
      <section className="reviewContrastColumn">
        <p className="kicker">{t("trend.review.negativePatterns")}</p>
        {topNegative.map(row=><div className="reviewContrastRow" key={row.key}><span>{t("trend.review.pattern."+row.key)}</span><strong>{row.irrelevant}</strong><small>{t("deck.irrelevant")}</small></div>)}
      </section>
    </div>

    <div className="reviewDemandHead">
      <div><p className="kicker">{t("trend.review.demandClusters")}</p><h2>{t("trend.review.demandQuestion")}</h2></div>
      <small>{t("trend.review.derivedNote")}</small>
    </div>

    <div className="quietPrimaryList reviewDemandList">
      {data.demand_clusters.map(cluster=><button type="button" className="quietConnectionRow reviewDemandRow" key={cluster.cluster_id} onClick={()=>onSelectCluster(cluster)}>
        <span className="reviewDemandMain">
          <strong>{t("trend.review.cluster."+cluster.cluster_id)}</strong>
          <small>{cluster.solution_map.length?cluster.solution_map.slice(0,3).join(" · "):t("trend.review.insightOnly")}{matchingAffiliateProducts(affiliateProducts,cluster.cluster_id).length ? " · "+t("affiliate.productCount",{count:matchingAffiliateProducts(affiliateProducts,cluster.cluster_id).length}) : ""}</small>
        </span>
        <span className="reviewDemandRight">
          <em className={"reviewAffiliateBadge "+cluster.affiliate_fit}>{t("deck.affiliateFit."+cluster.affiliate_fit)}</em>
          <span className="quietConnectionMeta">{cluster.relevant_count} {t("common.evidence")}</span>
        </span>
      </button>)}
    </div>
  </section>;
}

function EvidenceCard({evidence}:{evidence:TrendEvidence}){
  const {t,formatDate}=useI18n();
  const artist=evidence.annotation.artists.map(x=>x.label).join(" · ")||"—";
  const event=evidence.annotation.event?.label||"—";
  const venue=evidence.annotation.venues.map(x=>x.label).join(" · ")||"—";
  const chips=[...evidence.annotation.mobility,...evidence.annotation.timing,...evidence.annotation.stay].map(x=>x.label);
  return <article className="trendEvidenceCard quietEvidenceCard">
    <p>{evidence.text}</p>
    <div className="trendEvidenceMeta">
      <span>{t("trend.observedAt")}</span><strong>{formatDate(evidence.observed_at)}</strong>
      <span>{t("common.language")}</span><strong>{evidence.language_context}</strong>
      <span>{t("trend.resolvedArtist")}</span><strong>{artist}</strong>
      <span>{t("trend.resolvedEvent")}</span><strong>{event}</strong>
      <span>{t("trend.resolvedVenue")}</span><strong>{venue}</strong>
    </div>
    {chips.length?<div className="trendChipList">{chips.map((chip,index)=><span key={chip+index}>{chip}</span>)}</div>:null}
    {evidence.source_url?<a href={evidence.source_url} target="_blank" rel="noreferrer">{t("common.openSource")}</a>:null}
  </article>;
}

function AffiliateProductMatches({products}:{products:AffiliateProduct[]}){
  const {t,locale}=useI18n();
  if (!products.length) return null;
  return <section className="affiliateMatches" aria-label={t("affiliate.title")}>
    <div className="affiliateMatchHeading">
      <strong>{t("affiliate.title")}</strong>
      <small>{t("affiliate.disclosure")}</small>
    </div>
    {products.map(product=><article key={product.product_id} className="affiliateMatchRow">
      <div>
        <strong>{locale==="zh-TW"?product.title_zh:product.title_en}</strong>
        <p>{locale==="zh-TW"?product.context_zh:product.context_en}</p>
        <small>{product.affiliate_url?t("affiliate.tracked"):t("affiliate.untracked")}</small>
      </div>
      <a className="affiliateMatchLink" href={product.affiliate_url||product.public_url} target="_blank" rel="noopener noreferrer sponsored">
        {t("affiliate.openProduct")} ↗
      </a>
    </article>)}
    <p className="affiliateMatchFootnote">{t("affiliate.availability")}</p>
  </section>;
}
