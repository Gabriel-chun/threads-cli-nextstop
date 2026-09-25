package threads

import (
	"context"
	"iter"
	"net/url"
	"sort"
	"strings"
	"time"
)

// Search streams candidates from the crawler-rendered Threads search page,
// ranked by how strongly the visible post text/username matches the query.
//
// The anonymous Threads SSR payload mixes real search hits with unrelated feed
// recommendations. Instead of requiring an exact AND match (which was too
// strict), this fork assigns a relevance score and keeps any candidate with a
// meaningful match. Downstream workflows can then choose their own threshold.
func (c *Client) Search(ctx context.Context, query string, limit int) iter.Seq2[SearchResult, error] {
	return func(yield func(SearchResult, error) bool) {
		posts, err := c.searchSSR(ctx, query)
		if err != nil {
			yield(SearchResult{}, err)
			return
		}

		results := make([]SearchResult, 0, len(posts))
		seen := map[string]bool{}

		for _, p := range posts {
			key := p.ID
			if key == "" {
				key = p.Permalink
			}
			if key != "" && seen[key] {
				continue
			}
			if key != "" {
				seen[key] = true
			}

			score, matched := scoreSearchPost(p, query)
			if score <= 0 {
				continue
			}

			results = append(results, SearchResult{
				ID:             p.ID,
				Query:          query,
				Text:           p.Text,
				Username:       p.Username,
				Permalink:      p.Permalink,
				Timestamp:      p.Timestamp,
				MediaType:      p.MediaType,
				IsReply:        p.IsReply,
				IsQuotePost:    p.IsQuotePost,
				RelevanceScore: score,
				MatchedTerms:   matched,
				SearchedAt:     time.Now(),
			})
		}

		sort.SliceStable(results, func(i, j int) bool {
			if results[i].RelevanceScore == results[j].RelevanceScore {
				return results[i].Timestamp.After(results[j].Timestamp)
			}
			return results[i].RelevanceScore > results[j].RelevanceScore
		})

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

func (c *Client) searchSSR(ctx context.Context, query string) ([]Post, error) {
	u := WebBase + "/search?q=" + url.QueryEscape(query)
	html, err := c.getHTML(ctx, u)
	if err != nil {
		return nil, err
	}
	return parsePostsSSR(html), nil
}

// scoreSearchPost returns a 0-100 relevance score plus the terms/substrings that
// actually matched.
//
// Rules:
//   - exact query term match: +40
//   - exact full query phrase: +20
//   - all terms matched exactly: +20
//   - for a long CJK-style term, a contiguous 3+ rune partial match is allowed
//     with a lower score (e.g. "台北大巨蛋" can match "大巨蛋")
//   - unrelated recommendation-feed posts receive 0 and are discarded
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

	score := 0
	matched := make([]string, 0, len(terms))
	allExact := true

	for _, term := range terms {
		if strings.Contains(haystack, term) {
			score += 40
			matched = appendUnique(matched, term)
			continue
		}

		allExact = false
		if partial := longestQuerySubstringMatch(term, haystack, 3); partial != "" {
			// Lower confidence than an exact term. Longer partial matches score
			// slightly higher, but never as much as an exact term.
			partialLen := len([]rune(partial))
			score += 15 + partialLen*5
			matched = appendUnique(matched, partial)
		}
	}

	if strings.Contains(haystack, q) {
		score += 20
	}
	if len(terms) > 1 && allExact {
		score += 20
	}
	if score > 100 {
		score = 100
	}
	return score, matched
}

// longestQuerySubstringMatch finds the longest contiguous substring of term
// present in haystack. It is intentionally query-sided: we only relax a long
// search phrase into shorter pieces, rather than fuzzy-matching arbitrary post
// text. This keeps recall higher without reopening the unrelated-feed problem.
func longestQuerySubstringMatch(term, haystack string, minRunes int) string {
	r := []rune(term)
	if len(r) < minRunes+1 {
		return ""
	}

	for size := len(r) - 1; size >= minRunes; size-- {
		for start := 0; start+size <= len(r); start++ {
			part := string(r[start : start+size])
			if strings.Contains(haystack, part) {
				return part
			}
		}
	}
	return ""
}

func appendUnique(in []string, s string) []string {
	for _, existing := range in {
		if existing == s {
			return in
		}
	}
	return append(in, s)
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
