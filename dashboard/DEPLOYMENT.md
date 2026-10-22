# Next Stop Live — Cloudflare deployment from GitHub

The existing `threads-cli-nextstop` Cloudflare Worker can be deployed automatically from GitHub after a successful **Dashboard CI** run on `main`.

## One-time setup

1. In Cloudflare, create an API token scoped to **this account** with permission to edit Workers (see [Cloudflare's GitHub Actions instructions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)). Do **not** commit this token.
2. In this GitHub repository go to **Settings → Secrets and variables → Actions**, and create repository secrets:
   - `CLOUDFLARE_API_TOKEN`: the scoped token.
   - `CLOUDFLARE_ACCOUNT_ID`: the account ID shown in Cloudflare.
3. In Cloudflare's existing Worker, confirm the runtime secret bindings `NOTION_TOKEN` and `NEXTSTOP_EVENT_EMIT_TOKEN` are already set. This workflow **does not re-upload** them. The repo's `dashboard/wrangler.jsonc` provides the `MCP_EVENTS_KV` namespace binding.
4. Avoid also enabling Cloudflare Workers Builds / Git auto-deploy for this same Worker: choose **one** production deployment owner. This workflow uses GitHub Actions.
5. Merge the deployment workflow to `main`. Future changes to `dashboard/**` trigger Dashboard CI; if it succeeds on a `main` push, the deployment workflow checks out **that exact commit**, builds the vinext bundle, and deploys. Run `Dashboard Cloudflare Deploy` manually on `main` for an initial deployment after secrets are set.

## Behavior and safety

- Changes to collector archives, Notion control settings, and the routine collector schedule do **not** deploy the Dashboard Worker.
- Pull requests never deploy production. Failed CI never deploys production.
- A deployment is serialized to avoid two production deployments at once.
- The deploy step is intentionally separate from `npm run deploy:vinext`. That interactive/manual script executes `wrangler secret bulk`, while this CI path uses `npm run deploy:ci`, preserving existing runtime secrets.
- If the GitHub Actions credentials are missing, the workflow fails with an actionable error and does not touch Cloudflare.
- GitHub Actions workflow files are a privileged code path. Review proposed changes before merging. For added protection, require reviews on `main`.
- Production endpoint (existing): `https://threads-cli-nextstop.gabrielchun336.workers.dev`. Check Cloudflare deployment history and the existing `Production MCP Smoke` workflow after first deployment. The smoke workflow itself is manual or path-triggered; it is not a deploy gate.

## Modifying collection rules without a deployment

The scheduled `Next Stop Threads Collector` workflow runs `collector/load_notion_config.mjs` on each collection and loads the Enabled record from Notion Collector Control. Updating `Queries`, `Window Hours`, `Min Score`, or `Search Depth` does not need a Cloudflare Worker deployment.
