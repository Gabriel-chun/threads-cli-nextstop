import { del, get, list, put } from "@vercel/blob";
import type { EventState, SubscriptionRecord } from "./core";
import { stableHash } from "./core";

const ROOT = "mcp-events/v1";

async function readJson<T>(pathname: string): Promise<T | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await new Response(result.stream).text()) as T;
}

async function putJson(
  pathname: string,
  value: unknown,
  allowOverwrite = true
): Promise<void> {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    allowOverwrite,
    addRandomSuffix: false,
    contentType: "application/json"
  });
}

async function listPaths(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs.map((blob) => blob.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

function subPath(id: string) {
  return ROOT + "/subscriptions/" + id + ".json";
}
function eventPath(id: string) {
  return ROOT + "/events/" + stableHash(id) + ".json";
}
function lockPath(id: string) {
  return ROOT + "/locks/" + stableHash(id) + ".json";
}
function verificationPath(principal: string, url: string) {
  return ROOT + "/verifications/" + stableHash(principal + "\n" + url) + ".json";
}

export class BlobEventStore {
  async getSubscription(id: string) {
    return readJson<SubscriptionRecord>(subPath(id));
  }
  async putSubscription(record: SubscriptionRecord) {
    await putJson(subPath(record.id), record);
  }
  async deleteSubscription(id: string) {
    try { await del(subPath(id)); } catch {}
  }
  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    const records = await Promise.all(
      (await listPaths(ROOT + "/subscriptions/")).map((p) =>
        readJson<SubscriptionRecord>(p)
      )
    );
    return records.filter((r): r is SubscriptionRecord => Boolean(r));
  }

  async getVerification(principal: string, url: string): Promise<boolean> {
    const record = await readJson<{ expiresAt: string }>(
      verificationPath(principal, url)
    );
    return Boolean(record && Date.parse(record.expiresAt) > Date.now());
  }
  async putVerification(principal: string, url: string) {
    await putJson(verificationPath(principal, url), {
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
  }

  async getEventState(eventId: string) {
    return readJson<EventState>(eventPath(eventId));
  }
  async putEventState(state: EventState) {
    await putJson(eventPath(state.eventId), state);
  }

  async acquireEventLock(eventId: string): Promise<boolean> {
    const path = lockPath(eventId);
    const existing = await readJson<{ createdAt: string }>(path);
    if (existing && Date.now() - Date.parse(existing.createdAt) < 5 * 60 * 1000) {
      return false;
    }
    if (existing) {
      try { await del(path); } catch {}
    }
    try {
      await putJson(path, { createdAt: new Date().toISOString() }, false);
      return true;
    } catch {
      return false;
    }
  }
  async releaseEventLock(eventId: string) {
    try { await del(lockPath(eventId)); } catch {}
  }
}
