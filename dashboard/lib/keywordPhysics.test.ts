import test from "node:test";
import assert from "node:assert/strict";
import { createKeywordParticles, linkedKeywordIds, nearestKeywordParticle, particleRadius, stepKeywordParticles } from "./keywordPhysics";
import type { KeywordNetworkNode } from "./keywordNetwork";

const nodes: KeywordNetworkNode[] = [
  { id: "a", label: "演唱會", layer: "recall", count: 2 },
  { id: "b", label: "交通", layer: "need", count: 20 },
  { id: "c", label: "台灣", layer: "language", count: 1 }
];

test("stable golden-angle positions and weight-based radii", () => {
  const a = createKeywordParticles(nodes, 900, 580);
  const b = createKeywordParticles(nodes, 900, 580);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.ok(particleRadius(20) > particleRadius(2));
  assert.ok(a.every(p => p.x > p.radius && p.x < 900 - p.radius));
});

test("motion remains bounded; reduced motion can skip stepping entirely", () => {
  const nodesCopy = createKeywordParticles(nodes, 780, 500);
  for (let i = 0; i < 300; i++) stepKeywordParticles(nodesCopy, 780, 500, i * 22, { x: 390, y: 250 });
  assert.ok(nodesCopy.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= p.radius && p.x <= 780 - p.radius && p.y >= p.radius && p.y <= 500 - p.radius));
  assert.equal(nearestKeywordParticle(nodesCopy, { x: nodesCopy[0].x, y: nodesCopy[0].y })?.id, "a");
});

test("selection includes only direct evidence-backed edges, not nearby particles", () => {
  const edges = [{source:"a",target:"b"}, {source:"b",target:"c"}];
  assert.deepEqual([...linkedKeywordIds(edges,"a")].sort(), ["a","b"]);
  assert.deepEqual([...linkedKeywordIds(edges,"c")].sort(), ["b","c"]);
  assert.equal(linkedKeywordIds(edges,null).size,0);
});
