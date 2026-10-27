import test from "node:test";
import assert from "node:assert/strict";
import { INTENT_SCENARIOS, verifiedOffers, type AffiliateProduct } from "./affiliateBridge";

const checked: AffiliateProduct = {
  id: "offer-demo",
  merchant: "Test Merchant",
  title: "Reviewed Item",
  intentKeys: ["intercity"],
  status: "verified",
  affiliateUrl: "https://store.example.com/products/123?cid=test",
  verifiedAt: "2026-10-27T00:00:00.000Z"
};

test("each defined intent has a unique key", () => {
  assert.equal(new Set(INTENT_SCENARIOS.map((s) => s.id)).size, INTENT_SCENARIOS.length);
});

test("empty candidate catalog cannot produce outbound offers", () => {
  assert.deepEqual(verifiedOffers([], "intercity", ["example.com"]), []);
});

test("only human-verified offers for the selected intent and allowed hosts are shown", () => {
  const catalog: AffiliateProduct[] = [
    checked,
    { ...checked, id: "candidate", status: "candidate" },
    { ...checked, id: "other-intent", intentKeys: ["last_mile"] },
    { ...checked, id: "unsafe-host", affiliateUrl: "https://other.invalid/item" },
    { ...checked, id: "unverified-url", verifiedAt: undefined }
  ];
  assert.deepEqual(verifiedOffers(catalog, "intercity", ["example.com"]).map((p) => p.id), ["offer-demo"]);
  assert.deepEqual(verifiedOffers(catalog, "overnight", ["example.com"]), []);
});

test("rejects non-HTTPS, lookalike, credentialed or malformed URLs", () => {
  const badUrls = [
    "http://store.example.com/item",
    "https://example.com.evil.invalid/item",
    "https://user:pass@example.com/item",
    "javascript:alert(1)",
    "not a url"
  ];
  for (const affiliateUrl of badUrls) {
    assert.deepEqual(verifiedOffers([{ ...checked, affiliateUrl }], "intercity", ["example.com"]), []);
  }
});
