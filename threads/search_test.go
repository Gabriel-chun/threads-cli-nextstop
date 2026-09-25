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

func TestScoreSearchPostAllowsPartialVenuePhrase(t *testing.T) {
	p := Post{ID: "1", Text: "大巨蛋散場後捷運人很多"}
	score, matched := scoreSearchPost(p, "台北大巨蛋")
	if score <= 0 {
		t.Fatalf("expected partial venue match, got %d", score)
	}
	if len(matched) != 1 || matched[0] != "大巨蛋" {
		t.Fatalf("expected 大巨蛋 partial match, got %#v", matched)
	}
}

func TestScoreSearchPostRanksMultiTermMatchHigher(t *testing.T) {
	both := Post{ID: "1", Text: "YOASOBI 明年將在台北大巨蛋演出"}
	artistOnly := Post{ID: "2", Text: "YOASOBI 香港場日期公開"}

	bothScore, _ := scoreSearchPost(both, "YOASOBI 大巨蛋")
	artistScore, _ := scoreSearchPost(artistOnly, "YOASOBI 大巨蛋")

	if bothScore <= artistScore {
		t.Fatalf("expected combined match (%d) to outrank artist-only match (%d)", bothScore, artistScore)
	}
	if artistScore <= 0 {
		t.Fatalf("expected partial candidate to remain visible with lower score")
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
