package threads

import (
	"os"
	"path/filepath"
	"time"
)

// Default request parameters.
const (
	DefaultDelay   = 1 * time.Second
	DefaultRetries = 4
	DefaultTimeout = 30 * time.Second
)

// DefaultUserAgent identifies this project without impersonating a browser,
// search-engine crawler, or another third-party service.
const DefaultUserAgent = "NextStopLiveCollector/0.1 (+https://next-stop-live.vercel.app)"

// Web and API hosts. Anonymous HTML reads use threads.com; the official
// Graph API lives on graph.threads.net.
const (
	WebBase    = "https://www.threads.com"
	GraphQLURL = "https://www.threads.com/api/graphql"
	APIBase    = "https://graph.threads.net/v1.0"
)

// doc_id values are retained for legacy CLI helpers. The Next Stop Live
// collector does not use internal GraphQL pagination for anonymous search.
const (
	DocIDProfileThreads = "33773912952222602" // a profile's threads tab
	DocIDPostPage       = "7448594591874178"  // a single post page and its replies
	DocIDSearch         = "24871030029227550" // keyword/user search
)

// Config is the resolved runtime configuration for a Client.
type Config struct {
	Delay     time.Duration
	Retries   int
	Timeout   time.Duration
	UserAgent string
	Proxy     string
	Lang      string
	CacheDir  string
	NoCache   bool
	CacheTTL  time.Duration
	DataDir   string
	Verbose   int

	// Optional modes retained for non-collector CLI compatibility.
	Token   string // official Graph API token (own account)
	Session string // logged-in session id cookie
	CSRF    string // session CSRF token
}

// DefaultConfig returns the built-in defaults with XDG paths filled in and the
// optional credentials read from the environment.
func DefaultConfig() Config {
	return Config{
		Delay:     DefaultDelay,
		Retries:   DefaultRetries,
		Timeout:   DefaultTimeout,
		UserAgent: DefaultUserAgent,
		Lang:      "en-US",
		CacheDir:  filepath.Join(cacheHome(), "th"),
		CacheTTL:  time.Hour,
		DataDir:   filepath.Join(dataHome(), "th"),
		Token:     os.Getenv("THREADS_TOKEN"),
		Session:   os.Getenv("THREADS_SESSION"),
		CSRF:      os.Getenv("THREADS_CSRF"),
	}
}

func cacheHome() string {
	if d := os.Getenv("XDG_CACHE_HOME"); d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".cache")
}

func dataHome() string {
	if d := os.Getenv("XDG_DATA_HOME"); d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "share")
}
