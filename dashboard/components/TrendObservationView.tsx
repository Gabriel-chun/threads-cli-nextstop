"use client";

import { useMemo, useState } from "react";
import type { EventWatchRow, TrendEvidence, TrendIndexRow, TrendLink, TrendRadar } from "../lib/trendRadar";
import { isTrendObservation } from "../lib/trendRadar";
import { useI18n } from "./I18nProvider";

type View = "observation"|"connections"|"eventWatch";

function stateKey(state:string){ return "trend.state."+state; }

export function TrendObservationView({data,snapshots}:{data:TrendRadar|null;snapshots:TrendIndexRow[]}){
  const {t,formatDate,formatCount}=useI18n();
  const [view,setView]=useState<View>("observation");
  const [selectedLink,setSelectedLink]=useState<TrendLink|null>(null);
  const [selectedEvent,setSelectedEvent]=useState<EventWatchRow|null>(null);
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

  return <main className="networkWorkspace">
    <header className="workspaceHeader"><div>
      <p className="eyebrow">NEXT STOP LIVE · LINK OBSERVATION SYSTEM V0.2</p>
      <h1>{t("trend.title")}</h1>
      <p className="lead">{t("trend.lead")}</p>
    </div>
      <label>
        <span className="srOnly">{t("trend.selectSnapshot")}</span>
        <select className="trendSnapshotSelect" value={data?.run_stamp||""} onChange={e=>selectSnapshot(e.target.value)}>
          {snapshots.map(row=><option key={row.run_stamp} value={row.run_stamp}>{formatDate(row.generated_at)} · {row.sampling_strategy||row.schema_version||""}</option>)}
        </select>
      </label>
    </header>
    <div className="workspaceRule" />

    <div className="trendTabs" role="tablist">
      <button type="button" className={view==="observation"?"active":""} onClick={()=>setView("observation")}>{t("trend.tab.observation")}</button>
      <button type="button" className={view==="connections"?"active":""} onClick={()=>setView("connections")}>{t("trend.tab.connections")}</button>
      <button type="button" className={view==="eventWatch"?"active":""} onClick={()=>setView("eventWatch")}>{t("trend.tab.eventWatch")}</button>
    </div>
    <p className="trendQuestion">{t(view==="observation"?"trend.question.observation":view==="connections"?"trend.question.connections":"trend.question.eventWatch")}</p>

    {!data ? <section className="panel"><p className="muted">{t("common.noData")}</p></section> : null}

    {data && view==="observation" ? <>
      <section className="metrics">
        <article><span>{t("trend.currentSample")}</span><strong>{data.run_stamp.slice(11,17)}</strong><small>{formatDate(data.generated_at)}</small></article>
        <article><span>{t("trend.queriesExecuted")}</span><strong>{data.query_count}</strong><small>{sample?.sampling_strategy||t("trend.baselineStrategy")}</small></article>
        <article><span>{t("trend.raw")}</span><strong>{sample?.raw_count??data.raw_result_count}</strong><small>{formatCount(sample?.raw_count??data.raw_result_count,"sample")}</small></article>
        <article className="accent"><span>{t("trend.clean")}</span><strong>{sample?.clean_count??data.clean_result_count}</strong><small>{formatCount(evidence.length,"evidence")}</small></article>
      </section>
      <section className="grid">
        <div className="panel wide">
          <div className="panelHead"><div><p className="kicker">{t("trend.currentSample")}</p><h2>{t("trend.observedEntities")}</h2></div><p className="muted">{t("trend.samplingStrategy")} · {sample?.sampling_strategy||t("trend.baselineStrategy")}</p></div>
          <div className="trendCompareGrid">
            <div><strong>{countType("artist")}</strong><small>{t("trend.observedArtists")}</small></div>
            <div><strong>{countType("event")}</strong><small>{t("trend.observedEvents")}</small></div>
            <div><strong>{countType("venue")}</strong><small>{t("trend.observedVenues")}</small></div>
          </div>
        </div>
        <aside className="panel">
          <p className="kicker">{t("trend.observedNeeds")}</p>
          <h2>{t("trend.mobilityObservations")} · {needCount("mobility")}</h2>
          <div className="layer actionable"><span>M</span><div><strong>{needCount("mobility")}</strong><small>{t("trend.mobilityObservations")}</small></div></div>
          <div className="layer context"><span>T</span><div><strong>{needCount("timing")}</strong><small>{t("trend.timingObservations")}</small></div></div>
          <div className="layer noise"><span>S</span><div><strong>{needCount("stay")}</strong><small>{t("trend.stayObservations")}</small></div></div>
        </aside>
      </section>
      <section className="grid">
        <div className="panel wide">
          <div className="panelHead"><div><p className="kicker">{t("trend.languageDistribution")}</p><h2>{t("trend.currentSample")}</h2></div></div>
          <div className="bars">{Object.entries(v02?data.language_distribution:{}).map(([language,count])=><div className="barRow" key={language}><div className="barLabel"><span>{language}</span></div><div className="barTrack"><div className="barFill" style={{width:String(Math.max(8,(count/Math.max(1,evidence.length))*100))+"%"}} /></div><strong>{count}</strong></div>)}</div>
          {!v02?<p className="muted">{t("trend.baseline")} · {t("trend.baselineStrategy")}</p>:null}
        </div>
        <aside className="panel">
          <p className="kicker">{t("trend.snapshotComparison")}</p>
          <h2>{t("trend.currentVsPrevious")}</h2>
          <div className="trendCompareGrid">
            <div><strong>{v02?data.comparison.new_entities.length:0}</strong><small>{t("trend.newEntities")}</small></div>
            <div><strong>{v02?data.comparison.repeated_entities.length:0}</strong><small>{t("trend.repeatedEntities")}</small></div>
            <div><strong>{v02?data.comparison.dormant_links.length:0}</strong><small>{t("trend.dormantConnections")}</small></div>
          </div>
          {v02?<p className="muted">{t("trend.sampleSizeChange")} · raw {data.comparison.sample_size_change.raw>=0?"+":""}{data.comparison.sample_size_change.raw} · clean {data.comparison.sample_size_change.clean>=0?"+":""}{data.comparison.sample_size_change.clean}</p>:null}
        </aside>
      </section>
    </> : null}

    {data && view==="connections" ? <section className="panel">
      <div className="panelHead"><div><p className="kicker">{t("trend.tab.connections")}</p><h2>{t("trend.question.connections")}</h2></div><p className="muted">{formatCount(links.length,"connection")}</p></div>
      {links.length ? <div>{links.map(link=><button type="button" className="trendConnectionRow" key={link.link_id} onClick={()=>{setSelectedEvent(null);setSelectedLink(link);}}>
        <strong>{link.source_label}</strong><i>↔</i><span className="trendConnectionMeta"><strong>{link.target_label}</strong><small>{formatCount(link.sample_count,"sample")} · {formatCount(link.evidence_count,"evidence")}</small></span><span className={"trendStateBadge "+link.state}>{t(stateKey(link.state))}</span>
      </button>)}</div>:<p className="muted">{t("trend.noEvidence")}</p>}
    </section>:null}

    {data && view==="eventWatch" ? <section className="panel">
      <div className="panelHead"><div><p className="kicker">{t("trend.eventWatch")}</p><h2>{t("trend.question.eventWatch")}</h2></div></div>
      <div>{eventWatch.map(event=><button type="button" className="trendEventRow" key={event.event_id} onClick={()=>{setSelectedLink(null);setSelectedEvent(event);}}>
        <span><strong>{event.artist_name}</strong> · {event.event_name}<br/><small>{event.event_date} · {event.venue_name} · {event.city}</small></span>
        <span className="trendConnectionMeta"><strong>{event.linked_evidence.length?formatCount(event.linked_evidence.length,"evidence"):t("trend.eventNoEvidence")}</strong><small>{[...event.linked_mobility,...event.linked_timing,...event.linked_stay].join(" · ")}</small></span>
      </button>)}</div>
    </section>:null}

    {(selectedLink||selectedEvent) ? <aside className="trendEvidenceDrawer" aria-live="polite">
      <div className="trendDrawerHead"><div><p className="kicker">{t("trend.supportingEvidence")}</p><h2>{selectedLink?selectedLink.source_label+" ↔ "+selectedLink.target_label:selectedEvent?.event_name}</h2></div><button type="button" onClick={()=>{setSelectedLink(null);setSelectedEvent(null);}}>{t("common.close")}</button></div>
      {selectedLink?<div className="trendEvidenceMeta">
        <span>{t("common.firstSeen")}</span><strong>{formatDate(selectedLink.first_seen)}</strong>
        <span>{t("common.lastSeen")}</span><strong>{formatDate(selectedLink.last_seen)}</strong>
        <span>{t("trend.sampleCount")}</span><strong>{selectedLink.sample_count}</strong>
        <span>{t("trend.evidenceCount")}</span><strong>{selectedLink.evidence_count}</strong>
        <span>{t("trend.uniqueAuthors")}</span><strong>{selectedLink.unique_author_count}</strong>
        <span>{t("trend.resolutionConfidence")}</span><strong>{t("trend.confidence."+selectedLink.resolution_confidence)}</strong>
      </div>:null}
      {drawerEvidence.length?drawerEvidence.map(ev=><EvidenceCard key={ev.evidence_id} evidence={ev}/>):<p className="muted">{t("trend.eventNoEvidence")}</p>}
      {selectedEvent?.source?<a className="downloadButton" href={selectedEvent.source} target="_blank" rel="noreferrer"><span>↗</span><div><strong>{t("common.openSource")}</strong></div></a>:null}
    </aside>:null}

    <footer><span>Next Stop Live · Link Observation System V0.2</span><span>{t("trend.readOnly")}</span></footer>
  </main>;
}

function EvidenceCard({evidence}:{evidence:TrendEvidence}){
  const {t,formatDate}=useI18n();
  const artist=evidence.annotation.artists.map(x=>x.label).join(" · ")||"—";
  const event=evidence.annotation.event?.label||"—";
  const venue=evidence.annotation.venues.map(x=>x.label).join(" · ")||"—";
  const chips=[...evidence.annotation.mobility,...evidence.annotation.timing,...evidence.annotation.stay].map(x=>x.label);
  return <article className="trendEvidenceCard">
    <p>{evidence.text}</p>
    <div className="trendEvidenceMeta">
      <span>{t("trend.observedAt")}</span><strong>{formatDate(evidence.observed_at)}</strong>
      <span>{t("trend.postedAt")}</span><strong>{formatDate(evidence.posted_at)}</strong>
      <span>{t("common.language")}</span><strong>{evidence.language_context}</strong>
      <span>{t("common.queryFamily")}</span><strong>{evidence.query_family}</strong>
      <span>{t("trend.resolvedArtist")}</span><strong>{artist}</strong>
      <span>{t("trend.resolvedEvent")}</span><strong>{event}</strong>
      <span>{t("trend.resolvedVenue")}</span><strong>{venue}</strong>
      <span>{t("trend.resolutionConfidence")}</span><strong>{t("trend.confidence."+evidence.annotation.resolution_confidence)}</strong>
    </div>
    {chips.length?<div className="trendChipList">{chips.map((chip,index)=><span key={chip+index}>{chip}</span>)}</div>:null}
    {evidence.source_url?<a href={evidence.source_url} target="_blank" rel="noreferrer">{t("common.openSource")}</a>:null}
  </article>;
}
