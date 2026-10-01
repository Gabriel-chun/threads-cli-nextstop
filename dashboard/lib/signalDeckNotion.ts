import { Client } from "@notionhq/client";
import type { SignalDeckFeedback } from "./signalDeckFeedback";

const DATA_SOURCE_ID =
  process.env.NOTION_SIGNAL_REVIEW_DATA_SOURCE_ID ||
  "1c78f7c4-8325-4838-aa5b-64c6c1b88a22";

const clip = (value: unknown, max = 1900) => {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
};

const title = (value: string) => ({
  title: [{ type: "text" as const, text: { content: clip(value, 200) } }]
});
const richText = (value: unknown) => ({
  rich_text: value ? [{ type: "text" as const, text: { content: clip(value) } }] : []
});
const select = (value: string | null | undefined) => ({
  select: value ? { name: value } : null
});
const date = (value: string | null | undefined) => ({
  date: value ? { start: value } : null
});
const url = (value: string | null | undefined) => ({
  url: value || null
});
const number = (value: number | null | undefined) => ({
  number: value ?? null
});
const multiSelect = (values: string[]) => ({
  multi_select: values.map((name) => ({ name }))
});

function notionClient() {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return new Client({ auth: token, notionVersion: "2026-03-11" });
}

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

export async function mirrorFeedbackToNotion(row: SignalDeckFeedback) {
  const notion = notionClient();
  if (!notion) {
    return { ok: false, skipped: true, reason: "NOTION_TOKEN missing" };
  }

  const existing = await notion.dataSources.query({
    data_source_id: DATA_SOURCE_ID,
    filter: {
      property: "Post Key",
      rich_text: { equals: row.post_key }
    },
    page_size: 5
  });

  const page = (existing.results || []).find((item: any) => item.object === "page");
  if (page) {
    await notion.pages.update({
      page_id: page.id,
      properties: properties(row) as any
    });
    return { ok: true, created: false };
  }

  await notion.pages.create({
    parent: {
      type: "data_source_id",
      data_source_id: DATA_SOURCE_ID
    },
    properties: properties(row) as any
  });
  return { ok: true, created: true };
}
