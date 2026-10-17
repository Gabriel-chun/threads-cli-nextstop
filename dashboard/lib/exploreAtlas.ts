import type { ExplorationObject } from "./explorationObjects";
import type { KeywordNetworkOverlay } from "./keywordNetworkHistory";

export type AtlasEdge={source:string;target:string;weight:number;days:number};
export type AtlasGraph={items:ExplorationObject[];edges:AtlasEdge[]};
function norm(s:string){return s.normalize("NFKC").toLocaleLowerCase().trim();}
export function makeExplorationAtlas(items:ExplorationObject[], overlay:KeywordNetworkOverlay|null):AtlasGraph{
 const edges=new Map<string,AtlasEdge>();
 const ids=new Set(items.map(x=>x.id));
 const add=(a:string,b:string,w:number,days=1)=>{
   if(a===b||!ids.has(a)||!ids.has(b))return;
   const key=JSON.stringify([a,b].sort());
   const prior=edges.get(key);
   if(prior){prior.weight=Math.max(prior.weight,w);prior.days=Math.max(prior.days,days);}
   else edges.set(key,{source:a,target:b,weight:w,days});
 };
 if(overlay)for(const edge of overlay.trackedEdges) add("keyword:"+edge.source,"keyword:"+edge.target,edge.weight,edge.daysPresent);
 // Relations are already evidence-backed objects. Attach them only when their exact
 // source/target labels identify distinct archived items, never merely by proximity.
 const byLabel=new Map<string,string[]>();
 for(const item of items){const key=norm(item.label);byLabel.set(key,[...(byLabel.get(key)||[]),item.id]);}
 for(const relation of items.filter(x=>x.kind==="relation")){
   const [a,b]=relation.label.split(" ↔ ");
   if(!a||!b)continue;
   for(const label of [a,b]){
     for(const target of byLabel.get(norm(label))||[])if(target!==relation.id)add(relation.id,target,Math.max(1,relation.evidenceCount||1));
   }
 }
 return {items,edges:[...edges.values()]};
}
