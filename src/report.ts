import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Arm } from "./config.ts";
import type { TurnResult } from "./openai.ts";
import type { Scenario } from "./scenarios.ts";

export type RecordItem = { scenarioId: string; arm: Arm; turn: number; user: string; result: TurnResult };
export type RunFile = { runId: string; startedAt: string; finishedAt?: string; model: string;
  behaviorVersion: string; contextVersion: string; scenarioVersion: string;
  scenarioIds: string[]; priceCheckedAt: string; records: RecordItem[]; errors: Array<{ scenarioId: string; arm: Arm; turn: number; message: string }> };

export function summarize(run: RunFile, scenarios: Scenario[]) {
  const stats = Object.fromEntries((["A", "B", "C"] as Arm[]).map(arm => {
    const rows = run.records.filter(r => r.arm === arm);
    const latencies = rows.map(r => r.result.latencyMs).sort((a,b) => a-b);
    const n = latencies.length;
    return [arm, { turns: n,
      scenariosCompleted: run.scenarioIds.filter(id => run.records.filter(r => r.scenarioId === id && r.arm === arm).length === scenarios.find(s => s.id === id)?.turns.length).length,
      inputTokens: rows.reduce((a,r) => a+r.result.inputTokens,0),
      cachedInputTokens: rows.reduce((a,r) => a+r.result.cachedInputTokens,0),
      outputTokens: rows.reduce((a,r) => a+r.result.outputTokens,0),
      reasoningTokens: rows.reduce((a,r) => a+r.result.reasoningTokens,0),
      estimatedUsd: rows.some(r => r.result.estimatedUsd === null) ? null : rows.reduce((a,r) => a+(r.result.estimatedUsd ?? 0),0),
      medianLatencyMs: n ? latencies[Math.floor((n-1)/2)] : null,
      p95LatencyMs: n ? latencies[Math.ceil(n*0.95)-1] : null }];
  }));
  return { runId: run.runId, model: run.model, startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null, scenarioCount: run.scenarioIds.length,
    expectedTurns: run.scenarioIds.reduce((n,id) => n+(scenarios.find(s => s.id === id)?.turns.length ?? 0)*3,0),
    completedTurns: run.records.length, errorCount: run.errors.length,
    priceCheckedAt: run.priceCheckedAt, byArm: stats,
    caveats: ["Cost is estimated from a dated price card, not provider billing.",
      "Latency includes full API response time, not time to first useful text.",
      "This summary contains no subjective culinary quality score."] };
}

function hash(s: string): number { let h=2166136261; for (const c of s) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }

export function writeReports(out: string, run: RunFile, scenarios: Scenario[]): void {
  writeFileSync(join(out,"summary.json"), JSON.stringify(summarize(run,scenarios),null,2)+"\n");
  const key: Record<string,Record<string,Arm>> = {};
  const lines = ["# Blind Stage 1A culinary review", "", "Read full conversations and score before opening `blinding-key.json` or `context-fixtures.md`. A missing arm or turn means the run is incomplete. Score usefulness, breadth, curiosity, adaptation and practical cooking value. See `evaluation/protocol.md` in the repository.", ""];
  const contextLines = ["# Context fixtures for separate personalization review", "", "Open after scoring the blind culinary comparison.", ""];
  for (const s of scenarios.filter(s => run.scenarioIds.includes(s.id))) {
    const arms: Arm[]=["A","B","C"];
    const shift=hash(s.id)%3;
    const ordered=arms.slice(shift).concat(arms.slice(0,shift));
    key[s.id]={ X:ordered[0], Y:ordered[1], Z:ordered[2] };
    lines.push(`## ${s.title} (${s.id})`,"",`Review focus: ${s.reviewFocus.join("; ")}.`,"");
    for (const [index,arm] of ordered.entries()) {
      lines.push(`### ${["X","Y","Z"][index]}`,"");
      for (const row of run.records.filter(r=>r.scenarioId===s.id && r.arm===arm).sort((a,b)=>a.turn-b.turn))
        lines.push(`**User ${row.turn+1}:** ${row.user}`,"",`**Assistant ${row.turn+1}:** ${row.result.text}`,"");
      lines.push("Quality (1–5): ___  Breadth (1–5): ___  Curiosity (1–5): ___  Adaptation (1–5): ___  Material errors: ___"," ");
    }
    lines.push("Preferred response: ___  Notes: ___","","---","");
    contextLines.push(`## ${s.title} (${s.id})`,"",s.context,"","---","");
  }
  writeFileSync(join(out,"blinded-review.md"),lines.join("\n"));
  writeFileSync(join(out,"blinding-key.json"),JSON.stringify(key,null,2)+"\n");
  writeFileSync(join(out,"context-fixtures.md"),contextLines.join("\n"));
}

export function readRun(out: string): RunFile { return JSON.parse(readFileSync(join(out,"results.json"),"utf8")) as RunFile; }
