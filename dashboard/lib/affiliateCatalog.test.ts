import test from "node:test";
import assert from "node:assert/strict";
import { isVerifiedAffiliateUrl, matchingAffiliateProducts, parseAffiliateCatalog } from "./affiliateCatalog";

const base = {
  schema_version: "nextstop-affiliate-catalog-v0.1",
  products: [{
    product_id: "550020", priority: 1,
    title_zh: "演唱會接送", title_en: "Concert transfer",
    context_zh: "需核對場次", context_en: "Check date",
    cluster_ids: ["post_show_return"],
    public_url: "https://www.kkday.com/zh-tw/product/550020",
    affiliate_url: null
  }]
};

test("only curated KKday pages enter the demand-to-product mapping", () => {
  const products = parseAffiliateCatalog(base);
  assert.equal(products.length, 1);
  assert.equal(products[0].affiliate_url, null);
  assert.deepEqual(matchingAffiliateProducts(products, "post_show_return").map(p=>p.product_id), ["550020"]);
  assert.equal(matchingAffiliateProducts(products, "ticket_entry").length, 0);
});

test("reject spoofed hosts and untracked links; recognize explicit KKpartners CID", () => {
  assert.equal(isVerifiedAffiliateUrl("https://www.kkday.com/zh-tw/product/550020", "550020"), false);
  assert.equal(isVerifiedAffiliateUrl("https://kkday.com.evil.test/zh-tw/product/550020?cid=123", "550020"), false);
  assert.equal(isVerifiedAffiliateUrl("https://www.kkday.com/zh-tw/product/1111?cid=123", "550020"), false);
  assert.equal(isVerifiedAffiliateUrl("https://www.kkday.com/zh-tw/product/550020?cid=12345", "550020"), true);
  const products = parseAffiliateCatalog({
    ...base, products: [{...base.products[0], affiliate_url:"https://www.kkday.com/zh-tw/product/550020?cid=12345"}]
  });
  assert.ok(products[0].affiliate_url);
});

test("invalid, duplicated, or unmatched catalog rows fail closed", () => {
  assert.deepEqual(parseAffiliateCatalog({ schema_version:"bad", products: base.products }), []);
  const products = parseAffiliateCatalog({
    ...base,
    products: [...base.products, {...base.products[0]}, {...base.products[0], product_id:"550021", public_url:"https://evil.test/product/550021"}]
  });
  assert.equal(products.length,1);
});
