package threads

import (
	"context"
	"iter"
	"net/url"
	"time"
)

func (c *Client) Search(ctx context.Context, query string, limit int) iter.Seq2[SearchResult, error] {
	return func(yield func(SearchResult, error) bool) {
		posts, err := c.searchSSR(ctx, query)
		if err != nil || len(posts) == 0 {
			posts, err = c.graphqlSearch(ctx, query)
			if err != nil {
				yield(SearchResult{}, err)
				return
			}
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
	return parsePostsSSR(html), nil
}
