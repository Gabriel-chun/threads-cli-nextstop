import { env } from "cloudflare:workers";
import type { EventState, SubscriptionRecord } from "./core";
import { stableHash } from "./core";

const ROOT = "mcp-events/v2";
const kv = () => (env as any).MCP_EVENTS_KV as any;

async function readJson<T>(key: string): Promise<T | null> {
  const value = await kv().get(key, "json");
  return (value as T | null) ?? null;
}

async function putJson(key: string, value: unknown): Promise<void> {
  await kv().put(key, JSON.stringify(value));
}

async function listKeys(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv().list({ prefix, cursor, limit: 1000 });
    out.push(...page.keys.map((item: any) => item.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

function subPath(id: string) {
  return ROOT + "/subscriptions/" + id;
}
function eventPath(id: string) {
  return ROOT + "/events/" + stableHash(id);
}
function lockPath(id: string) {
  return ROOT + "/locks/" + stableHash(id);
}
function verificationPath(principal: string, url: string) {
  return ROOT + "/verifications/" + stableHash(principal + "\n" + url);
}

export class EventStore {
  async getSubscription(id: string) {
    return readJson<SubscriptionRecord>(subPath(id));
  }
  async putSubscription(record: SubscriptionRecord) {
    await putJson(subPath(record.id), record);
  }
  async deleteSubscription(id: string) {
    await kv().delete(subPath(id));
  }
  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    const records = await Promise.all(
      (await listKeys(ROOT + "/subscriptions/")).map((key) =>
        readJson<SubscriptionRecord>(key)
      )
    );
    return records.filter((record): record is SubscriptionRecord => Boolean(record));
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
    const key = lockPath(eventId);
    const existing = await readJson<{ createdAt: string }>(key);
    if (existing && Date.now() - Date.parse(existing.createdAt) < 5 * 60 * 1000) {
      return false;
    }
    await putJson(key, { createdAt: new Date().toISOString() });
    return true;
  }
  async releaseEventLock(eventId: string) {
    await kv().delete(lockPath(eventId));
  }
}
