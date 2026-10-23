package threads

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

type recentRoundTrip func(*http.Request) (*http.Response, error)

func (f recentRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestRecentSearchUsesPublicFilterWithoutObsoletePagination(t *testing.T) {
	cfg := DefaultConfig()
	cfg.NoCache, cfg.Delay = true, 0
	c, err := NewClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	c.http.Transport = recentRoundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != "GET" || r.URL.Path != "/search" || r.URL.Query().Get("filter") != "recent" || r.URL.Query().Get("serp_type") != "default" {
			t.Fatalf("unexpected recent request: %s %s", r.Method, r.URL)
		}
		if r.URL.Query().Get("q") != "演唱會" {
			t.Fatal("query was changed")
		}
		body := fmt.Sprintf(`<script type="application/json">{"thread_items":[{"post":{"pk":"123","code":"test","caption":{"text":"演唱會交通"},"like_count":1,"taken_at":%d,"user":{"username":"fixture"}}}]}</script>`, time.Now().Add(-time.Hour).Unix())
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	var reports []SearchPageDiagnostic
	var results []SearchResult
	for r, err := range c.SearchWithTypeDiagnostics(context.Background(), "演唱會", 0, 3, true, "recent", func(d SearchPageDiagnostic) { reports = append(reports, d) }) {
		if err != nil {
			t.Fatal(err)
		}
		results = append(results, r)
	}
	if calls != 1 {
		t.Fatalf("recent search made %d requests, want one", calls)
	}
	if len(results) != 1 || results[0].RetrievalSources[0] != "threads_ssr_recent" {
		t.Fatalf("unexpected source results: %+v", results)
	}
	if len(reports) != 1 || reports[0].Fresh12h != 1 || reports[0].Source != "threads_ssr_recent" {
		t.Fatalf("unexpected diagnostic: %+v", reports)
	}
}

// Optional local replay uses an already captured public page, without networking
// or retaining real post contents in the repository or test logs.
func TestRecentSearchCapturedPublicPage(t *testing.T) {
	path := os.Getenv("NEXTSTOP_RECENT_FIXTURE")
	if path == "" {
		t.Skip("no captured public page supplied")
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	posts := parsePostsSSR(string(body))
	matched, fresh := 0, 0
	for _, p := range posts {
		score, _ := scoreSearchPost(p, "演唱會")
		if score < 30 {
			continue
		}
		matched++
		if p.Timestamp.After(time.Now().Add(-12 * time.Hour)) {
			fresh++
		}
	}
	if fresh == 0 {
		t.Fatalf("captured page has %d matching candidates but no fresh candidates", matched)
	}
	t.Logf("captured recent page: matching=%d fresh12h=%d", matched, fresh)
}
