import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewBatch,
  nextUnreviewedKeys,
  remainingUnreviewedCount
} from "./reviewQuota";

function cards(total: number, reviewedThrough: number) {
  return Array.from({ length: total }, (_, index) => ({
    post_key: `p${index + 1}`,
    triage_label:
      index < reviewedThrough
        ? (index % 2 === 0 ? "relevant" as const : "irrelevant" as const)
        : null
  }));
}

test("plus-ten skips already-reviewed reserve positions and allocates ten real unreviewed cards", () => {
  const rows = cards(100, 60);
  const next = nextUnreviewedKeys(rows, 40, [], 10);

  assert.deepEqual(next, [
    "p61", "p62", "p63", "p64", "p65",
    "p66", "p67", "p68", "p69", "p70"
  ]);

  const batch = buildReviewBatch(rows, 40, next);
  assert.equal(batch.length, 50);
  assert.equal(batch.filter((card) => !card.triage_label).length, 10);
  assert.equal(remainingUnreviewedCount(rows, 40, next), 30);
});

test("all-reviewed window exposes no extra quota", () => {
  const rows = cards(100, 100);
  assert.deepEqual(nextUnreviewedKeys(rows, 40, [], 10), []);
  assert.equal(remainingUnreviewedCount(rows, 40, []), 0);
});

test("extra allocation stays fixed after those cards are reviewed", () => {
  const rows = cards(70, 40);
  const extra = nextUnreviewedKeys(rows, 40, [], 10);
  const reviewedRows = rows.map((card) =>
    extra.includes(card.post_key)
      ? { ...card, triage_label: "relevant" as const }
      : card
  );

  const batch = buildReviewBatch(reviewedRows, 40, extra);
  assert.equal(batch.length, 50);
  assert.equal(batch.filter((card) => !card.triage_label).length, 0);
  assert.equal(remainingUnreviewedCount(reviewedRows, 40, extra), 20);
});
