"use client";
import {useMemo,useState} from "react";
import {useI18n} from "./I18nProvider";
import {searchExplorationObjects,type ExplorationKind,type ExplorationObject} from "../lib/explorationObjects";

export function ExplorationWorkspace({items}:{items:ExplorationObject[]}){
  const {t}=useI18n();
  const [query,setQuery]=useState("");
  const [focus,setFocus]=useState<string|null>(null);
  const [kind,setKind]=useState<ExplorationKind|"all">("all");
  const matches=useMemo(()=>searchExplorationObjects(items,query).filter(item=>kind==="all"||item.kind===kind),[items,query,kind]);
  const selected=matches.find(item=>item.id===focus)||null;
  return <main className="networkWorkspace quietWorkspace quietExplore">
    <header className="workspaceHeader quietWorkspaceHeader"><div><p className="eyebrow">NEXT STOP LIVE / EXPLORE</p><h1>{t("explore.title")}</h1><p className="muted">{t("explore.lead")}</p></div></header>
    <div className="exploreQuery">
      <label htmlFor="exploreSearch">{t("explore.searchLabel")}</label>
      <input id="exploreSearch" type="search" value={query} autoComplete="off" placeholder={t("explore.placeholder")} onChange={e=>{setQuery(e.target.value);setFocus(null);}}/>
      {query?<button type="button" onClick={()=>{setQuery("");setFocus(null);setKind("all");}}>{t("common.clear")}</button>:null}
    </div>
    {!query.trim()?<div className="exploreEmpty"><p>{t("explore.empty")}</p><small>{t("explore.archiveNote")}</small></div>:<>
      <div className="exploreFilters" role="group" aria-label={t("explore.filterLabel")}>
        {(["all","need","event","relation","keyword"] as const).map(k=><button type="button" key={k} className={kind===k?"active":""} aria-pressed={kind===k} onClick={()=>{setKind(k);setFocus(null);}}>{t("explore.type."+k)}</button>)}
      </div>
      <p className="exploreResultsCount">{t("explore.resultCount",{count:matches.length})}</p>
      {!matches.length?<p className="exploreNoResults">{t("explore.noResults")}</p>:<div className="exploreResults">
        <div className="exploreObjectList">{matches.map(item=><button key={item.id} type="button" className={"exploreObject"+(selected?.id===item.id?" active":"")} onClick={()=>setFocus(selected?.id===item.id?null:item.id)}>
          <span className="exploreObjectDot" data-kind={item.kind}/><span><strong>{item.label}</strong><small>{t("explore.type."+item.kind)} · {item.context}</small></span>
          {item.evidenceCount!==null?<em>{item.evidenceCount}</em>:null}
        </button>)}</div>
        {selected?<aside className="exploreObjectDetail"><div className="exploreDetailHead"><small>{t("explore.type."+selected.kind)}</small><button type="button" onClick={()=>setFocus(null)}>{t("common.close")}</button></div>
          <h2>{selected.label}</h2><p>{selected.context}</p>
          {selected.detail?<p className="exploreDetailText">{selected.detail}</p>:null}
          {selected.evidenceCount!==null?<small>{t("explore.observedCount",{count:selected.evidenceCount})}</small>:null}
          <div className="exploreDetailLinks">{selected.sourceUrl?<a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">{t("common.openSource")}</a>:null}
          {selected.href?<a href={selected.href}>{t("explore.openArchive")} ↗</a>:null}</div>
        </aside>:null}
      </div>}
    </>}
  </main>;
}
