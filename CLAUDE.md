# Notes for Claude Code sessions

## Cloud sessions: what is reachable
- Outbound traffic is HTTPS only, through a proxy. No direct MongoDB, SSH or other raw TCP.
- Network secrets on the cloud environment add credentials for:
  - `api.cloudflare.com` (Bearer): zones, DNS, Worker routes, Worker deploys.
  - `api.netlify.com` (Bearer): the `foxes-network` site, deploys, env vars.
  - `backboard.railway.com` (Bearer, workspace token for "My Projects"): projects, variables,
    deploys, logs. The `me` query is refused for workspace tokens; query `projects` instead.
- A tool that sends its own token (wrangler) gets the real one from the proxy: set a placeholder,
  e.g. `CLOUDFLARE_API_TOKEN=placeholder`.
- The Railway CLI does not work here (its TLS ignores the proxy CA). Use the GraphQL API.

## Database work: the Railway ops-runner
Read `docs/OPS_RUNNER.md`. It runs one `src/scripts/*.ts` task inside Railway and exits.
- Project `attraction-backend`: `625479a2-f8b3-49f0-9497-34af3b1f76b2`
- Environment `production`: `8752bd79-9d76-42c1-90ee-ac55671b7464`
- Service `web` (API): `b082a313-e243-4279-b59e-a563ad4026f5`
- Service `ops-runner`: `1baf260b-7478-4535-a529-775a9864543c`
- Smoke test: `OPS_TASK=src/scripts/ops-runner-selftest.ts` (writes and removes one marker in
  its own collection; touches no business data).
- Read-only checks may run freely. A run that changes production data needs the owner's
  approval for that run.

## Releases
- A push to `main` deploys the API to Railway. Verify with
  `https://web-production-69d42.up.railway.app/api/version` (the `commit` field).
- The owner's standing instruction: push to `main`, then stop only once the change is live and
  verified.
- Gateway domains (served through the Cloudflare Worker in the storefront repo) need the tenant's
  `customDomain`; sites not created by the network seeds are listed in
  `src/services/gatewayDomainAssignments.service.ts`.
