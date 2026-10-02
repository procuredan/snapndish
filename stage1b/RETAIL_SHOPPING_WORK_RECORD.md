# Stage 1B retail-aware Shopping work record

**Authorized:** 2026-10-01 owner brief. **Target:** isolated Stage 1B staging only. Do not alter `app.snapndish.com` or Stage 1A resources.

## Existing system and authority

`stage1b-meal-package-v3` uses one streamed culinary response to propose a complete meal, consolidated Shopping sections and the complete cooking plan. The Worker validates and conditionally accepts one versioned JSON package in D1. Shopping checkboxes are backend-authoritative and revision-fenced; checked means the customer has enough. The browser currently displays each model-proposed `quantity` string as its Shopping amount. Cooking directions have independent point-of-use amounts. The same accepted package is available to Write It and Talk It.

## Narrow extension

Version a Shopping-only proposal contract. The model first totals each ingredient for the selected meal and servings, then proposes a practical purchase display. Keep the consolidated culinary requirement and an arithmetic-ready normalized amount in accepted state, plus the retail recommendation and its total amount in the same normalized unit. The Worker derives the remaining purchase requirement from the checkbox state; the model does not assert possession. Retain the existing `quantity` field as the customer-facing Shopping display, the cooking plan unchanged, and the V3 tool/prompt for immediate rollback. No SKU catalog, retailer integration, extra AI call or D1 migration is planned.

## Regression surface and proof

Possible failures: arithmetic mistakes, underbuying, excessive package rounding, duplicate items across meal components, lost point-of-use cooking quantities, a changed discovery or cooking voice, stale purchase requirement after a checkbox or meal revision, invalid Realtime tool serialization, and a provider rejection of the expanded strict Responses schema. Test unit/count, liquid, weight and naturally shopped units; dinner for two, family meal, 20-person breakfast and party; duplicate ingredient consolidation; checked/unchecked and serving revision; malformed proposal rejection; Responses/Realtime tool compatibility. Run fixed and held-out live comparisons with V3, complete local/browser suites and GitHub CI before staging. Verify rendered Shopping and cooking amounts, persistence, telemetry and rollback on staging. Owner retail-quality judgment remains a separate gate.

## Release and recovery

Before staging deployment, verify current active Worker, bindings, Access, D1 ledger and Time Travel bookmark. The pre-change functional Worker is expected to be `5178a2ac-c7ca-40a5-9ac0-156dbfee7fa9`; recheck before deployment. Roll back only `snapndish-stage1b-staging` to that version if the behavior fails. This changes JSON fields only, so code rollback should not require D1 restore; preserve evidence and treat data recovery separately if an unexpected data issue occurs. Production remains on its existing Stage 1A Worker.

## Pre-release evidence

The V4 instruction begins with the exact V3 discovery and cooking-plan instruction string, then adds only retail Shopping guidance. The Responses tool remains strict, while the existing Realtime serializer omits its unsupported top-level `strict`; model, voice, transcription, turn detection, tool names and bridge ordering are unchanged. The proposal includes `required_quantity`, an arithmetic-ready `normalized_quantity`, practical `quantity` display and `retail_total` in the same normalized unit. The Worker derives `purchase_requirement` from the checkbox and rederives it after edits/revisions. A narrow generic unit check corrects a clear conversion error without changing culinary directions or requiring another model call; it validates parseable package totals and rejects underbuying or duplicate exact ingredient names. Unknown food-density conversions remain a model judgment, not a hidden ingredient catalog.

Private synthetic model evidence is in ignored `runs/retail-shopping-2026-10-02T00-10-36-113Z.private.json`, `runs/retail-shopping-2026-10-02T00-17-35-776Z.private.json` and `runs/retail-shopping-2026-10-02T00-18-22-359Z.private.json`. Five matched package cases covered dinner for two, family for five, business breakfast for 20, taco party for 24, and a held-out 20-person brunch sharing yogurt across two components. V3 and V4 each yielded 5/5 valid packages; V4 had no duplicate exact ingredient rows and no accepted retail total below the normalized requirement. The 10-cup shared-yogurt case produced one item with a practical 3 × 32-oz-tub recommendation. Count, weight, liquid, dairy, eggs, meat and natural bunch/head/package forms appeared across the cases. Discovery and direct sauce recovery stayed direct and similar to V3; the foundation reference was also sampled for these controls.

One family case exposed a real model arithmetic mistake: 3 tbsp olive oil was normalized as 3 fl oz. The generic unit check now derives 1.5 fl oz from that unambiguous required amount, and rejects the proposal if the suggested purchase would then be short. Revalidation of all five saved V4 proposals passed with this check. This does not validate every conversion or a store's actual package availability; the latter remains explicitly estimated.

Median across five matched packages, V3 → V4: first streamed text 15.35 → 17.34 seconds; full completion 38.84 → 52.45 seconds; output tokens 1,695 → 2,602; estimated cost $0.1024 → $0.1510. The added ingredient facts cause a material latency/cost increase, especially for large meals. These are synthetic-model measurements at `gpt-6-astra` with medium reasoning and the repository's dated price card, not observed rendered decision-useful time or billing. Preserve the evidence for the owner to weigh quality against the extra cost; do not optimize culinary behavior within this Shopping-only release.

The final default local suite passed 54 tests with two opt-in browser skips and no failures. The final opt-in real Chrome suite passed all 56 tests with no skips or failures. The sandboxed Chrome attempt returned empty DOM output, a test-environment limitation rather than an application failure. Run CI on the exact final source before staging deployment.

The current Stage 1B checkbox represents enough on hand versus buy; it does not track a partial pantry quantity. Thus an unchecked item retains the full normalized requirement as its remaining purchase need. No exact pantry inventory or retailer SKU stock is inferred.
