import test from "node:test";
import assert from "node:assert/strict";
import { deidentifyReviewRow, deidentifyReviewText } from "./reviewLedger";

test("masks handles, email and inline URLs", () => {
  assert.equal(
    deidentifyReviewText("hi @someone mail a@example.com https://example.com/x"),
    "hi @user mail [email] [link]"
  );
});

test("review row removes direct identifiers but keeps a safe Threads source link", () => {
  const row = deidentifyReviewRow({
    id: "fb_raw",
    post_key: "threads:123",
    post_id: "123",
    username: "someone",
    permalink: "https://www.threads.com/@someone/post/ABC",
    label: "relevant",
    category: "交通／散場",
    original_category: "其他演出內容",
    category_source: "human_override",
    category_updated_at: "2026-10-02T01:00:00Z",
    text_excerpt: "@someone 想問入場",
    reviewed_at: "2026-10-01T10:00:00Z",
    window: "3d",
    feature_tags: ["ticketing_need"],
    base_score: 60
  });

  assert.match(row.anonymous_id, /^SIG-[A-F0-9]{8}$/);
  assert.equal(row.excerpt, "@user 想問入場");
  assert.equal(row.label, "relevant");
  assert.equal(row.category, "交通／散場");
  assert.equal(row.original_category, "其他演出內容");
  assert.equal(row.category_source, "human_override");
  assert.equal(row.evidence_url, "/api/reviews/source/" + row.anonymous_id);
  assert.equal("username" in row, false);
  assert.equal("post_key" in row, false);
  assert.equal("post_id" in row, false);
});
