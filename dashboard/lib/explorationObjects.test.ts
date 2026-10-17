import test from "node:test";
import assert from "node:assert/strict";
import {buildExplorationObjects,searchExplorationObjects} from "./explorationObjects";
import type {KeywordNetwork} from "./keywordNetwork";
import type {ReviewIntelligence} from "./trendRadar";

const review:ReviewIntelligence={
 schema_version:"review-intelligence-v0.1",generated_at:"2026-10-17",source:"archive",
 review_counts:{total:10,relevant:4,irrelevant:6},positive_patterns:{},negative_patterns:{},category_stats:{},feature_stats:{},
 demand_clusters:[{cluster_id:"post_show_return",label_zh:"散場返程",label_en:"Post-show return",relevant_count:4,irrelevant_count:2,affiliate_fit:"ready",solution_map:["高鐵","接送"],evidence:[]}]
};
const network:KeywordNetwork={
 schema_version:"keyword-network-v0.1",generated_at:"2026-10-17",network_date:"2026-10-17",timezone:"Asia/Taipei",refresh_policy:"daily",
 source_master_count:30,source_card_count:3,layers:["need","keyword"],top_keywords:{},
 nodes:[{id:"need:a",label:"散場交通",layer:"need",count:3},{id:"kw:b",label:"接送",layer:"keyword",count:2},{id:"kw:c",label:"其他",layer:"keyword",count:0}],
 edges:[{source:"need:a",target:"kw:b",weight:2}]
};
test("exploration objects are derived only from archived observations",()=>{
 const objects=buildExplorationObjects({review,trend:null,network});
 assert.equal(objects.filter(x=>x.kind==="need").length,1);
 assert.equal(objects.filter(x=>x.kind==="keyword").length,2);
 assert.equal(objects.find(x=>x.id==="keyword:need:a")?.detail,"接送");
 assert.ok(!objects.some(x=>x.label==="其他"));
});
test("no default accumulated list, search matches case-insensitively and across object fields",()=>{
 const objects=buildExplorationObjects({review,trend:null,network});
 assert.deepEqual(searchExplorationObjects(objects,""),[]);
 assert.equal(searchExplorationObjects(objects,"POST-SHOW").length,1);
 assert.ok(searchExplorationObjects(objects,"散場 交通").some(x=>x.label==="散場交通"));
 assert.equal(searchExplorationObjects(objects,"完全不存在").length,0);
});
test("search results have stable bounded ranking and reject unsafe source links",()=>{
 const objects=buildExplorationObjects({review,trend:null,network});
 assert.equal(searchExplorationObjects(objects,"接送",1).length,1);
 assert.ok(objects.every(x=>!x.sourceUrl || /^https?:\/\//.test(x.sourceUrl)));
});
