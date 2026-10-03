import { readFile } from "node:fs/promises";

const token=process.env.NOTION_TOKEN;
const pageId=process.env.NOTION_TREND_PAGE_ID;
const snapshotPath=process.env.TREND_SNAPSHOT || "collector/trend_tracking/output/trend_snapshot.json";
if(!token || !pageId){
  console.log("[trend-notion] missing token/page id; skip");
  process.exit(0);
}
const data=JSON.parse(await readFile(snapshotPath,"utf8"));
const sample=data.sample||{};
const states=data.link_states||{};
const count=(key)=>states[key]?.count||0;
const summary="Run "+data.run_stamp+" · strategy "+(sample.sampling_strategy||"unknown")+" · queries "+data.query_count+" · raw "+(sample.raw_count??data.raw_result_count)+" · clean "+(sample.clean_count??data.clean_result_count)+" · evidence "+(data.evidence||[]).length+" · links "+(data.links||[]).length+" · new/repeated/persistent/expanding/dormant "+count("new")+"/"+count("repeated")+"/"+count("persistent")+"/"+count("expanding")+"/"+count("dormant");
const body={children:[
  {object:"block",type:"heading_3",heading_3:{rich_text:[{type:"text",text:{content:"Trend Observation · "+data.generated_at.slice(0,10)}}]}},
  {object:"block",type:"paragraph",paragraph:{rich_text:[{type:"text",text:{content:summary}}]}}
]};
const res=await fetch("https://api.notion.com/v1/blocks/"+pageId+"/children",{
  method:"PATCH",
  headers:{Authorization:"Bearer "+token,"Notion-Version":"2025-09-03","Content-Type":"application/json"},
  body:JSON.stringify(body)
});
if(!res.ok) throw new Error("Notion sync failed: "+res.status+" "+await res.text());
console.log("[trend-notion] synced",summary);
