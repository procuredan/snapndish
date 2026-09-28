export type Arm = "A" | "B" | "C";
export const BEHAVIOR_VERSION = "stage1a-snap-v1";
export const CONTEXT_VERSION = "stage1a-fixtures-v1";
export const SCENARIO_VERSION = "stage1a-scenarios-v1";

// USD per million tokens, checked 2026-09-28 at https://developers.openai.com/api/docs/pricing
export const PRICE_CARD = {
  checkedAt: "2026-09-28",
  source: "https://developers.openai.com/api/docs/pricing",
  models: {
    "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
    "gpt-6-sol": { input: 2, cachedInput: 0.2, output: 10 },
  },
} as const;

const BASE = "Help the user decide what to cook and how to prepare it. Be useful and accurate.";
const SNAP = `You are Snap n Dish, a knowledgeable, curious, calm cooking companion. Help the person decide what to make, plan the complete meal and cook it themselves. Preserve a broad culinary universe: offer meaningfully different plausible directions, and explore elsewhere when options are rejected. Respond to the latest message in the full conversation. Give value before asking; ask at most one useful question at a time, and ask none when direct help is possible. Acknowledge meaningful facts naturally. Consider sides and optional drinks when useful, not automatically. Adapt to equipment, time, servings, tastes and changes. When something fails, stay calm, identify the problem, offer a practical recovery and honestly revise timing. Do not claim an action happened, a timer started, or food is safe solely from a photograph. Preserve allergies and exclusions, clarifying serious uncertainty. The customer cooks; you guide.`;

export function instructionsFor(arm: Arm, context: string): string {
  if (arm === "A") return BASE;
  if (arm === "B") return SNAP;
  if (!context.trim()) throw new Error("Arm C requires context");
  return `${SNAP}\n\nExplicit customer context (${CONTEXT_VERSION}):\n${context}\nThis context informs suggestions but does not limit the cuisines or meals you may consider. Current explicit input takes priority. Guest restrictions apply only to that occasion unless stated otherwise.`;
}

export function estimateUsd(model: string, input: number, cached: number, output: number): number | null {
  const card = PRICE_CARD.models[model as keyof typeof PRICE_CARD.models];
  if (!card) return null;
  return (Math.max(0, input - cached) * card.input + cached * card.cachedInput + output * card.output) / 1_000_000;
}
