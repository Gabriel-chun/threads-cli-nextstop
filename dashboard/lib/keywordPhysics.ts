import type { KeywordNetworkNode } from "./keywordNetwork";

/** Control Room-inspired motion, preserving the semantic source-of-truth graph. */
export type Particle = {
  id: string; x: number; y: number; vx: number; vy: number;
  ax: number; ay: number; radius: number; phase: number;
};
export type Point = { x: number; y: number };

export function particleRadius(count: number): number {
  return Math.max(7, Math.min(24, 7 + Math.sqrt(Math.max(0, count)) * 2.3));
}

export function createKeywordParticles(nodes: KeywordNetworkNode[], width: number, height: number): Particle[] {
  const n = Math.max(1, nodes.length);
  const cx = width / 2, cy = height / 2;
  const rx = Math.max(28, width / 2 - 42);
  const ry = Math.max(28, height / 2 - 42);
  return nodes.map((node, i) => {
    const angle = i * 2.399963229728653; // Golden angle; deterministic across refreshes.
    const r = Math.sqrt((i + .7) / n) * .87;
    const ax = cx + Math.cos(angle) * rx * r;
    const ay = cy + Math.sin(angle) * ry * r;
    return { id: node.id, x: ax, y: ay, vx: 0, vy: 0, ax, ay, phase: i * .83, radius: particleRadius(node.count) };
  });
}

export function nearestKeywordParticle(particles: Particle[], point: Point): Particle | null {
  let best: Particle | null = null;
  let distance = Infinity;
  for (const particle of particles) {
    const d = Math.hypot(particle.x - point.x, particle.y - point.y);
    if (d < Math.max(18, particle.radius + 9) && d < distance) { best = particle; distance = d; }
  }
  return best;
}

/** Integrate one ~22ms frame. Animated motion is decorative, not data inference. */
export function stepKeywordParticles(
  particles: Particle[], width: number, height: number, now: number,
  pointer: Point | null, heldId: string | null = null
): void {
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    if (a.id === heldId) continue;
    a.vx += (a.ax - a.x) * .00020 + Math.sin(now * .0008 + a.phase) * .017;
    a.vy += (a.ay - a.y) * .00020 + Math.cos(now * .00068 + a.phase) * .015;
    if (pointer) {
      const dx = a.x - pointer.x, dy = a.y - pointer.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 110 && dist > a.radius + 6) {
        const strength = (110 - dist) / 110 * .09;
        a.vx += dx / dist * strength;
        a.vy += dy / dist * strength;
      }
    }
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const gap = a.radius + b.radius + 16;
      if (dist < gap) {
        const force = (gap - dist) * .006;
        const ux = dx / dist, uy = dy / dist;
        a.vx -= ux * force; a.vy -= uy * force;
        if (b.id !== heldId) { b.vx += ux * force; b.vy += uy * force; }
      }
    }
  }
  for (const a of particles) {
    if (a.id !== heldId) {
      a.vx *= .952; a.vy *= .952;
      a.x += Math.max(-1.65, Math.min(1.65, a.vx));
      a.y += Math.max(-1.65, Math.min(1.65, a.vy));
    }
    const pad = a.radius + 12;
    if (a.x < pad) { a.x = pad; a.vx = Math.abs(a.vx) * .7; }
    if (a.x > width - pad) { a.x = width - pad; a.vx = -Math.abs(a.vx) * .7; }
    if (a.y < pad) { a.y = pad; a.vy = Math.abs(a.vy) * .7; }
    if (a.y > height - pad) { a.y = height - pad; a.vy = -Math.abs(a.vy) * .7; }
  }
}

/** Only source-recorded edges should render. Proximity NEVER creates an edge. */
export function linkedKeywordIds(edges: { source: string; target: string }[], selectedId: string | null): Set<string> {
  if (!selectedId) return new Set();
  const ids = new Set<string>([selectedId]);
  for (const edge of edges) {
    if (edge.source === selectedId) ids.add(edge.target);
    if (edge.target === selectedId) ids.add(edge.source);
  }
  return ids;
}
