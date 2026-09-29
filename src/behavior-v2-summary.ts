import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out=resolve(process.argv[2]??"");
if(!process.argv[2]) throw new Error("Pass a completed run directory");
const run=JSON.parse(readFileSync(join(out,"results.json"),"utf8"));
const expected=run.cases.reduce((n:number,c:any)=>n+3*(c.followUp?2:1),0);
if(!run.finishedAt||run.errors.length||run.rows.length!==expected) throw new Error("Comparison incomplete");
function metric(values:number[]) { const a=[...values].sort((x,y)=>x-y); return {count:a.length,median:a[Math.floor((a.length-1)/2)]??null,p95:a[Math.ceil(a.length*.95)-1]??null}; }
const arms=["foundation","deployed-v1","candidate-v2"];
const stats=Object.fromEntries(arms.map(arm=>{const rows=run.rows.filter((r:any)=>r.arm===arm);
  return [arm,{turns:rows.length,firstTextMs:metric(rows.map((r:any)=>r.firstTextMs).filter(Number.isFinite)),
    firstUsefulProxyMs:metric(rows.map((r:any)=>r.firstUsefulProxyMs).filter(Number.isFinite)),
    fullMs:metric(rows.map((r:any)=>r.fullMs)),inputTokens:rows.reduce((n:number,r:any)=>n+r.inputTokens,0),
    outputTokens:rows.reduce((n:number,r:any)=>n+r.outputTokens,0),reasoningTokens:rows.reduce((n:number,r:any)=>n+r.reasoningTokens,0),
    estimatedUsd:Math.round(rows.reduce((n:number,r:any)=>n+r.estimatedUsd,0)*10000)/10000,
    retries:rows.reduce((n:number,r:any)=>n+r.retryCount,0)}];}));
const summary={runId:run.id,model:run.model,effort:run.effort,maxOutputTokens:run.maxOutputTokens,
  behaviorVersions:run.versions,contextVersion:run.contextVersion,priceCheckedAt:run.priceCheckedAt,
  cases:run.cases.length,expectedTurns:expected,completedTurns:run.rows.length,errors:run.errors,
  byArm:stats,caveats:["FirstUsefulProxyMs is the server-side >=50-character/punctuation heuristic; it is not semantic or browser-rendered.",
    "Decision-useful rendered time requires browser replay with a human-selected earliest useful prefix; replay is not direct Live Lab latency.",
    "Cost uses a dated price card, not an invoice. Retries without returned usage may add unobserved cost.",
    "One sample per case/arm cannot establish a population latency or quality effect. Human owner blind review is pending."]};
writeFileSync(join(out,"technical-summary.json"),JSON.stringify(summary,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(summary,null,2));
