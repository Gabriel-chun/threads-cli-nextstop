package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
	"github.com/tamnd/threads-cli/threads"
)

func newSearchCmd(a *App) *cobra.Command {
	var typ string
	var depth int
	var googleFallback bool
	var diagnosticsFile string
	cmd := &cobra.Command{
		Use:   "search <query>",
		Short: "Keyword search across public posts",
		Long:  `Read public Threads search results. Recent search uses one filtered public page without GraphQL pagination or external fallback. Top search retains the legacy depth options.`,
		Args:  minArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			defer func() { _ = a.Out.Flush() }()
			if typ != "top" && typ != "recent" {
				return fmt.Errorf("invalid search type %q: use top or recent", typ)
			}
			ctx := cmd.Context()
			query := strings.Join(args, " ")
			a.progress("searching %q", query)
			var pages []any
			record := func(d threads.SearchPageDiagnostic) { pages = append(pages, d) }
			if diagnosticsFile != "" {
				defer func() {
					_ = os.MkdirAll(filepath.Dir(diagnosticsFile), 0755)
					data, e := json.MarshalIndent(map[string]any{"schema_version": "search-source-v1", "query": query, "depth_requested": depth, "pages": pages}, "", "  ")
					if e == nil {
						_ = os.WriteFile(diagnosticsFile, append(data, 10), 0644)
					}
				}()
			}
			for r, err := range a.Client.SearchWithTypeDiagnostics(ctx, query, a.Limit, depth, googleFallback, typ, record) {
				if err != nil {
					return err
				}
				if err := a.Out.Emit(searchRow(&r)); err != nil {
					return err
				}
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&typ, "type", "top", "top|recent (recent uses one public SSR window)")
	cmd.Flags().IntVar(&depth, "depth", 1, "deprecated compatibility flag; public-page search is single-window")
	cmd.Flags().BoolVar(&googleFallback, "google-fallback", false, "deprecated compatibility flag; external search fallback is disabled")
	cmd.Flags().StringVar(&diagnosticsFile, "diagnostics-file", "", "optional aggregate search-source diagnostic JSON path")
	return cmd
}
