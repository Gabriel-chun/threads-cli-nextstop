import test from "node:test";
import assert from "node:assert/strict";
import { buildRelevanceProfile } from "./signalDeckFeedback";

test("weekly profile prefers repeatedly relevant features", () => {
  const now = new Date("2026-10-05T00:25:00Z");
  const base = {
    id: "x",
    card_id: "sig_x",
    window: "3d" as const,
    category: "交通／散場",
    headline: "交通",
    summary: "x",
    base_score: 10,
    deck_generated_at: "2026-10-01T00:00:00Z"
  };
  const rows = [
    { ...base, id: "1", snapshot_id: "a", label: "relevant" as const, feature_tags: ["transport_need", "question_intent"], reviewed_at: "2026-10-01T01:00:00Z" },
    { ...base, id: "2", snapshot_id: "b", label: "relevant" as const, feature_tags: ["transport_need"], reviewed_at: "2026-10-02T01:00:00Z" },
    { ...base, id: "3", snapshot_id: "c", label: "irrelevant" as const, category: "場館／現場體驗", feature_tags: ["fan_narrative"], reviewed_at: "2026-10-03T01:00:00Z" }
  ];
  const profile = buildRelevanceProfile(rows, now);
  assert.equal(profile.feedback_count, 3);
  assert.ok(profile.feature_weights.transport_need > 0);
  assert.ok(profile.feature_weights.fan_narrative < 0);
  assert.ok(profile.category_weights["交通／散場"] > 0);
});

test("weekly profile ignores feedback older than 90 days", () => {
  const now = new Date("2026-10-05T00:25:00Z");
  const profile = buildRelevanceProfile([
    {
      id: "old",
      snapshot_id: "old",
      card_id: "sig_old",
      window: "3d",
      label: "irrelevant",
      category: "旧",
      headline: "old",
      summary: "old",
      feature_tags: ["old_feature"],
      base_score: 1,
      deck_generated_at: "2026-01-01T00:00:00Z",
      reviewed_at: "2026-01-01T00:00:00Z"
    }
  ], now);
  assert.equal(profile.feedback_count, 0);
  assert.equal(profile.feature_weights.old_feature, undefined);
});
