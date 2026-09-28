# Snap n Dish — Stage 1A

Private culinary comparison prototype. It runs identical scripted user turns through three configurations of the same foundation model: A (minimal cooking guidance), B (Snap behavior), and C (Snap behavior plus explicit customer context). Earlier assistant replies remain in each arm's own conversation.

## Project authority

- [SNAP_GLOBAL_RULES.md](SNAP_GLOBAL_RULES.md) — binding Snap n Dish governance and release rules.
- [SNAP_ARCHITECTURE.md](SNAP_ARCHITECTURE.md) — verified current system, future boundaries, and unresolved gaps.
- [SNAP_DECISION_LOG.md](SNAP_DECISION_LOG.md) — append-only product and architecture decisions.
- [AGENTS.md](AGENTS.md) — execution instructions subordinate to the three canonical documents.

The Stage 1A prototype is not a deployed product. GitHub CI runs verification only; a GitHub push does not deploy Cloudflare. No Snap n Dish staging or production deployment is configured in this repository.

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
