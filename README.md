# Next Stop Live — Data / Signal Layer

> Research / exploration project. This repository documents an evolving workflow for turning public Threads conversations into structured signals for human review. It is not presented as an official Threads integration, a guaranteed-compliant collection service, or a commercial data product.

## What this project is for

Next Stop Live explores a simple question:

> **Before going to the next stop, what do people actually need to know?**

The current system collects a limited set of public Threads conversations related to concerts, cleans and deduplicates them, builds a daily Signal Deck, and lets a human reviewer mark individual posts as **Relevant** or **Irrelevant** for future content research.

The goal is not to collect everything. The goal is to keep a small, auditable research loop that can be inspected, corrected, paused, or removed when platform behavior or expectations change.

## Current flow

```
Threads public search
  -> Collector
  -> GitHub Master
  -> Daily Signal Deck
  -> Human Relevant / Irrelevant review
  -> Vercel Blob feedback
  -> Weekly relevance profile
  -> Daily GitHub review archive
  -> Notion review database / MCP access
```

### Current collection boundary

The production query is intentionally kept broad and small:

```
演唱會
```

Cities, venues, artists, transport, lodging, ticketing, and other dimensions are primarily reorganized **after collection** from the material already captured. They are not treated as reasons to continuously create new crawlers or expand the query surface.

This is deliberate. Expanding retrieval for every city, venue, artist, or content type would make duplicates, weighting, maintenance, and provenance harder to explain.

## Retrieval implementation

The current production collector uses the last known working anonymous retrieval path:

1. crawler-rendered Threads SSR search;
2. logged-out Threads persisted GraphQL pagination;
3. search depth 3.

Google site fallback is disabled.

The production collector does not require a logged-in Threads session and does not use:

- private-profile access;
- private-post access;
- CAPTCHA bypass;
- proxy rotation;
- stealth fingerprinting;
- purchased or exchanged third-party personal data.

### Important limitation

The SSR / persisted GraphQL surfaces above are **not the official Threads API**. The project does not claim that these unofficial retrieval surfaces are permanently available, officially authorized by Meta, or suitable for unrestricted automated collection.

This repository treats them as an experimental research surface that can change or disappear at any time.

If Threads / Meta changes access behavior, platform expectations, terms, or technical controls, the affected retrieval path should be disabled. If continuing to publish related archives or derived artifacts is no longer appropriate, those public artifacts should be removed, regenerated, or taken offline.

## Research and exploratory status

This project is an ongoing research / engineering exploration.

It does **not** claim that:

- the current collection method is permanently permitted by the platform;
- a public post automatically grants unlimited redistribution rights;
- a technical ability to retrieve data is the same as platform authorization;
- the project has any special relationship with, endorsement from, or approval by Meta / Threads.

The system is designed to remain reversible. Collection paths can be disabled, review archives can be regenerated, and published artifacts can be taken down if the platform or research boundary changes.

## Data responsibility

### GitHub

GitHub is the code and audit layer.

It currently holds:

- collector code;
- Master snapshots;
- run summaries;
- observations;
- Daily Signal Deck data;
- daily reviewed-card archives.

### Vercel / Blob

Vercel / Blob is the interactive review-state layer.

It stores:

- Relevant / Irrelevant decisions;
- current review state used by Signal Deck;
- data needed for the daily review export.

### Notion

Notion is an operational and human-review layer.

It stores:

- collector controls;
- run history;
- review tables;
- Relevant / Irrelevant views.

Notion is not the only source of truth for review history; GitHub daily review JSON is the audit / retry layer.

### MCP

MCP is an access layer.

It exposes selected system state and downloads to an AI client. It is not intended to create an additional independent copy of the dataset.

## Human review boundary

A post being marked **Relevant** or **Irrelevant** is an internal research decision about usefulness to the Next Stop Live workflow.

It is **not**:

- a judgment of the author;
- a judgment of factual truth;
- a quality score for the person who posted it;
- a public ranking of users.

Human review currently works one post at a time.

- Default daily review quota: 40 posts.
- Optional reserve: +10 posts only when the reviewer explicitly chooses to continue.
- Master data is not deleted when a card is marked Irrelevant.

The system is intentionally designed so that having more data does not automatically create more required work.

## Source content, attribution, and ownership

Source posts remain the work of their original authors.

This project does not claim ownership over Threads posts, usernames, images, or other source material.

Collected text, usernames, timestamps, and permalinks are used as research evidence and provenance for signal extraction. They should not be repackaged as original Next Stop Live content, represented as the project's own writing, or treated as a freely redistributable commercial corpus.

Where possible, analysis should prefer:

- derived signals;
- short excerpts;
- links back to the original post;
- aggregated counts;
- structured features;

instead of unnecessary republication of full source material.

## Privacy and data minimization

Public availability does not automatically mean that indefinite republication is appropriate.

The project should minimize retained and exposed source data to what is useful for research provenance.

Current and future changes should prefer:

- stable post identifiers;
- original permalinks;
- short excerpts where sufficient;
- derived features and categories;
- bounded retention where practical;
- removing data that is no longer needed for the research workflow.

No attempt should be made to infer private attributes about authors from their posts.

## Public repository boundary

This repository is public.

That means collected archives may be visible beyond the immediate research workflow. The public codebase and the research corpus should therefore be treated as two different concerns.

The long-term direction should favor:

- keeping code and system design public;
- minimizing unnecessary source-text exposure;
- avoiding publication of material that is not needed to explain or reproduce the research method;
- separating internal research corpus needs from public repository needs where appropriate.

## Takedown / removal

If a source author, platform representative, or other rights holder identifies material in this repository that should no longer be retained or published, the maintainer should review the request and remove the affected material when it can be reasonably identified.

For removal requests:

- contact the repository maintainer through the GitHub profile or repository contact channel;
- provide the relevant permalink / post identifier if possible;
- do not post additional sensitive information into a public issue.

A removal request does not require the entire system to be deleted; the affected source material or archive can be removed or regenerated independently.

## Platform-change policy

If Threads / Meta changes technical access, platform policy, or expected automated-use boundaries:

1. stop the affected retrieval path;
2. do not attempt to defeat new technical controls;
3. review whether existing public artifacts should remain online;
4. remove or regenerate affected archives where appropriate;
5. document the change in the engineering Patch Notes before resuming collection.

The project should not respond to tighter platform controls by adding CAPTCHA bypass, stealth, proxy rotation, or account-based circumvention.

## Authorization and secrets

The system uses separate authorization contexts.

### Vercel runtime secrets

Used for runtime storage / export behavior, including review-state access.

### GitHub Actions secrets

Used for automation such as:

- Notion synchronization;
- daily review archive processing.

### ChatGPT / MCP-connected accounts

A ChatGPT-connected Notion authorization is not the same credential as a Vercel runtime token or a GitHub Actions secret.

These contexts must not be assumed to share authorization.

## Review archive

At Taipei midnight, the system is designed to archive the previous Taipei review day:

```
Blob review state
  -> GitHub collector/archive/reviews/YYYY-MM-DD.json
  -> Notion Signal Review Database
```

GitHub JSON acts as the audit and retry layer.

If Notion synchronization fails, the reviewed decisions should be recoverable from the GitHub archive without asking the reviewer to classify the posts again.

## Downloads

The Dashboard / MCP currently exposes two different data products:

### Latest Master ZIP

A full Master snapshot intended for debugging, analysis, and downstream data work.

### Reviewed Cards JSON

A JSON export of the latest completed daily Relevant / Irrelevant review archive.

These two downloads have different purposes and should not be treated as equivalent datasets.

## Current non-goals

This project is not currently trying to:

- collect all Threads content;
- maximize retrieval volume at any cost;
- create a crawler for every city, venue, artist, or event;
- automatically publish generated content;
- replace human judgment with automated relevance labels;
- infer private characteristics about users;
- bypass platform access controls;
- turn source posts into a commercial redistribution dataset.

## Engineering principle

> **Automation should remove transport friction, not remove the understanding process.**

The purpose of the data layer is not to grab more. It is to make a limited amount of natural-language evidence easier to inspect, trace, reorganize, and turn into better human decisions.

## Technical notes

Implementation details for the collector are documented separately in:

- `collector/README.md`
- Notion: System Archive / Engineering
- Iteration Patch Notes

The system remains intentionally experimental and reversible.
