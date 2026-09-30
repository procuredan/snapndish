# Stage 1B Talk It follow-up failure — 2026-09-30

## Reproduction

Isolated owner-only Stage 1B staging, regular Chrome, `stage1a-snap-v2+voice-v1` on `gpt-realtime-2.1`. No customer context was supplied. The owner said:

1. “I have boneless chicken thighs for tonight.”
2. “None of those. Give me something completely different.”

The first spoken reply offered a skillet preparation, sheet-pan taco bowls, and a tomato-olive braise. The owner confirmed hearing this first reply and no second reply. The browser displayed both user transcripts and the first assistant transcript, then showed “Voice ended with an unsaved transcript.” After reload, both user turns and the first assistant turn remained; no second assistant turn appeared.

## Authoritative evidence

- One voice session connected in 1,522 ms and closed 63.7 seconds after opening with no server `error_code`.
- Revisions 1 and 2 contain accepted user turns. Revision 1 has an accepted assistant turn; revision 2 has none.
- The first accepted voice model call recorded 477 input tokens, 956 output tokens, a 526 ms first transcript-delta proxy after speech stop, 8,168 ms to full response, and estimated generation cost $0.056064. The first and second transcription records report 5 and 4 seconds respectively. Transcription and any failed or incomplete second response cost are not in that estimate.
- Revision 2's user transcript was accepted about 4.7 seconds before the voice session closed. No second assistant result or model-call usage was accepted.
- The current client sets `syncFailed` for either a failed transcript/state synchronization operation or an empty provider transcription, then closes Talk It. It does not record which occurred. The precise trigger in this owner run is **not verified**.

## Expected behavior and guardrail

Snap should respond aloud to the correction in the same conversation, preserve both visible transcripts, and remain usable until the customer ends Talk It. No raw audio should be retained. Before changing culinary behavior, preserve this case and identify the client failure reason. A follow-up must not disappear or be mistaken for an accepted Snap reply.
