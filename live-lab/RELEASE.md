# Stage 1A Live Lab release runbook

This is a private, text-only owner experiment. It is not Stage 1B, a public beta, or the production application. `app.snapndish.com` is authorized only for this controlled surface. CI verifies; it does not deploy. GitHub source push and Cloudflare release are separate actions.

## Artifact and resources

- `wrangler.staging.jsonc`: `snapndish-stage1a-staging`, its own D1 database, Workers development URL.
- `wrangler.live.jsonc`: `snapndish-stage1a-live`, its own D1 database, custom domain `app.snapndish.com`.
- `*.bootstrap.jsonc`: a closed 503 Worker used as the first version and known code rollback target. Its scheduled deletion handler stays active during rollback.
- `live-lab/migrations/0001_init.sql`: initial append-only D1 schema. Apply it once per environment. Never edit it after remote application.
- Cloudflare Worker secrets for each environment: `OPENAI_API_KEY`, `LAB_ACCESS_CODE`, `COOKIE_SIGNING_KEY`. Keep staging and live cookie signing keys separate. Never print them or commit `.env`, `.dev.vars`, or private `runs/`.

## Exact telemetry

Each session stores UUID, creation/update/expiry timestamps, current conversation revision, last turn ID, and the owner-entered customer context. Each accepted user and assistant turn stores UUID, session, revision, role, exact text, timestamp, and the assistant's model-call ID. Each model call stores UUID, user turn ID, revision, request/completion timestamps, status, requested/reported model, provider response ID, behavior/context versions, reasoning effort, exact supplied context snapshot, `memory_retrieved` (`none` in this Lab), tool calls (`[]` in this Lab), time to first non-whitespace text, time to the first candidate useful streamed prefix, the prefix excerpt, full latency, available input/cached/output/reasoning token counts, price-card cost estimate, retry count, error code, and complete model text. State events separately record session creation, accepted user and assistant turns, model failure, or stale result rejection with IDs and revision. A stale model result is retained in model-call evidence but cannot become an accepted assistant turn.

The candidate useful metric is the time to the first streamed prefix at least 50 characters long with a sentence ending or list item. The excerpt permits owner inspection; this heuristic is not a semantic quality judgment. `response_model` is the provider's reported name, which may be an alias rather than an immutable snapshot. Cost is an estimate, not an invoice. No photo, voice, audio, geolocation, tool execution, Procure profile, or meal/cooking authority is included.

## Privacy and access

Private D1 databases hold session data for 30 days from creation. A daily cron removes expired sessions, turns, calls and state events. The owner can also ask to erase the entire Lab databases. D1 Time Travel may retain deleted database states for the plan's backup window; verify that window in the Cloudflare account. OpenAI requests use `store:false`; provider abuse retention is governed by the account's OpenAI terms. Worker request/response observability is disabled. Health reports only stage and behavior/config versions.

The Worker requires a high-entropy secret access code, then issues a 12-hour HMAC-signed `__Host-` cookie (`Secure`, `HttpOnly`, `SameSite=Strict`). Mutations require exact same origin. Content uses CSP nonces, no-store, noindex, and text-only DOM insertion. The access code is shared with trusted owner/developers, so this Lab does not provide per-person identity or attribution. Anyone holding the code can read all Lab sessions; rotate it and the cookie signing key if compromised. Keep synthetic or deliberately provided test context only. Do not enter secrets in a session.

## Gates before live release

1. Review governance, code, migration, domain/account ownership, and exact diff. Confirm the corpus and existing private results are preserved.
2. Run `npm test`; dry-run bundle each full config. Verify no secrets or private results in the GitHub source tree. Push reviewed source and confirm CI status. This is not deployment.
3. Provision separate Snap n Dish D1 databases, place their IDs in the four Wrangler files, and apply migration remotely. Inspect migration ledger and schema.
4. Deploy the **closed** staging Worker. Record its version ID with `wrangler deployments list --config wrangler.staging.bootstrap.jsonc --json`.
5. Put three staging secrets while the closed Worker remains active. Wrangler secret writes may create new versions; confirm the active Worker is still closed.
6. Deploy the full staging Worker. Verify unauthorized access is denied, login works, the rendered chat streams a real response, `/review` shows that session, timing/usage/state events exist, stale responses are rejected, and the D1 records match the visible conversation.
7. Deploy the **closed** live Worker to the custom domain. Record its version ID. Put the three live secrets with the closed config and verify the domain still shows only the closed response.
8. Deploy the full live Worker. Verify `https://app.snapndish.com` in an actual browser, including private entry, streamed conversation, review chronology, current model/behavior version, and D1 telemetry. Verify domain TLS, no unauthenticated transcript access, and no source secrets. Record environment, version IDs, timings, and limitations.

## Rollback and recovery

For any code/security/AI problem, close the affected Worker immediately with the recorded closed version ID:

```sh
wrangler rollback CLOSED_VERSION_ID --config wrangler.live.bootstrap.jsonc --name snapndish-stage1a-live --message 'Pause Stage 1A Live Lab' --yes
```

Use the corresponding staging name/config for staging. Verify the domain returns only `503 Snap n Dish Live Lab is paused.` and protected APIs expose no data. If version rollback is unavailable, `wrangler deploy --config wrangler.live.bootstrap.jsonc` restores the same closed code. These code actions do not revert D1. Preserve D1 evidence for investigation; use Cloudflare D1 backup/Time Travel for data restoration only after identifying the precise restore point and impact. No destructive migration is part of this release. Rotate the Lab access and signing secrets if credential compromise is suspected.

## Commands

Run from the repository root with `WRANGLER_LOG_PATH` outside the repo so logs do not enter source control. Never pass secret values as command arguments. Check `wrangler whoami` and D1 list before mutation. Examples:

```sh
npm test
wrangler deploy --dry-run --outdir /tmp/snd-stage1a-dry --config wrangler.staging.jsonc
wrangler d1 migrations apply DB --remote --config wrangler.staging.jsonc
wrangler deployments list --config wrangler.staging.bootstrap.jsonc --json
```

Every remote command is an explicit operator action. Do not automate deployment from GitHub Actions.
