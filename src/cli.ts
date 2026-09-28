import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { BEHAVIOR_VERSION, CONTEXT_VERSION, PRICE_CARD, SCENARIO_VERSION, estimateUsd, instructionsFor } from "./config.ts";
import type { Arm } from "./config.ts";
import { loadScenarios } from "./scenarios.ts";
import { requestTurn } from "./openai.ts";
import type { Message } from "./openai.ts";
import { readRun, writeReports } from "./report.ts";
import type { RunFile } from "./report.ts";

const command = process.argv[2] ?? "preflight";
const scenarios = loadScenarios();
function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
}
function credential(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw new Error("OPENAI_API_KEY is not configured; no live model calls were made");
  return key;
}
function persist(out: string, run: RunFile): void {
  const target = join(out,"results.json");
  writeFileSync(target+".tmp",JSON.stringify(run,null,2)+"\n",{mode:0o600});
  renameSync(target+".tmp",target);
  writeReports(out,run,scenarios);
}

async function compare() {
  const model=flag("model","gpt-6-astra")!;
  if (estimateUsd(model,1,0,1) === null) throw new Error(`No price card for ${model}`);
  const selectedId=flag("scenario");
  const selected=selectedId ? scenarios.filter(s=>s.id===selectedId) : scenarios;
  if (!selected.length) throw new Error(`Unknown scenario: ${selectedId}`);
  const cap=Number(flag("max-estimated-usd","25"));
  if (!Number.isFinite(cap)||cap<=0) throw new Error("Invalid cost cap");
  const apiKey=credential();
  const runId=new Date().toISOString().replace(/[:.]/g,"-");
  const out=resolve(flag("out",join("runs",runId))!);
  mkdirSync(out,{recursive:true,mode:0o700});
  const run:RunFile={runId,startedAt:new Date().toISOString(),model,
    behaviorVersion:BEHAVIOR_VERSION,contextVersion:CONTEXT_VERSION,
    scenarioVersion:SCENARIO_VERSION,scenarioIds:selected.map(s=>s.id),
    priceCheckedAt:PRICE_CARD.checkedAt,records:[],errors:[]};
  persist(out,run);
  console.log(`Run ${runId}: ${selected.length} scenarios, model ${model}. Results: ${out}`);
  for (const scenario of selected) {
    for (const arm of ["A","B","C"] as Arm[]) {
      const messages:Message[]=[];
      for (const [turn,user] of scenario.turns.entries()) {
        const spent=run.records.reduce((n,r)=>n+(r.result.estimatedUsd ?? 0),0);
        if (spent>=cap) {
          run.errors.push({scenarioId:scenario.id,arm,turn,message:`Estimated cost cap $${cap} reached`});
          persist(out,run);
          throw new Error(`Estimated cost cap reached. Partial results: ${out}`);
        }
        messages.push({role:"user",content:user});
        try {
          const result=await requestTurn({apiKey,model,
            instructions:instructionsFor(arm,scenario.context),messages});
          run.records.push({scenarioId:scenario.id,arm,turn,user,result});
          messages.push({role:"assistant",content:result.text});
          persist(out,run);
          console.log(`${scenario.id} ${arm}${turn+1}: ${result.latencyMs}ms, ${result.inputTokens}/${result.outputTokens} tokens, est $${result.estimatedUsd?.toFixed(4) ?? "unknown"}`);
        } catch (error) {
          const message=error instanceof Error?error.message:"Unknown failure";
          run.errors.push({scenarioId:scenario.id,arm,turn,message});
          persist(out,run);
          throw new Error(`${message}. Partial results: ${out}`);
        }
      }
    }
  }
  run.finishedAt=new Date().toISOString();
  persist(out,run);
  console.log(`Complete. Open ${join(out,"summary.json")} and the blinded review.`);
}

async function chat() {
  const arm=flag("arm","C") as Arm;
  if (!["A","B","C"].includes(arm)) throw new Error("Arm must be A, B or C");
  const contextId=flag("context",scenarios[0].id)!;
  const context=scenarios.find(s=>s.id===contextId)?.context;
  if (!context) throw new Error(`Unknown context fixture: ${contextId}`);
  const model=flag("model","gpt-6-astra")!;
  const apiKey=credential();
  const rl=createInterface({input:stdin,output:stdout});
  const messages:Message[]=[];
  console.log(`Private experimental chat: arm ${arm}, model ${model}. Type /quit to exit.`);
  try {
    while (true) {
      const line=(await rl.question("You: ")).trim();
      if (line==="/quit") break;
      if (!line) continue;
      messages.push({role:"user",content:line});
      try {
        const result=await requestTurn({apiKey,model,instructions:instructionsFor(arm,context),messages});
        messages.push({role:"assistant",content:result.text});
        console.log(`Snap: ${result.text}\n[${result.latencyMs} ms; estimated $${result.estimatedUsd?.toFixed(4) ?? "unknown"}]`);
      } catch (error) {
        messages.pop();
        throw error;
      }
    }
  } finally { rl.close(); }
}

async function main() {
  if (command==="preflight") {
    const turns=scenarios.reduce((n,s)=>n+s.turns.length,0);
    console.log(JSON.stringify({scenarios:scenarios.length,userTurns:turns,plannedApiCalls:turns*3,
      arms:["A","B","C"],modelDefault:"gpt-6-astra",priceCheckedAt:PRICE_CARD.checkedAt,
      keyConfigured:!!process.env.OPENAI_API_KEY},null,2));
  } else if (command==="run") await compare();
  else if (command==="chat") await chat();
  else if (command==="report") {
    const out=resolve(flag("out")??"");
    if (!flag("out")) throw new Error("report requires --out");
    writeReports(out,readRun(out),scenarios);
    console.log(`Reports refreshed in ${out}`);
  } else throw new Error(`Unknown command: ${command}`);
}

main().catch(error=>{console.error(error instanceof Error?error.message:"Unknown error");process.exitCode=1;});
