#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const QUERY_FILE = process.env.QUERY_FILE || "collector/queries.txt";
const RAW_DIR = process.env.RAW_DIR || "collector/raw";
const FAILED_FILE = process.env.FAILED_FILE || "collector/failed_queries.txt";
const SCROLLS = Math.max(0, Math.min(3, Number(process.env.COLLECTOR_BROWSER_SCROLLS || 2)));
const SETTLE_MS = Math.max(1000, Number(process.env.COLLECTOR_BROWSER_SETTLE_MS || 3500));
const BETWEEN_QUERY_MS = Math.max(3000, Number(process.env.COLLECTOR_BROWSER_QUERY_DELAY_MS || 7000));
const MAX_POSTS = Math.max(1, Math.min(100, Number(process.env.COLLECTOR_BROWSER_MAX_POSTS || 40)));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[#@＃＠]/g, "")
    .replace(/\s+/g, " ");
}

function isAscii(value) {
  return value && [...value].every((ch) => ch.codePointAt(0) <= 127);
}

function scoreText(text, username, query) {
  const haystack = normalizeSearchText(`${text} ${username}`);
  const q = normalizeSearchText(query);
  if (!q || !haystack) return { score: 0, matched: [] };
  const terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) return { score: 0, matched: [] };

  if (terms.length === 1) {
    return haystack.includes(q)
      ? { score: 60, matched: [q] }
      : { score: 0, matched: [] };
  }

  let anchor = terms[0];
  if (terms.length >= 2 && isAscii(terms[0]) && isAscii(terms[1])) {
    anchor = `${terms[0]} ${terms[1]}`;
  }
  if (!haystack.includes(anchor)) return { score: 0, matched: [] };
  for (const term of terms) {
    if (!haystack.includes(term)) return { score: 0, matched: [] };
  }
  return {
    score: haystack.includes(q) ? 100 : 80,
    matched: [...new Set([anchor, ...terms])],
  };
}

function relevanceTier(score) {
  if (score >= 60) return "high";
  if (score >= 30) return "candidate";
  if (score > 0) return "low";
  return "none";
}

async function extractPosts(page, query) {
  const candidates = await page.evaluate((maxPosts) => {
    const links = [...document.querySelectorAll('a[href*="/post/"]')];
    const seen = new Set();
    const rows = [];

    for (const anchor of links) {
      if (rows.length >= maxPosts) break;
      const href = anchor.href || "";
      const match = href.match(/https?:\/\/www\.threads\.com\/@([^/]+)\/post\/([^/?#]+)/i)
        || href.match(/https?:\/\/threads\.com\/@([^/]+)\/post\/([^/?#]+)/i);
      if (!match) continue;

      const permalink = `https://www.threads.com/@${match[1]}/post/${match[2]}`;
      if (seen.has(permalink)) continue;

      let node = anchor;
      let card = null;
      for (let depth = 0; depth < 12 && node && node !== document.body; depth += 1, node = node.parentElement) {
        const text = (node.innerText || "").trim();
        const time = node.querySelector?.("time[datetime]");
        if (time && text.length >= 20 && text.length <= 8000) {
          card = node;
          break;
        }
      }
      if (!card) continue;

      const time = card.querySelector("time[datetime]");
      const timestamp = time?.getAttribute("datetime") || "";
      if (!timestamp) continue;

      const text = (card.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
      if (!text) continue;

      let mediaType = "TEXT";
      if (card.querySelector("video")) mediaType = "VIDEO";
      else if (card.querySelector("img")) mediaType = "IMAGE";

      seen.add(permalink);
      rows.push({
        id: match[2],
        username: match[1],
        permalink,
        timestamp,
        text,
        media_type: mediaType,
      });
    }
    return rows;
  }, MAX_POSTS);

  const searchedAt = new Date().toISOString();
  return candidates
    .map((row) => {
      const scored = scoreText(row.text, row.username, query);
      return {
        ...row,
        query,
        source_queries: [query],
        relevance_score: scored.score,
        relevance_tier: relevanceTier(scored.score),
        matched_terms: scored.matched,
        retrieval_sources: ["threads_browser_dom"],
        searched_at: searchedAt,
      };
    })
    .filter((row) => row.relevance_score > 0);
}

await mkdir(RAW_DIR, { recursive: true });
await writeFile(FAILED_FILE, "", "utf8");

const queries = (await readFile(QUERY_FILE, "utf8"))
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter((x) => x && !x.startsWith("#"));

const diagnostics = [];
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    locale: "zh-TW",
    viewport: { width: 1440, height: 1200 },
  });

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    const outfile = join(RAW_DIR, `query_${String(index + 1).padStart(2, "0")}.jsonl`);
    const page = await context.newPage();
    let rows = [];
    let status = "success";
    let httpStatus = null;
    let note = "";

    console.log(`[browser] (${index + 1}/${queries.length}) ${query}`);

    try {
      const response = await page.goto(
        `https://www.threads.com/search?q=${encodeURIComponent(query)}`,
        { waitUntil: "domcontentloaded", timeout: 45000 }
      );
      httpStatus = response?.status() ?? null;

      await page.waitForTimeout(SETTLE_MS);
      for (let i = 0; i < SCROLLS; i += 1) {
        await page.mouse.wheel(0, 1600);
        await page.waitForTimeout(1800);
      }

      const bodyText = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      const blocked = [
        "you must log in to continue",
        "log in to see",
        "please wait a few minutes",
        "challenge required",
        "captcha",
      ].some((needle) => bodyText.includes(needle));

      if (blocked) {
        status = "coverage_degraded";
        note = "login wall or access challenge visible; no bypass attempted";
      } else {
        rows = await extractPosts(page, query);
        if (!rows.length) {
          status = "coverage_degraded";
          note = "public browser page exposed no matching post cards";
        }
      }

      await writeFile(
        outfile,
        rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
        "utf8"
      );
    } catch (error) {
      status = "failed";
      note = String(error?.message || error);
      await writeFile(outfile, "", "utf8");
      await writeFile(FAILED_FILE, query + "\n", { encoding: "utf8", flag: "a" });
    } finally {
      diagnostics.push({
        query,
        status,
        http_status: httpStatus,
        rows: rows.length,
        url: page.url(),
        note,
      });
      await page.close();
    }

    if (index < queries.length - 1) await sleep(BETWEEN_QUERY_MS);
  }

  await context.close();
} finally {
  await browser.close();
}

await writeFile(
  join(RAW_DIR, "browser_diagnostics.json"),
  JSON.stringify({
    collector_mode: "browser",
    browser_engine: "chromium",
    logged_in: false,
    user_agent_override: false,
    stealth: false,
    proxy_rotation: false,
    captcha_bypass: false,
    bounded_scrolls: SCROLLS,
    queries: diagnostics,
  }, null, 2) + "\n",
  "utf8"
);

console.log(`[browser] finished ${queries.length} queries`);
