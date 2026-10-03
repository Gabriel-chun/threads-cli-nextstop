# Trend Tracking Project V0.2 — Link Observation System

Trend Tracking remains an isolated module inside the existing Next Stop Live repository. It reuses the existing logged-out Threads CLI, conservative Collector boundary, GitHub archive, Notion documentation sync, Cloudflare Worker and `/trends` route.

## Product definition

V0.1 was **artist-first targeted observation**: `Artist / Event → Need Query → Signal`.

V0.2 is **need-led public sample → evidence → link observation**: `Public Sample → Evidence → Annotation → Entity Resolution → Link → Cross-snapshot Link State → Event Watch`.

V0.2 does not rank popularity, predict virality or estimate a population-level trend. A sample is only a bounded public observation under a fixed query, language and time boundary.

The V0.1 snapshot `2026-10-03_055110Z` remains unchanged and is treated as `sampling_strategy = targeted_artist_need`. V0.2 snapshots use `sampling_strategy = need_led_observation`.

## Link states

- `new`: first observed link.
- `repeated`: observed in more than one snapshot.
- `persistent`: observed in at least three consecutive windows.
- `expanding`: a new link appears around an entity already seen in prior links.
- `dormant`: a previously observed link is not observed in the current window.

No Trend Score is produced.

## Evidence boundary

Evidence text and source URLs are preserved in their original language. UI localization never rewrites evidence. Event-level links are created only when resolution confidence is `high` or `medium`; `low` and `unresolved` evidence remains at artist/need or unresolved level.

## Security boundary

- existing public, logged-out Threads CLI only;
- no private account login;
- no session/token cookies;
- no verification/rate-limit bypass;
- no stealth plugins;
- bounded query budget and existing cadence;
- read-only MCP data surface;
- GitHub remains source of truth;
- Notion remains a human-readable/review/documentation layer.


## Retrieval semantics

The existing public Threads CLI intentionally treats multi-term search as a strict precision-oriented AND match. Trend Tracking V0.2 therefore keeps the research semantics separate from the retrieval term:

- `semantic_query`: the intended observation, for example `高鐵 演唱會`.
- `query`: the bounded need-first retrieval term sent to the existing CLI, for example `高鐵`.
- post-retrieval context gate: the builder keeps a row only when the original post contains a concert/event-context term or resolves to a known Artist / Event / Venue.

This is `need_first_context_gated` retrieval. It does **not** relax the shared CLI relevance scorer, crawler cadence, depth, safety boundary, or query budget.

The first V0.2 run (`2026-10-03_065422Z`) executed 18 multi-term queries successfully but returned `raw=0`. A same-day normal Collector run using single-term `演唱會 / 演唱会 / concert` queries returned public results, so the diagnosis was query formulation rather than a CLI/security failure. The fix is limited to Trend Tracking retrieval formulation.


### Context-gate precision note
Generic words such as `演出`, `tour`, and `gig` are not accepted as standalone event-context evidence because they can describe film acting, travel, or unrelated work. The gate uses stronger concert/festival/fan-event wording or a resolved known Artist / Event / Venue instead.
