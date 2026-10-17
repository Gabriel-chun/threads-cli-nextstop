import test from "node:test";import assert from "node:assert/strict";
import {makeExplorationAtlas} from "./exploreAtlas";import type {ExplorationObject} from "./explorationObjects";
const object=(id:string,label:string,kind:"keyword"|"relation"="keyword"):ExplorationObject=>({id,label,kind,context:"",detail:"",terms:"",evidenceCount:2,sourceUrl:null,href:null});
test("only documented graph edges are connected, never geometric neighbors",()=>{
 const items=[object("keyword:a","A"),object("keyword:b","B"),object("keyword:c","C")];
 const overlay:any={trackedEdges:[{source:"a",target:"b",weight:3,daysPresent:2}]};
 const graph=makeExplorationAtlas(items,overlay);
 assert.equal(graph.edges.length,1);assert.equal(graph.edges[0].days,2);
 assert.ok(!graph.edges.some(x=>x.source==="keyword:c"||x.target==="keyword:c"));
});
test("relation objects connect only exact labeled endpoints",()=>{
 const items=[object("keyword:a","A"),object("keyword:b","B"),object("relation:ab","A ↔ B","relation"),object("keyword:c","Z")];
 assert.equal(makeExplorationAtlas(items,null).edges.length,2);
});
