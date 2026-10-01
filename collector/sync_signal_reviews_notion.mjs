import { Client } from "@notionhq/client";
import { readFile } from "node:fs/promises";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID =
  process.env.NOTION_SIGNAL_REVIEW_DATA_SOURCE_ID ||
  "1c78f7c4-8325-4838-aa5b-64c6c1b88a22";
const archivePath = process.argv[2] || process.env.REVIEW_ARCHIVE_PATH;

if (!NOTION_TOKEN) throw new Error("NOTION_TOKEN is missing");
if (!archivePath) throw new Error("review archive path is required");

const notion = new Client({ auth: NOTION_TOKEN, notionVersion: "2026-03-11" });
const payload = JSON.parse(await readFile(archivePath, "utf8"));
if (payload?.schema_version !== "signal-review-archive-v0.1") {
  throw new Error("Unsupported review archive schema");
}
const rows = Array.isArray(payload.rows) ? payload.rows : [];

const clip = (value, max = 1900) => {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
};
const title = (value) => ({ title: [{ type: "text", text: { content: clip(value, 200) } }] });
const richText = (value) => ({ rich_text: value ? [{ type: "text", text: { content: clip(value) } }] : [] });
const select = (value) => ({ select: value ? { name: String(value) } : null });
const date = (value) => ({ date: value ? { start: String(value) } : null });
const url = (value) => ({ url: value ? String(value) : null });
const number = (value) => ({ number: value === null || value === undefined || value === "" ? null : Number(value) });
const multiSelect = (values) => ({ multi_select: Array.isArray(values) ? values.map((name) => ({ name: String(name) })) : [] });

function properties(row) {
  return {
    "Post": title(`@${row.username || "unknown"} — ${clip(row.text_excerpt, 110)}`),
    "Label": select(row.label === "relevant" ? "Relevant" : "Irrelevant"),
    "Category": richText(row.category),
    "Username": richText(row.username || ""),
    "Text": richText(row.text_excerpt || ""),
    "Original Link": url(row.permalink || null),
    "Posted At": date(row.posted_at || null),
    "Reviewed At": date(row.reviewed_at || null),
    "Window": select(row.window || null),
    "Feature Tags": multiSelect(row.feature_tags || []),
    "Post Key": richText(row.post_key || ""),
    "Post ID": richText(row.post_id || ""),
    "Snapshot ID": richText(row.snapshot_id || ""),
    "Query": richText(row.query || ""),
    "Base Score": number(row.base_score),
    "Source": select("Threads")
  };
}

async function findByPostKey(postKey) {
  const result = await notion.dataSources.query({
    data_source_id: DATA_SOURCE_ID,
    filter: { property: "Post Key", rich_text: { equals: postKey } },
    page_size: 5
  });
  return (result.results || []).find((item) => item.object === "page") || null;
}

let created = 0;
let updated = 0;

for (const row of rows) {
  if (!row?.post_key) continue;
  const existing = await findByPostKey(row.post_key);
  if (existing) {
    await notion.pages.update({ page_id: existing.id, properties: properties(row) });
    updated += 1;
  } else {
    await notion.pages.create({
      parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
      properties: properties(row)
    });
    created += 1;
  }
}

console.log(JSON.stringify({
  archive_date: payload.archive_date,
  rows: rows.length,
  created,
  updated
}, null, 2));
