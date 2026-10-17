import type { AtlasEdge } from "./exploreAtlas";
import type { ExplorationKind, ExplorationObject } from "./explorationObjects";

export type AtlasSelection={
  kind:ExplorationKind|"all";
  query:string;
  matches:string[];
  focused:string|null;
  limit?:number;
};

/**
 * Keep the resting atlas sparse. Search reveals matching objects and their
 * evidence-backed neighbors. Visual proximity never creates a semantic edge.
 */
export function selectQuietAtlasObjects(
  items:ExplorationObject[],edges:AtlasEdge[],selection:AtlasSelection
):ExplorationObject[]{
  const limit=Math.min(48,Math.max(5,selection.limit??22));
  const candidates=items.filter(item=>selection.kind==="all"||item.kind===selection.kind);
  const candidateIds=new Set(candidates.map(item=>item.id));
  const connections=new Map<string,{id:string;strength:number}[]>();
  for(const edge of edges){
    if(!candidateIds.has(edge.source)||!candidateIds.has(edge.target))continue;
    const strength=Math.max(1,edge.days)*Math.sqrt(Math.max(1,edge.weight));
    connections.set(edge.source,[...(connections.get(edge.source)||[]),{id:edge.target,strength}]);
    connections.set(edge.target,[...(connections.get(edge.target)||[]),{id:edge.source,strength}]);
  }
  const score=(item:ExplorationObject)=>{
    const direct=connections.get(item.id)||[];
    const evidence=Math.log1p(Math.max(0,item.evidenceCount||0));
    const relationship=direct.reduce((total,c)=>total+c.strength,0);
    // Demand and visible evidence are useful anchors, not synthetic connections.
    const kindWeight=item.kind==="need"?5:item.kind==="relation"?1.8:item.kind==="event"?1.2:0;
    return relationship*2+Math.min(6,evidence)+kindWeight;
  };
  const ordered=[...candidates].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
  const selected=new Set<string>();
  const add=(id:string|null)=>{
    if(id&&candidateIds.has(id)&&selected.size<limit)selected.add(id);
  };
  if(selection.focused)add(selection.focused);
  if(selection.query.trim()){
    for(const id of selection.matches)add(id);
    for(const id of [...selected]){
      const linked=[...(connections.get(id)||[])].sort((a,b)=>b.strength-a.strength);
      for(const neighbor of linked.slice(0,4))add(neighbor.id);
    }
    // No unrelated dots when searching.
  }else{
    // Seed with the most informative, connected objects, then their neighbors.
    for(const item of ordered){
      if(selected.size>=limit)break;
      if(selected.has(item.id))continue;
      add(item.id);
      for(const neighbor of [...(connections.get(item.id)||[])].sort((a,b)=>b.strength-a.strength).slice(0,2))add(neighbor.id);
    }
  }
  return candidates.filter(item=>selected.has(item.id));
}
