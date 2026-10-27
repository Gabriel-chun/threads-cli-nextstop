# Next Stop Live — Affiliate Intent Bridge V0.1 (preview only)

## Why

Keep the existing Collector, Trend Observation, Signal Deck, human Relevant / Irrelevant review, data provenance and scheduled workflows unchanged. Add a **separate and opt-in** product matching layer, not another crawler or AI agent.

Commercial loop (future, once link validation and analytics exist):

```
Observed needs -> human-selected scenario -> useful public destination
               -> eligible reviewed affiliate offer
               -> partner checkout -> partner-reported attributed commission
```

**A click is not a sale.** Revenue must be confirmed from the partner dashboard/report and cannot be inferred from web analytics.

## Current prototype

- Route: `/affiliate-preview` in the **existing** Next.js Dashboard.
- Three generic intents: last-mile concert transport, intercity travel, overnight stay.
- CSS follows existing warm-white / brick-red palette, responsive on mobile.
- `metadata.robots` is `noindex, nofollow`. This preview is not a public sales page.
- The offer registry is **empty** by default. No product names, claims, inventory or affiliate URLs have been invented.
- `APPROVED_AFFILIATE_HOSTS` is also empty; even mistakenly added products are not exposed until the destination host has been manually approved.
- All displayed approved offers must use `rel="sponsored noopener noreferrer"` and have a clear commission disclosure.
- A link marked `verified` is a **manual review state**, not a promise of real-time price or availability.

## Existing code reused

- `dashboard/app` with Next.js 16.x and Cloudflare Workers / vinext build.
- `dashboard/lib/trendRadar.ts`: reviewed `affiliate_fit` and demand clusters.
- Existing review, observation and evidence boundaries remain authoritative.

**Do not directly inject public Threads post content into commercial recommendations.**
The current Collector uses a documented experimental, unofficial public search surface; collection ability does not prove unlimited commercial re-use rights or permanent permission.

## Before adding a real affiliate offer

1. Verify partner enrollment and register the intended website / social channel.
2. Obtain the specific affiliate-tracked product URL from the **official** partner console; never fabricate `cid` or other tracking parameters.
3. Check venue/city, date applicability, inventory or schedule (if shown), product category, cancellation/terms and accuracy. Use official merchant source material.
4. Record `id`, `merchant`, `title`, `intentKeys`, `status: "verified"`, `affiliateUrl`, `verifiedAt`, `sourceUrl` in `AFFILIATE_CATALOG`.
5. Approve the actual HTTPS redirect host(s) under `APPROVED_AFFILIATE_HOSTS` only after testing partner URLs, including legitimate intermediate tracking domains.
6. Double-check the visible disclosure, destination and approval date; establish a periodic human recheck. Mark stale or unavailable offers as `unavailable`.
7. Do not publish or automate Threads promotion without a separate platform-policy and attribution review.

## Next instrumentation (not implemented in V0.1)

Measure the minimal journey without storing personally identifying post text:

| Event | When | Required dimensions |
| --- | --- | --- |
| `intent_view` | intent section viewed | `intent_id`, `page_id` |
| `offer_view` | reviewed offer shown | `intent_id`, `offer_id` |
| `affiliate_click` | visitor chooses partner offer | `intent_id`, `offer_id`, `placement_id` |
| `partner_conversion` | verified affiliate partner report ingested | `offer_id`, `commission`, `currency`, `report_period` |

An analytics product can count onsite events, but only the actual partner/affiliate reporting surface can supply attributed sales and payout.

## Domain & distribution

For preview and demand testing, keep using a default Cloudflare `workers.dev` endpoint; buying a public custom domain is not necessary. As the preview is part of the existing internal Dashboard shell, do **not** treat it as a ready consumer homepage. When customer-facing content is validated, place it under an appropriately isolated public route or site, with internal research and credentials kept separated.

Use Threads as a *distribution channel*, not the only permanent source of product information. Write useful posts that explain a real need and link to a relevant site page; affiliate links should be properly disclosed and conform to partner/platform rules.

## Test / deployment boundaries

- Run `cd dashboard && npx tsx --test lib/affiliateBridge.test.ts` and `npm run build:vinext` in CI/local checkout.
- This branch must be reviewed before merge.
- **Do not change** the existing GitHub production deployment workflow, scheduled Collector, MCP keys or Notion sync.
- No store credentials, affiliate CID, new Worker or custom domain are required to review this PR.
