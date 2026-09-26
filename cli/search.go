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
		Long: `Replay the logged-out search query for a keyword.

This path depends on a rotating doc_id. When the current doc_id does not expose
search to anonymous callers, the stream ends honestly after what it found.`,
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
	cmd.Flags().IntVar(&depth, "depth", 1, "anonymous retrieval depth, 1-5 pages including the SSR window")
	cmd.Flags().BoolVar(&googleFallback, "google-fallback", false, "add Google site:threads.com URL discovery as a best-effort coverage fallback")
	return cmd
}
