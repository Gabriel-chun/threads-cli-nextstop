import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyReviewArchive, taipeiCalendarDate } from "./reviewArchive";
import type { SignalDeckFeedback } from "./signalDeckFeedback";

const base: SignalDeckFeedback = {
  id: "fb_x",
  post_key: "post_x",
  post_id: "x",
  permalink: "https://www.threads.com/@x/post/x",
  snapshot_id: "deck_2026-10-01_3d_x",
  window: "3d",
  label: "relevant",
  category: "交通／散場",
  username: "x",
  posted_at: "2026-10-01T12:00:00Z",
  query: "演唱會",
  text_excerpt: "散場交通",
  feature_tags: ["transport_need"],
  base_score: 60,
  deck_generated_at: "2026-10-01T00:00:00Z",
  reviewed_at: "2026-10-01T15:59:59Z"
};

test("Taipei calendar date rolls over at UTC+8 midnight", () => {
  assert.equal(taipeiCalendarDate("2026-10-01T15:59:59Z"), "2026-10-01");
  assert.equal(taipeiCalendarDate("2026-10-01T16:00:00Z"), "2026-10-02");
});

test("daily archive contains only the requested Taipei review day", () => {
  const rows: SignalDeckFeedback[] = [
    base,
    { ...base, id: "fb_y", post_key: "post_y", label: "irrelevant", reviewed_at: "2026-10-01T16:00:00Z" }
  ];

  const first = buildDailyReviewArchive(rows, "2026-10-01", new Date("2026-10-01T16:01:00Z"));
  assert.equal(first.count, 1);
  assert.equal(first.relevant_count, 1);
  assert.equal(first.rows[0].post_key, "post_x");

  const second = buildDailyReviewArchive(rows, "2026-10-02", new Date("2026-10-02T16:01:00Z"));
  assert.equal(second.count, 1);
  assert.equal(second.irrelevant_count, 1);
  assert.equal(second.rows[0].post_key, "post_y");
});

test("category edits are archived on the edit date even when review is older", () => {
  const archive = buildDailyReviewArchive(
    [
      {
        id: "fb_old",
        post_key: "post_old",
        snapshot_id: "deck_old",
        window: "3d",
        label: "relevant",
        category: "交通／散場",
        original_category: "其他演出內容",
        category_source: "human_override",
        category_updated_at: "2026-10-02T00:30:00Z",
        text_excerpt: "散場交通",
        feature_tags: ["transport_need"],
        base_score: 50,
        deck_generated_at: "2026-10-01T00:00:00Z",
        reviewed_at: "2026-10-01T03:00:00Z"
      }
    ],
    "2026-10-02",
    new Date("2026-10-02T16:00:00Z")
  );

  assert.equal(archive.count, 1);
  assert.equal(archive.rows[0].category, "交通／散場");
  assert.equal(archive.rows[0].original_category, "其他演出內容");
  assert.equal(archive.rows[0].category_source, "human_override");
});


test("label edits are archived on the edit date even when review is older", () => {
  const archive = buildDailyReviewArchive(
    [
      {
        id: "fb_label_old",
        post_key: "post_label_old",
        snapshot_id: "deck_label_old",
        window: "3d",
        label: "irrelevant",
        original_label: "relevant",
        label_updated_at: "2026-10-02T01:20:00Z",
        category: "其他演出內容",
        text_excerpt: "舊 review 今日重新判斷",
        feature_tags: ["long_fandom_story"],
        base_score: 40,
        deck_generated_at: "2026-10-01T00:00:00Z",
        reviewed_at: "2026-10-01T03:00:00Z"
      }
    ],
    "2026-10-02",
    new Date("2026-10-02T16:00:00Z")
  );

  assert.equal(archive.count, 1);
  assert.equal(archive.irrelevant_count, 1);
  assert.equal(archive.rows[0].label, "irrelevant");
  assert.equal(archive.rows[0].original_label, "relevant");
  assert.equal(archive.rows[0].label_updated_at, "2026-10-02T01:20:00Z");
});


test("daily archive counts Unsure separately", () => {
  const archive = buildDailyReviewArchive(
    [
      {
        ...base,
        id: "fb_unsure",
        post_key: "post_unsure",
        label: "unsure",
        reviewed_at: "2026-10-01T12:00:00Z"
      }
    ],
    "2026-10-01",
    new Date("2026-10-01T16:01:00Z")
  );
  assert.equal(archive.count, 1);
  assert.equal(archive.relevant_count, 0);
  assert.equal(archive.irrelevant_count, 0);
  assert.equal(archive.unsure_count, 1);
});
