import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { snapshot, compact } from "../../../lib/signals";

const handler = createMcpHandler(
  (server) => {
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
        description: "Return collector health and archive statistics.",
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
  },
  {
    serverInfo: {
      name: "next-stop-live",
      version: "0.1.0"
    }
  }
);

export { handler as GET, handler as POST };
