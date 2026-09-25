import { Client } from "@notionhq/client";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const POSTS_DATA_SOURCE_ID =
  process.env.NOTION_POSTS_DATA_SOURCE_ID || "1d268bf4-2656-46c2-9ed1-b2143e611d3c";
const RUNS_DATA_SOURCE_ID =
  process.env.NOTION_RUNS_DATA_SOURCE_ID || "0f121a0f-3cfa-477c-be91-2bc61410dff4";
const JSON_ARCHIVE_DATA_SOURCE_ID =
  process.env.NOTION_JSON_ARCHIVE_DATA_SOURCE_ID || "fb4c3b0b-8dbd-4604-826c-32d3bcb7b5c5";
const QUERY_RUN_HISTORY_DATA_SOURCE_ID =
  process.env.NOTION_QUERY_RUN_HISTORY_DATA_SOURCE_ID || "bd2b6fc3-f4ca-4b54-9def-84f9708a6b96";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "collector/output";
const QUERY_FILE = process.env.QUERY_FILE || "collector/queries.txt";
const RUN_STAMP = process.env.RUN_STAMP;
const GITHUB_RUN_URL = process.env.GITHUB_RUN_URL || "";
const COLLECTOR_TRACK = process.env.COLLECTOR_TRACK || "";
const COLLECTOR_CONFIG_KEY = process.env.COLLECTOR_CONFIG_KEY || "";
const COLLECTOR_WINDOW_HOURS = Number(process.env.COLLECTOR_WINDOW_HOURS || 12);
const COLLECTOR_MIN_SCORE = Number(process.env.COLLECTOR_MIN_SCORE || 30);

if (!NOTION_TOKEN) {
  throw new Error("NOTION_TOKEN is missing");
}
if (!RUN_STAMP) {
  throw new Error("RUN_STAMP is missing");
}

const notion = new Client({
  auth: NOTION_TOKEN,
  notionVersion: "2026-03-11",
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clip = (value, max = 1900) => {
  const text = String(value ?? "");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
};
const cleanTitle = (row) => {
  const text = String(row.text || "").replace(/\s+/g, " ").trim();
  const prefix = row.username ? `@${row.username} — ` : "";
  return clip(prefix + (text || row.id || row.permalink || "Threads post"), 120);
};
const richText = (value) => ({
  rich_text: value
    ? [{ type: "text", text: { content: clip(value) } }]
    : [],
});
const title = (value) => ({
  title: [{ type: "text", text: { content: clip(value, 200) } }],
});
const date = (value) => ({
  date: value ? { start: String(value) } : null,
});
const number = (value) => ({
  number: value === null || value === undefined || value === "" ? null : Number(value),
});
const url = (value) => ({
  url: value ? String(value) : null,
});
const select = (value) => ({
  select: value ? { name: String(value) } : null,
});

function plainText(prop) {
  if (!prop) return "";
  if (prop.type === "rich_text") {
    return (prop.rich_text || []).map((x) => x.plain_text || "").join("");
  }
  if (prop.type === "title") {
    return (prop.title || []).map((x) => x.plain_text || "").join("");
  }
  if (prop.type === "url") return prop.url || "";
  return "";
}

function numberValue(prop) {
  return prop?.type === "number" && typeof prop.number === "number" ? prop.number : 0;
}

function chunkText(text, size = 1800) {
  const value = String(text || "");
  if (!value) return [];
  const chunks = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
  return chunks;
}

function postProperties(row, seenCountOverride = null) {
  const sourceQueries = Array.isArray(row.source_queries)
    ? JSON.stringify(row.source_queries, null, 0)
    : String(row.source_queries || "");

  return {
    "Post": title(cleanTitle(row)),
    "Post ID": richText(String(row.id || row.permalink || "")),
    "Text": richText(clip(row.text || "")),
    "Username": richText(row.username || ""),
    "Permalink": url(row.permalink || ""),
    "Posted At": date(row.timestamp || null),
    "Query": richText(row.query || ""),
    "Source Queries": richText(sourceQueries),
    "Relevance Score": number(row.relevance_score ?? null),
    "Relevance Tier": select(row.relevance_tier || null),
    "First Seen": date(row.first_seen_at || row.searched_at || null),
    "Last Seen": date(row.last_seen_at || row.searched_at || null),
    "Seen Count": number(
      seenCountOverride ?? row.seen_count ?? 1
    ),
  };
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function findOutput(prefix, suffix) {
  const files = await readdir(OUTPUT_DIR);
  const exact = files.find(
    (name) => name.startsWith(prefix) && name.endsWith(suffix)
  );
  if (!exact) {
    throw new Error(`Could not find ${prefix}*${suffix} in ${OUTPUT_DIR}`);
  }
  return join(OUTPUT_DIR, exact);
}

async function listAllPages(dataSourceId) {
  const pages = [];
  let cursor;
  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const item of response.results || []) {
      if (item.object === "page") pages.push(item);
    }
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function uploadFile(path, contentType, notionFilename = basename(path)) {
  const upload = await notion.fileUploads.create({
    mode: "single_part",
    filename: notionFilename,
    content_type: contentType,
  });

  // CSV/JSONL are UTF-8 text. Passing a string lets the official SDK build
  // the multipart body itself and avoids runtime-specific Blob issues.
  const data = await readFile(path, "utf8");

  await notion.fileUploads.send({
    file_upload_id: upload.id,
    file: {
      filename: notionFilename,
      data,
    },
    part_number: "1",
  });

  return {
    id: upload.id,
    name: notionFilename,
  };
}

function fileProperty(upload) {
  return {
    files: [
      {
        name: upload.name,
        type: "file_upload",
        file_upload: { id: upload.id },
      },
    ],
  };
}

async function syncPosts(snapshotRows) {
  const existingPages = await listAllPages(POSTS_DATA_SOURCE_ID);
  const byPostId = new Map();
  const byPermalink = new Map();

  for (const page of existingPages) {
    const props = page.properties || {};
    const postId = plainText(props["Post ID"]);
    const permalink = props["Permalink"]?.type === "url" ? props["Permalink"].url || "" : "";
    if (postId) byPostId.set(postId, page);
    if (permalink) byPermalink.set(permalink, page);
  }

  let created = 0;
  let updated = 0;

  for (const row of snapshotRows) {
    const id = String(row.id || row.permalink || "");
    const permalink = String(row.permalink || "");
    const existing = byPostId.get(id) || byPermalink.get(permalink);

    if (existing) {
      const previousSeen = numberValue(existing.properties?.["Seen Count"]);
      const nextSeen = Math.max(
        previousSeen + 1,
        Number(row.seen_count || 1)
      );

      const properties = postProperties(row, nextSeen);
      delete properties["First Seen"];

      await notion.pages.update({
        page_id: existing.id,
        properties,
      });
      updated += 1;
    } else {
      const children = chunkText(row.text || "").map((part) => ({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: part } }],
        },
      }));

      await notion.pages.create({
        parent: {
          type: "data_source_id",
          data_source_id: POSTS_DATA_SOURCE_ID,
        },
        properties: postProperties(row),
        ...(children.length ? { children } : {}),
      });
      created += 1;
    }

    // Keep writes below Notion's average per-connection rate limit.
    await sleep(380);
  }

  return { created, updated };
}

async function upsertCollectorRun({
  summary,
  failedQueries,
  csvUpload,
  jsonlUpload,
  syncResult,
}) {
  const runTitle = `Threads Collector ${RUN_STAMP}`;
  const failed = failedQueries
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const totalQueries = (await readFile(QUERY_FILE, "utf8"))
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("#")).length;

  let status = "Success";
  if (failed.length >= totalQueries && totalQueries > 0) status = "Failed";
  else if (failed.length > 0) status = "Partial";

  const enrichedSummary = {
    ...summary,
    notion_created: syncResult.created,
    notion_updated: syncResult.updated,
  };

  const properties = {
    "Run": title(runTitle),
    "Run At": date(summary.run_at || null),
    "Status": select(status),
    "Snapshot Count": number(summary.snapshot_unique_rows ?? 0),
    "Master Count": number(summary.master_unique_rows ?? 0),
    "Failed Query Count": number(failed.length),
    "Failed Queries": richText(clip(failed.join("\n"))),
    "GitHub Run": url(GITHUB_RUN_URL),
    "CSV": fileProperty(csvUpload),
    "JSONL": fileProperty(jsonlUpload),
    "Summary": richText(clip(JSON.stringify(enrichedSummary, null, 0))),
  };

  const existing = await notion.dataSources.query({
    data_source_id: RUNS_DATA_SOURCE_ID,
    filter: {
      property: "Run",
      title: { equals: runTitle },
    },
    page_size: 10,
  });

  const page = (existing.results || []).find((x) => x.object === "page");
  if (page) {
    await notion.pages.update({
      page_id: page.id,
      properties,
    });
  } else {
    await notion.pages.create({
      parent: {
        type: "data_source_id",
        data_source_id: RUNS_DATA_SOURCE_ID,
      },
      properties,
    });
  }
}


async function upsertJsonArchive({
  summary,
  failedQueries,
  snapshotJsonUpload,
  masterJsonUpload,
}) {
  const runTitle = `JSON Archive ${RUN_STAMP}`;
  const failed = failedQueries
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const totalQueries = (await readFile(QUERY_FILE, "utf8"))
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("#")).length;

  let status = "Success";
  if (failed.length >= totalQueries && totalQueries > 0) status = "Failed";
  else if (failed.length > 0) status = "Partial";

  const properties = {
    "Run": title(runTitle),
    "Run At": date(summary.run_at || null),
    "Status": select(status),
    "Snapshot Count": number(summary.snapshot_unique_rows ?? 0),
    "Master Count": number(summary.master_unique_rows ?? 0),
    "Snapshot JSON": fileProperty(snapshotJsonUpload),
    "Master JSON": fileProperty(masterJsonUpload),
    "GitHub Run": url(GITHUB_RUN_URL),
  };

  const existing = await notion.dataSources.query({
    data_source_id: JSON_ARCHIVE_DATA_SOURCE_ID,
    filter: {
      property: "Run",
      title: { equals: runTitle },
    },
    page_size: 10,
  });

  const page = (existing.results || []).find((x) => x.object === "page");
  if (page) {
    await notion.pages.update({ page_id: page.id, properties });
  } else {
    await notion.pages.create({
      parent: {
        type: "data_source_id",
        data_source_id: JSON_ARCHIVE_DATA_SOURCE_ID,
      },
      properties,
    });
  }
}


async function upsertQueryRunHistory({
  summary,
  failedQueries,
  syncResult,
}) {
  const runTitle = `Query Run ${RUN_STAMP}`;
  const queryLines = (await readFile(QUERY_FILE, "utf8"))
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith("#"));
  const failed = failedQueries
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  let status = "Success";
  if (failed.length >= queryLines.length && queryLines.length > 0) status = "Failed";
  else if (failed.length > 0) status = "Partial";

  const snapshotCount = Number(summary.snapshot_unique_rows || 0);
  const newUnique = Number(syncResult.created || 0);
  const repeatedUpdated = Number(syncResult.updated || 0);
  const noveltyRate = snapshotCount > 0
    ? Number(((newUnique / snapshotCount) * 100).toFixed(1))
    : 0;

  const properties = {
    "Run": title(runTitle),
    "Run At": date(summary.run_at || null),
    "Track": richText(COLLECTOR_TRACK),
    "Config Key": richText(COLLECTOR_CONFIG_KEY),
    "Queries": richText(clip(queryLines.join("\n"))),
    "Query Count": number(queryLines.length),
    "Window Hours": number(COLLECTOR_WINDOW_HOURS),
    "Min Score": number(COLLECTOR_MIN_SCORE),
    "Raw Rows": number(summary.raw_rows ?? 0),
    "Snapshot Unique": number(snapshotCount),
    "New Unique": number(newUnique),
    "Repeated / Updated": number(repeatedUpdated),
    "Master Count": number(summary.master_unique_rows ?? 0),
    "Novelty Rate %": number(noveltyRate),
    "Status": select(status),
    "GitHub Run": url(GITHUB_RUN_URL),
  };

  const existing = await notion.dataSources.query({
    data_source_id: QUERY_RUN_HISTORY_DATA_SOURCE_ID,
    filter: {
      property: "Run",
      title: { equals: runTitle },
    },
    page_size: 10,
  });

  const page = (existing.results || []).find((x) => x.object === "page");
  if (page) {
    await notion.pages.update({ page_id: page.id, properties });
  } else {
    await notion.pages.create({
      parent: {
        type: "data_source_id",
        data_source_id: QUERY_RUN_HISTORY_DATA_SOURCE_ID,
      },
      properties,
    });
  }
}

async function main() {
  const summaryPath = join(OUTPUT_DIR, "summary.json");
  const snapshotJsonl = await findOutput("snapshot_", ".jsonl");
  const snapshotJson = await findOutput("snapshot_", ".json");
  const snapshotCsv = await findOutput("snapshot_", ".csv");
  const masterJson = join(OUTPUT_DIR, "master.json");
  const failedPath = join(OUTPUT_DIR, "failed_queries.txt");

  const [summary, snapshotRows, failedQueries] = await Promise.all([
    loadJson(summaryPath),
    loadJsonl(snapshotJsonl),
    readFile(failedPath, "utf8").catch(() => ""),
  ]);

  console.log(
    `[notion] syncing ${snapshotRows.length} snapshot rows to Threads Raw Database`
  );

  const syncResult = await syncPosts(snapshotRows);
  console.log(
    `[notion] created ${syncResult.created}, updated ${syncResult.updated}`
  );

  console.log("[notion] uploading snapshot CSV + JSONL");
  const notionJsonFilename = basename(snapshotJsonl).replace(/\.jsonl$/i, ".txt");
  const [csvUpload, jsonlUpload] = await Promise.all([
    uploadFile(snapshotCsv, "text/csv"),
    uploadFile(snapshotJsonl, "text/plain", notionJsonFilename),
  ]);

  await upsertCollectorRun({
    summary,
    failedQueries,
    csvUpload,
    jsonlUpload,
    syncResult,
  });

  console.log("[notion] uploading JSON archive files");
  const [snapshotJsonUpload, masterJsonUpload] = await Promise.all([
    uploadFile(snapshotJson, "application/json"),
    uploadFile(masterJson, "application/json"),
  ]);

  await upsertJsonArchive({
    summary,
    failedQueries,
    snapshotJsonUpload,
    masterJsonUpload,
  });

  await upsertQueryRunHistory({
    summary,
    failedQueries,
    syncResult,
  });

  console.log("[notion] sync complete");
}

await main();
