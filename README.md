# Snap n Dish — Stage 1A

Private culinary comparison prototype. It runs identical scripted user turns through three configurations of the same foundation model: A (minimal cooking guidance), B (Snap behavior), and C (Snap behavior plus explicit customer context). Earlier assistant replies remain in each arm's own conversation.

## Project authority

- [SNAP_GLOBAL_RULES.md](SNAP_GLOBAL_RULES.md) — binding Snap n Dish governance and release rules.
- [SNAP_ARCHITECTURE.md](SNAP_ARCHITECTURE.md) — verified current system, future boundaries, and unresolved gaps.
- [SNAP_DECISION_LOG.md](SNAP_DECISION_LOG.md) — append-only product and architecture decisions.
- [AGENTS.md](AGENTS.md) — execution instructions subordinate to the three canonical documents.

The controlled Stage 1A evaluation remains separate from the private Live Lab. GitHub CI runs verification only; a GitHub push does not deploy Cloudflare. The Live Lab is not Stage 1B or a public beta.

## Private evaluation

Requires Node 22+ and an OpenAI API key in `OPENAI_API_KEY`. The key may be supplied through a private, ignored `.env` file containing `OPENAI_API_KEY=...`. Never commit the key or put it in chat.

```sh
npm run preflight
npm run compare
npm run chat
npm test
```

Optional `run` flags: `--model gpt-6-astra`, `--scenario <id>`, `--out <directory>`, `--max-estimated-usd 25`. The run writes each result immediately into ignored `runs/` files and creates a blinded human review sheet, key and metric summary. Review outputs for private information before sharing or committing them. `preflight` and tests make no API calls. Cost is an estimate based on the dated price card in `src/config.ts`, not a bill.

See [evaluation protocol](evaluation/protocol.md). Stage 1B and product build are out of scope.

## Private Live Lab

`live-lab/` is a small text-only Worker with streaming Arm C responses. The chat opens directly at `app.snapndish.com`; each browser can access only its own session. The chronological `/review` page and telemetry APIs still require the private owner code. It intentionally has no photo, voice, account, meal orchestration, or Procure profile integration. The original A/B/C corpus and ignored `runs/` results remain unchanged.

The staging and `app.snapndish.com` Wrangler files bind separate Snap n Dish D1 databases. See [release runbook](live-lab/RELEASE.md) for exact gates, telemetry, retention, verification, and rollback. Never put `OPENAI_API_KEY`, the Lab access code, or signing keys in GitHub or terminal output. CI never deploys.
