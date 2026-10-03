"use client";

import { useMemo, useState } from "react";
import type {
  KeywordNetwork,
  KeywordNetworkEdge,
  KeywordNetworkNode
} from "../lib/keywordNetwork";

type ViewMode = "table" | "network";
const LAYERS = ["recall", "language", "need", "keyword"] as const;
const TITLES: Record<(typeof LAYERS)[number], string> = {
  recall: "Base Recall",
  language: "Language Context",
  need: "Need Network",
  keyword: "Top Keywords"
};

const LAYER_X: Record<(typeof LAYERS)[number], number> = {
  recall: 110,
  language: 360,
  need: 660,
  keyword: 980
};

function nodeRadius(node: KeywordNetworkNode) {
  return Math.max(9, Math.min(22, 9 + Math.sqrt(Math.max(0, node.count)) * 2.1));
}

export function KeywordNetworkView({ data }: { data: KeywordNetwork }) {
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<string | null>(null);

  const activeNodes = useMemo(
    () => data.nodes.filter((node) => node.count > 0),
    [data.nodes]
  );

  const nodeMap = useMemo(
    () => new Map(activeNodes.map((node) => [node.id, node])),
    [activeNodes]
  );

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        LAYERS.map((layer) => [
          layer,
          activeNodes.filter((node) => node.layer === layer)
        ])
      ) as Record<(typeof LAYERS)[number], KeywordNetworkNode[]>,
    [activeNodes]
  );

  const layout = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    const top = 68;
    const bottom = 610;
    for (const layer of LAYERS) {
      const rows = grouped[layer];
      const step = (bottom - top) / Math.max(1, rows.length + 1);
      rows.forEach((node, index) => {
        out.set(node.id, {
          x: LAYER_X[layer],
          y: top + step * (index + 1)
        });
      });
    }
    return out;
  }, [grouped]);

  const activeEdges = useMemo(
    () =>
      selected
        ? data.edges.filter((edge) => edge.source === selected || edge.target === selected)
        : data.edges,
    [data.edges, selected]
  );

  const connected = useMemo(() => {
    const ids = new Set<string>();
    if (!selected) return ids;
    ids.add(selected);
    activeEdges.forEach((edge) => {
      ids.add(edge.source);
      ids.add(edge.target);
    });
    return ids;
  }, [activeEdges, selected]);

  const selectedNode = selected ? nodeMap.get(selected) || null : null;
  const maxWeight = Math.max(1, ...data.edges.map((edge) => edge.weight));

  const tableView = (
    <div className="networkBoard">
      <div className="networkColumns">
        {LAYERS.map((layer) => (
          <section className="networkColumn" key={layer}>
            <div className="networkColumnHead">
              <span>{TITLES[layer]}</span>
              <small>{grouped[layer].length}</small>
            </div>
            <div className="networkNodes">
              {grouped[layer].map((node) => {
                const dim = Boolean(selected && !connected.has(node.id));
                return (
                  <button
                    type="button"
                    key={node.id}
                    className={[
                      "networkNode",
                      node.layer,
                      selected === node.id ? "selected" : "",
                      dim ? "dim" : ""
                    ].join(" ")}
                    onClick={() =>
                      setSelected((current) => (current === node.id ? null : node.id))
                    }
                  >
                    <span>{node.label}</span>
                    <strong>{node.count}</strong>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <ConnectionPanel
        selectedNode={selectedNode}
        edges={activeEdges}
        nodeMap={nodeMap}
        onClear={() => setSelected(null)}
      />
    </div>
  );

  const networkView = (
    <div className="networkGraphLayout">
      <div
        className="networkGraphCanvas"
        onClick={(event) => {
          if (event.currentTarget === event.target) setSelected(null);
        }}
      >
        <svg viewBox="0 0 1100 650" aria-label="Daily Keyword Network graph">
          <g className="networkGraphGuides">
            {LAYERS.map((layer) => (
              <g key={layer}>
                <line x1={LAYER_X[layer]} y1="42" x2={LAYER_X[layer]} y2="625" />
                <text x={LAYER_X[layer]} y="26" textAnchor="middle">
                  {TITLES[layer]}
                </text>
              </g>
            ))}
          </g>

          <g className="networkGraphEdges">
            {data.edges.map((edge, index) => {
              const source = layout.get(edge.source);
              const target = layout.get(edge.target);
              if (!source || !target) return null;
              const dim = Boolean(
                selected && edge.source !== selected && edge.target !== selected
              );
              const width = 1 + (edge.weight / maxWeight) * 5;
              return (
                <line
                  key={edge.source + edge.target + index}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  strokeWidth={width}
                  className={dim ? "dim" : "active"}
                />
              );
            })}
          </g>

          <g className="networkGraphNodes">
            {activeNodes.map((node) => {
              const point = layout.get(node.id);
              if (!point) return null;
              const dim = Boolean(selected && !connected.has(node.id));
              const selectedHere = selected === node.id;
              const r = nodeRadius(node);
              return (
                <g
                  key={node.id}
                  className={[
                    "networkGraphNode",
                    node.layer,
                    dim ? "dim" : "",
                    selectedHere ? "selected" : ""
                  ].join(" ")}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected((current) => (current === node.id ? null : node.id));
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <circle cx={point.x} cy={point.y} r={r} />
                  <text x={point.x + r + 8} y={point.y - 2}>
                    {node.label}
                  </text>
                  <text
                    className="networkGraphNodeCount"
                    x={point.x + r + 8}
                    y={point.y + 12}
                  >
                    {node.count}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <ConnectionPanel
        selectedNode={selectedNode}
        edges={activeEdges}
        nodeMap={nodeMap}
        onClear={() => setSelected(null)}
      />
    </div>
  );

  return (
    <div>
      <div className="networkViewToolbar">
        <div className="networkViewTabs">
          <button
            type="button"
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            Table
          </button>
          <button
            type="button"
            className={view === "network" ? "active" : ""}
            onClick={() => setView("network")}
          >
            Network
          </button>
        </div>
        <span>
          {selectedNode
            ? "Focused · " + selectedNode.label
            : "點任一 node 聚焦；點空白或同一 node 還原"}
        </span>
      </div>

      {view === "table" ? tableView : networkView}
    </div>
  );
}

function ConnectionPanel({
  selectedNode,
  edges,
  nodeMap,
  onClear
}: {
  selectedNode: KeywordNetworkNode | null;
  edges: KeywordNetworkEdge[];
  nodeMap: Map<string, KeywordNetworkNode>;
  onClear: () => void;
}) {
  return (
    <aside className="networkEdgesPanel">
      <div className="networkEdgesHead">
        <div>
          <span>
            {selectedNode
              ? "Connections · " + selectedNode.label
              : "Daily strongest connections"}
          </span>
          {selectedNode ? (
            <small>
              {TITLES[selectedNode.layer]} · count {selectedNode.count}
            </small>
          ) : null}
        </div>
        {selectedNode ? (
          <button type="button" onClick={onClear}>
            清除
          </button>
        ) : null}
      </div>

      <div className="networkEdgeList">
        {edges.slice(0, 20).map((edge, index) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          const width = Math.min(100, 18 + edge.weight * 10);
          return (
            <div
              className="networkEdgeRow"
              key={edge.source + edge.target + index}
            >
              <span>{source?.label || edge.source}</span>
              <i style={{ width: width + "%" }} />
              <span>{target?.label || edge.target}</span>
              <strong>{edge.weight}</strong>
            </div>
          );
        })}
        {edges.length === 0 ? (
          <p className="networkNoConnections">目前沒有直接連線。</p>
        ) : null}
      </div>
    </aside>
  );
}
