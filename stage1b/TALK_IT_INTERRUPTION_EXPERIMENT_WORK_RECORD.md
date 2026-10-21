# Talk It controlled interruption experiment

## Existing system and authority

Baseline source: `edbb457e44cf586d180aa5a52042bed85b002568`. Separate branch: `codex/talk-it-interruption-contract`. Active isolated staging Worker verified before changes: `3a8120b9-2cd3-485b-893d-e97084f15ad9` at 100% traffic with that source annotation. Worker/D1 conditional writes own accepted conversation, meal, Shopping and cooking state. The browser owns bounded input/response association and provider-acknowledged tool continuation; generated content is not application authority.

The preserved October 21 owner test showed playback clearing 1 ms after provider speech detection, cancellation with `turn_detected`, then empty transcription. The session stayed operational and ended manually. Private original evidence is in ignored `runs/`; no owner content belongs in GitHub.

## Phase 1 extension and regression surface

New session URL: `https://snapndish-stage1b-staging.dan-fda.workers.dev/?talkInterruption=observe`. The client passes the selection only when starting a new voice session. A staging-only server flag gates it and rejects unsupported modes. The provider receives unchanged semantic VAD and `create_response:false`, with `interrupt_response:false` only for observation. The server returns the effective selection and records it in `voice_connected`. Ordinary URLs use the existing automatic-interruption control.

Bounded diagnostics record the first empty and first nonempty input-transcription delta identities and monotonic timestamps, without content. Provider-requested/effective configuration and relevant buffer/connection events receive retention priority. Audio, transcript deltas, prompts and credentials are not logged. Diagnostic failures remain nonterminal. No manual interruption, replay, threshold, word matching, speculative retry or scheduling change is included.

Risk: observation permits Snap to keep speaking over customer input. It is a controlled contract probe, not a completed reliability correction. Existing currentness checks must still reject obsolete model/tool results. A valid new user input may wait for active generation. Stop the experiment for stalled responses, provider errors, ownership/state regressions or unacceptable talk-over. Returning to the normal URL restores the control for the next voice session.

## Provider gate and proof plan

Official sources: [Realtime client events](https://developers.openai.com/api/reference/resources/realtime/client-events), [server events](https://developers.openai.com/api/reference/resources/realtime/server-events), [transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription). Docs describe independent interruption/creation flags, VAD events with automatic interruption disabled, response-specific cancel, WebRTC output clear and input transcription deltas. They do not establish live early-delta timing for this application's current transcription model, nor owner-heard latency.

Before Phase 2, observe the actual provider configuration, whether speech detection leaves active and buffered audio intact, and whether meaningful transcription arrives before speech-stop/commit soon enough for an intentional “Wait” or full question. Compare silence, cough, throat clearing, kitchen noise and deliberate speech. Record response/input/request identities and cancellation/completion, plus owner-heard responsiveness separately. No Phase 2 implementation until the evidence establishes safe association for active generation and completed generation with audio still buffered. A transcription-only signal does not itself prove intentionality or acoustic cause.

## Verification and release gates

Focused D1-compatible tests cover default and opt-in settings, production/disabled rejection, unchanged models/voice/transcription/tools/instructions and diagnostic privacy. Browser lifecycle tests cover observation without client cancel/clear, retained input identity, duplicate delta bounding and healthy empty-input handling. Run full browser-enabled suite, preflight and exact-source GitHub CI. Physical sound quality is not simulated-browser proof.

Before isolated deployment: reverify active Worker, isolated D1/R2, Cloudflare Access, unchanged migration ledger and fresh private D1 recovery. No migration. Preserve the baseline Worker as immediate code rollback; do not restore D1 for routine rollback. No production route or resource is touched. Record release specifics and real microphone findings privately after exact-source release.

Status: Phase 1 candidate implemented. Full browser-enabled suite passed 85/85 with zero skips; preflight, syntax, diff check and Wrangler staging dry run passed. Exact-source CI passed for runtime candidate `dd154f5781d5e13a3c64dd3c31079bf871871f0c` ([direct-push run](https://github.com/procuredan/snapndish/actions/runs/39626395921)). Independent QA gave that candidate a Phase 1 technical pass with no reviewed acceptance, ownership, currentness or control blocker. This release-status addendum changes documentation only. Actual staging provider evidence and real microphone results remain open gates, recorded separately in private release evidence. Phase 2 is not implemented or authorized to proceed without the provider evidence gate.
