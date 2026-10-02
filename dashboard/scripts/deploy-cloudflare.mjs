import { spawnSync } from "node:child_process";

const required = ["NOTION_TOKEN", "NEXTSTOP_EVENT_EMIT_TOKEN"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error("Missing Cloudflare build secrets: " + missing.join(", "));
  process.exit(1);
}

const secretPayload = JSON.stringify(
  Object.fromEntries(required.map((name) => [name, process.env[name]]))
);

const sync = spawnSync(
  "npx",
  ["wrangler", "secret", "bulk", "--config", "dist/server/wrangler.json"],
  {
    input: secretPayload,
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env
  }
);
if (sync.status !== 0) process.exit(sync.status ?? 1);

const deploy = spawnSync(
  "npx",
  ["vinext-cloudflare", "deploy", "--config", "dist/server/wrangler.json"],
  {
    stdio: "inherit",
    env: process.env
  }
);
process.exit(deploy.status ?? 1);
