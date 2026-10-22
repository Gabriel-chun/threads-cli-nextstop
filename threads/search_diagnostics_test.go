package threads

import (
    "testing"
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
