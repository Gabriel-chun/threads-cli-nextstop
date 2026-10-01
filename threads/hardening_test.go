package threads

import (
	"strings"
	"testing"
)

func TestDefaultUserAgentDoesNotImpersonateCrawler(t *testing.T) {
	ua := DefaultConfig().UserAgent
	lower := strings.ToLower(ua)
	for _, forbidden := range []string{"googlebot", "bingbot", "duckduckbot", "facebookexternalhit"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("default user agent must not impersonate %q: %q", forbidden, ua)
		}
	}
	if !strings.Contains(ua, "NextStopLiveCollector") {
		t.Fatalf("default user agent should identify this project: %q", ua)
	}
}

func TestRelayProviderDoesNotClaimCrawlerStatus(t *testing.T) {
	vars := relayProviderVars()
	key := "__relay_internal__pv__BarcelonaIsCrawlerrelayprovider"
	got, ok := vars[key]
	if !ok {
		t.Fatalf("expected explicit crawler relay state")
	}
	if got != false {
		t.Fatalf("crawler relay state must be false, got %#v", got)
	}
}
