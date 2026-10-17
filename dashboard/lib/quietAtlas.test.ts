import test from "node:test";
import assert from "node:assert/strict";
import {selectQuietAtlasObjects} from "./quietAtlas";
import type {ExplorationObject} from "./explorationObjects";
import type {AtlasEdge} from "./exploreAtlas";
const item=(id:string,kind:"need"|"event"|"keyword"="keyword"):ExplorationObject=>({
 id,kind,label:id,context:"",detail:"",terms:id,evidenceCount:3,sourceUrl:null,href:null
});
const items=Array.from({length:90},(_,i)=>item("n"+i,i===0?"need":"keyword"));
const edges:AtlasEdge[]=[{source:"n0",target:"n1",weight:8,days:3},{source:"n1",target:"n2",weight:4,days:2}];
test("resting atlas never displays all archived objects",()=>{
 const shown=selectQuietAtlasObjects(items,edges,{kind:"all",query:"",matches:[],focused:null});
 assert.ok(shown.length<=22);
 assert.ok(shown.some(x=>x.id==="n0"));
 assert.ok(shown.some(x=>x.id==="n1"));
});
test("search shows matches and actual neighboring nodes, not unrelated nodes",()=>{
 const shown=selectQuietAtlasObjects(items,edges,{kind:"all",query:"n0",matches:["n0"],focused:null});
 assert.deepEqual(shown.map(x=>x.id),["n0","n1"]);
});
test("type filter and focus respect available objects",()=>{
 const filtered=selectQuietAtlasObjects(items,edges,{kind:"need",query:"",matches:[],focused:"n3"});
 assert.deepEqual(filtered.map(x=>x.id),["n0"]);
 const searched=selectQuietAtlasObjects(items,edges,{kind:"all",query:"n89",matches:["n89"],focused:null});
 assert.deepEqual(searched.map(x=>x.id),["n89"]);
});
