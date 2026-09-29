# Stage 1B engineering work record

**Authorized:** 2026-09-29 by the product owner. **Scope:** five Stage 1B capability proofs only. The v2 culinary behavior and Stage 1A corpus remain the baseline. Stage 1A Live Lab at `app.snapndish.com` stays on its verified deployment until a separately authorized live release.

## Existing authority

The Stage 1A Worker owns signed anonymous sessions, ordered text turns, revision-fenced assistant acceptance, model-call evidence, private review and one-tap feedback in isolated D1 databases. `src/config.ts` owns the v2 culinary behavior. There is no customer identity, image, voice, accepted meal, cross-device link or closed-app notification state.

## Extension and regression surface

1. Repair browser generation fences, interrupted-turn replay and acceptance/diagnostic consistency before adding modalities. Preserve current direct-entry text and private review.
2. Add image evidence to the same conversation with bounded, private media handling and no recipe classifier.
3. Add a minimal customer/device link for one conversation and accepted state across phone, computer/tablet and phone.
4. Experiment with realtime spoken conversation using the same behavior/context/application authority. Compare culinary quality with text v2; no raw audio retention.
5. Demonstrate one permissioned, durable closed-app return to the correct conversation. Do not build full cooking scheduling.

The main risks are stale output appearing after a session change, duplicate turns after interrupted requests, mixed device authority, image privacy, voice transcript drift, unexpected model quality loss, notification delivery limits and higher cost/latency. Stage 1B changes must retain model/behavior/version telemetry and Good / Missed It.

Stage 1B migrations live only in `stage1b/migrations/`. Its `0001_init.sql` is an exact copy of the Stage 1A baseline for a new, isolated D1 database. The Stage 1A migration directory remains at `0001_init.sql` alone, preventing routine Stage 1A migration commands from applying Stage 1B schema. Local Wrangler reported no pending Stage 1B migrations after this split.

## Proof and release plan

Run the existing automated and focused culinary regression suites after each relevant change. Add targeted currentness, idempotency, access and modality tests that prove real failure boundaries. Measure provider and rendered latency, available usage/cost and quality against representative v2 text journeys. Exercise real target-device journeys and a closed-app return. Stage new runtime only in isolated Snap n Dish staging, inspect migration ledger before append-only changes, and verify rendered experience and protected review. A GitHub push and Cloudflare deployment are separate. Production deployment requires separate explicit authorization for that deployment.

## Recovery

Keep the verified Stage 1A v2 live Worker version `8b68fce3-7845-412e-9c1a-80e78293d17b` and v1 rollback `cda4b362-0c8e-4f84-a049-ea8976a3df0b` untouched. Use a separate Stage 1B staging resource and additive migrations. Record its first closed and working Worker versions before further releases. Code rollback does not reverse data; keep old columns readable and preserve a D1 restore point before applying each migration.

The [Stage 1B release runbook](RELEASE.md) requires an owner-only Cloudflare Access gate on the isolated staging Worker before live Realtime voice. Direct browser-to-provider WebRTC media can continue after SDP exchange, so the text call counter does not bound voice spending. This is a staging access and spend-control gate, not a product login design. The closed Worker is the immediate Stage 1B rollback target.

## Evidence convention

For each capability, record what was built, what was deferred, relationship to the culinary core, measured latency/cost, quality, reliability and known limits. Mark VERIFIED, INFERRED and NOT VERIFIED explicitly. Stop for PM review after all five proofs; do not begin commercial alpha.

## Local evidence, 2026-09-29

All experiments below use the same `stage1a-snap-v2` culinary behavior. `npm test` passed 23 tests after the Stage 1B changes. Local D1 migrations 0001–0007 applied to a new database. The local Worker has no effect on the Stage 1A staging or live databases. No raw voice audio from a customer was recorded; synthetic speech fixtures used for the provider probe were temporary local files.

| Proof | Built and exercised | Measured local evidence | Quality and reliability | Missing proof |
| --- | --- | --- | --- | --- |
| Durable/current conversation | Per-turn operation lease, replay, conditional assistant acceptance, separate model evidence/state events, browser generation fence, interrupted-reply recovery | Automated disconnected-stream, duplicate-retry, late-result and meal-change-during-stream tests passed; sample text turns first nonblank 1.18–1.62 s, first-useful **server proxy** 1.66–2.08 s, full 6.42–6.86 s, estimated $0.0137–$0.0143 each | One accepted user turn and one accepted reply across reconnect/retry; a meal selection advances conversation revision so an older in-flight suggestion is retained as evidence but rejected as state. | Browser decision-useful paint timing and remote network interruption test. |
| Snap It | Session-private R2 image, browser resize to bounded JPEG, server metadata stripping, image in same streamed Responses call | Public-domain shrimp-taco image: 542 metadata bytes stripped; image call first nonblank 4.80 s, first-useful **server proxy** 5.84 s, full 18.25 s; 1,282 input / 591 output tokens; estimated $0.0424 | Reply recognized likely dish, distinguished visible and uncertain details, did not infer allergens, and offered reconstruction. Chrome rendered stored photo and reply after pairing. | Native phone camera/picker journey and owner culinary judgment. |
| Talk It | WebRTC SDP proxy, realtime speech and spoken response, visible transcript acceptance on same session revision, v2 behavior/context/meal snapshot | Separate real Realtime provider WebSocket probe: two synthetic speech turns, exact input transcription; first output transcript delta 1.56 s and 2.89 s after commit; full audio generation 14.18 s and 9.69 s; estimated generation cost about $0.086 and $0.050, based on published modality rates | First answer offered garlic-butter shrimp, tacos and tomato-olive skillet; rejection shifted to coconut curry and kimchi fried rice. This single sample showed useful culinary reasoning, though spoken output was longer than ideal. | Actual browser microphone, audio playback, transcript reconciliation and owner quality comparison. The transcript-delta timing is a proxy, not the first decision-useful spoken content. Separate transcription and synthetic TTS costs are excluded. |
| Cross-device | Signed anonymous customer cookie and one-use 10-minute pairing link, same conversation and accepted meal revision through backend | Automated two-browser-cookie test passed; local Chrome joined an API-created photo session and rendered its conversation | Server revision and meal version remained authoritative; second context could continue. | Real phone → computer/tablet → phone target-device round trip and usability timing. |
| Closed-app return | Permissioned payloadless Web Push, authenticated service worker fetch, one reminder for the existing conversation, scheduler and delivery/interaction timestamps | Automated push-service acceptance, protected pending fetch, display/click acknowledgement and wrong-customer denial passed | Push acceptance is separately recorded from notification display and click. Interrupted dispatch becomes retryable after five minutes. | Real notification while browser closed, operating-system permission, device support and delivery timing. An interrupted send may duplicate a push because the push service and D1 cannot commit atomically. |

Closed-app proof should first target a browser with ordinary Web Push support. [WebKit's iOS/iPadOS documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) requires a Home Screen web app for iOS web push; a normal Safari tab is not a valid proof target. The Stage 1B Access session must also still be valid when the service worker fetches the private reminder; otherwise it intentionally shows no conversation notification. Record push-service acceptance, OS display and user click separately.

Realtime generation estimates use the [OpenAI API price table](https://developers.openai.com/api/docs/pricing?tab=suite) checked 2026-09-29. They exclude separately priced live transcription, Cloudflare infrastructure, failed attempts without usage, and taxes. The browser WebRTC handshake follows the [OpenAI Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/voice-webrtc); a provider WebSocket probe does not by itself prove browser media transport.

**VERIFIED rendered local continuation:** Chrome accepted the shrimp-taco photo reply as meal revision 1, then streamed a dairy-free adaptation in that same conversation. The reply preserved the shrimp-taco plan, changed the dairy components and distinguished ordinary dairy avoidance from a milk-allergy cross-contact concern. D1 recorded the accepted meal revision and a 2,149-character meal snapshot in the model call. First nonblank text was 1.75 s, first-useful **server proxy** 2.40 s, full 6.03 s, 2,356 input/179 output tokens and estimated $0.0325. The image reply preceding this was over-detailed before the customer chose a direction; this remains a quality concern for owner review. The continuation was useful and did not require a new recipe engine or an additional synchronous model call.

## Experimental data and retention

Only the isolated Stage 1B staging database and private image bucket are intended to hold Stage 1B data. Anonymous customer/session cookies expire after 30 days; session transcripts, model evidence, accepted meal pointer, voice transcript/usage, pair links, reminder and push endpoint records follow the session's 30-day expiry with daily deletion. Pair links expire after 10 minutes. Images are stripped JPEG derivatives, private to the session, and deleted from R2 at session expiry. OpenAI Responses requests use `store:false`; Realtime sends live audio to the provider but this Worker stores only text and usage. No raw voice recording is retained. Push messages have no payload; the service worker retrieves the reminder only with the customer's signed cookie. D1 Time Travel and provider retention are separate from application deletion and require verification for the staging account.

The owner review surface is code-protected and separate from frictionless chat. Its records include sensitive voluntary conversation/context and image evidence; staging access should be shared only with controlled testers. Stage 1B has no durable commercial identity or deletion UI.
