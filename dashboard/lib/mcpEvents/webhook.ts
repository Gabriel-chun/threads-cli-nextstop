import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Webhook } from "standardwebhooks";
import type { ObservationEvent, SubscriptionRecord } from "./core";

function privateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a,b,c] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113);
}
function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) return !privateV4(ip);
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return !(
      v === "::" || v === "::1" ||
      v.startsWith("fc") || v.startsWith("fd") ||
      /^fe[89ab]/.test(v) || v.startsWith("ff") ||
      v.startsWith("2001:db8")
    );
  }
  return false;
}

export function validateWebhookSecret(secret: string) {
  if (!secret.startsWith("whsec_")) throw new Error("secret must use whsec_.");
  const raw = secret.slice(6).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < 24 || bytes.length > 64) {
    throw new Error("signing secret must decode to 24-64 bytes.");
  }
}

async function resolvePublic(urlString: string) {
  const url = new URL(urlString);
  if (url.protocol !== "https:") throw new Error("callback must use HTTPS.");
  if (url.username || url.password) throw new Error("callback credentials are forbidden.");
  if (url.port && url.port !== "443") throw new Error("callback must use port 443.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new Error("callback hostname is not public.");
  }
  if (isIP(url.hostname)) {
    if (!publicAddress(url.hostname)) throw new Error("callback address is not public.");
    return { url, address: url.hostname };
  }
  const answers = await lookup(url.hostname, { all: true, verbatim: true });
  if (!answers.length || answers.some((a) => !publicAddress(a.address))) {
    throw new Error("callback resolves to a non-public address.");
  }
  return { url, address: answers[0].address };
}

async function postPinned(
  urlString: string,
  body: string,
  headers: Record<string,string>
): Promise<{status:number; body:string}> {
  const { url, address } = await resolvePublic(urlString);
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: "https:",
      hostname: address,
      port: 443,
      servername: isIP(url.hostname) ? undefined : url.hostname,
      method: "POST",
      path: url.pathname + url.search,
      rejectUnauthorized: true,
      headers: {
        ...headers,
        Host: url.host,
        "Content-Length": String(Buffer.byteLength(body))
      }
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        text += chunk;
        if (Buffer.byteLength(text) > 65536) {
          req.destroy(new Error("callback response too large."));
        }
      });
      res.on("end", () => resolve({ status: res.statusCode || 0, body: text }));
    });
    req.setTimeout(10000, () => req.destroy(new Error("callback timeout.")));
    req.on("error", reject);
    req.end(body);
  });
}

function signature(sub: SubscriptionRecord, id: string, at: Date, body: string) {
  const signatures = [new Webhook(sub.secret).sign(id, at, body)];
  if (
    sub.previousSecret &&
    sub.previousSecretExpiresAt &&
    Date.parse(sub.previousSecretExpiresAt) > Date.now()
  ) {
    signatures.push(new Webhook(sub.previousSecret).sign(id, at, body));
  }
  return signatures.join(" ");
}

export async function verifyCallback(
  subscriptionId: string,
  url: string,
  secret: string
) {
  validateWebhookSecret(secret);
  const challenge = randomBytes(24).toString("base64url");
  const webhookId = "msg_verification_" + randomUUID();
  const body = JSON.stringify({ type: "verification", challenge });
  const at = new Date();
  const temp: SubscriptionRecord = {
    id: subscriptionId, principal: "verification",
    name: "nextstop.observation.bundle.ready", arguments: {},
    url, secret, createdAt: at.toISOString(), updatedAt: at.toISOString(),
    expiresAt: null, active: true
  };
  const response = await postPinned(url, body, {
    "Content-Type":"application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": String(Math.floor(at.getTime()/1000)),
    "webhook-signature": signature(temp, webhookId, at, body),
    "X-MCP-Subscription-Id": subscriptionId
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error("callback verification returned HTTP " + response.status);
  }
  let echoed = "";
  try { echoed = String(JSON.parse(response.body)?.challenge || ""); }
  catch { throw new Error("callback verification response was not JSON."); }
  const a=Buffer.from(challenge), b=Buffer.from(echoed);
  if (a.length !== b.length || !timingSafeEqual(a,b)) {
    throw new Error("callback challenge mismatch.");
  }
}

export async function deliverEvent(sub: SubscriptionRecord, event: ObservationEvent) {
  const body = JSON.stringify(event);
  if (Buffer.byteLength(body) > 262144) throw new Error("event payload too large.");
  const at = new Date();
  return postPinned(sub.url, body, {
    "Content-Type":"application/json",
    "webhook-id": event.eventId,
    "webhook-timestamp": String(Math.floor(at.getTime()/1000)),
    "webhook-signature": signature(sub, event.eventId, at, body),
    "X-MCP-Subscription-Id": sub.id
  });
}
