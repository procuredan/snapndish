# Repeated equipment answer during cooking

**Source:** Product owner report from a real Stage 1B staging cooking conversation, 2026-09-30. This note preserves only facts supplied by the owner. The protected full transcript has not yet been retrieved; do not present the synthetic controls as that exact conversation.

## Observed failure

Snap asked which skillet the customer had. The customer answered **“both”** twice. Snap repeatedly re-asked instead of resolving the available options through ordinary culinary judgment. The failure is repeated questioning after an answer that makes multiple options available; it is not a special-case rule for one word.

## Expected behavior

Use the conversation and known equipment to choose a suitable method when either option works. Briefly explain the choice if helpful. Ask again only when an unresolved difference materially changes safety or technique. A conversational answer does not itself prove either tool was used or food was cooked.

## Regression probes

`stage1b/cooking-eval.mjs` includes held-out single and repeated availability paraphrases under `equipment-multiple-options` and `equipment-repeated-answer`, compared with Foundation, v1 and v2. A Worker test verifies that a premature tool-only proposal can still yield a conversational answer while its unsupported cooking state is rejected. These probes test the general failure mechanism but cannot establish that the original voice exchange is fixed; the exact protected session and a new owner voice test are still needed.
