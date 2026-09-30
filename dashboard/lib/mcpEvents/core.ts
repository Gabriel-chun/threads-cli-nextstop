import { createHash } from "node:crypto";

export const OBSERVATION_EVENT_NAME = "nextstop.observation.bundle.ready";
export const MCP_EVENTS_PROTOCOL_VERSION = "2026-07-28";
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ObservationDecision =
  | "no_change"
  | "watch"
  | "notable"
  | "data_quality_issue";

export type ObservationEvent = {
  eventId: string;
  name: typeof OBSERVATION_EVENT_NAME;
  timestamp: string;
  data: {
    run_id: string;
    observation_id: string;
    pipeline_version: string;
    bundle_ref: string;
    provenance: "scheduled";
    baseline_eligible: true;
  };
  cursor: null;
};

export type SubscriptionRecord = {
  id: string;
  principal: string;
  name: typeof OBSERVATION_EVENT_NAME;
  arguments: Record<string, never>;
  url: string;
  secret: string;
  previousSecret?: string | null;
  previousSecretExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  active: boolean;
};

export type DeliveryState = {
  subscriptionId: string;
  status: "pending" | "delivered" | "failed" | "skipped";
  attempts: number;
  lastHttpStatus?: number | null;
  lastError?: string | null;
  updatedAt: string;
};

export type EventState = {
  eventId: string;
  runId: string;
  observationId: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  targetSubscriptionIds: string[];
  deliveries: Record<string, DeliveryState>;
  finalStatus: "emitted" | "completed" | "no_subscribers" | "partial_failure";
};

export const EVENT_DEFINITION = {
  name: OBSERVATION_EVENT_NAME,
  description:
    "A baseline-eligible scheduled Next Stop Live Observation Bundle is archived and ready to read with get_observation_bundle(run_id).",
  delivery: ["webhook"],
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  },
  payloadSchema: {
    type: "object",
    properties: {
      run_id: { type: "string" },
      observation_id: { type: "string" },
      pipeline_version: { type: "string" },
      bundle_ref: { type: "string" },
      provenance: { type: "string", enum: ["scheduled"] },
      baseline_eligible: { type: "boolean", const: true }
    },
    required: [
      "run_id",
      "observation_id",
      "pipeline_version",
      "bundle_ref",
      "provenance",
      "baseline_eligible"
    ],
    additionalProperties: false
  }
} as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function deriveSubscriptionId(
  principal: string,
  callbackUrl: string,
  eventName: string,
  args: Record<string, unknown>
): string {
  return "sub_" + stableHash(
    [principal, callbackUrl, eventName, canonicalJson(args)].join("\n")
  ).slice(0, 32);
}

export function normalizeSubscriptionExpiry(
  ttlMs: number | null | undefined,
  now = Date.now()
): string | null {
  if (ttlMs === null) return null;
  const requested =
    typeof ttlMs === "number" && Number.isFinite(ttlMs)
      ? Math.max(60 * 60 * 1000, Math.trunc(ttlMs))
      : DEFAULT_TTL_MS;
  return new Date(now + Math.min(requested, MAX_TTL_MS)).toISOString();
}

export function isSubscriptionActive(
  sub: SubscriptionRecord,
  at = Date.now()
): boolean {
  if (!sub.active) return false;
  return !sub.expiresAt || Date.parse(sub.expiresAt) > at;
}

export function isEligibleObservationBundle(bundle: any): boolean {
  return Boolean(
    bundle &&
      bundle.run?.status === "success" &&
      bundle.run?.provenance === "scheduled" &&
      bundle.run?.baseline_eligible === true &&
      /^\d{4}-\d{2}-\d{2}_\d{6}Z$/.test(bundle.run?.run_stamp || "") &&
      typeof bundle.observation_id === "string" &&
      typeof bundle.run?.pipeline_version === "string"
  );
}

export function buildObservationEvent(bundle: any): ObservationEvent {
  if (!isEligibleObservationBundle(bundle)) {
    throw new Error("Observation bundle is not eligible for MCP Event delivery.");
  }
  const runId = bundle.run.run_stamp;
  return {
    eventId: bundle.observation_id,
    name: OBSERVATION_EVENT_NAME,
    timestamp: bundle.run.run_at,
    data: {
      run_id: runId,
      observation_id: bundle.observation_id,
      pipeline_version: bundle.run.pipeline_version,
      bundle_ref: "collector/archive/observations/" + runId + ".json",
      provenance: "scheduled",
      baseline_eligible: true
    },
    cursor: null
  };
}

export function shouldNotifyDecision(decision: ObservationDecision): boolean {
  return decision === "notable" || decision === "data_quality_issue";
}
