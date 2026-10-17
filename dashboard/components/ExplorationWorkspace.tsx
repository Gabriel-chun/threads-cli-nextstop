"use client";
import {useMemo,useState} from "react";
import {ExploreParticleMap} from "./ExploreParticleMap";
import {selectQuietAtlasObjects} from "../lib/quietAtlas";
import {makeExplorationAtlas} from "../lib/exploreAtlas";
import type {KeywordNetworkOverlay,NetworkWindow} from "../lib/keywordNetworkHistory";
import {useI18n} from "./I18nProvider";
import {searchExplorationObjects,type ExplorationKind,type ExplorationObject} from "../lib/explorationObjects";

export function ExplorationWorkspace({items,overlays}:{items:ExplorationObject[];overlays:Record<NetworkWindow,KeywordNetworkOverlay>|null}){
  const {t}=useI18n();
  const [query,setQuery]=useState("");
  const [days,setDays]=useState<NetworkWindow>(1);
  const [focus,setFocus]=useState<string|null>(null);
  const [kind,setKind]=useState<ExplorationKind|"all">("all");
  const matches=useMemo(()=>searchExplorationObjects(items,query).filter(item=>kind==="all"||item.kind===kind),[items,query,kind]);
  const atlas=useMemo(()=>makeExplorationAtlas(items,overlays?.[days]||null),[items,overlays,days]);
  const allowed=new Set((overlays?.[days]?.graph.nodes||[]).filter(n=>n.count>0).map(n=>"keyword:"+n.id));
  const particles=atlas.items.filter(item=>item.kind!=="keyword"||allowed.has(item.id));
  const visible=useMemo(()=>selectQuietAtlasObjects(particles,atlas.edges,{kind,query,matches:matches.map(x=>x.id),focused:focus,limit:20}),[particles,atlas.edges,kind,query,matches,focus]);
  const selected=items.find(item=>item.id===focus)||null;
  return <main className="networkWorkspace quietWorkspace quietExplore">
    <header className="workspaceHeader quietWorkspaceHeader"><div><p className="eyebrow">NEXT STOP LIVE / EXPLORE</p><h1>{t("explore.title")}</h1><p className="muted">{t("explore.lead")}</p></div></header>
    <div className="exploreQuery">
      <label htmlFor="exploreSearch">{t("explore.searchLabel")}</label>
      <input id="exploreSearch" type="search" value={query} autoComplete="off" placeholder={t("explore.placeholder")} onChange={e=>{setQuery(e.target.value);setFocus(null);}}/>
      {query?<button type="button" onClick={()=>{setQuery("");setFocus(null);setKind("all");}}>{t("common.clear")}</button>:null}
    </div>
    <div className="exploreAtlasTools">
      <div className="exploreFilters" role="group" aria-label={t("explore.filterLabel")}>
        {(["all","need","event","relation","keyword"] as const).map(k=><button type="button" key={k} className={kind===k?"active":""} aria-pressed={kind===k} onClick={()=>{setKind(k);setFocus(null);}}>{t("explore.type."+k)}</button>)}
      </div>
      <div className="exploreFilters" role="group" aria-label={t("explore.windowLabel")}>
        {([1,3,7] as const).map(n=><button type="button" className={days===n?"active":""} aria-pressed={days===n} key={n} onClick={()=>{setDays(n);setFocus(null);}}>{t("explore.window."+n)}</button>)}
      </div>
    </div>
    <div className="exploreAtlasLayout">
      <ExploreParticleMap items={visible} edges={atlas.edges} focused={focus} onFocus={setFocus} query={query} matches={matches.map(x=>x.id)}/>
      <aside className="exploreAtlasSide">
        {selected?<div className="exploreObjectDetail"><div className="exploreDetailHead"><small>{t("explore.type."+selected.kind)}</small><button type="button" onClick={()=>setFocus(null)}>{t("common.close")}</button></div>
          <h2>{selected.label}</h2><p>{selected.context}</p>
          {selected.detail?<p className="exploreDetailText">{selected.detail}</p>:null}
          {selected.evidenceCount!==null?<small>{t("explore.observedCount",{count:selected.evidenceCount})}</small>:null}
          <div className="exploreDetailLinks">{selected.sourceUrl?<a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">{t("common.openSource")}</a>:null}{selected.href?<a href={selected.href}>{t("explore.openArchive")} ↗</a>:null}</div>
        </div>:<div className="exploreAtlasHint"><p>{t("explore.particleHint")}</p><small>{overlays?t("explore.availableDays",{count:overlays[days].loadedDays,total:days}):t("explore.archiveNote")}</small></div>}
        {query.trim()?<div className="exploreMatchList">
          <small>{t("explore.resultCount",{count:matches.length})}</small>
          {matches.length?matches.filter(o=>kind==="all"||o.kind===kind).slice(0,10).map(item=><button type="button" key={item.id} onClick={()=>setFocus(item.id)}>{item.label}</button>):<p>{t("explore.noResults")}</p>}
        </div>:null}
      </aside>
    </div>
  </main>;
}
