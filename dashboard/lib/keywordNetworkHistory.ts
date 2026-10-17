import type { KeywordNetwork, KeywordNetworkEdge, KeywordNetworkNode } from "./keywordNetwork";

export type NetworkWindow = 1 | 3 | 7;
export type DatedNetwork = { date: string; snapshot: KeywordNetwork | null };
export type DayGraphStats = {
  date: string; available: boolean; sourceCards: number | null;
  nodes: number | null; edges: number | null; firstSeen: number | null; revisited: number | null;
};
export type TrackedKeywordEdge = KeywordNetworkEdge & {
  daysPresent: number; dailyWeights: Record<string, number>;
};
export type KeywordNetworkOverlay = {
  graph: KeywordNetwork;
  dates: string[];
  daily: DayGraphStats[];
  trackedEdges: TrackedKeywordEdge[];
  nodeDays: Record<string, number>;
  edgeDays: Record<string, number>;
  loadedDays: number;
  sourceCardTotal: number;
  repeatedEdges: number;
};

export function calendarNetworkDate(anchor: string, offset: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error("Invalid network anchor date");
  const [year,month,day]=anchor.split("-").map(Number);
  const date=new Date(Date.UTC(year,month-1,day+offset));
  return date.toISOString().slice(0,10);
}

/** Direction is preserved: a semantic link is never inferred from spatial proximity. */
export function networkEdgeKey(edge: Pick<KeywordNetworkEdge, "source"|"target">): string {
  return JSON.stringify([edge.source,edge.target]);
}

/**
 * Merge canonical daily snapshots only. "Total" is the sum of daily observations:
 * it is not a de-duplicated count of unique people, posts, or demand.
 * Missing days remain missing; they do not become zero-valued snapshots.
 */
export function aggregateKeywordNetworks(
  snapshots: DatedNetwork[], anchor: string, window: NetworkWindow
): KeywordNetworkOverlay {
  const dates=Array.from({length:window},(_,i)=>calendarNetworkDate(anchor,i+1-window));
  const lookup=new Map(snapshots.filter(s=>s.snapshot?.network_date===s.date).map(s=>[s.date,s.snapshot as KeywordNetwork]));
  const nodes=new Map<string, KeywordNetworkNode>();
  const edges=new Map<string, TrackedKeywordEdge>();
  const nodeDays:Record<string,number>={};
  const daily:DayGraphStats[]=[];
  const seen=new Set<string>();
  let sourceCardTotal=0;
  for(const date of dates) {
    const snapshot=lookup.get(date);
    if(!snapshot){
      daily.push({date,available:false,sourceCards:null,nodes:null,edges:null,firstSeen:null,revisited:null});
      continue;
    }
    sourceCardTotal+=Math.max(0,snapshot.source_card_count||0);
    const dayNodes=new Set<string>();
    for(const node of snapshot.nodes) {
      if(!Number.isFinite(node.count)||node.count<=0)continue;
      const existing=nodes.get(node.id);
      if(existing){existing.count+=node.count;}
      else nodes.set(node.id,{...node,count:node.count});
      if(!dayNodes.has(node.id)){
        nodeDays[node.id]=(nodeDays[node.id]||0)+1;
        dayNodes.add(node.id);
      }
    }
    const todayEdges=new Map<string,KeywordNetworkEdge>();
    for(const edge of snapshot.edges){
      if(!Number.isFinite(edge.weight)||edge.weight<=0)continue;
      const key=networkEdgeKey(edge);
      const inDay=todayEdges.get(key);
      if(inDay)inDay.weight+=edge.weight;
      else todayEdges.set(key,{...edge,weight:edge.weight});
    }
    let firstSeen=0,revisited=0;
    for(const [key,edge] of todayEdges){
      if(!nodes.has(edge.source)||!nodes.has(edge.target))continue;
      if(seen.has(key))revisited++;
      else {firstSeen++;seen.add(key);}
      const item=edges.get(key);
      if(item){item.weight+=edge.weight;item.daysPresent++;item.dailyWeights[date]=edge.weight;}
      else edges.set(key,{...edge,daysPresent:1,dailyWeights:{[date]:edge.weight}});
    }
    daily.push({date,available:true,sourceCards:snapshot.source_card_count,nodes:dayNodes.size,edges:todayEdges.size,firstSeen,revisited});
  }
  const graphNodes=[...nodes.values()].sort((a,b)=>a.layer.localeCompare(b.layer)||b.count-a.count||a.id.localeCompare(b.id));
  const trackedEdges=[...edges.values()].sort((a,b)=>b.daysPresent-a.daysPresent||b.weight-a.weight||networkEdgeKey(a).localeCompare(networkEdgeKey(b)));
  const graphEdges=trackedEdges.map(({source,target,weight})=>({source,target,weight}));
  const latest=lookup.get(anchor)||snapshots.find(s=>s.snapshot)?.snapshot;
  const graph:KeywordNetwork={
    schema_version:"keyword-network-v0.1",
    generated_at:latest?.generated_at||"",
    network_date:anchor,
    timezone:"Asia/Taipei",
    refresh_policy:latest?.refresh_policy||"daily_00:00_with_collector_fallback",
    source_master_count:latest?.source_master_count||0,
    source_card_count:sourceCardTotal,
    layers:latest?.layers||["recall","language","need","keyword"],
    nodes:graphNodes,
    edges:graphEdges,
    top_keywords:{}
  };
  return {
    graph,dates,daily,trackedEdges,nodeDays,
    edgeDays:Object.fromEntries(trackedEdges.map(e=>[networkEdgeKey(e),e.daysPresent])),
    loadedDays:daily.filter(row=>row.available).length,
    sourceCardTotal,
    repeatedEdges:trackedEdges.filter(e=>e.daysPresent>1).length
  };
}
