package cli

import (
	"time"

	"github.com/spf13/cobra"
)

func newBatchSearchCmd(a *App) *cobra.Command {
	var minScore int
	var sinceDays int

	cmd := &cobra.Command{
		Use:   "batch-search <query...|->",
		Short: "Search several public Threads queries and return one deduplicated ranked list",
		Long: `Run multiple anonymous public Threads searches, merge duplicate posts by
permalink/id, keep the best relevance score, retain every query that found the
post, and optionally filter by relevance score and recency.

Use "-" to read one query per line from stdin.`,
		Args: minArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			defer func() { _ = a.Out.Flush() }()
			ctx := cmd.Context()
			queries := readArgsOrStdin(args)

			var since time.Time
			if sinceDays > 0 {
				since = time.Now().AddDate(0, 0, -sinceDays)
			}

			a.progress("batch searching %d queries", len(queries))
			results, err := a.Client.BatchSearch(ctx, queries, minScore, since, a.Limit)
			if err != nil {
				return err
			}
			for i := range results {
				if err := a.Out.Emit(searchRow(&results[i])); err != nil {
					return err
				}
			}
			return nil
		},
	}

	cmd.Flags().IntVar(&minScore, "min-score", 30, "minimum relevance score to keep")
	cmd.Flags().IntVar(&sinceDays, "since-days", 30, "keep posts from the last N days (0 = no date filter)")
	return cmd
}
