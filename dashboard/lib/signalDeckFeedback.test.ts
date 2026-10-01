import test from "node:test";
import assert from "node:assert/strict";
import { buildRelevanceProfile } from "./signalDeckFeedback";

const base = {
  id: "x",
  post_id: "x",
  permalink: "https://www.threads.com/@x/post/x",
  snapshot_id: "deck_2026-10-01_3d_x",
  window: "3d" as const,
  category: "交通／散場",
  text_excerpt: "散場交通",
  base_score: 10,
  deck_generated_at: "2026-10-01T00:00:00Z"
};

test("post-level weekly profile learns text features more strongly than category", () => {
  const now = new Date("2026-10-05T00:25:00Z");
  const rows = [
    { ...base, id: "1", post_key: "p1", label: "relevant" as const, feature_tags: ["transport_need", "question_intent"], reviewed_at: "2026-10-01T01:00:00Z" },
    { ...base, id: "2", post_key: "p2", label: "relevant" as const, feature_tags: ["transport_need"], reviewed_at: "2026-10-02T01:00:00Z" },
    { ...base, id: "3", post_key: "p3", label: "irrelevant" as const, category: "場館／現場體驗", feature_tags: ["fan_narrative", "long_fandom_story"], reviewed_at: "2026-10-03T01:00:00Z" }
  ];

  const profile = buildRelevanceProfile(rows, now);
  assert.equal(profile.schema_version, "relevance-profile-v0.2");
  assert.equal(profile.feedback_count, 3);
  assert.ok(profile.feature_weights.transport_need > 0);
  assert.ok(profile.feature_weights.fan_narrative < 0);
  assert.ok(Math.abs(profile.feature_weights.fan_narrative) > Math.abs(profile.category_weights["場館／現場體驗"]));
});

test("weekly profile ignores feedback older than 90 days", () => {
  const now = new Date("2026-10-05T00:25:00Z");
  const profile = buildRelevanceProfile([
    {
      ...base,
      id: "old",
      post_key: "old",
      label: "irrelevant",
      category: "旧",
      feature_tags: ["old_feature"],
      reviewed_at: "2026-01-01T00:00:00Z"
    }
  ], now);

  assert.equal(profile.feedback_count, 0);
  assert.equal(profile.feature_weights.old_feature, undefined);
});
