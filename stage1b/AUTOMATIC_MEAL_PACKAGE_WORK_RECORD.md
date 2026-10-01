# Stage 1B automatic meal package work record

**Authorized:** 2026-10-01, owner approval of Astra Ultra's Stage 1B Engineering GO. **Target:** isolated `snapndish-stage1b-staging` only. No Stage 1A or `app.snapndish.com` mutation.

## Before the change

The reviewed source is `codex/stage1b-bridge-repair` at `219ef23`. A clean checkout was made because the older local `codex/stage1b-proof` tree has uncommitted work; that tree remains untouched. The existing Worker owns conversation and revision fences, meal and shopping acceptance, cooking progress, voice tool-result ordering, and bounded recovery. Its meal tool proposes Shopping; the complete plan is generated later through the cooking tool. The UI hides the full plan under More. The Stage 1B D1 schema has migrations through `0010_bridge_currentness_metrics.sql`.

## Authorized extension and risks

Extend the existing meal tool to propose one complete package after commitment, including a concise coordinated plan. Persist it in accepted meal state and show Shopping first with the plan visible beneath it. Keep optional Now emphasis and direct cooking. Reconcile shopping identities and customer edits across meal revisions; preserve customer-reported physical progress. Use the existing text and voice acceptance boundaries and the same culinary model.

Regression surfaces: culinary discovery breadth, commitment recognition, list/plan coherence, token and latency cost, incorrect success speech, stale results, concurrent shopping edits, progress loss, voice synchronization, recovery after interruption, and Stage 1A isolation. Existing tests and fixed/held-out culinary cases cover these boundaries; rendered owner judgment remains a separate gate.

## Proof and recovery plan

Run local tests, fixed and held-out culinary probes, syntax and bundle checks, then verification-only GitHub CI. Inspect the Stage 1B remote migration ledger and D1 recovery point, current functional Worker version, bindings, Access protection, and Stage 1A health before deployment. Deploy only the isolated Stage 1B Worker and verify the rendered text journey, reload, shopping edit, plan revision, protected review, telemetry and accessible Now/Full Plan. A real microphone run and a physical phone round trip require owner participation and must be reported as unverified until observed. Keep the pre-change functional Worker version as immediate code rollback and the recorded closed Worker as containment; D1 recovery is separate. Do not destroy private owner evidence.

## Local proof, 2026-10-01

- `npm test`: 40 passed, 2 opt-in browser tests skipped in the ordinary run. Focused tests cover atomic package acceptance, missing plan rejection, Shopping edit preservation and changed quantity, physical-report retention, voice proposal-before-speech, visitor isolation, stale-result rejection and interrupted-request replay.
- `SNAP_BROWSER_TEST=1 node --experimental-strip-types --test tests/browser-bridge.test.mjs`: both real Chrome DOM regressions passed outside the shell sandbox. The new test confirms Shopping and the full recipe are visible at acceptance without Now, and Now focus leaves the recipe available.
- `wrangler deploy --dry-run --outdir /private/tmp/snapndish-package-bundle --config wrangler.stage1b.staging.jsonc`: bundled 239.45 KiB, isolated Worker/D1/R2 names and `stage1b-meal-package-v1` binding verified. No migration was added.
- Private synthetic live probes are under ignored `runs/meal-package-*.private.json`. Candidate initial chicken and frozen-shrimp thoughts remained discovery, and a direct cooking question was answered without proposing a meal. Rejection reopened different directions. A two-person hambāgu selection produced five concise sections and 20 Shopping items; a brunch selection produced five sections and 15 items. Both structurally valid packages used 1,062–1,302 output tokens, estimated $0.065–$0.077 each, completed in 28.5–34.7 seconds, and first streamed text appeared in 8.6–12.6 seconds. These are provider timings, not observed browser paint. The first prompt version asked an unnecessary allergy question for a household dinner and produced dense text; the revised prompt removed the routine question and shortened the plan. This is synthetic quality evidence, not owner acceptance.
- The existing Foundation A and V2 controls were rerun on selected fixed and held-out cases. Both remain text-only comparison references; their lack of a package is by design, not a failure score. They establish that candidate discovery still offers varied directions and materially changes the application handoff only after commitment.
- Cloudflare's saved Wrangler authorization expired while preparing remote release checks. The first fresh OAuth attempt timed out before owner approval; no staging deployment or remote resource mutation occurred. Resume the existing authorized staging gate with a fresh consent window when the owner is ready.
