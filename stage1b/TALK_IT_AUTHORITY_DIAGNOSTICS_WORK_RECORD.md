# Talk It diagnostics and meal authority — bounded Stage 1B experiment

## Pre-change record — 2026-10-20

- **Source and control:** Start from exact source `9bee1419a68428b80118cdc40cde1c2dfd249227`. The recorded active isolated Worker is `20ba6552-9bbe-4de4-9098-3c64098a648e`; reverify it before release. Keep it as the immediate code rollback.
- **Existing authority:** The Stage 1B Worker conditionally accepts turns and meal/cooking proposals against D1 revisions. The browser owns Realtime input/response association. The V5.1 instruction requests a package after a clear selection or delegation, while the active Retail-derived meal tool description lacks that explicit prerequisite. The current bounded voice lifecycle drops older middle events and discards provider error identifiers and outgoing continuation identities.
- **Requested extension:** Phase A adds content-free, bounded client lifecycle evidence and Worker validation/storage using the existing `voice_lifecycle` event. It does not change voice scheduling or accepted state. Only after exact-source CI, diagnostic-only staging deployment, and a real-microphone control run may Phase B add a separately selectable contextual meal-selection contract for Write It and Talk It.
- **Regression surface:** Telemetry exceptions, event buffer overflow, browser playback, microphone lifetime, Realtime provider errors and tool continuation; later, ambiguous versus clear meal selection, Shopping and complete plan acceptance, repair, currentness, response ownership, reload, dashboard history, customer isolation, culinary breadth, latency, and cost.
- **Proof:** Test privacy/validation and browser event sequence, full suite with enabled browser tests, exact-source GitHub CI, staging Worker/Access/bindings/ledger/recovery checks, rendered diagnostic-only staging, owner real-microphone control. Phase B requires fixed and held-out complete-conversation comparisons with identical contexts, culinary and application review, then separate CI and staging verification.
- **Expected diagnostic staging behavior:** The same Talk It, Write It and state behavior as control. Captured event identities and effective client settings permit an owner microphone run to distinguish the known failure boundaries without storing audio, speech text, prompts, recipes, credentials, or provider payloads.
- **Recovery:** No migration or D1 restore for a routine code rollback. Return the Worker to `20ba6552-9bbe-4de4-9098-3c64098a648e` if diagnostics affect operation. Keep the private incident and new control evidence outside Git. Production and Milestone 2 remain excluded.

## Phase A result

**VERIFIED local diagnostic-only candidate:** `SNAP_BROWSER_TEST=1 npm test` passed 80/80, including the Chrome lifecycle replay and diagnostic overflow case. `npm run preflight`, client/Worker syntax checks and `git diff --check` passed. Wrangler 4.103.0 dry-run bundled 337.90 KiB (80.08 KiB gzip) with only the isolated Stage 1B D1/R2 bindings and unchanged `BEHAVIOR_VERSION=stage1b-meal-package-v5.1`. No migration is required. The browser records allowlisted provider error identities, output and function-result event IDs, request/response phases, output-buffer events, playback and microphone state, and requested/provider/microphone configuration booleans. The Worker stores only bounded whitelisted metadata in the existing lifecycle state event. The buffer preferentially keeps critical causal records. A malformed diagnostic cannot block a normal voice stop.

**NOT VERIFIED yet:** Exact-source GitHub CI, active staging preflight, diagnostic-only staging deployment, actual provider event shapes and a real-microphone control run. These gates precede Phase B.

## Phase B result

Pending physical control and evaluation gate.
