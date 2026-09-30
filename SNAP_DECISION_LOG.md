# Snap n Dish — append-only decision log

**Installed:** 2026-09-28. **Status:** Canonical Snap n Dish product and architecture decisions.
**Governance:** [SNAP_GLOBAL_RULES.md](SNAP_GLOBAL_RULES.md). **Current implementation:** [SNAP_ARCHITECTURE.md](SNAP_ARCHITECTURE.md).

## Rules for this log

Each decision is recorded once with a stable `SNDISH` ID. Never edit accepted history to make a later view look original. Append a new decision that names the superseded ID and the owner's reason. Code, tests, a prototype result, and a plan are evidence, not substitutes for a decision. Do not import Snap n Done decision IDs or its legacy ledger; they govern a different product. A human operational owner is **NOT VERIFIED** until assigned.

The entries below record explicit Snap n Dish owner direction in the product reference, Engineering GO, and the 2026-09-28 instructions. They do not claim that the future capabilities are implemented.

### SNDISH-001 — Canonical governance hierarchy

- **Date / owner:** 2026-09-28; Snap n Dish product owner, via the governance-conversion instruction.
- **Decision:** `SNAP_GLOBAL_RULES.md` is binding governance; `SNAP_ARCHITECTURE.md` records current verified architecture and gaps; this log is append-only decision history; `AGENTS.md` gives subordinate execution instructions. Plans and reports are evidence.
- **Reason:** One authority per decision and no contradictory documents.
- **Excluded alternative:** Copying Snap n Done governance wholesale or allowing plans to override these documents.
- **Depends / reconsider:** All future work; reconsider only with explicit owner approval of a new hierarchy.
- **Supersedes:** None.

### SNDISH-002 — Culinary breadth and the foundation model

- **Date / owner:** 2026-09-28; product owner, from the product reference, Engineering GO, and this instruction.
- **Decision:** The culinary brain is the product. Preserve a strong foundation model's broad, creative, curious, adaptive culinary universe. **CULINARY BREADTH IS AN INVARIANT.** Compare material behavior changes to a minimally instructed foundation reference and evaluate breadth, curiosity, adaptation, conversation and practical cooking quality before promotion.
- **Reason:** A narrowed recipe engine would fail the product's core premise.
- **Excluded alternative:** Finite recipe database, restrictive taxonomy, mandatory complete schema on every discovery turn, or cost-only model downgrade.
- **Depends / reconsider:** AI adapter, prompts, context, retrieval, schemas, model selection, evaluation and release; reconsider only through owner-reviewed evidence and an explicit superseding decision.
- **Supersedes:** None.

### SNDISH-003 — One Snap across photo, text, and realtime speech

- **Date / owner:** 2026-09-28; product owner, from the product reference and Engineering GO.
- **Decision:** Snap It, Write It, and Talk It converge on one identity, ordered conversation, editable customer context, active meal and cooking state. Talk It is genuine realtime spoken conversation with spoken replies and a visible transcript. Snap It supports visual food discovery and adaptation, with uncertainty expressed honestly.
- **Reason:** A customer must be able to switch modality without losing the same Snap or the meal.
- **Excluded alternative:** Separate voice bot, transcription-only Talk It, photo-as-recipe-lookup, or modality-specific memory authority.
- **Depends / reconsider:** Future client/API, media, voice, transcript and state contracts; only explicit owner change or target-device evidence supporting an equivalent single-state design.
- **Supersedes:** None.

### SNDISH-004 — Customer authority and dynamic cooking state

- **Date / owner:** 2026-09-28; product owner, from the Engineering GO and product reference.
- **Decision:** The application owns authoritative truth. Keep meal version, actual cooking progress, and schedule forecast distinct. Explicit corrections and accepted changes version state; late work cannot overwrite them. Snap owns the plan and recalculates calmly when timing, equipment, ingredients, or cooking outcomes change; the customer owns the moment and reports what actually happened.
- **Reason:** “There is no such thing as behind” requires an honest revised plan rather than an obsolete schedule or invented completed action.
- **Excluded alternative:** Model prose, browser-local state, or timer expiry as proof of durable customer action or food doneness.
- **Depends / reconsider:** Future backend persistence, orchestration, timers, cross-device and retries; reconsider only with an equally authoritative, version-safe replacement approved by owner.
- **Supersedes:** None.

### SNDISH-005 — Progressive context and Procure parent-profile boundary

- **Date / owner:** 2026-09-28; product owner, from the product reference and Engineering GO.
- **Decision:** Snap gradually learns editable equipment, tastes, cooking habits, household facts and relevant beverage preferences. Stage 1 uses lightweight Snap n Dish context; full Procure parent-profile integration is deferred. Current explicit input overrides memory, and occasion-specific guest constraints do not automatically become permanent profile facts.
- **Reason:** Personalization should improve suggestions over time without an initial questionnaire or narrowing the culinary universe.
- **Excluded alternative:** Full parent-profile service in Stage 1A, uneditable inferred facts, or treating every guest preference as permanent.
- **Depends / reconsider:** Stage 1A context comparison and later profile consent, provenance, retention and sync design; reconsider after evaluated personalization evidence and owner decision.
- **Supersedes:** None.

### SNDISH-006 — Product at SnapNDish.com

- **Date / owner:** 2026-09-28; product owner, from the product reference and explicit non-negotiable.
- **Decision:** SnapNDish.com is the interactive product itself. Web, mobile and eventual native clients must use the same backend-owned account, conversation, memory, meal and cooking state; planning on one device must continue on another.
- **Reason:** The kitchen experience spans phone, laptop and tablet.
- **Excluded alternative:** A marketing-only apex site, a browser-only source of product truth, or separate device state.
- **Depends / reconsider:** Future origin, client, authentication and state API design; reconsider only by explicit owner decision.
- **Supersedes:** None.

### SNDISH-007 — Stage 1A proof gate and pause

- **Date / owner:** 2026-09-28; product owner, from the Engineering GO and subsequent Stage 1A/governance instructions.
- **Decision:** Stage 1A runs A (strong minimally instructed foundation reference), B (Snap behavior), and C (Snap plus explicit context) on demanding multi-turn cases, capturing exact versions, outputs, latency, usage/cost, errors and human evaluation. Diagnose the culinary premise before Stage 1B. The governance conversion does not resume Stage 1A; stop for PM review when the four governing documents are established.
- **Reason:** Discover a weak culinary brain before building an application around it, and give PM a clean governance review point.
- **Excluded alternative:** Starting with polished UI, commerce, full infrastructure, Stage 1B seams, or production build before this gate.
- **Depends / reconsider:** Current private prototype and evaluation; Stage 1A resumption and any Stage 1B work require further owner direction after this pause.
- **Supersedes:** The broad Engineering GO's conditional Stage 1B permission to the extent it could be read as automatic; later explicit instructions control the current sequence.

### SNDISH-008 — Separate source control, CI, staging and production actions

- **Date / owner:** 2026-09-28; product owner, via this governance-conversion instruction.
- **Decision:** GitHub push and Cloudflare deployment are separate actions. CI verifies but never deploys. Material runtime changes go to Snap n Dish staging first, with known rollback and post-deploy verification. Each production deployment requires explicit owner authorization.
- **Reason:** A verified commit is not proof of the deployed customer journey or authority to change production.
- **Excluded alternative:** Auto-deploy from CI, treating a GitHub push as a release, or copying Snap n Done's resource configuration.
- **Depends / reconsider:** CI, future staging/prod setup, release runbooks and operational gates; reconsider only by explicit owner decision with equivalent safety.
- **Supersedes:** None.

### SNDISH-009 — Product isolation and selective reuse

- **Date / owner:** 2026-09-28; product owner, via the product reference, Engineering GO and this instruction.
- **Decision:** Reuse transferable engineering patterns from Snap n Done only where they fit: backend APIs, private media handling, authority/version fences, usage accounting, sanitized observability, and release discipline. Give Snap n Dish its own configuration and decisions.
- **Reason:** Shared discipline reduces known failure modes without forcing a marketplace-shaped cooking product.
- **Excluded alternative:** Provider matching, routing/BID_READY, offers, job publishing/scoping, marketplace fees/tips/transfers/payments, provider qualification, supply classes, marketplace SMS, Walter dependencies, and Snap n Done-specific models, budgets, resources or secrets.
- **Depends / reconsider:** All architecture and release work; any cross-product integration needs separate explicit authorization.
- **Supersedes:** None.

### SNDISH-010 — Governance approved; Stage 1A resumes alone

- **Date / owner:** 2026-09-28; Snap n Dish product owner, via explicit approval and resumption instruction.
- **Decision:** The four Snap n Dish governing documents are canonical. Resume only the existing Stage 1A culinary comparison once the private `OPENAI_API_KEY` is configured. Run A/B/C live, capture outputs and measurements, then stop and report evidence and diagnosis to PM. Do not begin Stage 1B, production development, staging deployment, or production deployment without the next explicit authorization.
- **Reason:** Governance conversion was reviewed and approved; the culinary premise still requires measured live evidence.
- **Excluded alternative:** Treating governance approval, passing prototype tests, or the Engineering GO's conditional Stage 1B language as a completed Stage 1A gate or broader build authorization.
- **Depends / reconsider:** Stage 1A run and human review; reconsider after measured results and a new owner instruction.
- **Supersedes:** `SNDISH-007` only for its temporary governance-review pause. Its Stage 1A proof gate and Stage 1B restriction remain in force.

### SNDISH-011 — Private Stage 1A Live Lab

- **Date / owner:** 2026-09-29; Snap n Dish product owner, via explicit Live Lab authorization.
- **Decision:** Add a private, instrumented, streaming Stage 1A experience at `app.snapndish.com` using the existing Arm C behavior and context by default. Keep the controlled A/B/C corpus and results. Store distinguishable model/conversation/state telemetry with a defined retention period, provide chronological owner review, protect access, use Snap n Dish-specific staging and live resources, and verify the rendered journey after staging-first deployment. Report telemetry, privacy, security, rollback and verification before deploying.
- **Reason:** Owner testing should generate direct product-experience evidence without pretending the culinary gate or Stage 1B has passed.
- **Excluded alternative:** Public beta, Stage 1B, broader production app, voice/audio retention, Snap n Done resources, or automatic CI deployment.
- **Depends / reconsider:** Blind owner review and Live Lab evidence; later architecture and deployment require separate authorization. The proposed Live Lab retention is 30 days, subject to documented D1 Time Travel availability beyond application deletion.
- **Supersedes:** `SNDISH-010` only for its prior prohibition on Stage 1A staging/live deployment; its Stage 1B prohibition remains in force.

### SNDISH-012 — Direct Stage 1A chat entry with protected review

- **Date / owner:** 2026-09-29; Snap n Dish product owner, via explicit frictionless Live Lab instruction.
- **Decision:** `app.snapndish.com` opens directly into the Stage 1A chat without an access-code or sign-in step. Keep `/review` and review/telemetry APIs behind the existing owner code, and do not link to review from the consumer page. Give each anonymous browser access only to its own conversation through a signed session cookie. Preserve the Stage 1A model behavior, telemetry, retention, cost cap, evaluation corpus, and staging-first release discipline.
- **Reason:** Test the actual frictionless consumer entry while preserving private owner review and visitor conversation privacy.
- **Excluded alternative:** Public review data, a replacement account system, Stage 1B, or a broader production application.
- **Depends / reconsider:** Live testing and abuse/cost observation. Public model usage remains bounded by the existing daily and per-session limits; a future public product needs a separately approved abuse strategy.
- **Supersedes:** `SNDISH-011` only for its access-code requirement on the chat entry. Its review protection and Stage 1A scope remain in force.

### SNDISH-013 — Offline Stage 1A behavior v2 comparison

- **Date / owner:** 2026-09-29; Snap n Dish product owner, via explicit Stage 1A behavior-experiment authorization.
- **Decision:** Preserve Foundation A, `stage1a-snap-v1` and the deployed Live Lab. Add a separately versioned `stage1a-snap-v2` candidate guided by the next shared decision/action contract. Compare Foundation A, deployed C v1 and candidate C v2 anonymously on focused fixed and held-out cases, including empty-context discovery, selection, direct answers, recovery, rejection, context contrasts and real two-turn continuity. Report latency with the old first-useful heuristic labeled a proxy and gather decision-useful rendered evidence. Stop for PM review before any deployment.
- **Reason:** The first owner Live Lab failure suggests that v1 may treat an incomplete ingredient statement as a committed dish. A controlled experiment can test that cause without narrowing culinary breadth or changing the production surface.
- **Excluded alternative:** Stage 1B, v2 deployment, prompt rules tied to the pork example, fixed cuisine/recipe outputs, intent classifier, state machine, second model call, retrieval or fine-tuning.
- **Depends / reconsider:** Measured API run, blind owner judgment, regression diagnosis and separate release authorization. The two-turn pork example is a behavioral reference, not a lexical answer key.
- **Supersedes:** None.

### SNDISH-014 — Controlled Live Lab promotion of v2 with one-tap feedback

- **Date / owner:** 2026-09-29; Snap n Dish product owner, via explicit change of evaluation strategy and release authorization.
- **Decision:** Preserve the completed offline v2 comparison, blind artifacts, and mapping unchanged. Promote `stage1a-snap-v2` to the existing Stage 1A Live Lab after automated and focused behavioral regression checks and a staging-first rendered verification. Keep v1 code and the recorded v1 Worker version available for immediate rollback. Add unobtrusive Good / Missed It feedback on an accepted assistant turn, with a single tap recorded under that session and visible only to its visitor and protected owner review. Live owner use becomes the primary quality discovery; preserve any material failure as a regression case before correction. Offline evaluation remains a regression guardrail, not a recurring owner-scoring obligation.
- **Existing authority and extension:** The Worker owns accepted conversation revision, model-call telemetry, and append-only `state_events`. It will select the existing v2 prompt and version while keeping model, context, streaming, privacy, and state acceptance behavior. Feedback uses the existing state-event store and retention, with no schema migration or new identity system.
- **Regression surface / proof:** Discovery versus premature recipe, direct questions, recovery, allergy, selection, stale-result rejection, visitor isolation, protected review, response streaming, version/cost telemetry, and flag persistence. Run local automated tests, the focused behavior suite, staging rendered conversation and feedback/telemetry checks, then the same live checks.
- **Rollback / recovery:** Roll back the Worker to the verified prior v1 deployment version if behavior or security regresses; feedback events remain in D1 under the existing 30-day retention. No schema or destructive data change occurs. If the Worker must close, use the recorded closed version from the Live Lab runbook.
- **Supersedes:** `SNDISH-013` only for its requirement to wait for exhaustive owner blind scoring and its no-deployment pause. The offline evidence and Stage 1B prohibition remain in force.

### SNDISH-015 — Stage 1B capability proofs authorized

- **Date / owner:** 2026-09-29; Snap n Dish product owner, via explicit Stage 1B Engineering GO.
- **Decision:** Proceed with five incremental capability proofs: real spoken Talk It with visible transcript, real image input, durable/current conversation, phone-to-computer-to-phone continuation, and one closed-app return. All use the same v2 culinary core and application-owned state. Add only minimum identity and maintain diagnostic telemetry and Good / Missed It. Preserve the Stage 1A Live Lab and culinary comparisons.
- **Reason:** Stage 1A supplied enough evidence to test whether the culinary relationship survives modalities, persistence and return over time. The architectural rule is “Sophisticated around the brain. Simple through the brain.”
- **Excluded alternative:** Intent classifier, rigid conversational state machine, recipe retrieval, cuisine taxonomy, chef agents, mandatory discovery schema, vector memory or extra synchronous AI calls without demonstrated need and PM authorization. Grocery fulfillment, full commercial memory, advanced orchestration, native apps, exact pantry inventory, Procure profile integration and commercial alpha remain out of scope.
- **Depends / reconsider:** Follow staging-first release gates, evaluate culinary quality and reliability after each capability, and stop for PM review when all five proofs are complete. This decision authorizes engineering and staging proof work; each production deployment still requires explicit owner authorization under `SNDISH-008` and the global rules.
- **Supersedes:** The Stage 1B prohibition in `SNDISH-007`, `SNDISH-010` through `SNDISH-014`, and stale current-scope text in subordinate documents. The Stage 1A evidence and Live Lab release record remain intact.

### SNDISH-016 — Stage 1B next flow on isolated staging

- **Date / owner:** 2026-09-30; Snap n Dish product owner, via the Next Flow Build instruction.
- **Decision:** Test a continuous occasion → culinary discovery → conversational selection → materially useful curiosity → complete meal and interactive consolidated shopping list on the isolated Stage 1B staging Worker. Discovery stays concise and broad; selection needs no second button; the model proposes a complete plan only when ready. Checked shopping items mean held ingredients, with assumed staples visibly marked and editable. Talk It uses the same culinary guidance and server-owned plan/list; it must not read the list aloud. Occasion guest count and constraints do not silently become durable profile facts. Preserve Stage 1A and v2 for rollback, and return rendered evidence to PM before any promotion.
- **Reason:** Owner multi-turn voice testing established technical feasibility but showed excessive early execution detail and a missing transition from choice to useful shopping state.
- **Excluded alternative:** Intent classifier, rigid conversation state machine, mandatory discovery schema, recipe catalog, second culinary model, commercial memory, grocery checkout, full orchestration, or production rollout.
- **Depends / reconsider:** Fixed and held-out culinary comparisons, local regression tests, additive Stage 1B D1 migration, isolated staging rendered text and voice journey, exact rollback, PM review. Production still requires separate explicit authorization.
- **Supersedes:** `SNDISH-015` only where its earlier narrow Stage 1B scope excluded this explicitly approved shopping-flow proof. All five original capability proofs and their evidence remain in force.

### SNDISH-017 — Cooking Mode choreography on isolated Stage 1B staging

- **Date / owner:** 2026-09-30; Snap n Dish product owner, via the Cooking Mode Choreography instruction.
- **Decision:** Extend the existing Stage 1B next-flow experiment through cooking on its isolated staging Worker. After shopping is complete, Snap gives one coherent current action, waits for customer reports, and proposes the next action through the same culinary model and conversation. The application conditionally accepts a versioned current action, customer-reported progress, and explicitly reported equipment facts; neither model instructions nor elapsed time prove completion. Keep the full meal and remaining components available under More. Talk It and Write It share the accepted state. Preserve Stage 1A and the prior Stage 1B behavior version for rollback.
- **Reason:** Owner testing found that the complete meal plan became an oversized cooking response. The approved choreography keeps execution simple for the customer while retaining the complete meal internally.
- **Excluded alternative:** A rigid cooking wizard, recipe engine, deterministic culinary task graph, second model/router, commercial memory, schedule forecasting, grocery commerce, or rollout to `app.snapndish.com`.
- **Depends / reconsider:** Fixed and held-out live culinary probes, local regression and CI, additive Stage 1B migration, a known Worker and D1 recovery point, staging rendered conversation and voice evidence, owner review before any broader promotion. A strict example sequence is a product behavior target, not a recipe answer key.
- **Supersedes:** `SNDISH-015` only where its earlier narrow Stage 1B scope excluded this explicitly approved cooking choreography experiment. Other Stage 1B proof and production boundaries remain.

## Open decisions — no authority may be invented

1. Stage 1A quality result and owner benchmark/human review; the current prototype tests are not that decision.
2. Production identity and exact Procure parent-profile consent, access, provenance, correction and deletion boundaries.
3. Retention/deletion periods and executor for images, speech/transcripts, conversation, customer facts, logs and vendor copies.
4. General product staging/prod resources, release artifact and rollback/restore procedure beyond this isolated Stage 1A Lab.
5. Realtime voice, image, and notification providers and limits after the appropriate prototype gate.
6. Owner-approved culinary quality, latency and full-session cost thresholds.
