package threads

import "testing"

func TestFilterSearchPostsChineseQuery(t *testing.T) {
	posts := []Post{
		{ID: "1", Text: "YOASOBI 大巨蛋演唱會抽選開始"},
		{ID: "2", Text: "今天中秋節月亮很漂亮"},
		{ID: "3", Text: "台北大巨蛋 Garden City 新開幕"},
	}

	got := filterSearchPosts(posts, "大巨蛋")
	if len(got) != 2 {
		t.Fatalf("expected 2 relevant posts, got %d", len(got))
	}
	if got[0].ID != "1" || got[1].ID != "3" {
		t.Fatalf("unexpected matches: %#v", got)
	}
}

func TestFilterSearchPostsMultiWordQuery(t *testing.T) {
	posts := []Post{
		{ID: "1", Text: "YOASOBI 明年將在台北大巨蛋演出"},
		{ID: "2", Text: "YOASOBI 新歌很好聽"},
		{ID: "3", Text: "大巨蛋交通資訊整理"},
	}

	got := filterSearchPosts(posts, "YOASOBI 大巨蛋")
	if len(got) != 1 || got[0].ID != "1" {
		t.Fatalf("expected only combined match, got %#v", got)
	}
}

func TestFilterSearchPostsHashtagAndHandle(t *testing.T) {
	posts := []Post{
		{ID: "1", Username: "nextstop.live", Text: "#大巨蛋 交通"},
	}
	got := filterSearchPosts(posts, "#大巨蛋")
	if len(got) != 1 {
		t.Fatalf("expected hashtag match, got %d", len(got))
	}
}
