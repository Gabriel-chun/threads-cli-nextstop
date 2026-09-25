package threads

import "testing"

func TestScoreSearchPostExactChineseQuery(t *testing.T) {
	p := Post{ID: "1", Text: "YOASOBI 大巨蛋演唱會抽選開始"}
	score, matched := scoreSearchPost(p, "大巨蛋")
	if score < 60 {
		t.Fatalf("expected strong exact score, got %d", score)
	}
	if len(matched) != 1 || matched[0] != "大巨蛋" {
		t.Fatalf("unexpected matched terms: %#v", matched)
	}
}

func TestScoreSearchPostRejectsPartialSingleTermVenuePhrase(t *testing.T) {
	p := Post{ID: "1", Text: "大巨蛋散場後捷運人很多"}
	score, matched := scoreSearchPost(p, "台北大巨蛋")
	if score != 0 || len(matched) != 0 {
		t.Fatalf("expected partial single-term match to be rejected, got score=%d matched=%#v", score, matched)
	}
}

func TestScoreSearchPostRequiresAllMultiTermParts(t *testing.T) {
	both := Post{ID: "1", Text: "YOASOBI 明年將在大巨蛋演出"}
	artistOnly := Post{ID: "2", Text: "YOASOBI 香港場日期公開"}

	bothScore, _ := scoreSearchPost(both, "YOASOBI 大巨蛋")
	artistScore, artistMatched := scoreSearchPost(artistOnly, "YOASOBI 大巨蛋")

	if bothScore <= 0 {
		t.Fatalf("expected anchored AND match to pass, got %d", bothScore)
	}
	if artistScore != 0 || len(artistMatched) != 0 {
		t.Fatalf("expected missing second term to be rejected, got score=%d matched=%#v", artistScore, artistMatched)
	}
}

func TestScoreSearchPostRequiresLatinPhraseAnchor(t *testing.T) {
	good := Post{ID: "1", Text: "Extra ticket for Tokyo Dome concert this November"}
	noise := Post{ID: "2", Text: "Amazing concert tonight in Singapore"}

	goodScore, _ := scoreSearchPost(good, "Tokyo Dome concert")
	noiseScore, noiseMatched := scoreSearchPost(noise, "Tokyo Dome concert")

	if goodScore != 100 {
		t.Fatalf("expected exact phrase match score 100, got %d", goodScore)
	}
	if noiseScore != 0 || len(noiseMatched) != 0 {
		t.Fatalf("expected generic concert noise to be rejected, got score=%d matched=%#v", noiseScore, noiseMatched)
	}
}

func TestScoreSearchPostRequiresCJKAnchorAndIntent(t *testing.T) {
	good := Post{ID: "1", Text: "東京ドームからの帰りは水道橋駅が混んでいた"}
	venueOnly := Post{ID: "2", Text: "東京ドームに行ってきた"}

	goodScore, _ := scoreSearchPost(good, "東京ドーム 帰り")
	venueScore, venueMatched := scoreSearchPost(venueOnly, "東京ドーム 帰り")

	if goodScore <= 0 {
		t.Fatalf("expected venue + intent to pass, got %d", goodScore)
	}
	if venueScore != 0 || len(venueMatched) != 0 {
		t.Fatalf("expected missing intent to be rejected, got score=%d matched=%#v", venueScore, venueMatched)
	}
}

func TestScoreSearchPostRejectsUnrelatedFeed(t *testing.T) {
	p := Post{ID: "1", Text: "今天中秋節月亮很漂亮"}
	score, matched := scoreSearchPost(p, "大巨蛋")
	if score != 0 || len(matched) != 0 {
		t.Fatalf("expected unrelated feed to score 0, got score=%d matched=%#v", score, matched)
	}
}

func TestLongestQuerySubstringMatch(t *testing.T) {
	got := longestQuerySubstringMatch("台北大巨蛋", "今天去大巨蛋看演唱會", 3)
	if got != "大巨蛋" {
		t.Fatalf("expected 大巨蛋, got %q", got)
	}
}


func TestRelevanceTier(t *testing.T) {
	cases := []struct {
		score int
		want  string
	}{
		{100, "high"},
		{60, "high"},
		{59, "candidate"},
		{30, "candidate"},
		{29, "low"},
		{1, "low"},
		{0, "none"},
	}
	for _, tc := range cases {
		if got := relevanceTier(tc.score); got != tc.want {
			t.Fatalf("score %d: want %q, got %q", tc.score, tc.want, got)
		}
	}
}

func TestMergeSearchResultsDeduplicatesMetadata(t *testing.T) {
	a := SearchResult{
		ID:             "1",
		Query:          "大巨蛋",
		SourceQueries:  []string{"大巨蛋"},
		MatchedTerms:   []string{"大巨蛋"},
		RelevanceScore: 60,
		RelevanceTier:  "high",
	}
	b := SearchResult{
		ID:             "1",
		Query:          "台北大巨蛋",
		SourceQueries:  []string{"台北大巨蛋"},
		MatchedTerms:   []string{"台北大巨蛋"},
		RelevanceScore: 80,
		RelevanceTier:  "high",
	}

	got := mergeSearchResults(a, b)
	if got.Query != "台北大巨蛋" || got.RelevanceScore != 80 {
		t.Fatalf("expected stronger query to win, got query=%q score=%d", got.Query, got.RelevanceScore)
	}
	if len(got.SourceQueries) != 2 {
		t.Fatalf("expected 2 source queries, got %#v", got.SourceQueries)
	}
	if len(got.MatchedTerms) != 2 {
		t.Fatalf("expected merged matched terms, got %#v", got.MatchedTerms)
	}
}
