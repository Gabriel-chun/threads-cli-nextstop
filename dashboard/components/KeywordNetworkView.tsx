"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KeywordNetwork,
  KeywordNetworkEdge,
  KeywordNetworkNode
} from "../lib/keywordNetwork";
import { useI18n } from "./I18nProvider";
import { KeywordParticleCanvas } from "./KeywordParticleCanvas";
import { KeywordHistoryPanel } from "./KeywordHistoryPanel";
import type { KeywordNetworkOverlay, NetworkWindow } from "../lib/keywordNetworkHistory";

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

function layerTitle(layer:Layer,t:(key:string,values?:Record<string,string|number>)=>string){
  return t("network.layer."+layer);
}

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

export function KeywordNetworkView({ data, overlays }: { data: KeywordNetwork; overlays: Record<NetworkWindow,KeywordNetworkOverlay>|null }) {
  const {t}=useI18n();
  const [view, setView] = useState<ViewMode>("network");
  const [windowDays,setWindowDays]=useState<NetworkWindow>(1);
  const current=overlays?.[windowDays];
  const graph=current?.graph||data;
  const [particleReset, setParticleReset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, Point>>(new Map());
  const [drag, setDrag] = useState<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const activeNodes = useMemo(
    () => graph.nodes.filter((node) => node.count > 0),
    [graph.nodes]
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
  }, [baseLayout, graph.network_date]);

  const pointFor = (id: string) => positions.get(id) || baseLayout.get(id);

  const activeEdges = useMemo(
    () =>
      selected
        ? graph.edges.filter((edge) => edge.source === selected || edge.target === selected)
        : graph.edges,
    [graph.edges, selected]
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
  const maxWeight = Math.max(1, ...graph.edges.map((edge) => edge.weight));

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
    setParticleReset(v=>v+1);
    setPositions(new Map(baseLayout));
    setSelected(null);
    setDrag(null);
  }

  const tableView = (
    <div className="networkBoard quietNetworkBoard">
      <div className="networkColumns">
        {LAYERS.map((layer) => (
          <section className="networkColumn quietNetworkColumn" key={layer}>
            <div className="networkColumnHead">
              <span>{layerTitle(layer,t)}</span>
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
      {selectedNode ? <ConnectionPanel
        selectedNode={selectedNode}
        edges={activeEdges}
        nodeMap={nodeMap}
        onClear={() => setSelected(null)}
        t={t}
      /> : null}
    </div>
  );

  const networkView = (
    <div className={`networkGraphLayout quietGraphLayout ${selectedNode ? "hasSelection" : ""}`}>
      <div className="networkGraphCanvas quietGraphCanvas">
        <KeywordParticleCanvas
          nodes={activeNodes}
          edges={graph.edges}
          edgeDays={current?.edgeDays}
          selectedId={selected}
          onSelect={setSelected}
          resetKey={particleReset}
        />
      </div>
      <ConnectionPanel
        selectedNode={selectedNode}
        edges={activeEdges}
        nodeMap={nodeMap}
        onClear={() => setSelected(null)}
        t={t}
      />
    </div>
  );

  return (
    <div className="quietNetworkView">
      <div className="keywordRangeToolbar">
        <div className="networkViewTabs quietTabs" role="group" aria-label={t("network.rangeLabel")}>
          {([1,3,7] as const).map(days=><button key={days} type="button" className={windowDays===days?"active":""} aria-pressed={windowDays===days} onClick={()=>{setWindowDays(days);setSelected(null);}}>{t("network.window."+days)}</button>)}
        </div>
        <small>{current?t("network.availableDays",{count:current.loadedDays,total:windowDays}):t("common.noData")}</small>
      </div>
      <div className="networkViewToolbar quietToolbar">
        <div className="networkViewTabs quietTabs">
          <button
            type="button"
            className={view === "network" ? "active" : ""}
            onClick={() => setView("network")}
          >
            {t("network.graph")}
          </button>
          <button
            type="button"
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            {t("network.table")}
          </button>
        </div>

        <div className="networkToolbarActions quietToolbarActions">
          <span>
            {selectedNode
              ? t("network.focused",{label:selectedNode.label})
              : t("network.clickHelp")}
          </span>
          {view === "network" ? (
            <button type="button" onClick={resetLayout}>
              {t("network.reset")}
            </button>
          ) : null}
        </div>
      </div>

      {view === "table" ? tableView : networkView}
      {current ? <KeywordHistoryPanel overlay={current}/> : null}
    </div>
  );
}

function ConnectionPanel({
  selectedNode,
  edges,
  nodeMap,
  onClear,
  t
}: {
  selectedNode: KeywordNetworkNode | null;
  edges: KeywordNetworkEdge[];
  nodeMap: Map<string, KeywordNetworkNode>;
  onClear: () => void;
  t: (key:string,values?:Record<string,string|number>)=>string;
}) {
  return (
    <aside className="networkEdgesPanel quietConnectionPanel">
      <div className="networkEdgesHead">
        <div>
          <span>
            {selectedNode
              ? t("network.connectionsFor",{label:selectedNode.label})
              : t("network.dailyStrongest")}
          </span>
          {selectedNode ? (
            <small>
              {layerTitle(selectedNode.layer,t)} · {t("network.count",{count:selectedNode.count})}
            </small>
          ) : null}
        </div>
        {selectedNode ? (
          <button type="button" onClick={onClear}>
            {t("common.close")}
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
          <p className="networkNoConnections">{t("network.noConnections")}</p>
        ) : null}
      </div>
    </aside>
  );
}
