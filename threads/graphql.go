package threads

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/url"
	"strings"
)

// The logged-out GraphQL path. Threads marks a caller as a crawler through a set
// of relay provider flags; with those set, the persisted profile-threads, post,
// and search queries return data without a session. doc_id values rotate (see
// config.go), so a stale id degrades to "no extra data" rather than an error.

func relayProviderVars() map[string]any {
	return map[string]any{
		"__relay_internal__pv__BarcelonaIsLoggedInrelayprovider":             false,
		"__relay_internal__pv__BarcelonaIsInternalUserrelayprovider":         false,
		"__relay_internal__pv__BarcelonaIsCrawlerrelayprovider":              true,
		"__relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider": true,
		"__relay_internal__pv__BarcelonaIsLoggedOutrelayprovider":            true,
	}
}

// maxGraphQLPages caps how far the logged-out pagination walks, so an unbounded
// crawl cannot loop forever on a profile with a very long history.
const maxGraphQLPages = 20

// graphqlProfileThreads walks a user's posts via the logged-out persisted query,
// following the page_info cursor from startCursor until it runs out or the page
// cap is hit. startCursor is the end_cursor from the server-rendered window, so
// pagination resumes where the SSR page left off.
func (c *Client) graphqlProfileThreads(ctx context.Context, userID, startCursor string) ([]Post, error) {
	var out []Post
	cursor := startCursor
	for page := 0; page < maxGraphQLPages; page++ {
		vars := map[string]any{"userID": userID}
		if cursor != "" {
			vars["after"] = cursor
		}
		raw, err := c.graphqlPost(ctx, DocIDProfileThreads, vars)
		if err != nil {
			return out, err
		}
		out = append(out, postsFromGraphQL(raw)...)
		next, more, ok := findPageInfo(raw, 0)
		if !ok || !more || next == "" || next == cursor {
			break
		}
		cursor = next
	}
	return out, nil
}

// graphqlPostReplies fetches a window of a post's replies via the logged-out
// persisted query.
func (c *Client) graphqlPostReplies(ctx context.Context, postID string) ([]Post, error) {
	vars := map[string]any{"postID": postID}
	raw, err := c.graphqlPost(ctx, DocIDPostPage, vars)
	if err != nil {
		return nil, err
	}
	return postsFromGraphQL(raw), nil
}

// graphqlSearch runs the logged-out keyword search query.
func (c *Client) graphqlSearch(ctx context.Context, query string) ([]Post, error) {
	posts, _, _, err := c.graphqlSearchPage(ctx, query, "")
	return posts, err
}

// graphqlSearchPage fetches one anonymous search page and returns its cursor.
// Threads' persisted query may rotate or stop exposing pagination to logged-out
// callers; callers should treat that as "no extra depth" rather than losing the
// SSR results they already have.
func (c *Client) graphqlSearchPage(ctx context.Context, query, cursor string) ([]Post, string, bool, error) {
	vars := map[string]any{"query": query}
	if cursor != "" {
		vars["after"] = cursor
	}
	raw, err := c.graphqlPost(ctx, DocIDSearch, vars)
	if err != nil {
		return nil, "", false, err
	}
	posts := postsFromGraphQL(raw)
	next, more, _ := findPageInfo(raw, 0)
	return posts, next, more, nil
}

// graphqlFailure records a safe error category without retaining remote response bodies.
type graphqlFailure struct { kind string }
func (e *graphqlFailure) Error() string { return "graphql " + e.kind }

func graphqlFailureKind(err error) string {
    var failure *graphqlFailure
    if errors.As(err, &failure) { return failure.kind }
    return "request_failed"
}

// decodeGraphQLPayload checks the HTTP response and GraphQL envelope separately.
// Do not log raw upstream bodies, request cookies, or query variables.
func decodeGraphQLPayload(status int, body []byte) (any, error) {
    if status < 200 || status >= 300 {
        return nil, &graphqlFailure{kind: fmt.Sprintf("http_%d", status)}
    }
    var envelope struct {
        Data json.RawMessage `json:"data"`
        Errors []json.RawMessage `json:"errors"`
    }
    if err := json.Unmarshal(body, &envelope); err != nil {
        return nil, &graphqlFailure{kind: "invalid_json"}
    }
    if len(envelope.Errors) > 0 {
        return nil, &graphqlFailure{kind: "graphql_errors"}
    }
    if len(envelope.Data) == 0 || string(envelope.Data) == "null" {
        return nil, &graphqlFailure{kind: "missing_data"}
    }
    var data any
    if err := json.Unmarshal(envelope.Data, &data); err != nil || data == nil {
        return nil, &graphqlFailure{kind: "invalid_data"}
    }
    return data, nil
}

// graphqlPost POSTs a persisted query and returns a validated decoded data tree.
func (c *Client) graphqlPost(ctx context.Context, docID string, vars map[string]any) (any, error) {
    maps.Copy(vars, relayProviderVars())
    varsJSON, _ := json.Marshal(vars)
    form := url.Values{}
    form.Set("lsd", "t")
    form.Set("doc_id", docID)
    form.Set("variables", string(varsJSON))

    c.rateLimit()
    req, err := http.NewRequestWithContext(ctx, http.MethodPost, GraphQLURL, strings.NewReader(form.Encode()))
    if err != nil { return nil, err }
    req.Header.Set("User-Agent", c.cfg.UserAgent)
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    req.Header.Set("X-FB-LSD", "t")
    req.Header.Set("X-IG-App-ID", "238260118697367")
    if c.cfg.Session != "" { req.Header.Set("Cookie", "sessionid="+c.cfg.Session) }
    if c.cfg.CSRF != "" { req.Header.Set("X-CSRFToken", c.cfg.CSRF) }
    c.logf(2, "POST graphql doc_id=%s", docID)
    resp, err := c.http.Do(req)
    if err != nil { return nil, codeErr(ExitNetwork, "graphql request: %v", err) }
    defer func() { _ = resp.Body.Close() }()
    if resp.StatusCode < 200 || resp.StatusCode >= 300 {
        return nil, &graphqlFailure{kind: fmt.Sprintf("http_%d", resp.StatusCode)}
    }
    const maxGraphQLResponseBytes = 2 << 20
    body, err := io.ReadAll(io.LimitReader(resp.Body, maxGraphQLResponseBytes+1))
    if err != nil { return nil, &graphqlFailure{kind: "read_failed"} }
    if len(body) > maxGraphQLResponseBytes {
        return nil, &graphqlFailure{kind: "payload_too_large"}
    }
    return decodeGraphQLPayload(resp.StatusCode, body)
}

// postsFromGraphQL reuses the SSR thread_items walker over the GraphQL data
// tree: both surfaces nest the same post objects.
func postsFromGraphQL(data any) []Post {
	posts := walkThreadItems(data, 0)
	out := posts[:0]
	seen := map[string]bool{}
	for _, p := range posts {
		if p.ID == "" || seen[p.ID] {
			continue
		}
		seen[p.ID] = true
		out = append(out, p)
	}
	return out
}
