export const runtime = "nodejs";

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { snapshot, compact, loadTrendHistory } from "../../../lib/signals";
import { loadObservationBundle } from "../../../lib/observations";
import { loadSignalDeck, selectSignalDeckWindow } from "../../../lib/signalDeck";
import { registerObservationEventHandlers } from "../../../lib/mcpEvents/server";

const LATEST_DOWNLOAD_URL =
  "https://threads-cli-nextstop.gabrielchun336.workers.dev/api/download/latest";
const REVIEWED_DOWNLOAD_URL =
  "https://threads-cli-nextstop.gabrielchun336.workers.dev/api/download/reviews/latest";

const handler = createMcpHandler(
  (server) => {
    registerObservationEventHandlers(server);

    server.registerTool(
      "get_recent_signals",
      {
        title: "Get recent signals",
        description: "Return clean Next Stop Live concert signals with resale/transaction posts excluded.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).default(20),
          kind: z.enum(["actionable", "context", "noise"]).optional()
        })
      },
      async ({ limit, kind }) => {
        const data = await snapshot();
        const rows = data.signals
          .filter((signal) => !kind || signal.kind === kind)
          .slice(0, limit)
          .map(compact);
        return {
          content: [{ type: "text", text: JSON.stringify({ count: rows.length, signals: rows }, null, 2) }]
        };
      }
    );

    server.registerTool(
      "get_demand_clusters",
      {
        title: "Get demand clusters",
        description: "Return current concert demand/context clusters and counts.",
        inputSchema: z.object({})
      },
      async () => {
        const data = await snapshot();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              concertRaw: data.concertRaw,
              cleanCount: data.cleanCount,
              actionable: data.actionable,
              context: data.context,
              noise: data.noise,
              clusters: data.clusters
            }, null, 2)
          }]
        };
      }
    );

    server.registerTool(
      "get_signal_detail",
      {
        title: "Get signal detail",
        description: "Fetch one clean signal by Threads post ID.",
        inputSchema: z.object({ id: z.string().min(1) })
      },
      async ({ id }) => {
        const data = await snapshot();
        const signal = data.signals.find((row) => row.id === id);
        return {
          content: [{
            type: "text",
            text: signal ? JSON.stringify(compact(signal), null, 2) : "Signal not found."
          }]
        };
      }
    );

    server.registerTool(
      "get_collector_health",
      {
        title: "Get collector health",
        description: "Return core collector health and archive signal statistics; low-value source coverage metrics are intentionally omitted.",
        inputSchema: z.object({})
      },
      async () => {
        const data = await snapshot();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              health: data.health,
              masterCount: data.masterCount,
              concertRaw: data.concertRaw,
              cleanCount: data.cleanCount,
              excludedTransactions: data.excludedTransactions,
              generatedAt: data.generatedAt
            }, null, 2)
          }]
        };
      }
    );

    server.registerTool(
      "get_trend_history",
      {
        title: "Get trend history",
        description: "Return recent Next Stop Live rolling signal and clean-pipeline trend points.",
        inputSchema: z.object({
          limit: z.number().int().min(3).max(84).default(24),
          includeFailed: z.boolean().default(false)
        })
      },
      async ({ limit, includeFailed }) => {
        const rows = await loadTrendHistory(limit, includeFailed);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ count: rows.length, points: rows }, null, 2)
          }]
        };
      }
    );

    server.registerTool(
      "get_observation_bundle",
      {
        title: "Get observation bundle",
        description: "Return Observation Bundle v1. Omit run_id for latest; specify an archived run stamp for immutable historical data.",
        inputSchema: z.object({
          run_id: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}_\\d{6}Z$/).optional(),
          evidence_limit: z.number().int().min(1).max(50).default(16)
        })
      },
      async ({ run_id, evidence_limit }) => {
        try {
          const bundle = await loadObservationBundle(run_id, evidence_limit);
          return {
            content: [{ type: "text", text: JSON.stringify(bundle, null, 2) }]
          };
        } catch (error) {
          return {
            isError: true,
            content: [{
              type: "text",
              text: error instanceof Error ? error.message : "Observation bundle unavailable."
            }]
          };
        }
      }
    );

    server.registerTool(
      "get_signal_deck",
      {
        title: "Get Signal Deck",
        description: "Return the daily Signal Deck v0.3 post-level triage queue for a 1-day, 3-day, or 5-day window, including source evidence links.",
        inputSchema: z.object({
          window: z.enum(["1d", "3d", "5d"]).default("3d"),
          limit: z.number().int().min(1).max(5).default(5)
        })
      },
      async ({ window, limit }) => {
        const deck = await loadSignalDeck();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(selectSignalDeckWindow(deck, window, limit), null, 2)
          }]
        };
      }
    );

    server.registerTool(
      "get_reviewed_cards_download",
      {
        title: "Get reviewed cards JSON download",
        description: "Return the de-identified download URL for the latest GitHub-archived Relevant / Irrelevant Signal Review cards JSON.",
        inputSchema: z.object({})
      },
      async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            filename: "next-stop-live-reviewed-cards-latest.json",
            contains: "de-identified latest completed daily Signal Review archive",
            source: "collector/archive/reviews/latest.json",
            reviewPageUrl: "https://threads-cli-nextstop.gabrielchun336.workers.dev/reviews",
            downloadUrl: REVIEWED_DOWNLOAD_URL
          }, null, 2)
        }]
      })
    );

    server.registerTool(
      "get_latest_download",
      {
        title: "Get latest JSON ZIP download",
        description: "Return the one-click URL for the latest Next Stop Live master.json ZIP.",
        inputSchema: z.object({})
      },
      async () => ({
        content: [{
          type: "text",
          text: JSON.stringify({
            filename: "next-stop-live-master-latest.zip",
            contains: "master.json",
            downloadUrl: LATEST_DOWNLOAD_URL
          }, null, 2)
        }]
      })
    );
  },
  {
    capabilities: { events: {} } as any,
    instructions: "For observation events, call get_observation_bundle(run_id). Deterministic facts are authoritative; derived annotations are not.",
    serverInfo: {
      name: "next-stop-live",
      version: "0.11.0"
    }
  }
);

export { handler as GET, handler as POST };
