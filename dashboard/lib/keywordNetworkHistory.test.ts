import test from "node:test";
import assert from "node:assert/strict";
import { aggregateKeywordNetworks, calendarNetworkDate, networkEdgeKey } from "./keywordNetworkHistory";
import type { KeywordNetwork } from "./keywordNetwork";

function fixture(date:string,weights:{pair:[string,string];weight:number}[],sourceCards:number):KeywordNetwork{
  return {
    schema_version:"keyword-network-v0.1",generated_at:date+"T00:00:00Z",network_date:date,
    timezone:"Asia/Taipei",refresh_policy:"daily",source_master_count:40,source_card_count:sourceCards,
    layers:["recall","need","keyword","language"],
    nodes:[
      {id:"recall:a",label:"演唱會",layer:"recall",count:2},
      {id:"need:b",label:"交通",layer:"need",count:sourceCards},
      {id:"kw:c",label:"住宿",layer:"keyword",count:sourceCards}
    ],
    edges:weights.map(({pair,weight})=>({source:pair[0],target:pair[1],weight})),
    top_keywords:{}
  };
}
const a=fixture("2026-10-15",[{pair:["recall:a","need:b"],weight:2}],3);
const b=fixture("2026-10-16",[
  {pair:["recall:a","need:b"],weight:3},
  {pair:["need:b","kw:c"],weight:1}
],4);
const c=fixture("2026-10-17",[{pair:["recall:a","need:b"],weight:1}],2);
const history=[{date:a.network_date,snapshot:a},{date:b.network_date,snapshot:b},{date:c.network_date,snapshot:c}];

test("1/3/7 day windows align to calendar dates, not just available snapshots",()=>{
  assert.equal(calendarNetworkDate("2026-01-01",-1),"2025-12-31");
  const one=aggregateKeywordNetworks(history,"2026-10-17",1);
  assert.deepEqual(one.dates,["2026-10-17"]);
  assert.equal(one.loadedDays,1);
  assert.equal(one.graph.edges[0].weight,1);
  const three=aggregateKeywordNetworks(history,"2026-10-17",3);
  assert.equal(three.loadedDays,3);
  assert.equal(three.sourceCardTotal,9);
  assert.equal(three.graph.edges.length,2);
  assert.equal(three.graph.edges.find(e=>e.source==="recall:a")?.weight,6);
  assert.equal(three.repeatedEdges,1);
  const seven=aggregateKeywordNetworks(history,"2026-10-17",7);
  assert.equal(seven.daily.length,7);
  assert.equal(seven.loadedDays,3);
  assert.equal(seven.daily.filter(x=>!x.available).length,4);
  assert.equal(seven.daily[0].sourceCards,null);
});

test("edge persistence and daily series are based on source edges only",()=>{
  const result=aggregateKeywordNetworks(history,"2026-10-17",3);
  const id=networkEdgeKey({source:"recall:a",target:"need:b"});
  assert.equal(result.edgeDays[id],3);
  assert.equal(result.trackedEdges[0].daysPresent,3);
  assert.equal(result.trackedEdges[0].dailyWeights["2026-10-16"],3);
  assert.deepEqual(result.daily.map(d=>[d.firstSeen,d.revisited]),[[1,0],[1,1],[0,1]]);
  assert.equal(result.graph.nodes.find(n=>n.id==="recall:a")?.count,6);
});

test("a missing day is not silently interpreted as an observed zero day",()=>{
  const result=aggregateKeywordNetworks([history[0],history[2]],"2026-10-17",3);
  assert.equal(result.loadedDays,2);
  assert.equal(result.daily[1].available,false);
  assert.equal(result.daily[1].edges,null);
  assert.equal(result.trackedEdges.length,1);
  assert.equal(result.trackedEdges[0].daysPresent,2);
});

test("reject mismatch of snapshot date and duplicated source-edge inference",()=>{
  const wronglyDated={...a,network_date:"2026-10-14"};
  const result=aggregateKeywordNetworks([{date:"2026-10-15",snapshot:wronglyDated}],"2026-10-15",1);
  assert.equal(result.loadedDays,0);
  assert.equal(result.trackedEdges.length,0);
});
