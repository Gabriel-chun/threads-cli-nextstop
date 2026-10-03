import { readFile } from "node:fs/promises";

const token=process.env.NOTION_TOKEN;
const pageId=process.env.NOTION_TREND_PAGE_ID;
const snapshotPath=process.env.TREND_SNAPSHOT || "collector/trend_tracking/output/trend_snapshot.json";
if(!token || !pageId){
  console.log("[trend-notion] missing token/page id; skip");
  process.exit(0);
}
const data=JSON.parse(await readFile(snapshotPath,"utf8"));
const summary=`Run ${data.run_stamp} · queries ${data.query_count} · raw ${data.raw_result_count} · clean ${data.clean_result_count} · edges ${data.active_edge_count} · observe/watch/active ${data.status_counts.observe}/${data.status_counts.watch}/${data.status_counts.active}`;
const body={children:[
  {object:"block",type:"heading_3",heading_3:{rich_text:[{type:"text",text:{content:`Trend Snapshot · ${data.generated_at.slice(0,10)}`}}]}},
  {object:"block",type:"paragraph",paragraph:{rich_text:[{type:"text",text:{content:summary}}]}}
]};
const res=await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`,{
  method:"PATCH",
  headers:{Authorization:`Bearer ${token}`,"Notion-Version":"2025-09-03","Content-Type":"application/json"},
  body:JSON.stringify(body)
});
if(!res.ok) throw new Error(`Notion sync failed: ${res.status} ${await res.text()}`);
console.log("[trend-notion] synced",summary);
