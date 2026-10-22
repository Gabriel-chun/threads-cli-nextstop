package cli

import (
	"strings"
 "encoding/json"
 "os"
 "path/filepath"

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
		Long: `Read the public logged-out Threads search page for a keyword.\n\nThis command does not use internal GraphQL pagination or search-engine fallback.\nIf the public page does not expose results, the command returns that limitation.`,
		Args: minArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			defer func() { _ = a.Out.Flush() }()
			ctx := cmd.Context()
			query := strings.Join(args, " ")
			a.progress("searching %q", query)
			var pages []any
            record := func(d threads.SearchPageDiagnostic) { pages = append(pages, d) }
            if diagnosticsFile != "" {
                defer func() {
                    _ = os.MkdirAll(filepath.Dir(diagnosticsFile), 0755)
                    data, e := json.MarshalIndent(map[string]any{"schema_version":"search-source-v1","query":query,"depth_requested":depth,"pages":pages}, "", "  ")
                    if e == nil { _ = os.WriteFile(diagnosticsFile, append(data, 10), 0644) }
                }()
            }
            for r, err := range a.Client.SearchWithDiagnostics(ctx, query, a.Limit, depth, googleFallback, record) {
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
	cmd.Flags().StringVar(&typ, "type", "top", "top|recent")
	cmd.Flags().IntVar(&depth, "depth", 1, "deprecated compatibility flag; public-page search is single-window")
	cmd.Flags().BoolVar(&googleFallback, "google-fallback", false, "deprecated compatibility flag; external search fallback is disabled")
	cmd.Flags().StringVar(&diagnosticsFile, "diagnostics-file", "", "optional aggregate search-source diagnostic JSON path")
	return cmd
}
