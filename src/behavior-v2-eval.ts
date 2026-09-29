import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BEHAVIOR_VERSION, CANDIDATE_BEHAVIOR_VERSION, CONTEXT_VERSION, PRICE_CARD, estimateUsd, instructionsFor, instructionsForCandidate } from "./config.ts";
import type { Message } from "./openai.ts";

type Arm = "foundation" | "deployed-v1" | "candidate-v2";
type Case = { id: string; title: string; group: string; context: string; history: Message[]; user: string; followUp?: string };
type Chunk = { atMs: number; text: string };
type Row = { caseId: string; arm: Arm; turn: number; user: string; history: Message[]; text: string;
  responseId: string; responseModel: string; firstTextMs: number | null; firstUsefulProxyMs: number | null;
  fullMs: number; chunks: Chunk[]; inputTokens: number; cachedInputTokens: number; outputTokens: number;
  reasoningTokens: number; estimatedUsd: number | null; retryCount: number };
type Run = { id: string; startedAt: string; finishedAt?: string; model: string; effort: "medium";
  maxOutputTokens: 4096; versions: Record<Arm,string>; contextVersion: string; priceCheckedAt: string;
  cases: Case[]; rows: Row[]; errors: Array<{caseId:string;arm:Arm;turn:number;code:string}> };

const arms: Arm[] = ["foundation", "deployed-v1", "candidate-v2"];
const cases = JSON.parse(readFileSync(new URL("../evaluation/behavior-v2-cases.json", import.meta.url), "utf8")) as Case[];
function validate() {
  const ids = new Set<string>();
  if (cases.length < 20) throw new Error("Focused evaluation corpus is incomplete");
  for (const c of cases) {
    if (!/^[a-z0-9-]+$/.test(c.id) || ids.has(c.id) || !c.title || !c.group || typeof c.context !== "string" ||
        !c.user?.trim() || !Array.isArray(c.history) || c.history.some(m => !["user","assistant"].includes(m.role) || !m.content?.trim()))
      throw new Error(`Invalid case ${c.id}`);
    ids.add(c.id);
  }
}
validate();
const arg = (name: string, fallback: string) => { const i=process.argv.indexOf(`--${name}`); return i<0?fallback:process.argv[i+1]; };
const hash = (s:string) => { let h=2166136261; for (const c of s) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; };
const proxy = (s:string) => s.length>=50 && (/[.!?](?:\s|$)/.test(s) || /\n\s*[-*]/.test(s));
const instructions = (arm:Arm, context:string) => arm==="foundation" ? instructionsFor("A","") :
  arm==="deployed-v1" ? instructionsFor("C",context.trim() || "No saved customer facts provided yet.") : instructionsForCandidate(context);
function atomic(path:string, value:unknown) { writeFileSync(`${path}.tmp`,JSON.stringify(value,null,2)+"\n",{mode:0o600}); renameSync(`${path}.tmp`,path); }
function persist(out:string,run:Run) { atomic(join(out,"results.json"),run); writeReview(out,run); }
function ordering(id:string):Arm[] { const n=hash(id)%3; return arms.slice(n).concat(arms.slice(0,n)); }
function writeReview(out:string,run:Run) {
  const key:Record<string,Record<string,Arm>>={};
  const lines=["# Stage 1A v2 — blind owner review","", "The three options are remapped independently for every case. Score the conversation before opening the private key. Fixed prior assistant turns are shared controls, not each arm's generated answer. The last case runs a real second model turn after each arm's own first answer.","", "For each option, judge: next shared decision/action; culinary breadth; appealing distinct choices; intelligent initiative; selection recognition; appropriate detail; constraints/customer control; adaptation after correction. Also consider: would I cook this, does it sound human, and does it match the inspired experience?",""];
  for (const c of run.cases) {
    const order=ordering(c.id); key[c.id]={"1":order[0],"2":order[1],"3":order[2]};
    lines.push(`## ${c.title} (${c.id})`,"",`**User:** ${c.user}`,"");
    if (c.history.length) lines.push("**Shared preceding conversation:**", "", ...c.history.map(m=>`- ${m.role}: ${m.content}`),"");
    if (c.followUp) lines.push(`**Same second user turn for all arms:** ${c.followUp}`,"");
    for (const [i,arm] of order.entries()) {
      lines.push(`### Option ${i+1}`,"");
      const rows=run.rows.filter(r=>r.caseId===c.id&&r.arm===arm).sort((a,b)=>a.turn-b.turn);
      for (const row of rows) lines.push(`**Snap${row.turn+1}:** ${row.text}`,"");
      if (!rows.length) lines.push("[Not yet run]","");
    }
    lines.push("**Best:** 1 / 2 / 3 / none", "", "**Acceptable:** 1 / 2 / 3 (circle any)", "", "**None are good enough:** yes / no", "", "**Eight criteria (1–5 each) and specific concerns:** ____________________", "", "---", "");
  }
  writeFileSync(join(out,"blind-owner-review.md"),lines.join("\n"),{mode:0o600});
  atomic(join(out,"private-blinding-key.json"),key);
  writeFileSync(join(out,"context-after-blind.md"),["# Context fixtures — open after blind scoring","",...run.cases.filter(c=>c.context).flatMap(c=>[`## ${c.title} (${c.id})`,``,c.context,``])].join("\n"),{mode:0o600});
}
async function streamTurn(apiKey:string,model:string,arm:Arm,context:string,messages:Message[]):Promise<Omit<Row,"caseId"|"arm"|"turn"|"user"|"history">> {
  const started=performance.now(); let retryCount=0; let response:Response|undefined;
  for (let attempt=0;attempt<3;attempt++) {
    try { response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({model,instructions:instructions(arm,context),input:messages,reasoning:{effort:"medium"},max_output_tokens:4096,store:false,stream:true}),signal:AbortSignal.timeout(120_000)}); }
    catch { if(attempt===2) throw new Error("TRANSPORT_FAILURE"); retryCount++; await new Promise(r=>setTimeout(r,600*2**attempt)); continue; }
    if(response.ok) break;
    const status=response.status; await response.body?.cancel();
    if(![429,500,502,503,504].includes(status)||attempt===2) throw new Error(`HTTP_${status}`);
    retryCount++; await new Promise(r=>setTimeout(r,600*2**attempt));
  }
  if(!response?.body) throw new Error("NO_STREAM");
  const chunks:Chunk[]=[]; let text="",firstTextMs:null|number=null,firstUsefulProxyMs:null|number=null;
  let completed:any; let buffer=""; const decoder=new TextDecoder(); const reader=response.body.getReader();
  function frame(raw:string) {
    const line=raw.split("\n").find(x=>x.startsWith("data: "));
    if(!line||line.slice(6)==="[DONE]") return;
    let e:any; try { e=JSON.parse(line.slice(6)); } catch { throw new Error("BAD_STREAM_EVENT"); }
    if(e.type==="response.output_text.delta"&&typeof e.delta==="string") {
      text+=e.delta; const atMs=Math.round(performance.now()-started); chunks.push({atMs,text:e.delta});
      if(firstTextMs===null&&/\S/.test(e.delta)) firstTextMs=atMs;
      if(firstUsefulProxyMs===null&&proxy(text)) firstUsefulProxyMs=atMs;
    } else if(e.type==="response.completed") completed=e.response;
    else if(e.type==="error"||e.type==="response.failed") throw new Error("PROVIDER_STREAM_FAILED");
  }
  while(true) { const next=await reader.read(); if(next.done) break; buffer+=decoder.decode(next.value,{stream:true}).replace(/\r\n/g,"\n");
    let i; while((i=buffer.indexOf("\n\n"))>=0) { frame(buffer.slice(0,i)); buffer=buffer.slice(i+2); } }
  if(buffer.trim()) frame(buffer);
  if(!completed||!text.trim()) throw new Error("INCOMPLETE_STREAM");
  const usage=completed.usage;
  if(!Number.isFinite(usage?.input_tokens)||!Number.isFinite(usage?.output_tokens)) throw new Error("MISSING_USAGE");
  const responseModel=completed.model??model;
  return {text,responseId:completed.id??"unknown",responseModel,firstTextMs,firstUsefulProxyMs,
    fullMs:Math.round(performance.now()-started),chunks,inputTokens:usage.input_tokens,
    cachedInputTokens:usage.input_tokens_details?.cached_tokens??0,outputTokens:usage.output_tokens,
    reasoningTokens:usage.output_tokens_details?.reasoning_tokens??0,
    estimatedUsd:estimateUsd(responseModel,usage.input_tokens,usage.input_tokens_details?.cached_tokens??0,usage.output_tokens),retryCount};
}
async function main() {
  const cmd=process.argv[2]??"preflight"; const model=arg("model","gpt-6-astra");
  if(estimateUsd(model,1,0,1)===null) throw new Error("No price card for requested model");
  const selectedId=arg("case",""); const selected=selectedId?cases.filter(c=>c.id===selectedId):cases;
  if(!selected.length) throw new Error("Unknown case");
  if(cmd==="preflight") { console.log(JSON.stringify({cases:selected.length,plannedCalls:selected.reduce((n,c)=>n+3*(c.followUp?2:1),0),arms:arms.length,model,effort:"medium",v1:BEHAVIOR_VERSION,v2:CANDIDATE_BEHAVIOR_VERSION,keyConfigured:!!process.env.OPENAI_API_KEY},null,2)); return; }
  if(cmd!=="run") throw new Error("Unknown command");
  const apiKey=process.env.OPENAI_API_KEY; if(!apiKey?.trim()) throw new Error("OPENAI_API_KEY not configured");
  const cap=Number(arg("max-estimated-usd","15")); if(!Number.isFinite(cap)||cap<=0) throw new Error("Invalid cost cap");
  const out=resolve(arg("out",join("runs",`stage1a-v2-${new Date().toISOString().replace(/[:.]/g,"-")}`)));
  mkdirSync(out,{recursive:true,mode:0o700});
  const run:Run={id:new Date().toISOString(),startedAt:new Date().toISOString(),model,effort:"medium",maxOutputTokens:4096,
    versions:{foundation:"foundation-a-v1","deployed-v1":BEHAVIOR_VERSION,"candidate-v2":CANDIDATE_BEHAVIOR_VERSION},
    contextVersion:CONTEXT_VERSION,priceCheckedAt:PRICE_CARD.checkedAt,cases:selected,rows:[],errors:[]};
  persist(out,run); console.log(`Focused run: ${selected.length} cases; output ${out}`);
  for(const c of selected) for(const arm of ordering(c.id)) {
    const messages:Message[]=[...c.history,{role:"user",content:c.user}];
    for(const [turn,user] of [c.user,...(c.followUp?[c.followUp]:[])].entries()) {
      if(turn>0) messages.push({role:"user",content:user});
      const spent=run.rows.reduce((n,r)=>n+(r.estimatedUsd??0),0);
      if(spent>=cap) { run.errors.push({caseId:c.id,arm,turn,code:"ESTIMATED_COST_CAP"}); persist(out,run); throw new Error(`Cost cap reached; partial run ${out}`); }
      try { const result=await streamTurn(apiKey,model,arm,c.context,messages);
        run.rows.push({caseId:c.id,arm,turn,user,history:[...messages],...result}); messages.push({role:"assistant",content:result.text}); persist(out,run);
        console.log(`${c.id} ${arm} t${turn+1}: first ${result.firstTextMs}ms, proxy ${result.firstUsefulProxyMs}ms, full ${result.fullMs}ms, $${result.estimatedUsd?.toFixed(4)??"?"}`);
      } catch(error) { const code=error instanceof Error?error.message:"UNKNOWN"; run.errors.push({caseId:c.id,arm,turn,code}); persist(out,run); throw new Error(`${code}; partial run ${out}`); }
    }
  }
  run.finishedAt=new Date().toISOString();persist(out,run);
  console.log(`Complete. Blind sheet: ${join(out,"blind-owner-review.md")}`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Unknown error");process.exitCode=1;});
