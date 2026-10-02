import { Client } from "@notionhq/client";
import type { SignalDeckFeedback, TriageLabel } from "./signalDeckFeedback";

const DATA_SOURCE_ID =
  process.env.NOTION_SIGNAL_REVIEW_DATA_SOURCE_ID ||
  "1c78f7c4-8325-4838-aa5b-64c6c1b88a22";

const clip = (value: unknown, max = 1900) => {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
};
const title = (value: string) => ({ title: [{ type: "text" as const, text: { content: clip(value, 200) } }] });
const richText = (value: unknown) => ({ rich_text: value ? [{ type: "text" as const, text: { content: clip(value) } }] : [] });
const select = (value: string | null | undefined) => ({ select: value ? { name: value } : null });
const date = (value: string | null | undefined) => ({ date: value ? { start: value } : null });
const url = (value: string | null | undefined) => ({ url: value || null });
const number = (value: number | null | undefined) => ({ number: value ?? null });
const multiSelect = (values: string[]) => ({ multi_select: values.map((name) => ({ name })) });

function notionClient() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN missing");
  return new Client({ auth: token, notionVersion: "2026-03-11" });
}
function plainText(prop: any) {
  if (!prop) return "";
  if (prop.type === "rich_text") return (prop.rich_text || []).map((x: any) => x.plain_text || "").join("");
  if (prop.type === "title") return (prop.title || []).map((x: any) => x.plain_text || "").join("");
  return "";
}
const selectName=(prop:any)=>prop?.type==="select"?String(prop.select?.name||""):"";
const dateValue=(prop:any)=>prop?.type==="date"?String(prop.date?.start||""):"";
const urlValue=(prop:any)=>prop?.type==="url"?String(prop.url||""):"";
const numberValue=(prop:any)=>prop?.type==="number"&&typeof prop.number==="number"?prop.number:null;
const multiSelectValues=(prop:any)=>prop?.type==="multi_select"?(prop.multi_select||[]).map((x:any)=>String(x.name||"")).filter(Boolean):[];

function properties(row: SignalDeckFeedback) {
  return {
    "Post": title(`@${row.username || "unknown"} — ${clip(row.text_excerpt, 110)}`),
    "Label": select(row.label === "relevant" ? "Relevant" : "Irrelevant"),
    "Category": richText(row.category),
    "Username": richText(row.username || ""),
    "Text": richText(row.text_excerpt),
    "Original Link": url(row.permalink || null),
    "Posted At": date(row.posted_at || null),
    "Reviewed At": date(row.reviewed_at),
    "Window": select(row.window),
    "Feature Tags": multiSelect(row.feature_tags || []),
    "Post Key": richText(row.post_key),
    "Post ID": richText(row.post_id || ""),
    "Snapshot ID": richText(row.snapshot_id),
    "Query": richText(row.query || ""),
    "Base Score": number(row.base_score),
    "Source": select("Threads")
  };
}
function pageToFeedback(page:any):SignalDeckFeedback|null {
  const p=page?.properties||{}, post_key=plainText(p["Post Key"]);
  const ln=selectName(p["Label"]);
  const label:TriageLabel|null=ln==="Relevant"?"relevant":ln==="Irrelevant"?"irrelevant":null;
  if(!post_key||!label) return null;
  const w=selectName(p["Window"]);
  const reviewed_at=dateValue(p["Reviewed At"])||String(page.last_edited_time||page.created_time||new Date().toISOString());
  return {
    id:"notion_"+String(page.id||post_key),post_key,
    post_id:plainText(p["Post ID"])||null,permalink:urlValue(p["Original Link"])||null,
    snapshot_id:plainText(p["Snapshot ID"])||"",window:w==="1d"||w==="5d"?w:"3d",
    label,original_label:null,label_updated_at:null,
    category:plainText(p["Category"])||"Uncategorized",original_category:null,category_source:"system",category_updated_at:null,
    username:plainText(p["Username"])||null,posted_at:dateValue(p["Posted At"])||null,
    query:plainText(p["Query"])||null,text_excerpt:plainText(p["Text"]),
    feature_tags:multiSelectValues(p["Feature Tags"]),base_score:numberValue(p["Base Score"])??0,
    deck_generated_at:reviewed_at,reviewed_at
  };
}
async function findByPostKey(postKey:string){
  const notion=notionClient();
  const r=await notion.dataSources.query({data_source_id:DATA_SOURCE_ID,filter:{property:"Post Key",rich_text:{equals:postKey}},page_size:5});
  return {notion,page:(r.results||[]).find((x:any)=>x.object==="page")||null};
}
export async function upsertSignalReviewToNotion(row:SignalDeckFeedback){
  const {notion,page}=await findByPostKey(row.post_key);
  if(page){await notion.pages.update({page_id:page.id,properties:properties(row) as any});return {created:false,post_key:row.post_key};}
  await notion.pages.create({parent:{type:"data_source_id",data_source_id:DATA_SOURCE_ID},properties:properties(row) as any});
  return {created:true,post_key:row.post_key};
}
export async function syncSignalReviewsToNotion(rows:SignalDeckFeedback[]){
  let created=0,updated=0; const synced_keys:string[]=[];
  for(const row of rows){const r=await upsertSignalReviewToNotion(row);r.created?created++:updated++;synced_keys.push(r.post_key);}
  return {created,updated,synced_keys};
}
export async function listSignalReviewsFromNotion():Promise<SignalDeckFeedback[]>{
  const notion=notionClient(),rows:SignalDeckFeedback[]=[];let cursor:string|undefined;
  do{
    const r=await notion.dataSources.query({data_source_id:DATA_SOURCE_ID,page_size:100,...(cursor?{start_cursor:cursor}:{})});
    for(const item of r.results||[]){if(item.object==="page"){const row=pageToFeedback(item);if(row)rows.push(row);}}
    cursor=r.has_more?(r.next_cursor||undefined):undefined;
  }while(cursor);
  return rows.sort((a,b)=>Date.parse(b.reviewed_at)-Date.parse(a.reviewed_at));
}
export async function updateSignalReviewLabelInNotion(postKey:string,label:TriageLabel){
  const {notion,page}=await findByPostKey(postKey); if(!page)throw new Error("Review feedback not found.");
  const updated=await notion.pages.update({page_id:page.id,properties:{"Label":select(label==="relevant"?"Relevant":"Irrelevant")} as any});
  const row=pageToFeedback(updated); if(!row)throw new Error("Updated review could not be read."); return row;
}
export async function updateSignalReviewCategoryInNotion(postKey:string,category:string){
  const {notion,page}=await findByPostKey(postKey); if(!page)throw new Error("Review feedback not found.");
  const updated=await notion.pages.update({page_id:page.id,properties:{"Category":richText(category)} as any});
  const row=pageToFeedback(updated); if(!row)throw new Error("Updated review could not be read."); return row;
}
