import type { SignalDeckFeedback, TriageLabel } from "./signalDeckFeedback";

const DATA_SOURCE_ID =
  process.env.NOTION_SIGNAL_REVIEW_DATA_SOURCE_ID ||
  "1c78f7c4-8325-4838-aa5b-64c6c1b88a22";
const NOTION_VERSION = "2026-03-11";

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

function notionToken() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN missing");
  return token;
}

async function notionRequest<T = any>(
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {}
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${notionToken()}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store"
    });

    if (response.ok) return (await response.json()) as T;

    const raw = await response.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.message || parsed?.code || raw;
    } catch {}

    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after") || "1");
      await new Promise((resolve) => setTimeout(resolve, Math.max(250, retryAfter * 1000)));
      continue;
    }

    throw new Error(`Notion API ${response.status}: ${detail}`);
  }

  throw new Error("Notion API retry exhausted.");
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
    "Label": select(row.label === "relevant" ? "Relevant" : row.label === "irrelevant" ? "Irrelevant" : "Unsure"),
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
  const label:TriageLabel|null=ln==="Relevant"?"relevant":ln==="Irrelevant"?"irrelevant":ln==="Unsure"?"unsure":null;
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
  const r=await notionRequest<any>(`/data_sources/${DATA_SOURCE_ID}/query`, {
    method:"POST",
    body:{filter:{property:"Post Key",rich_text:{equals:postKey}},page_size:5}
  });
  return (r.results||[]).find((x:any)=>x.object==="page")||null;
}

export async function upsertSignalReviewToNotion(row:SignalDeckFeedback){
  const page=await findByPostKey(row.post_key);
  if(page){
    await notionRequest(`/pages/${page.id}`,{method:"PATCH",body:{properties:properties(row)}});
    return {created:false,post_key:row.post_key};
  }
  await notionRequest("/pages",{
    method:"POST",
    body:{parent:{type:"data_source_id",data_source_id:DATA_SOURCE_ID},properties:properties(row)}
  });
  return {created:true,post_key:row.post_key};
}

export async function syncSignalReviewsToNotion(rows:SignalDeckFeedback[]){
  const existingRows = await listSignalReviewsFromNotion();
  const existingByKey = new Map(existingRows.map((row) => [row.post_key, row]));

  let created = 0;
  let updated = 0;
  const synced_keys: string[] = [];

  for (const row of rows) {
    const existing = existingByKey.get(row.post_key);
    if (existing?.id?.startsWith("notion_")) {
      const pageId = existing.id.slice("notion_".length);
      await notionRequest(`/pages/${pageId}`, {
        method: "PATCH",
        body: { properties: properties(row) }
      });
      updated += 1;
    } else {
      await notionRequest("/pages", {
        method: "POST",
        body: {
          parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
          properties: properties(row)
        }
      });
      created += 1;
    }
    synced_keys.push(row.post_key);
  }

  return {created,updated,synced_keys};
}

export async function listSignalReviewsFromNotion():Promise<SignalDeckFeedback[]>{
  const rows:SignalDeckFeedback[]=[];let cursor:string|undefined;
  do{
    const r=await notionRequest<any>(`/data_sources/${DATA_SOURCE_ID}/query`,{
      method:"POST",
      body:{page_size:100,...(cursor?{start_cursor:cursor}:{})}
    });
    for(const item of r.results||[]){
      if(item.object==="page"){
        const row=pageToFeedback(item);
        if(row)rows.push(row);
      }
    }
    cursor=r.has_more?(r.next_cursor||undefined):undefined;
  }while(cursor);
  return rows.sort((a,b)=>Date.parse(b.reviewed_at)-Date.parse(a.reviewed_at));
}

export async function updateSignalReviewLabelInNotion(postKey:string,label:TriageLabel){
  const page=await findByPostKey(postKey);
  if(!page)throw new Error("Review feedback not found.");
  const updated=await notionRequest<any>(`/pages/${page.id}`,{
    method:"PATCH",
    body:{properties:{"Label":select(label==="relevant"?"Relevant":label==="irrelevant"?"Irrelevant":"Unsure")}}
  });
  const row=pageToFeedback(updated);
  if(!row)throw new Error("Updated review could not be read.");
  return row;
}

export async function updateSignalReviewCategoryInNotion(postKey:string,category:string){
  const page=await findByPostKey(postKey);
  if(!page)throw new Error("Review feedback not found.");
  const updated=await notionRequest<any>(`/pages/${page.id}`,{
    method:"PATCH",
    body:{properties:{"Category":richText(category)}}
  });
  const row=pageToFeedback(updated);
  if(!row)throw new Error("Updated review could not be read.");
  return row;
}
