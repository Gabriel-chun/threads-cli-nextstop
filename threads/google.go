package threads

import (
	"context"
	htmlpkg "html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// googleThreadsURLRe intentionally accepts only concrete public Threads post
// URLs. Google is used as a coverage fallback to discover URLs, never as a
// substitute source for post text or timestamps.
var googleThreadsURLRe = regexp.MustCompile(`https?://(?:www\.)?threads\.(?:com|net)/@[A-Za-z0-9._]+/post/[A-Za-z0-9_-]+`)

// googleThreadsSearch asks Google's public web index for site:threads.com hits,
// then re-fetches each discovered Threads URL from Threads itself. This keeps
// the stored evidence grounded in the public post rather than in a search
// snippet. The fallback is best-effort: blocking or empty Google results simply
// contribute no extra coverage.
func (c *Client) googleThreadsSearch(ctx context.Context, query string, limit int) ([]Post, error) {
	if limit <= 0 || limit > 20 {
		limit = 20
	}

	q := "site:threads.com " + strings.TrimSpace(query)
	searchURL := "https://www.google.com/search?q=" + url.QueryEscape(q) + "&num=20&filter=0"

	c.rateLimit()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/153 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, codeErr(ExitNetwork, "Google coverage search returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	html := htmlpkg.UnescapeString(string(body))
	matches := googleThreadsURLRe.FindAllString(html, -1)
	seenURL := map[string]bool{}
	var out []Post

	for _, raw := range matches {
		raw = strings.Replace(raw, "https://www.threads.net/", WebBase+"/", 1)
		raw = strings.Replace(raw, "https://threads.net/", WebBase+"/", 1)
		raw = strings.Replace(raw, "https://threads.com/", WebBase+"/", 1)
		if seenURL[raw] {
			continue
		}
		seenURL[raw] = true

		page, err := c.getHTML(ctx, raw)
		if err != nil {
			continue
		}
		posts := parsePostsSSR(page)
		if len(posts) == 0 {
			continue
		}

		// Prefer the root post whose canonical permalink matches the URL Google
		// discovered. Fall back to the first parsed post only when necessary.
		chosen := posts[0]
		for _, p := range posts {
			if p.Permalink == raw {
				chosen = p
				break
			}
		}
		out = append(out, chosen)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}
