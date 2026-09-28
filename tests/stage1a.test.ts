import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { instructionsFor, estimateUsd } from "../src/config.ts";
import { requestTurn } from "../src/openai.ts";
import { summarize, writeReports } from "../src/report.ts";
import { loadScenarios } from "../src/scenarios.ts";

test("comparison preserves one strong model with only intended arm differences", () => {
  const context = "Owns a wok. Tonight the wok is unavailable.";
  const a = instructionsFor("A", context);
  const b = instructionsFor("B", context);
  const c = instructionsFor("C", context);
  assert.ok(!a.includes("Snap n Dish"));
  assert.ok(b.includes("Snap n Dish"));
  assert.ok(!b.includes(context));
  assert.ok(c.startsWith(b));
  assert.ok(c.includes(context));
  assert.ok(c.includes("Current explicit input takes priority"));
});

test("scenario corpus covers exploration, occasions, safety and live recovery", () => {
  const cards = loadScenarios();
  assert.equal(cards.length, 16);
  assert.equal(cards.reduce((sum, card) => sum + card.turns.length, 0), 48);
  for (const id of ["argentine-shrimp", "super-bowl", "serious-allergy", "wok-no-wok", "cold-grill", "burned-sauce", "oversalted-sauce"])
    assert.ok(cards.some(card => card.id === id), `Missing ${id}`);
});

test("API adapter disables storage, sends full conversation and records provider usage", async () => {
  const calls: Array<{ url: unknown; request: RequestInit }> = [];
  const fetcher = (async (url: unknown, request: RequestInit) => {
    calls.push({ url, request });
    return new Response(JSON.stringify({
      id: "resp-test", model: "gpt-6-astra", status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "Make a bright shrimp salad." }] }],
      usage: { input_tokens: 120, output_tokens: 60, input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 10 } },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const messages = [{ role: "user" as const, content: "Ideas?" }, { role: "assistant" as const, content: "A few." }, { role: "user" as const, content: "Different ones." }];
  const result = await requestTurn({ apiKey: "dummy-key", model: "gpt-6-astra", instructions: "Help cook.", messages, fetcher });
  assert.equal(calls.length, 1);
  const body = JSON.parse(String(calls[0].request.body));
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(body.store, false);
  assert.deepEqual(body.input, messages);
  assert.equal(result.text, "Make a bright shrimp salad.");
  assert.equal(result.reasoningTokens, 10);
  assert.equal(result.estimatedUsd, estimateUsd("gpt-6-astra", 120, 20, 60));
});

test("provider errors never expose secret or returned error body", async () => {
  const fetcher = (async () => new Response(JSON.stringify({ error: { message: "server says secret-key" } }), { status: 401 })) as typeof fetch;
  await assert.rejects(requestTurn({ apiKey: "secret-key", model: "gpt-6-astra", instructions: "test", messages: [], fetcher }),
    error => error instanceof Error && error.message === "OpenAI API HTTP 401");
});

test("summary distinguishes an incomplete run and blind review hides profile context", () => {
  const cards = loadScenarios();
  const sample = cards[0];
  const run = { runId: "test", startedAt: "2026-09-28T00:00:00Z", model: "gpt-6-astra", behaviorVersion: "test", contextVersion: "test", scenarioVersion: "test", scenarioIds: [sample.id], priceCheckedAt: "2026-09-28", records: [{ scenarioId: sample.id, arm: "A" as const, turn: 0, user: sample.turns[0], result: { text: "A useful reply.", responseId: "resp", responseModel: "gpt-6-astra", status: "completed", latencyMs: 900, inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, reasoningTokens: 10, estimatedUsd: 0.0035 } }], errors: [] };
  const summary = summarize(run, cards);
  assert.equal(summary.expectedTurns, sample.turns.length * 3);
  assert.equal(summary.completedTurns, 1);
  assert.equal(summary.byArm.A.scenariosCompleted, 0);
  const out = mkdtempSync(join(tmpdir(), "snapndish-test-"));
  try {
    writeReports(out, run, cards);
    const blind = readFileSync(join(out, "blinded-review.md"), "utf8");
    const fixtures = readFileSync(join(out, "context-fixtures.md"), "utf8");
    assert.ok(!blind.includes(sample.context));
    assert.ok(fixtures.includes(sample.context));
  } finally { rmSync(out, { recursive: true, force: true }); }
});
