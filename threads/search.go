package threads

import (
	"context"
	"iter"
	"net/url"
	"strings"
	"time"
)

// Search streams public keyword-search hits from the crawler-rendered Threads
// search page.
//
// The anonymous search page can contain unrelated recommendation/feed posts in
// the same SSR payload as real search results. To avoid labeling those posts as
// matches, this fork keeps only posts whose visible text/username actually
// matches the requested query.
//
// We intentionally do not fall back to the rotating logged-out GraphQL search
// doc_id here. A stale doc_id is what originally broke the upstream CLI, and a
// bad fallback is worse than returning an honest empty result set.
func (c *Client) Search(ctx context.Context, query string, limit int) iter.Seq2[SearchResult, error] {
	return func(yield func(SearchResult, error) bool) {
		posts, err := c.searchSSR(ctx, query)
		if err != nil {
			yield(SearchResult{}, err)
			return
		}

		n := 0
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

			r := SearchResult{
				ID:          p.ID,
				Query:       query,
				Text:        p.Text,
				Username:    p.Username,
				Permalink:   p.Permalink,
				Timestamp:   p.Timestamp,
				MediaType:   p.MediaType,
				IsReply:     p.IsReply,
				IsQuotePost: p.IsQuotePost,
				SearchedAt:  time.Now(),
			}
			if !yield(r, nil) {
				return
			}
			n++
			if limit > 0 && n >= limit {
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
	return filterSearchPosts(parsePostsSSR(html), query), nil
}

// filterSearchPosts removes unrelated feed/recommendation posts that Threads
// includes in the anonymous search-page SSR payload.
//
// Matching rules:
//   - case-insensitive
//   - '#' and '@' are ignored for matching
//   - multi-word queries require every term to appear somewhere in the visible
//     post text or username
//   - CJK queries such as "大巨蛋" remain a single exact substring term
func filterSearchPosts(posts []Post, query string) []Post {
	terms := searchTerms(query)
	if len(terms) == 0 {
		return nil
	}

	out := make([]Post, 0, len(posts))
	seen := map[string]bool{}

	for _, p := range posts {
		haystack := normalizeSearchText(p.Text + " " + p.Username)

		matches := true
		for _, term := range terms {
			if !strings.Contains(haystack, term) {
				matches = false
				break
			}
		}
		if !matches {
			continue
		}

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
		out = append(out, p)
	}

	return out
}

func searchTerms(query string) []string {
	q := normalizeSearchText(query)
	if q == "" {
		return nil
	}
	return strings.Fields(q)
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
