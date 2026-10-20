# Stage 1B Talk It reliability — SNDISH-027

## Pre-change record — 2026-10-20

- **Existing system and authority:** Source `8ac984849394794e972eca4f5f4df609972658e8`; isolated staging Worker `fb3cdc64-b5ea-44a9-86a0-2696d1a619f3`. The Realtime client in `live-lab/ui.mjs` observes provider events and sends nonempty user transcripts and completed assistant responses to the Worker. The Worker conditionally commits turns, meal packages and cooking state to Stage 1B D1. The client currently ends Talk It on any empty completed input transcription. Completed responses are paired with accepted user items by queue order. The October 20 owner catfish session and raw D1 evidence are preserved in ignored private `runs/voice-interruption-2026-10-20/`.
- **Requested extension:** Phase A records a bounded content-free lifecycle timeline for Realtime event order, response status/cancellation, connection state, transcription outcome and shutdown reason without changing voice behavior. Phase B may make empty transcriptions nonterminal only after real microphone evidence establishes safe turn association.
- **Regression surface:** User/assistant pairing, natural interruption, cancelled response handling, late/duplicate events, proposal-before-speech tool continuation, currentness, accepted meal/Shopping/recipe history, browser reload, diagnostic privacy and failure isolation. Preserve V5.1 culinary configuration, Retail Shopping, migration 0011, dashboard persistence and the acceptance-result correction.
- **Proof plan:** Focused endpoint/privacy and browser lifecycle tests using the preserved catfish sequence and edge cases; full local suite and browser tests; exact-source GitHub CI; active Stage 1B Worker, binding, Access, migration-ledger and D1 recovery checks; diagnostic-only staging deployment and a real microphone control run; evidence review before any Phase B change; repeat automated and physical staging acceptance after Phase B.
- **Expected Phase A behavior:** Talk It operates as before while a protected state event records a bounded diagnostic timeline at session stop. Invalid or failed diagnostics do not interrupt or modify conversation/meal authority.
- **Code and data recovery:** Keep Worker `fb3cdc64-b5ea-44a9-86a0-2696d1a619f3` as immediate code rollback. No migration is proposed. Do not restore D1 for routine code rollback; preserve the current D1 recovery point separately before any deployment.

## Phase A findings and release

**Local implementation:** The existing `/voice/stop` operation accepts a bounded, allowlisted lifecycle summary and writes one protected `voice_lifecycle` state event after normal session closure. The browser records only event kind/order, elapsed milliseconds, opaque provider item/response IDs, bounded response and connection statuses, transcription outcome, and stop reason. It keeps the first eight and latest 56 events when a session exceeds 64, recording how many were dropped. Arbitrary provider fields and transcript/audio content are never copied. Invalid or failed diagnostic writes do not change the stop result. No migration or Realtime configuration change is involved.

**Local verification:** `SNAP_BROWSER_TEST=1 npm test` passed 75/75 tests, including the new Chrome catfish lifecycle replay and D1-compatible endpoint/privacy test. The replay preserves the known empty-transcription shutdown behavior in Phase A and records the cancellation/empty-event order without speech content. Exact-source CI, staging preflight, diagnostic deployment, and physical microphone evidence remain pending.

## Phase B evidence and release

Pending diagnostic microphone review.
