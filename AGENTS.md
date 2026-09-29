# Snap n Dish execution instructions

## Read first

Before material work, read [`SNAP_GLOBAL_RULES.md`](SNAP_GLOBAL_RULES.md), [`SNAP_ARCHITECTURE.md`](SNAP_ARCHITECTURE.md), and [`SNAP_DECISION_LOG.md`](SNAP_DECISION_LOG.md), then inspect the affected implementation, tests, evaluation evidence and environment. These three files are the canonical governance, current architecture and append-only decision authority. This file supplies execution guidance and cannot override them. Record new decisions only in `SNAP_DECISION_LOG.md`; update the architecture when verified implementation changes.

## Current authorization boundary

The owner has authorized a private, instrumented Stage 1A Live Lab at `app.snapndish.com`, with staging first and the specified pre-deploy report. Preserve the controlled A/B/C evaluation and its private results. This authorization covers only the Live Lab; it does not approve Stage 1B, a public beta, or the broader production application. Future material deployments still require their own owner authorization.

## Snap n Dish build principles

1. **The culinary brain is the product.** Preserve open culinary breadth from a strong foundation model. Prompt, context, schema, retrieval, workflow and model changes require comparison with the foundation reference. Inspect specific losses of novelty, curiosity, adaptation and conversational quality, not only average scores.
2. **Keep it simple.** Use the smallest design that protects currentness, authority, safety, privacy and the demonstrated experience. Let the model reason about food; do not replace it with a finite recipe engine, cuisine table, canned meal plan or unnecessary orchestration layer.
3. **Be curious through human conversation.** Give useful options or a next step before asking. Ask when the answer changes a real decision; do not run a questionnaire. Respond to the entire conversation, especially corrections and repeated rejection.
4. **“Not a problem, I got you.”** Treat a cold grill, missing ingredient, late start, burned food or broken sauce as a new fact. Recalculate calmly and state the next feasible action. Snap owns the plan; the customer owns the moment. Time is Snap's responsibility; there is no such thing as behind.
5. **One Snap across modes and devices.** Snap It, Write It and Talk It must share account, transcript, memory and active meal/cooking state. Realtime voice must speak back and preserve a visible transcript. Image observations can guide reconstruction but cannot prove hidden ingredients or allergy safety. SnapNDish.com is the product.
6. **Explicit customer authority.** Current customer input outranks inferred or remembered context. Separate accepted meal version, actual progress and schedule forecast. A model suggestion cannot commit a timer, completed step, ingredient verification or accepted meal change without the authoritative backend operation succeeding.
7. **Fix causes.** If a culinary case fails, determine whether the model, prompt, context, conversation history, state/currentness, or presentation caused it. Do not hardcode one scenario's answer or tune copy to hide a systemic failure.
8. **Private by default.** Use synthetic fixtures in Stage 1A. Keep keys in ignored local environment or managed secrets, never in GitHub or review artifacts. Inspect outputs before sharing. Define retention and deletion before real customer media or profiles become durable.

## Material-change prework

Write down the existing system, its authoritative owner, the requested extension, what could regress, the evidence to prove success, and the code/data recovery path. For AI behavior, record model, prompt, context, parameter and corpus versions. For a client or backend change, identify the current meal/conversation revision and the stale-result behavior. If the necessary authority is undecided, do not create it silently.

## Verification and release

- Run the relevant local checks and evaluate material AI behavior on fixed and held-out cases, with human culinary review before promotion. A green CLI test is not a culinary quality result.
- CI is verification only. The repository's GitHub workflow must not contain deployment credentials or `wrangler deploy`.
- A `git push` changes GitHub history only. A future Cloudflare deploy is a separate, explicitly invoked action under Snap n Dish-specific configuration. Never use Snap n Done Wrangler IDs, routes, queues, models, budgets or secrets.
- Material runtime changes reach isolated staging before production. Verify the actual rendered conversation and critical journeys on target devices, current behavior/model version, telemetry, and operational gates. Record rollback and data recovery before deploying.
- Production deployment requires explicit owner authorization every time. After deployment, verify health **and** a real critical journey; report what was not verified.

## Out of scope unless separately authorized

No Snap n Done provider, job, quote, routing/BID_READY, matching, offer, fee, tip, transfer, Stripe/payment, supply, marketplace SMS or Walter policy belongs here. Do not mutate Snap n Done, Procure, Walter, Clink Pass or their resources. Do not build Stage 1B, a production app, grocery commerce, a recipe corpus, native clients or a parent-profile service as part of governance installation.
