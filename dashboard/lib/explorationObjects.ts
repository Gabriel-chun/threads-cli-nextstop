import type { KeywordNetwork } from "./keywordNetwork";
import type { ReviewIntelligence, TrendRadar, TrendObservationV02 } from "./trendRadar";
import { isTrendObservation } from "./trendRadar";

export type ExplorationKind="need"|"event"|"relation"|"keyword";
export type ExplorationObject={
  id:string;
  kind:ExplorationKind;
  label:string;
  context:string;
  detail:string;
  terms:string;
  evidenceCount:number|null;
  sourceUrl:string|null;
  href:string|null;
};

function safeUrl(value:unknown):string|null{
  if(typeof value!=="string")return null;
  try {const url=new URL(value);return url.protocol==="https:"||url.protocol==="http:"?url.toString():null;}
  catch {return null;}
}

export function buildExplorationObjects({
  review,trend,network
}:{
  review:ReviewIntelligence|null;
  trend:TrendRadar|null;
  network:KeywordNetwork|null;
}):ExplorationObject[]{
  const items:ExplorationObject[]=[];
  if(review)for(const cluster of review.demand_clusters){
    items.push({
      id:"need:"+cluster.cluster_id,kind:"need",
      label:cluster.label_zh||cluster.label_en||cluster.cluster_id,
      context:cluster.label_en||cluster.cluster_id,
      detail:cluster.solution_map.slice(0,3).join(" · ")||cluster.evidence[0]?.text?.slice(0,180)||"",
      terms:[cluster.cluster_id,cluster.label_en,cluster.label_zh,...cluster.solution_map].join(" "),
      evidenceCount:cluster.relevant_count,
      sourceUrl:null,
      href:"/trends"
    });
  }
  if(isTrendObservation(trend)){
    const v02:TrendObservationV02=trend;
    const evidence=new Map(v02.evidence.map(e=>[e.evidence_id,e]));
    for(const event of v02.event_watch){
      const refs=event.linked_evidence.map(id=>evidence.get(id)).filter(Boolean);
      items.push({
        id:"event:"+event.event_id,kind:"event",
        label:event.event_name||event.artist_name||event.event_id,
        context:[event.artist_name,event.city,event.venue_name,event.event_date].filter(Boolean).join(" · "),
        detail:refs[0]?.text?.slice(0,180)||"",
        terms:[event.artist_name,event.venue_name,event.city,event.event_date,event.event_name].join(" "),
        evidenceCount:refs.length,
        sourceUrl:safeUrl(event.source)||safeUrl(refs[0]?.source_url),
        href:"/trends?view=eventWatch"
      });
    }
    for(const link of v02.links){
      const first=link.supporting_evidence?.[0] || link.evidence_ids.map(id=>evidence.get(id)).find(Boolean);
      items.push({
        id:"relation:"+link.link_id,kind:"relation",
        label:link.source_label+" ↔ "+link.target_label,
        context:[link.relation_type,link.state].filter(Boolean).join(" · "),
        detail:first?.text?.slice(0,180)||"",
        terms:[link.source_label,link.target_label,link.source_type,link.target_type,link.relation_type].join(" "),
        evidenceCount:link.evidence_count,
        sourceUrl:safeUrl(first?.source_url),
        href:"/trends?view=connections"
      });
    }
  }
  if(network){
    const map=new Map(network.nodes.filter(n=>n.count>0).map(n=>[n.id,n]));
    for(const node of map.values()){
      const connected=network.edges.filter(edge=>edge.source===node.id||edge.target===node.id)
        .map(edge=>map.get(edge.source===node.id?edge.target:edge.source)?.label).filter((x):x is string=>Boolean(x));
      items.push({
        id:"keyword:"+node.id,kind:"keyword",
        label:node.label,context:node.layer,
        detail:connected.length?connected.slice(0,4).join(" · "):"",
        terms:[node.label,node.layer,...connected].join(" "),
        evidenceCount:node.count,
        sourceUrl:null,
        href:"/network"
      });
    }
  }
  return items;
}

export function searchExplorationObjects(items:ExplorationObject[],rawQuery:string,limit=24):ExplorationObject[]{
  const query=rawQuery.normalize("NFKC").trim().toLocaleLowerCase();
  if(!query)return [];
  const terms=query.split(/\s+/).filter(Boolean);
  return items.map((item,index)=>{
    const label=item.label.normalize("NFKC").toLocaleLowerCase();
    const text=[item.label,item.context,item.detail,item.terms].join(" ").normalize("NFKC").toLocaleLowerCase();
    if(!terms.every(term=>text.includes(term)))return null;
    const score=(label===query?100:label.startsWith(query)?70:label.includes(query)?45:0)+
      (item.kind==="need"?8:0)+Math.min(12,Math.max(0,item.evidenceCount??0));
    return {item,score,index};
  }).filter((v):v is {item:ExplorationObject;score:number;index:number}=>v!==null)
    .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(v=>v.item);
}
