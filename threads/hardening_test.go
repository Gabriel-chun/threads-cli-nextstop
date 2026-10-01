package threads

import (
	"strings"
	"testing"
)

func TestDepth3CollectorUsesCrawlerRenderedSurface(t *testing.T) {
	ua := DefaultConfig().UserAgent
	if !strings.Contains(strings.ToLower(ua), "googlebot") {
		t.Fatalf("restored depth3 retrieval expects crawler-rendered SSR user agent: %q", ua)
	}
}

func TestDepth3CollectorDeclaresLoggedOutCrawlerRelayState(t *testing.T) {
	vars := relayProviderVars()

	if got := vars["__relay_internal__pv__BarcelonaIsCrawlerrelayprovider"]; got != true {
		t.Fatalf("crawler relay state must be true for restored logged-out depth retrieval, got %#v", got)
	}
	if got := vars["__relay_internal__pv__BarcelonaIsLoggedInrelayprovider"]; got != false {
		t.Fatalf("logged-in relay state must stay false, got %#v", got)
	}
	if got := vars["__relay_internal__pv__BarcelonaIsInternalUserrelayprovider"]; got != false {
		t.Fatalf("internal-user relay state must stay false, got %#v", got)
	}
}

func TestDefaultConfigDoesNotRequireSessionCredentials(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.Token != "" || cfg.Session != "" || cfg.CSRF != "" {
		t.Fatalf("production tests expect no account credentials in the default environment")
	}
}
