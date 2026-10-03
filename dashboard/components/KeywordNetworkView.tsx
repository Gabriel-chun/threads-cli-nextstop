"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KeywordNetwork,
  KeywordNetworkEdge,
  KeywordNetworkNode
} from "../lib/keywordNetwork";

type ViewMode = "table" | "network";
type Point = { x: number; y: number };
type DragState = {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPoint: Point;
  moved: boolean;
};

const LAYERS = ["recall", "language", "need", "keyword"] as const;
type Layer = (typeof LAYERS)[number];

const TITLES: Record<Layer, string> = {
  recall: "Base Recall",
  language: "Language Context",
  need: "Need Network",
  keyword: "Top Keywords"
};

const LANE_BOUNDS: Record<Layer, { left: number; right: number }> = {
  recall: { left: 45, right: 235 },
  language: { left: 280, right: 485 },
  need: { left: 535, right: 790 },
  keyword: { left: 840, right: 1060 }
};

const GRAPH_TOP = 62;
const GRAPH_BOTTOM = 620;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function nodeRadius(node: KeywordNetworkNode) {
  return Math.max(9, Math.min(22, 9 + Math.sqrt(Math.max(0, node.count)) * 2.1));
}

function initialLayout(
  grouped: Record<Layer, KeywordNetworkNode[]>
): Map<string, Point> {
  const out = new Map<string, Point>();

  for (const layer of LAYERS) {
    const rows = grouped[layer];
    const bounds = LANE_BOUNDS[layer];
    const laneWidth = bounds.right - bounds.left;
    const centerX = (bounds.left + bounds.right) / 2;
    const stepY = (GRAPH_BOTTOM - GRAPH_TOP) / Math.max(1, rows.length + 1);

    rows.forEach((node, index) => {
      const stagger = ((index % 3) - 1) * Math.min(34, laneWidth * 0.16);
      const wave = Math.sin((index + 1) * 1.7) * 10;

      out.set(node.id, {
        x: clamp(centerX + stagger, bounds.left + 24, bounds.right - 24),
        y: clamp(
          GRAPH_TOP + stepY * (index + 1) + wave,
          GRAPH_TOP + 20,
          GRAPH_BOTTOM - 20
        )
      });
    });
  }

  return out;
}

function labelWidth(label: string) {
  const chars = Array.from(label).length;
  return clamp(28 + chars * 10, 54, 132);
}

export function KeywordNetworkView({ data }: { data: KeywordNetwork }) {
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, Point>>(new Map());
  const [drag, setDrag] = useState<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

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
      ) as Record<Layer, KeywordNetworkNode[]>,
    [activeNodes]
  );

  const baseLayout = useMemo(() => initialLayout(grouped), [grouped]);

  useEffect(() => {
    setPositions(new Map(baseLayout));
    setSelected(null);
    setDrag(null);
  }, [baseLayout, data.network_date]);

  const pointFor = (id: string) => positions.get(id) || baseLayout.get(id);

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

  function clientToSvg(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 1100,
      y: ((clientY - rect.top) / rect.height) * 650
    };
  }

  function onNodePointerDown(
    event: React.PointerEvent<SVGGElement>,
    node: KeywordNetworkNode
  ) {
    event.stopPropagation();
    const point = pointFor(node.id);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: node.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: point,
      moved: false
    });
  }

  function onNodePointerMove(
    event: React.PointerEvent<SVGGElement>,
    node: KeywordNetworkNode
  ) {
    if (!drag || drag.id !== node.id || drag.pointerId !== event.pointerId) return;

    const startSvg = clientToSvg(drag.startClientX, drag.startClientY);
    const nowSvg = clientToSvg(event.clientX, event.clientY);
    if (!startSvg || !nowSvg) return;

    const dx = nowSvg.x - startSvg.x;
    const dy = nowSvg.y - startSvg.y;
    const moved = drag.moved || Math.hypot(dx, dy) > 4;
    const bounds = LANE_BOUNDS[node.layer];

    setDrag((current) => (current ? { ...current, moved } : current));
    setPositions((current) => {
      const next = new Map(current);
      next.set(node.id, {
        x: clamp(drag.startPoint.x + dx, bounds.left + 20, bounds.right - 20),
        y: clamp(drag.startPoint.y + dy, GRAPH_TOP + 18, GRAPH_BOTTOM - 18)
      });
      return next;
    });
  }

  function onNodePointerUp(
    event: React.PointerEvent<SVGGElement>,
    node: KeywordNetworkNode
  ) {
    if (!drag || drag.id !== node.id || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    setDrag(null);

    if (!moved) {
      setSelected((current) => (current === node.id ? null : node.id));
    }
  }

  function resetLayout() {
    setPositions(new Map(baseLayout));
    setSelected(null);
    setDrag(null);
  }

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
      <div className="networkGraphCanvas">
        <svg
          ref={svgRef}
          viewBox="0 0 1100 650"
          aria-label="Daily Keyword Network graph"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <g className="networkLaneBands">
            {LAYERS.map((layer) => {
              const bounds = LANE_BOUNDS[layer];
              return (
                <g key={layer}>
                  <rect
                    x={bounds.left}
                    y="42"
                    width={bounds.right - bounds.left}
                    height="590"
                    rx="18"
                  />
                  <text
                    x={(bounds.left + bounds.right) / 2}
                    y="27"
                    textAnchor="middle"
                  >
                    {TITLES[layer]}
                  </text>
                </g>
              );
            })}
          </g>

          <g className="networkGraphEdges">
            {data.edges.map((edge, index) => {
              const source = pointFor(edge.source);
              const target = pointFor(edge.target);
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
              const point = pointFor(node.id);
              if (!point) return null;

              const dim = Boolean(selected && !connected.has(node.id));
              const selectedHere = selected === node.id;
              const draggingHere = drag?.id === node.id;
              const r = nodeRadius(node);
              const bounds = LANE_BOUNDS[node.layer];
              const width = labelWidth(node.label);
              const roomRight = bounds.right - (point.x + r);
              const roomLeft = point.x - r - bounds.left;
              const placeRight = roomRight >= width + 14 || roomRight >= roomLeft;
              const labelX = placeRight
                ? point.x + r + 8
                : point.x - r - width - 8;
              const labelY = point.y - 17;

              return (
                <g
                  key={node.id}
                  className={[
                    "networkGraphNode",
                    node.layer,
                    dim ? "dim" : "",
                    selectedHere ? "selected" : "",
                    draggingHere ? "dragging" : ""
                  ].join(" ")}
                  onPointerDown={(event) => onNodePointerDown(event, node)}
                  onPointerMove={(event) => onNodePointerMove(event, node)}
                  onPointerUp={(event) => onNodePointerUp(event, node)}
                  onPointerCancel={() => setDrag(null)}
                  role="button"
                  tabIndex={0}
                >
                  <circle cx={point.x} cy={point.y} r={r} />
                  <g className="networkGraphLabel">
                    <rect
                      x={labelX}
                      y={labelY}
                      width={width}
                      height="34"
                      rx="8"
                    />
                    <text x={labelX + 9} y={point.y - 1}>
                      {node.label}
                    </text>
                    <text
                      className="networkGraphNodeCount"
                      x={labelX + 9}
                      y={point.y + 11}
                    >
                      {node.count}
                    </text>
                  </g>
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

        <div className="networkToolbarActions">
          <span>
            {selectedNode
              ? "Focused · " + selectedNode.label
              : view === "network"
                ? "拖曳 node 可整理版面；node 不會離開自己的 lane"
                : "點任一 node 聚焦"}
          </span>
          {view === "network" ? (
            <button type="button" onClick={resetLayout}>
              Reset layout
            </button>
          ) : null}
        </div>
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
