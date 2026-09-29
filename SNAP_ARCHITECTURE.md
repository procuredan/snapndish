# Snap n Dish — current architecture and authority register

**Reconciled:** 2026-09-29. **Status:** Stage 1A controlled evaluation and private Live Lab implementation; deployment must be verified separately.
**Governance:** [SNAP_GLOBAL_RULES.md](SNAP_GLOBAL_RULES.md). **Decisions:** [SNAP_DECISION_LOG.md](SNAP_DECISION_LOG.md).

This document describes what exists and marks future product boundaries separately. The owner has authorized the private Stage 1A Live Lab at `app.snapndish.com`; that authorization does not include Stage 1B or a broader production build. Code and observed runtime remain implementation evidence; an old plan is not proof of current behavior.

## Evidence convention

**VERIFIED** means inspected in the current repository or exercised; **INFERRED** means plausible but not proven at the named boundary; **NOT VERIFIED** means no evidence or owner decision. A checked-in design is not a deployed system.

## Verified Stage 1A system

**VERIFIED:** This repository currently holds a dependency-free Node/TypeScript CLI, synthetic scenario corpus, local test suite, and evaluation protocol. `src/cli.ts` offers preflight, three-arm run, private terminal chat, and report regeneration. `src/config.ts` defines A (minimal foundation reference), B (Snap behavior), C (B plus explicit fixture context), versions, and a dated price estimate. `src/openai.ts` calls the OpenAI Responses API with `store:false`; `src/report.ts` writes raw turn records, aggregate metrics, and a blinded review sheet. Each arm carries its own prior user/assistant turns. Ignored `runs/` output is local evidence, not an account, memory service, or authoritative meal state.

**VERIFIED:** Tests exercise arm separation, corpus coverage, adapter request/usage parsing, secret-safe error handling, incomplete-run reporting, and blind context separation. The controlled A/B/C comparison has been run live and retained privately in ignored `runs/`; owner blind scoring is pending. The local key has been configured without entering Git history.

**VERIFIED ABSENT FROM THE PRODUCT:** There is no React application, R2/Queue binding, account system, image upload, realtime voice, persistent customer profile, meal/cooking state, or notification transport. The Live Lab Worker adds only private text sessions and a conversation revision; these are evaluation records, not evidence of the full product architecture.

## Authority register

| Concern | Current status | Authority / implementation | Boundary |
| --- | --- | --- | --- |
| Project invariants | VERIFIED document | `SNAP_GLOBAL_RULES.md` | Owner-approved governance; subordinate files cannot override it. |
| Product/architecture decisions | VERIFIED document | Append-only `SNAP_DECISION_LOG.md` | New decisions append; existing entries are not rewritten. |
| Stage 1A scenarios and context | VERIFIED fixture | `evaluation/scenarios.json` | Synthetic test inputs, not real customer memory. |
| A/B/C behavior | VERIFIED code | `src/config.ts` | Only experiment instructions and fixture context; not a deployed Snap policy. |
| Model transport | VERIFIED code, live call NOT VERIFIED | `src/openai.ts` | Thin adapter; provider response is generated advice and usage evidence, not durable action authority. |
| Per-arm conversation | VERIFIED code | `src/cli.ts` in-process arrays | Isolated experimental histories; process exit ends them. |
| Run output and metrics | VERIFIED code, live metrics NOT VERIFIED | `src/cli.ts`, `src/report.ts`, ignored `runs/` | Partial results persist locally; estimated price is not a bill or a quality rating. |
| Human culinary evaluation | Protocol exists; outcomes NOT VERIFIED | `evaluation/protocol.md` and generated blind sheet | Human reviewers must score; software cannot fabricate judgments. |
| Identity and parent profile | NOT IMPLEMENTED | Future product decision | Procure profile integration boundary is planned, not currently connected. |
| Meal/progress/forecast authority | NOT IMPLEMENTED | Future Snap n Dish backend | Must be server-owned and independently versioned when authorized. |
| Cross-device and three modalities | NOT IMPLEMENTED | Future account/conversation APIs and clients | Snap It/Write It/Talk It must converge; no current client demonstrates this. |
| Stage 1A Live Lab | VERIFIED local code and tests; remote release separately verified | `live-lab/`, `wrangler.*.jsonc` | Arm C streaming text, private access, D1 conversation and telemetry, no product account or meal state. |
| Release environments | CONFIGURED for Stage 1A only | `wrangler.staging.jsonc`, `wrangler.live.jsonc` | Separate Snap n Dish resources; actual deployments and custom domain must be verified. |

## Current data and execution flow

`evaluation/scenarios.json` → identical scripted user turns → three instruction/context variants with the same selected model → Responses API adapter → per-arm local conversation → incremental `results.json` → `summary.json`, blind review, key, separate context fixtures.

The run records response/model IDs, full-response latency, provider token usage, estimated USD, text, versions, and errors. It does not record time to first spoken/visible response, actual invoice, human culinary scores, real cooking outcome, image or voice cost, or backend cost. Retries may incur unobserved cost when the provider does not return usage. A run is incomplete if any expected turn is missing. The local cost cap is an experimental guard, not a product budget.

## Approved product boundary, not current implementation

The Snap n Dish product belongs at **SnapNDish.com itself**. A future web client and eventual mobile/native clients must use the same backend APIs, account, ordered conversation, customer context, active meal, cooking progress, and schedule forecast. A phone planning session should continue on a kitchen laptop or tablet. The product direction expects Snap n Dish-owned Cloudflare Workers, D1, R2 and, only when useful, Queues; resource names, IDs, routes, schema, identity provider, and deployment topology have **not** been selected here.

Keep three distinct durable concepts when implementation is authorized:

1. **Meal version:** what the customer has chosen to make, with accepted substitutions or changes.
2. **Cooking progress:** what the person reports or an authoritative operation confirms actually happened.
3. **Schedule forecast:** Snap's current estimate of what should happen next and when, recalculated from the first two and real constraints.

The model can suggest a plan or recovery. The backend must conditionally accept consequential changes against the current revision, preserve the prior version, and reject late results. Timers are operations, not claims in prose. Current input outranks remembered preference; a visiting guest's restriction does not silently become a permanent household rule. Visual evidence remains uncertain about hidden ingredients and allergens. Spoken and displayed turns share one transcript; a speech correction changes the same state as a typed correction.

## Versioning, concurrency, and failure signals

**Current prototype:** behavior/context/scenario versions are constants. No concurrent durable mutation occurs. Partial run files survive a process error, but the CLI does not resume a failed run; a new run is a new comparison. The blind review is for private evaluation, not a customer interface.

**Future requirement:** assign durable IDs and revisions to the customer conversation, accepted meal, cooking progress, forecast, timer operations, and any asynchronous image/voice/model work. Use conditional datastore writes and idempotency keys for retries and cross-device races. A correction or accepted meal change invalidates dependent stale forecasts and pending model suggestions. Failure signals should include current revision, model/behavior version, latency, usage/cost, timeout/retry, rejected stale write, and customer-visible recovery without logging unnecessary private content.

## Release and environment status

The repository has a verification-only GitHub Actions workflow. A GitHub commit/push does not deploy a Worker. Stage 1A Live Lab staging and live configuration, initial migration, and release runbook are in this repository; actual Cloudflare state must be checked after each deployment. Do not substitute Snap n Done's resource IDs, domains, queues, models, or release scripts. The live hostname is a private test surface, not a Stage 1B or general product release.

## Open decisions and known limits

- **NOT VERIFIED:** Whether the selected foundation model and Snap instructions preserve the inspired culinary experience to the owner's standard. Live A/B/C outputs exist; blind owner judgment is pending.
- **NOT VERIFIED:** Owner reference conversations, blinded human ratings, actual cooking validation, acceptable quality threshold, and full-session economics/latency threshold.
- **NOT DECIDED:** Identity provider, Procure parent-profile consent and data-sharing contract, sensitive-context retention/deletion executor, and vendor data controls for production.
- **NOT DECIDED:** Broader production rollout/rollback mechanism, realtime voice provider and transcript reconciliation, and cross-device synchronization contract. Stage 1A Live Lab resources and rollback are specific to this controlled test.
- **NOT DECIDED:** Notification channels and permission model; they are not Stage 1A work.

The Stage 1A CLI intentionally lacks product-owned durable state. The Live Lab adds only session and transcript authority for controlled testing. Neither demonstrates the final meal, cooking, memory, voice, photo, or cross-device system. Stage 1B still requires a separate owner decision after blind review.
