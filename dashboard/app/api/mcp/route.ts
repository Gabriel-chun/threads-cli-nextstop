import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { snapshot, compact } from "../../../lib/signals";

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "get_recent_signals",
      "Return clean Next Stop Live concert signals with resale/transaction posts excluded.",
      {
        limit: z.number().int().min(1).max(50).default(20),
        kind: z.enum(["actionable", "context", "noise"]).optional()
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

    server.tool(
      "get_demand_clusters",
      "Return current concert demand/context clusters and counts.",
      {},
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

    server.tool(
      "get_signal_detail",
      "Fetch one clean signal by Threads post ID.",
      { id: z.string().min(1) },
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

    server.tool(
      "get_collector_health",
      "Return collector health and archive statistics.",
      {},
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
  },
  {},
  { basePath: "/api" }
);

export { handler as GET, handler as POST, handler as DELETE };
