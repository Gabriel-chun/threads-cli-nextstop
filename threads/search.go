package threads

import (
	"context"
	"iter"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Search streams candidates from the crawler-rendered Threads search page.
// It preserves the historical one-window behavior. Use SearchWithOptions when
// retrieval depth or Google coverage fallback is desired.
func (c *Client) Search(ctx context.Context, query string, limit int) iter.Seq2[SearchResult, error] {
	return c.SearchWithOptions(ctx, query, limit, 1, false)
}

// SearchWithOptions combines three anonymous retrieval surfaces:
//   1. Threads SSR search window
//   2. logged-out Threads GraphQL pagination (up to depth pages total)
//   3. optional Google site:threads.com coverage fallback
//
// All candidates are deduplicated before relevance scoring, and every surviving
// row records which retrieval sources found it.
func (c *Client) SearchWithOptions(ctx context.Context, query string, limit, depth int, googleFallback bool) iter.Seq2[SearchResult, error] {
	return func(yield func(SearchResult, error) bool) {
		if depth < 1 {
			depth = 1
		}
		if depth > 5 {
			depth = 5
		}

		type sourcedPost struct {
			post   Post
			source string
		}
		var candidates []sourcedPost

		posts, cursor, hasMore, err := c.searchSSRPage(ctx, query)
		if err != nil {
			yield(SearchResult{}, err)
			return
		}
		for _, p := range posts {
			candidates = append(candidates, sourcedPost{post: p, source: "threads_ssr"})
		}

		// Depth counts the SSR window as page 1. Resume from its cursor when
		// available; otherwise ask GraphQL for its first anonymous page.
		graphCursor := cursor
		for page := 2; page <= depth; page++ {
			if page > 2 && !hasMore {
				break
			}
			gPosts, next, more, gErr := c.graphqlSearchPage(ctx, query, graphCursor)
			if gErr != nil {
				c.logf(1, "anonymous GraphQL search depth stopped at page %d: %v", page, gErr)
				break
			}
			for _, p := range gPosts {
				candidates = append(candidates, sourcedPost{post: p, source: "threads_graphql"})
			}
			if next == "" || next == graphCursor {
				break
			}
			graphCursor, hasMore = next, more
			if !more {
				break
			}
		}

		if googleFallback {
			gPosts, gErr := c.googleThreadsSearch(ctx, query, 5)
			if gErr != nil {
				c.logf(1, "Google coverage fallback unavailable: %v", gErr)
			} else {
				for _, p := range gPosts {
					candidates = append(candidates, sourcedPost{post: p, source: "google_site"})
				}
			}
		}

		byKey := map[string]SearchResult{}
		for _, item := range candidates {
			p := item.post
			key := p.ID
			if key == "" {
				key = p.Permalink
			}
			if key == "" {
				continue
			}

			score, matched := scoreSearchPost(p, query)
			if score <= 0 {
				continue
			}

			r := SearchResult{
				ID:               p.ID,
				Query:            query,
				SourceQueries:    []string{query},
				Text:             p.Text,
				Username:         p.Username,
				Permalink:        p.Permalink,
				Timestamp:        p.Timestamp,
				MediaType:        p.MediaType,
				IsReply:          p.IsReply,
				IsQuotePost:      p.IsQuotePost,
				RelevanceScore:   score,
				RelevanceTier:    relevanceTier(score),
				MatchedTerms:     matched,
				RetrievalSources: []string{item.source},
				SearchedAt:       time.Now(),
			}
			if existing, ok := byKey[key]; ok {
				byKey[key] = mergeSearchResults(existing, r)
			} else {
				byKey[key] = r
			}
		}

		results := make([]SearchResult, 0, len(byKey))
		for _, r := range byKey {
			results = append(results, r)
		}
		sortSearchResults(results)

		for i, r := range results {
			if limit > 0 && i >= limit {
				return
			}
			if !yield(r, nil) {
				return
			}
		}
	}
}

// BatchSearch runs several queries, filters by score/date, deduplicates posts,
// merges the queries/terms that found the same post, and returns one ranked list.
func (c *Client) BatchSearch(ctx context.Context, queries []string, minScore int, since time.Time, limit int) ([]SearchResult, error) {
	byKey := map[string]SearchResult{}

	for _, query := range queries {
		query = strings.TrimSpace(query)
		if query == "" {
			continue
		}

		for r, err := range c.Search(ctx, query, 0) {
			if err != nil {
				return nil, err
			}
			if r.RelevanceScore < minScore {
				continue
			}
			if !since.IsZero() && (r.Timestamp.IsZero() || r.Timestamp.Before(since)) {
				continue
			}

			key := r.Permalink
			if key == "" {
				key = r.ID
			}
			if key == "" {
				continue
			}

			if existing, ok := byKey[key]; ok {
				byKey[key] = mergeSearchResults(existing, r)
			} else {
				byKey[key] = r
			}
		}
	}

	results := make([]SearchResult, 0, len(byKey))
	for _, r := range byKey {
		results = append(results, r)
	}
	sortSearchResults(results)

	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

func (c *Client) searchSSR(ctx context.Context, query string) ([]Post, error) {
	posts, _, _, err := c.searchSSRPage(ctx, query)
	return posts, err
}

func (c *Client) searchSSRPage(ctx context.Context, query string) ([]Post, string, bool, error) {
	u := WebBase + "/search?q=" + url.QueryEscape(query)
	html, err := c.getHTML(ctx, u)
	if err != nil {
		return nil, "", false, err
	}
	cursor, more := pageInfoSSR(html)
	return parsePostsSSR(html), cursor, more, nil
}

func sortSearchResults(results []SearchResult) {
	sort.SliceStable(results, func(i, j int) bool {
		if results[i].RelevanceScore == results[j].RelevanceScore {
			return results[i].Timestamp.After(results[j].Timestamp)
		}
		return results[i].RelevanceScore > results[j].RelevanceScore
	})
}

func mergeSearchResults(a, b SearchResult) SearchResult {
	a.SourceQueries = appendUniqueMany(a.SourceQueries, b.SourceQueries...)
	a.MatchedTerms = appendUniqueMany(a.MatchedTerms, b.MatchedTerms...)
	a.RetrievalSources = appendUniqueMany(a.RetrievalSources, b.RetrievalSources...)

	if b.RelevanceScore > a.RelevanceScore {
		a.Query = b.Query
		a.RelevanceScore = b.RelevanceScore
		a.RelevanceTier = relevanceTier(b.RelevanceScore)
	}
	if b.SearchedAt.After(a.SearchedAt) {
		a.SearchedAt = b.SearchedAt
	}
	return a
}

func relevanceTier(score int) string {
	switch {
	case score >= 60:
		return "high"
	case score >= 30:
		return "candidate"
	case score > 0:
		return "low"
	default:
		return "none"
	}
}

// scoreSearchPost returns a 0-100 relevance score plus the exact terms
// that satisfied the query.
//
// Precision rules:
//   - a single-term query must match the full normalized query exactly
//   - a multi-term query is AND, not OR: every term must be present
//   - the anchor must also be present:
//     * for Latin queries, the first two words form a phrase anchor
//       (e.g. "Tokyo Dome concert" requires "tokyo dome" + "concert")
//     * otherwise the first term is the anchor
//   - exact full-query phrase receives the strongest score
//   - partial CJK substring matches never qualify a result on their own
//
// This intentionally favors precision over recall so recommendation-feed noise
// cannot pass merely because it contains a generic word such as "concert".
func scoreSearchPost(p Post, query string) (int, []string) {
	haystack := normalizeSearchText(p.Text + " " + p.Username)
	q := normalizeSearchText(query)
	if q == "" || haystack == "" {
		return 0, nil
	}

	terms := strings.Fields(q)
	if len(terms) == 0 {
		return 0, nil
	}

	// Single-term searches are themselves the anchor. Require the complete
	// normalized term; do not fall back to a shorter CJK substring.
	if len(terms) == 1 {
		if !strings.Contains(haystack, q) {
			return 0, nil
		}
		return 60, []string{q}
	}

	anchor := terms[0]
	if len(terms) >= 2 && isASCIIQueryTerm(terms[0]) && isASCIIQueryTerm(terms[1]) {
		anchor = terms[0] + " " + terms[1]
	}
	if !strings.Contains(haystack, anchor) {
		return 0, nil
	}

	matched := []string{anchor}
	for _, term := range terms {
		if !strings.Contains(haystack, term) {
			return 0, nil
		}
		matched = appendUnique(matched, term)
	}

	// Anchored AND match.
	score := 80
	// Exact phrase is the strongest possible match.
	if strings.Contains(haystack, q) {
		score = 100
	}
	return score, matched
}

func isASCIIQueryTerm(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r > 127 {
			return false
		}
	}
	return true
}

func appendUnique(in []string, s string) []string {
	for _, existing := range in {
		if existing == s {
			return in
		}
	}
	return append(in, s)
}

func appendUniqueMany(in []string, values ...string) []string {
	for _, v := range values {
		if strings.TrimSpace(v) == "" {
			continue
		}
		in = appendUnique(in, v)
	}
	return in
}

func normalizeSearchText(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.NewReplacer(
		"#", "",
		"@", "",
		"＃", "",
		"＠", "",
	).Replace(s)
	return strings.Join(strings.Fields(s), " ")
}
