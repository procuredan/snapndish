import { estimateUsd } from "./config.ts";

export type Message = { role: "user" | "assistant"; content: string };
export type TurnResult = {
  text: string; responseId: string; responseModel: string; status: string;
  latencyMs: number; inputTokens: number; cachedInputTokens: number;
  outputTokens: number; reasoningTokens: number; estimatedUsd: number | null;
};

type Payload = {
  id?: string; model?: string; status?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number } };
};

export async function requestTurn(args: {
  apiKey: string; model: string; instructions: string; messages: Message[];
  fetcher?: typeof fetch;
}): Promise<TurnResult> {
  const fetcher = args.fetcher ?? fetch;
  const started = performance.now();
  let failure = new Error("OpenAI request failed");
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: args.model, instructions: args.instructions,
          input: args.messages, reasoning: { effort: "medium" }, max_output_tokens: 4096,
          store: false }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      failure = new Error("OpenAI transport failure");
      if (attempt < 2) { await delay(600 * 2 ** attempt); continue; }
      break;
    }
    let payload: Payload;
    try { payload = await response.json() as Payload; }
    catch { throw new Error(`OpenAI returned non-JSON HTTP ${response.status}`); }
    if (!response.ok) {
      // Never store provider error bodies, headers or the credential.
      failure = new Error(`OpenAI API HTTP ${response.status}`);
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await delay(600 * 2 ** attempt); continue;
      }
      break;
    }
    if (payload.status !== "completed") throw new Error(`OpenAI status ${payload.status ?? "unknown"}`);
    const text = (payload.output ?? []).flatMap(i => i.type === "message" ? i.content ?? [] : [])
      .filter(i => i.type === "output_text" && typeof i.text === "string")
      .map(i => i.text).join("\n").trim();
    if (!text) throw new Error("OpenAI response has no assistant text");
    const usage = payload.usage;
    if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens))
      throw new Error("OpenAI response omitted token usage");
    const inputTokens = usage.input_tokens!;
    const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;
    const outputTokens = usage.output_tokens!;
    const responseModel = payload.model ?? args.model;
    return { text, responseId: payload.id ?? "unknown", responseModel,
      status: payload.status, latencyMs: Math.round(performance.now() - started),
      inputTokens, cachedInputTokens, outputTokens,
      reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
      estimatedUsd: estimateUsd(responseModel, inputTokens, cachedInputTokens, outputTokens) };
  }
  throw failure;
}

function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
