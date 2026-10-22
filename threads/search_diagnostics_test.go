package threads

import (
    "testing"
    "strings"
    "time"
)

func TestSummarizeSearchPage(t *testing.T) {
    now := time.Date(2026, 10, 22, 5, 0, 0, 0, time.UTC)
    posts := []Post{
        {Timestamp: now.Add(-1*time.Hour)},
        {Timestamp: now.Add(-13*time.Hour)},
        {Timestamp: time.Time{}},
        {Timestamp: now.Add(10*time.Minute)},
    }
    d := SummarizeSearchPage("threads_ssr", 1, posts, now, 12*time.Hour, "ok")
    if d.Returned != 4 || d.Fresh12h != 1 || d.MissingTime != 1 {
        t.Fatalf("unexpected freshness diagnostic: %+v", d)
    }
    if d.LatestPostedAt != now.Add(10*time.Minute).Format(time.RFC3339) {
        t.Fatalf("unexpected latest timestamp: %+v", d)
    }
    if d.Source != "threads_ssr" || d.Page != 1 || d.Status != "ok" {
        t.Fatalf("unexpected diagnostic identity: %+v", d)
    }
}

func TestDecodeGraphQLPayloadCategorizesFailures(t *testing.T) {
    cases := []struct { name string; status int; body string; want string }{
        {"rate_limited", 429, `{"data":{}}`, "http_429"},
        {"server_error", 503, `{"data":{}}`, "http_503"},
        {"bad_json", 200, "<html>", "invalid_json"},
        {"api_error", 200, `{"errors":[{"message":"private upstream detail"}],"data":null}`, "graphql_errors"},
        {"missing_data", 200, `{"data":null}`, "missing_data"},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            _, err := decodeGraphQLPayload(tc.status, []byte(tc.body))
            if err == nil { t.Fatal("expected failure") }
            if got := graphqlFailureKind(err); got != tc.want { t.Fatalf("want %s, got %s", tc.want, got) }
            if strings.Contains(err.Error(), "private upstream detail") { t.Fatal("leaked upstream error") }
        })
    }
    data, err := decodeGraphQLPayload(200, []byte(`{"data":{"search":{"ok":true}}}`))
    if err != nil || data == nil { t.Fatalf("valid payload failed: %v", err) }
}
