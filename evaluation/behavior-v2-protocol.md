# Stage 1A behavior v2 experiment

**Authority:** Owner instruction, 2026-09-29. This is an offline Stage 1A behavior experiment. The deployed Live Lab remains `stage1a-snap-v1`; Stage 1B and deployment are excluded.

## Existing system and exact change

The Stage 1A CLI and Live Lab use `instructionsFor` with `stage1a-snap-v1`. The original 16-case A/B/C corpus, run outputs and deployed Worker remain authoritative evidence for v1. This experiment adds `instructionsForCandidate` with version `stage1a-snap-v2` and a separate focused corpus and runner. The candidate does not change model, reasoning effort, max output tokens, API storage setting, tools, or context fixture format. Foundation A still uses its original minimal instruction. Deployed C v1 uses the identical v1 instruction and empty-context sentinel as the Live Lab.

The hypothesis is that the v1 prompt can mistake an incomplete starting point for a chosen dish. V2 directs the model to find the next shared decision or action, while preserving culinary breadth, useful culinary initiative and direct recovery help. It does not encode a cuisine, option count, recipe answer, classifier, state machine, retrieval system, or second model call.

## Protocol

- Run all three arms on the same `gpt-6-astra` model, `medium` reasoning, 4096 max output tokens, and identical user/history/context per case. `stream=true`, `store=false`.
- Compare 24 cases: original terse pork, two held-out pork phrasings, new ingredient/equipment/cuisine/occasion openings, direct cooking/safety/recovery questions, fixed preceding conversations for selections and references, rejection and direction change, context contrasts, and one genuine two-turn pork conversation.
- Fixed preceding assistant turns are controls shared by the arms. They assess interpretation of a known offer, not how each arm would have written the preceding offer. The genuine two-turn case assesses each arm's own continuity. The positive pork example is a behavioral reference only; exact wording, Korean food, option count and historical temperatures are not expected outputs.
- The blind owner sheet remaps Foundation A, deployed C v1 and candidate C v2 independently for each case. The mapping lives only in the ignored private run directory. Do not reveal it until owner scoring is complete.
- Score each option for: next shared decision/action, culinary breadth, appealing distinct possibilities, intelligent initiative, commitment recognition, detail after commitment, constraints/customer control, and adaptation after rejection/correction. Also record best, acceptable options, and whether none are good enough. A green automated test cannot substitute for this judgment.
- Inspect safety, invented personalization, answer avoidance, forced equipment usage, excessive detail, and needless reconfirmation as potential regressions. Inspect individual failures before any aggregate claim.

## Latency, cost and limits

The runner records every streamed text delta with time since request start, first nonblank text, full completion, token usage, estimated cost, retry count, model response identity and exact effective behavior version. Its `firstUsefulProxyMs` is **only** the existing server-side heuristic: at least 50 characters plus punctuation or a list marker. It is not a semantic or browser-rendered measure.

Decision-useful rendered content requires a human to identify the first prefix that supports the actual next decision/action, plus a browser paint timestamp for that prefix. A local replay of the recorded stream can provide browser-rendering evidence for this experiment; its timing is a replay of the captured provider stream, not a direct measurement of the deployed Live Lab or a guarantee of production latency. Report the distinction and the measurement method. Estimates use the dated price card in `src/config.ts`, not provider billing. Retries without usage may have unobserved cost.

## Boundaries and recovery

The CLI writes only synthetic context and responses into gitignored `runs/`; the API credential remains in ignored `.env` and is never printed or serialized. A run is incomplete if any expected turn is missing. No model output is accepted as cooking or application state. Source rollback is reverting the separate v2 additions; data recovery is not needed because the experiment changes no deployed database or schema. Expected staging and live behavior are unchanged. Promotion requires owner blind review and a separate release authorization.
