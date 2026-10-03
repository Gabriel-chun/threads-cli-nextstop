"use client";

import { useMemo, useState } from "react";
import type { KeywordNetwork } from "../lib/keywordNetwork";

const LAYERS = ["recall", "language", "need", "keyword"] as const;

const TITLES: Record<(typeof LAYERS)[number], string> = {
  recall: "Base Recall",
  language: "Language Context",
  need: "Need Network",
  keyword: "Top Keywords"
};

export function KeywordNetworkView({ data }: { data: KeywordNetwork }) {
  const [selected, setSelected] = useState<string | null>(null);

  const nodeMap = useMemo(
    () => new Map(data.nodes.map((node) => [node.id, node])),
    [data.nodes]
  );

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        LAYERS.map((layer) => [
          layer,
          data.nodes.filter((node) => node.layer === layer && node.count > 0)
        ])
      ) as Record<(typeof LAYERS)[number], typeof data.nodes>,
    [data.nodes]
  );

  const activeEdges = selected
    ? data.edges.filter((edge) => edge.source === selected || edge.target === selected)
    : data.edges;

  const related = new Set(activeEdges.flatMap((edge) => [edge.source, edge.target]));

  return (
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
                const dim = Boolean(
                  selected && !related.has(node.id) && node.id !== selected
                );

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
                    title={node.label}
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

      <div className="networkEdgesPanel">
        <div className="networkEdgesHead">
          <span>
            {selected
              ? "Connections · " + (nodeMap.get(selected)?.label || selected)
              : "Daily strongest connections"}
          </span>
          {selected ? (
            <button type="button" onClick={() => setSelected(null)}>
              清除
            </button>
          ) : null}
        </div>

        <div className="networkEdgeList">
          {activeEdges.slice(0, 18).map((edge, index) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            const width = Math.min(100, 20 + edge.weight * 10);

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
        </div>
      </div>
    </div>
  );
}
