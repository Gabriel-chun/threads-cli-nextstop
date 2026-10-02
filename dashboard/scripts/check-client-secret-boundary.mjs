import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "dist/client";
const forbidden = [
  "NOTION_TOKEN",
  "NEXTSTOP_EVENT_EMIT_TOKEN",
  "@notionhq/client",
  "dangerouslyAllowBrowser",
  "api.notion.com/v1",
  "Authorization: Bearer"
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const hits = [];
for (const file of walk(root)) {
  if (!/\.(js|mjs|cjs|json|html|css|map)$/.test(file)) continue;
  const content = readFileSync(file, "utf8");
  for (const marker of forbidden) {
    if (content.includes(marker)) hits.push({ file, marker });
  }
}

if (hits.length) {
  console.error("[secret-boundary] Forbidden server credential marker found in client bundle:");
  for (const hit of hits) console.error(`- ${hit.marker} in ${hit.file}`);
  process.exit(1);
}
console.log("[secret-boundary] client bundle clean: no server credential markers found");
