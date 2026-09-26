import { Client } from "@notionhq/client";
import { writeFile, appendFile } from "node:fs/promises";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const CONTROL_DATA_SOURCE_ID =
  process.env.NOTION_CONTROL_DATA_SOURCE_ID || "198328f3-d0b7-4fad-8740-5c5177cc1101";
const OUTPUT_QUERY_FILE =
  process.env.OUTPUT_QUERY_FILE || "collector/runtime_queries.txt";

if (!NOTION_TOKEN) throw new Error("NOTION_TOKEN is missing");

const notion = new Client({
  auth: NOTION_TOKEN,
  notionVersion: "2026-03-11",
});

function plainText(prop) {
  if (!prop) return "";
  if (prop.type === "rich_text") {
    return (prop.rich_text || []).map((x) => x.plain_text || "").join("");
  }
  if (prop.type === "title") {
    return (prop.title || []).map((x) => x.plain_text || "").join("");
  }
  return "";
}

function numberValue(prop, fallback) {
  return prop?.type === "number" && typeof prop.number === "number"
    ? prop.number
    : fallback;
}

function checkboxValue(prop, fallback = false) {
  return prop?.type === "checkbox" ? Boolean(prop.checkbox) : fallback;
}

const response = await notion.dataSources.query({
  data_source_id: CONTROL_DATA_SOURCE_ID,
  filter: {
    property: "Enabled",
    checkbox: { equals: true },
  },
  page_size: 10,
});

const active = (response.results || []).filter((x) => x.object === "page");
if (active.length === 0) {
  throw new Error("Collector Control has no Enabled track");
}
if (active.length > 1) {
  throw new Error(
    `Collector Control has ${active.length} Enabled tracks. MVP currently supports exactly one active track.`
  );
}

const page = active[0];
const props = page.properties || {};
const track = plainText(props["Track"]).trim();
const configKey = plainText(props["Config Key"]).trim();
const queriesText = plainText(props["Queries"]);

const queries = queriesText
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter((x) => x && !x.startsWith("#"));

if (!queries.length) {
  throw new Error(`Enabled track "${track || configKey}" has no queries`);
}

const windowHours = Math.max(1, Math.floor(numberValue(props["Window Hours"], 12)));
const minScore = Math.max(0, Math.floor(numberValue(props["Min Score"], 30)));
const searchDepth = Math.min(5, Math.max(1, Math.floor(numberValue(props["Search Depth"], 3))));
const googleFallback = checkboxValue(props["Google Fallback"], true);

await writeFile(OUTPUT_QUERY_FILE, queries.join("\n") + "\n", "utf8");

console.log(
  `[config] track=${track || "(untitled)"} key=${configKey || "(none)"} queries=${queries.length} window_hours=${windowHours} min_score=${minScore} search_depth=${searchDepth} google_fallback=${googleFallback}`
);

if (process.env.GITHUB_ENV) {
  const lines = [
    `QUERY_FILE=${OUTPUT_QUERY_FILE}`,
    `COLLECTOR_TRACK=${track}`,
    `COLLECTOR_CONFIG_KEY=${configKey}`,
    `COLLECTOR_WINDOW_HOURS=${windowHours}`,
    `COLLECTOR_MIN_SCORE=${minScore}`,
    `COLLECTOR_SEARCH_DEPTH=${searchDepth}`,
    `COLLECTOR_GOOGLE_FALLBACK=${googleFallback ? "true" : "false"}`,
  ];
  await appendFile(process.env.GITHUB_ENV, lines.join("\n") + "\n", "utf8");
}
