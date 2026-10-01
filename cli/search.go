package cli

import (
	"strings"

	"github.com/spf13/cobra"
)

func newSearchCmd(a *App) *cobra.Command {
	var typ string
	var depth int
	var googleFallback bool
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
			for r, err := range a.Client.SearchWithOptions(ctx, query, a.Limit, depth, googleFallback) {
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
	return cmd
}
