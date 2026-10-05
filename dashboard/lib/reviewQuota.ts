export type ReviewQuotaCard = {
  post_key: string;
  triage_label?: "relevant" | "irrelevant" | "unsure" | null;
};

function clampedBaseLimit(cards: ReviewQuotaCard[], baseLimit: number) {
  return Math.max(0, Math.min(baseLimit, cards.length));
}

export function buildReviewBatch<T extends ReviewQuotaCard>(
  cards: T[],
  baseLimit: number,
  extraKeys: string[]
): T[] {
  const limit = clampedBaseLimit(cards, baseLimit);
  const base = cards.slice(0, limit);
  const baseKeys = new Set(base.map((card) => card.post_key));
  const extraSet = new Set(extraKeys);

  const extras = cards.filter(
    (card) => !baseKeys.has(card.post_key) && extraSet.has(card.post_key)
  );

  return [...base, ...extras];
}

export function nextUnreviewedKeys(
  cards: ReviewQuotaCard[],
  baseLimit: number,
  extraKeys: string[],
  step: number
): string[] {
  const limit = clampedBaseLimit(cards, baseLimit);
  const allocated = new Set([
    ...cards.slice(0, limit).map((card) => card.post_key),
    ...extraKeys
  ]);

  return cards
    .filter((card) => !allocated.has(card.post_key) && !card.triage_label)
    .slice(0, Math.max(0, step))
    .map((card) => card.post_key);
}

export function remainingUnreviewedCount(
  cards: ReviewQuotaCard[],
  baseLimit: number,
  extraKeys: string[]
): number {
  const limit = clampedBaseLimit(cards, baseLimit);
  const allocated = new Set([
    ...cards.slice(0, limit).map((card) => card.post_key),
    ...extraKeys
  ]);

  return cards.filter(
    (card) => !allocated.has(card.post_key) && !card.triage_label
  ).length;
}
