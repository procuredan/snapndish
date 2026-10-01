# Stage 1B cooking voice v3 work record

**Authorized:** 2026-10-01 owner cooking-voice refinement. **Target:** isolated Stage 1B staging only. No Stage 1A or production change.

## Existing authority and change

The current `stage1b-meal-package-v2` uses one streamed `gpt-6-astra` culinary response to propose a complete measured package. The Worker validates and accepts meal, Shopping and `full_plan` as versioned D1 state; the browser renders the accepted sections. Realtime Talk It uses the same accepted state and its existing voice bridge. The owner reports a successful microphone test of the Realtime `strict` correction. The current prompt permits a separate chef's coordination note and some plans read like recipe records.

Add a versioned cooking-plan writing instruction to that same culinary call. Preserve the v2 prompt for rollback and comparison. Keep schema, tool definitions, model, voice, bridge, accepted-state rules, UI, and Shopping unchanged. Place concise, useful culinary judgment inside the relevant section; keep quantities and safety cues at point of use, every component, and final assembly. Do not require a generic note or closing paragraph.

## Regression surface and proof

Risks: lost ingredients or assembly, more words without value, missing quantities, fake personality, discovery drift, equipment-question drift, changed direct recovery, and voice reading a full plan. Compare v2/v3 on fixed and held-out Asian/stir-fry, pasta, grill/flat-top, sauce-driven, multi-component bowl, and brunch cases, plus discovery, rejection and recovery controls. Inspect full packages manually against the owner's criteria; record latency, tokens, estimated cost, and failures. Run focused and full local tests, browser regressions, CI, then verify a rendered staging plan and metadata. Owner culinary judgment remains the acceptance gate.

## Release and recovery

Before staging deployment, recheck the active isolated Worker version, D1 bookmark and migration ledger, bindings, Cloudflare Access, and exact CI commit. No migration or data rewrite is planned. Roll back only `snapndish-stage1b-staging` to the recorded pre-change Worker if behavior regresses. D1 recovery is separate and should not be invoked for a prompt-only rollback. Production remains on its existing Worker.

## Pre-release evidence

The original v2 instructions remain byte-for-byte identical for fresh, accepted-meal and cooking-active contexts. The V3 change adds only plan-writing guidance; the package schema and Responses/Realtime tool schemas are unchanged. The owner reports a successful real microphone test of the prior Realtime correction; staging metadata confirms a V2 session with three accepted user voice items, three accepted Snap replies, 353 ms connection time and no session error. This is evidence for preserving the voice path, not a new V3 cooking-quality judgment.

The first private live comparison is `runs/cooking-content-2026-10-01T22-04-49-939Z.private.json`. It showed a general remaining problem: valid V3 plans still packed several actions into dense paragraphs. One general visual-writing clarification was made before the final candidate; no recipe-specific rule was added. The final V3 cases are preserved in `runs/cooking-content-2026-10-01T22-07-44-623Z.private.json`, `runs/cooking-content-2026-10-01T22-08-16-477Z.private.json`, and `runs/cooking-content-2026-10-01T22-09-14-807Z.private.json`. These ignored files contain synthetic prompts and model outputs and are not pushed to GitHub.

Across six matched package cases (flat-top pork, shrimp pasta, Asian chicken bowls, chicken lettuce cups, brunch tacos, grilled salmon with sauce), both V2 and final V3 generated 6/6 valid packages without provider errors. Manual inspection found point-of-use measurements, concrete doneness/texture cues, Shopping coverage for defining components, and final assembly in all six final V3 plans. The final V3 plans placed timing and culinary reasons inside relevant steps and used compact measured lists where helpful; no generic chef/coordination section appeared. Discovery still offered distinct meal directions, rejection reopened the choices, and direct sauce trouble/missing-ingredient controls received direct help without a package proposal. These are synthetic evaluations; the owner's experience of whether the voice feels natural remains unverified until staging review.

Median V2 vs final V3 across those six package cases: plan length **1,920.5 vs 2,046.5 characters**, first streamed text **10.63 vs 10.48 seconds**, full response **28.47 vs 29.24 seconds**, output tokens **1,347 vs 1,376.5**, estimated cost **$0.0826 vs $0.0862**. The estimate uses the repository's dated price card, not billing. First text is a transport metric, not measured decision-useful rendered content.

Pre-deploy Cloudflare inspection: the intended account is `fdacd02cd3e76e9131dcd8582057d230`; active isolated Worker is `7dc97ee8-5af1-4935-87f1-5d0694e849dc`; D1 binding is `snapndish-stage1b-staging`, R2 binding is `snapndish-stage1b-staging-images`, and the staging route has no `app.snapndish.com` mapping. The D1 ledger contains expected migrations `0001`–`0010` only. Time Travel bookmark: `000000ac-00000000-000050f7-0cb81208b84edd872159c8446e9e1c82`. Required staging secret **names** are configured; values were not inspected or copied. An unauthenticated staging request redirected to Cloudflare Access. The pre-change functional Worker remains the intended immediate rollback. No migration is introduced.
