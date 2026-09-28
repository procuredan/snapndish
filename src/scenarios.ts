import { readFileSync } from "node:fs";
export type Scenario = { id: string; title: string; category: string; context: string; turns: string[]; reviewFocus: string[] };

export function loadScenarios(path = new URL("../evaluation/scenarios.json", import.meta.url)): Scenario[] {
  const data: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(data) || data.length < 12 || data.length > 20) throw new Error("Initial corpus must have 12–20 scenarios");
  const ids = new Set<string>();
  for (const value of data) {
    const s = value as Scenario;
    if (!s || !/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id) || !s.title || !s.category || !s.context?.trim() || !Array.isArray(s.turns) || s.turns.length < 2 || s.turns.some(t => typeof t !== "string" || !t.trim()) || !Array.isArray(s.reviewFocus) || !s.reviewFocus.length) throw new Error(`Invalid scenario: ${s?.id}`);
    ids.add(s.id);
  }
  return data as Scenario[];
}
