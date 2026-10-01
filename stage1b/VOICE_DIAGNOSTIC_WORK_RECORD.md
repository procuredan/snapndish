# Stage 1B Realtime initialization diagnosis

## Pre-change record — 2026-10-01

- **Existing authority:** The Stage 1B Worker creates the Realtime WebRTC call and D1 owns the session/revision. Meal Package V2, its two application tools and shared transcript are already versioned. The failed production candidate at source `3fd4aa9acae2afba943c406174610ecca2dca05c` returned upstream HTTP 400; its code discarded the response body. Production was restored to Worker `8b68fce3-7845-412e-9c1a-80e78293d17b`. Isolated staging remains separate.
- **Extension:** On an upstream Realtime initialization failure only, persist a bounded `voice_init_failed` event in the existing protected state-event timeline. Record HTTP status, allowlisted error type/code/field, reconstructed safe message, validated request ID, configuration identities, field presence and static tool schema fingerprints. Do not persist raw response text, SDP, audio, transcript, meal, instructions, headers or credentials. Keep the customer-facing failure bounded.
- **Regression surface:** Voice connection, session cleanup and retry, protected review, confidential telemetry, and unchanged text/Shopping/cooking behavior. No culinary prompt, tool definition, model, voice, route, secret, schema or production resource change is authorized.
- **Proof plan:** Focused malformed/hostile provider-response tests, complete local suite and CI, exact staging target/binding and rollback verification, isolated staging deployment, rendered text/Shopping/plan regression, then fresh and accepted-meal real microphone starts with protected diagnostic review. Compare the two outcomes with the failed production evidence without copying private conversation content into source or reports.
- **Expected staging behavior:** Successful voice starts remain identical. Failed upstream starts return a bounded Talk It error and save only the sanitized diagnostic event. The site remains Cloudflare Access protected.
- **Rollback:** Record the current functional Stage 1B Worker version before deployment; `wrangler rollback VERSION_ID --config wrangler.stage1b.staging.jsonc --name snapndish-stage1b-staging --message 'Restore Stage 1B before Realtime diagnosis' --yes` restores code. No D1 migration is made. Production remains on Worker `8b68fce3-7845-412e-9c1a-80e78293d17b` and is outside this deployment.

## Observations

Pending local, CI and real staging verification. Keep exact customer conversations and provider responses in protected telemetry, not this file.
