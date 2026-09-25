package cli

import (
	"github.com/spf13/cobra"
	"github.com/tamnd/threads-cli/pkg/thid"
)

func newIDCmd(a *App) *cobra.Command {
	return &cobra.Command{
		Use:   "id <input>",
		Short: "Classify any Threads handle, id, shortcode, or URL (offline)",
		Args:   exactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			defer func() { _ = a.Out.Flush() }()
			for _, in := range readArgsOrStdin(args) {
				if err := a.Out.Emit(identityRow(thid.Classify(in))); err != nil {
					return err
				}
			}
			return nil
		},
	}
}
