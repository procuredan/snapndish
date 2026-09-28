# Snap n Dish — project rules

**Status:** Binding Snap n Dish governance, approved 2026-09-28.
**Scope:** This repository and its future product, evaluation, data, and release work.
**Companions:** [current architecture](SNAP_ARCHITECTURE.md), [append-only decisions](SNAP_DECISION_LOG.md), [execution instructions](AGENTS.md).

These rules are native to Snap n Dish. Snap n Done is a source of engineering discipline, not a source of culinary, marketplace, infrastructure, or financial policy. The product owner must approve a material change to these invariants. If instructions conflict, surface the conflict; do not silently weaken a higher-priority safeguard.

Priority when obligations conflict: physical and food safety; security and privacy; customer authority and data integrity; culinary breadth and conversational quality; usability; latency and cost; speed of delivery. A lower priority does not erase a higher one.

## Evidence and scope

Every system claim must be marked **VERIFIED** (observed in code, configuration, a test, or a running environment), **INFERRED** (reasoned but not proven, with the missing proof stated), or **NOT VERIFIED** (evidence absent). Green tests prove only what they exercise. Do not call a prototype deployed, a model good, or a stage complete by inference.

A change is material when it affects AI behavior (prompt, model, parameters, context, tools, schema, retrieval or preprocessing), customer conversation, meal/cooking state, identity, authorization, privacy, safety, data retention, schema, release configuration, or a deployed surface. An agent cannot label its own work immaterial to evade a gate.

## Binding invariants

1. **Verify, never guess.** Read the authoritative code or observe the actual behavior before claiming it works. Name unverified boundaries and stop where they block a consequential action.
2. **Read before changing.** Before material work, read these three canonical documents and the relevant code, migrations, tests, evaluation corpus, deployment configuration, and current staging behavior where applicable. Identify the existing owner of the behavior before adding another.
3. **One authority per decision.** The customer authorizes goals, corrections, constraints, and what actually happened. The future application backend owns durable conversation, accepted meal version, cooking progress, schedule forecast, timers, account/profile linkage, and operation revisions. A model proposes and converses; a browser cache, old device, delayed model reply, or stale job cannot become a second authority. Stage 1A's local transcripts are evaluation artifacts, not production state.
4. **Newest intent wins.** Explicit current customer input overrides older profile assumptions and model guesses. Version dependent state; reject or discard results from an older meal, input generation, session revision, or cooking-progress version. Conditional writes and idempotency belong at the durable store for retryable or concurrent actions. Preserve important accepted history through new versions, not silent rewrites.
5. **CULINARY BREADTH IS AN INVARIANT.** Preserve the foundation model's broad, dynamic, diverse culinary reasoning. No finite recipe database, cuisine taxonomy, rigid output schema, retrieval set, memory summary, or workflow rule may silently narrow what Snap can suggest. Use structure only where it protects durable authority or execution. Evaluate material AI behavior changes against a fixed and held-out corpus for breadth, curiosity, adaptation, practical cooking value, and conversational quality. Compare against a strong minimally instructed foundation reference and inspect regressions, not just aggregate wins. Do not promote a change because it improves one anecdote or lowers cost alone.
6. **One Snap, one conversation.** Snap It, Write It, and Talk It must feed the same account, ordered conversation, customer context, active meal, cooking progress, and forecast. Spoken replies and the visible transcript represent the same turn. Visual observations are uncertain evidence; they do not establish hidden ingredients, allergens, or what the customer has accepted.
7. **Human conversation and calm replanning.** Be curious through human conversation. Give value before asking; ask only when an answer would materially improve the next decision. “Not a problem, I got you” is the recovery posture. Snap owns the plan; the user owns the moment. Time is Snap's responsibility, and there is no such thing as “behind.” A late start, cold grill, missing ingredient, or burned component requires an honest new plan, not blame or a fictitious completed step.
8. **Safety and uncertainty stay explicit.** Serious allergy uncertainty, unreadable labels, cross-contact, undercooked food, unsafe holding, and other material food-safety risks require clarification or a safer direction. A photo or timer expiry does not prove food is safe. Never state an action occurred merely because Snap suggested it.
9. **Server-owned protection.** In the future product, the backend validates identity, authorization, account/profile access, consequential state changes, and currentness for every client. A web-only flow is not the authority for mobile or native clients. Secrets never enter commits, prompts unnecessarily, logs, browser bundles, or user-visible errors. Suspected exposure requires containment and rotation.
10. **Minimum data and defined lifetime.** Collect only context that helps the person cook or improves continuity. Keep food images, voice, transcripts, household facts, allergies, and beverage preferences private and purpose-bound. Define retention, deletion, derived-store, cache, analytics, log, vendor, and backup treatment before durable production collection. No production data in staging. Do not infer an indefinite retention permission from an unset policy.
11. **No regressions.** Before implementation name what could break. Afterward test the changed behavior and its neighbors. Customer-facing acceptance includes the rendered journey and real target-device behavior; unit tests and an HTTP health response alone are insufficient. A real physical failure outranks a contradictory passing test; find the cause and add appropriate coverage.
12. **Append-only migrations and recoverable history.** Do not edit an applied migration. Inspect the remote ledger before applying expected migrations, state compatibility and recovery, then verify the ledger. Code rollback and data recovery are separate. Irreversible data changes require explicit owner authorization and a tested forward-recovery plan.
13. **Instrument material behavior without excess data.** Record versions, operation IDs, currentness, latency, usage/cost, outcomes, and characteristic failures sufficient to diagnose a customer problem. Protect raw media and sensitive context; do not log hidden reasoning or secrets. Telemetry cannot itself become product authority.
14. **AI behavior is versioned and tested code.** Pin or record model, prompt/behavior, context, schema, tool, and material parameter versions. Stage and evaluate changes before customer rollout. A model may propose a meal and guidance, but cannot claim a timer was started, an ingredient was verified, a step was completed, or a durable mutation succeeded until the authoritative operation confirms it. Learned preferences are editable and cannot silently override current explicit input.
15. **Keep the product simple.** Use the strongest capable foundation model while testing quality and economics. Do not build a recipe engine, ontology, vector layer, profile microservice, multiple chef agents, or orchestration state machine merely because it can be built. Add machinery only for demonstrated product need or an authority, safety, privacy, or integrity boundary.
16. **Staging first; production by explicit authorization.** A GitHub push changes source history; it is not a Cloudflare deployment. CI verifies and never deploys. Material runtime changes go to isolated Snap n Dish staging first, with risky external effects off, known code rollback and data recovery, rendered journey checks, and post-deploy verification. Every production deployment requires explicit owner authorization for that deployment, even after CI and staging pass. Do not copy Snap n Done resource IDs, routes, secrets, or gates.
17. **Stay in the product boundary.** Do not mutate Snap n Done, Procure, Walter, Clink Pass, or shared accounts/resources without a separately authorized task. Their marketplace policies have no Snap n Dish authority. Stage 1B and production build remain outside current authorization.

## Required work record

Before a material change, record: what exists; its current authority; the exact extension; the regression surface; proof plan; expected staging behavior; and code/data rollback. If an authority or consequential policy is unresolved, obtain the owner's decision instead of inventing one.

At completion report: files and behavior versions changed; what was **VERIFIED**, **INFERRED**, and **NOT VERIFIED**; regression evidence; canonical document updates; deployed environment and operational gates; and rollback/recovery. Never use “done” to imply an unobserved release.

## Release order

1. Read governance and inspect current implementation/deployment evidence.
2. Make the smallest authorized change and run local checks.
3. For AI changes, run fixed and held-out culinary comparisons with human review before promotion.
4. Inspect migration ledger and compatibility if schema changes.
5. Push reviewed source to GitHub; treat this separately from deployment.
6. Deploy material runtime changes to Snap n Dish staging under its own configuration and verify real journeys, logs, versions, and rollback.
7. Obtain explicit owner authorization for production deployment.
8. Deploy the exact reviewed artifact, verify production health **and** critical customer journeys, and record rollback status.

Current Stage 1A is a private local evaluation with no Cloudflare resources or production release. Its results must be observed and reviewed before the stage can be diagnosed.
