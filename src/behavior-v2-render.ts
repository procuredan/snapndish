import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out=resolve(process.argv[2]??"");
if(!process.argv[2]) throw new Error("Pass a completed run directory");
const run=JSON.parse(readFileSync(join(out,"results.json"),"utf8"));
if(!run.finishedAt||run.errors.length) throw new Error("Run must be complete before browser replay");
const key=JSON.parse(readFileSync(join(out,"private-blinding-key.json"),"utf8"));
const data=run.cases.map((c:any)=>({id:c.id,title:c.title,options:["1","2","3"].map(n=>({
  number:n,turns:run.rows.filter((r:any)=>r.caseId===c.id&&r.arm===key[c.id][n]).sort((a:any,b:any)=>a.turn-b.turn)
    .map((r:any)=>({user:r.user,text:r.text,chunks:r.chunks,firstTextMs:r.firstTextMs,firstUsefulProxyMs:r.firstUsefulProxyMs,fullMs:r.fullMs}))
}))}));
const safe=JSON.stringify(data).replace(/</g,"\\u003c");
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Stage 1A v2 rendered latency review</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#222}select,button,input{font:inherit;margin:.3rem}#screen{white-space:pre-wrap;border:1px solid #aaa;border-radius:8px;min-height:10rem;padding:1rem;margin:1rem 0}#prefix{white-space:pre-wrap;background:#f3f3f3;padding:1rem;min-height:5rem}small{color:#555}label{display:inline-block;margin-right:1rem}</style>
<h1>Rendered decision-useful timing review</h1><p>This local replay preserves the recorded stream timing. Choose the <em>earliest</em> visible prefix that actually helps the next decision or action. The old “first useful” value is a server-side punctuation proxy. Browser timing here is replay evidence, not a live deployment measurement.</p>
<label>Scenario <select id="case"></select></label><label>Anonymous arm <select id="option"><option>1</option><option>2</option><option>3</option></select></label><label>Turn <select id="turn"></select></label><button id="play">Replay stream</button>
<p id="user"></p><div id="screen" aria-live="polite"></div><p id="status"></p>
<label>Earliest decision-useful prefix <input id="cut" type="range" min="0" max="0" value="0"></label><span id="cutInfo"></span><div id="prefix"></div>
<label>Find meaningful phrase <input id="phrase" type="text" size="45"></label><button id="find">Find earliest containing prefix</button>
<button id="mark">Save this cutoff</button><button id="export">Export annotations</button><pre id="saved"></pre>
<script>const data=${safe}; const byId=id=>document.getElementById(id); let active,paint=[],started=0,timers=[];
const annotations=JSON.parse(localStorage.getItem('stage1a-v2-render-annotations')||'{}');
for(const c of data){const o=document.createElement('option');o.value=c.id;o.textContent=c.title;byId('case').append(o)}
function chosen(){const c=data.find(c=>c.id===byId('case').value);return c.options[Number(byId('option').value)-1]}
function updateTurn(){const turns=chosen().turns;byId('turn').replaceChildren(...turns.map((_,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=String(i+1);return o}));update()}
function update(){active=chosen().turns[Number(byId('turn').value)];byId('user').textContent='User: '+active.user;byId('screen').textContent='';byId('cut').max=String(Math.max(0,active.chunks.length-1));byId('cut').value='0';paint=[];showPrefix();saved()}
function showPrefix(){const i=Number(byId('cut').value);byId('prefix').textContent=active.chunks.slice(0,i+1).map(c=>c.text).join('');byId('cutInfo').textContent='Chunk '+(i+1)+'/'+active.chunks.length+', provider arrival '+active.chunks[i]?.atMs+' ms, browser paint '+(paint[i]??'not replayed')+' ms'}
function saved(){byId('saved').textContent='Saved cutoffs: '+Object.keys(annotations).length}
byId('case').onchange=updateTurn;byId('option').onchange=updateTurn;byId('turn').onchange=update;byId('cut').oninput=showPrefix;
byId('find').onclick=()=>{const phrase=byId('phrase').value.trim();if(!phrase)return;let prefix='';for(let i=0;i<active.chunks.length;i++){prefix+=active.chunks[i].text;if(prefix.toLowerCase().includes(phrase.toLowerCase())){byId('cut').value=String(i);showPrefix();return}}alert('Phrase not found')};
byId('play').onclick=()=>{for(const t of timers)clearTimeout(t);timers=[];paint=[];byId('screen').textContent='';byId('status').textContent='Replaying…';const chunks=active.chunks;started=performance.now();
  chunks.forEach((chunk,i)=>{timers.push(setTimeout(()=>{byId('screen').textContent+=chunk.text;requestAnimationFrame(()=>requestAnimationFrame(()=>{paint[i]=Math.round(performance.now()-started);if(i===chunks.length-1)byId('status').textContent='Replay complete. Select the earliest useful prefix.';showPrefix()}))},chunk.atMs))});};
byId('mark').onclick=()=>{const i=Number(byId('cut').value);if(paint[i]===undefined){alert('Replay this turn first');return}const key=byId('case').value+':'+byId('option').value+':'+byId('turn').value;
  annotations[key]={caseId:byId('case').value,option:Number(byId('option').value),turn:Number(byId('turn').value),chunkIndex:i,sourceChunkAtMs:active.chunks[i].atMs,paintedAtMs:paint[i],firstTextMs:active.firstTextMs,firstUsefulProxyMs:active.firstUsefulProxyMs,fullMs:active.fullMs,prefix:byId('prefix').textContent.slice(0,500)};
  localStorage.setItem('stage1a-v2-render-annotations',JSON.stringify(annotations));saved()};
byId('export').onclick=()=>{const blob=new Blob([JSON.stringify(annotations,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='render-annotations.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
updateTurn();</script></html>`;
writeFileSync(join(out,"rendered-latency-review.html"),html,{mode:0o600});
console.log(join(out,"rendered-latency-review.html"));
