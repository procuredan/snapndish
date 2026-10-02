# Stage 1B Cooking Quality V5 work record

**Authorization:** 2026-10-02 owner approval of Astra Ultra's Section 2. **Scope:** local comparison, CI and isolated Stage 1B staging only. No production or Stage 1A change.

## Existing authority and narrow extension

Source baseline `d16ab8ffa8947c00e5839d13e9f9c5ec2003c228` runs retail Shopping V4 on the isolated Stage 1B Worker. One primary streamed culinary response proposes a complete meal, consolidated Shopping, retail estimates and a free-form `full_plan`. The Worker validates and conditionally accepts the package against current session/meal revisions; D1 owns accepted state. The browser renders the accepted strings directly. Text and Realtime voice share package semantics and accepted state. The last recorded V4 staging Worker is `61f1eee7-87ee-49e0-b183-71ac7d7e7b6f`; verify the actual active and rollback-eligible version immediately before deployment.

V5 replaces accumulated cooking-writing instructions with a coherent cooking-decision contract. It preserves the discovery instruction text, all V4 retail Shopping wording and fields, the accepted schema, validator, renderer, model/effort/output cap, Realtime settings and bridge. The V5 tool clone changes only the `full_plan` description. A narrowly bounded diagnostic records `INCOMPLETE_MAX_OUTPUT_TOKENS` in the existing model-call error code when the provider explicitly reports that reason; it does not log provider body or change the customer response path. V1–V4 remain callable. No D1 migration or new synchronous model call is planned.

## Regression surface and proof

Potential regressions include discovery length, mistaken commitment, missing meal components, food-safety omissions, retail arithmetic, repeated quantities, unnecessarily generic equipment choices, stale proposals, altered Shopping checks, voice tool serialization, and excessive generation latency/cost. The fixed and held-out synthetic comparison covers small, simple, multi-component, frozen, large-group, selected/owned equipment, serious-allergy and meal-revision cases; discovery, rejection, direct-question and recovery controls remain. The minimally instructed foundation receives identical facts in input and produces a complete cooking plan, while V4/V5 still must satisfy the same retail package contract. The owner comparison is anonymous; the real unscripted staging meal is the primary quality gate. Raw outputs and option mapping remain private in ignored `runs/`.

Run the full local suite, actual browser tests where the environment permits, model comparison, GitHub CI and a staging bundle dry run. Before deploy, verify Worker/bindings/Access/D1 ledger and a Time Travel recovery point. After deploy, verify the rendered discovery → commitment → accepted Shopping/full plan → checkbox/revision → reload journey, telemetry, current behavior, and real Talk It with accepted context. Report any physical-microphone evidence separately from mocked/local voice tests. Measure full and rendered package latency, usage/cost and incomplete reasons; label first streamed text a proxy. If the 4,096 output-token ceiling is genuinely exhausted, stop advancement and report the evidence.

## Recovery

The prior active V4 Stage 1B Worker is the immediate code rollback once reverified. Roll back only `snapndish-stage1b-staging` to that version and verify `/health` and a rendered V4 journey. This prompt/tool-description change has no migration; do not restore D1 for code rollback without separate evidence. Use the known closed Stage 1B version for access/privacy containment. Preserve the D1 recovery point and private test evidence. `app.snapndish.com`, Stage 1A and production resources stay unchanged.

## Results

Pending controlled comparison, CI and staging verification. Do not treat green unit tests alone as culinary quality or deployment proof.
