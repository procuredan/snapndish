const STYLE = `<style nonce="__NONCE__">
  :root{font-family:system-ui,-apple-system,sans-serif;color:#1f2b24;background:#f6f7f3}*{box-sizing:border-box}
  body{margin:0}header{background:#fff;border-bottom:1px solid #d8ded7;padding:14px max(18px,calc((100vw - 900px)/2));display:flex;justify-content:space-between;align-items:center}
  h1{font-size:1.25rem;margin:0}a{color:#235b42}main{max-width:900px;margin:0 auto;padding:16px}button{border:0;border-radius:8px;background:#256747;color:white;padding:10px 16px;cursor:pointer;font:inherit}
  button:disabled{opacity:.5;cursor:default}textarea,input,select{font:inherit;border:1px solid #adbdb1;border-radius:8px;padding:10px;background:white}textarea,input{width:100%}
  #messages{min-height:55vh;display:flex;flex-direction:column;gap:12px;padding:14px 0}body.cooking #messages{min-height:0}.msg{white-space:pre-wrap;line-height:1.5;padding:14px 16px;border-radius:12px;max-width:86%}.user{align-self:flex-end;background:#dceee2}.snap{align-self:flex-start;background:white;border:1px solid #d8ded7}
  .feedback{display:flex;gap:6px;margin-top:10px;white-space:normal}.feedback button{background:transparent;color:#596b60;border:1px solid #d8ded7;padding:5px 9px;font-size:.76rem}.feedback button[aria-pressed="true"]{background:#e5f2e9;color:#205c3e;border-color:#8ebda0}
  #chat{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;position:sticky;bottom:0;background:#f6f7f3;padding:8px 0 16px}#chat textarea{flex:1 1 260px;min-width:0;min-height:52px;max-height:150px;resize:vertical}#chat button{white-space:nowrap}#photo-tools{max-width:170px}#photo-tools input{max-width:170px}#status{font-size:.85rem;color:#56665c;min-height:1.4em}
  details{background:#fff;border:1px solid #d8ded7;border-radius:10px;padding:10px;margin-bottom:8px}summary{cursor:pointer}#context{min-height:70px;margin:8px 0}
  #review-list button{display:block;margin:8px 0;background:#e7eee8;color:#1f2b24;text-align:left;width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;border:1px solid #d8ded7;border-radius:10px;padding:14px;line-height:1.45}
  #shopping{background:#fff;border:1px solid #cbd8cf;border-radius:12px;padding:18px;margin:12px 0 20px}#shopping h2{font-size:1.12rem;margin:0 0 5px}#shopping .shopping-note{font-size:.84rem;color:#56665c;margin:0 0 12px}#shopping h3{font-size:.83rem;text-transform:uppercase;letter-spacing:.08em;color:#456050;margin:18px 0 6px}#shopping label{display:flex;align-items:flex-start;gap:9px;padding:5px 0;line-height:1.3}#shopping input{width:auto;margin:3px 0 0;accent-color:#256747}#shopping .assumed{font-size:.78rem;color:#6b6f4b;margin-left:5px}
  .msg.current-action{border-color:#6ca884;box-shadow:0 0 0 2px #dceee2}#now[hidden],#plan-details[hidden],#recipe[hidden]{display:none}#now{background:#e7f2e9;border:1px solid #8ebda0;border-radius:12px;padding:16px;margin:8px 0 14px;line-height:1.5}#now h2{font-size:.88rem;letter-spacing:.08em;margin:0 0 7px;color:#235b42}#now-text{white-space:pre-wrap}#ask-snap{font-size:.82rem;font-weight:700;letter-spacing:.08em;color:#456050;margin:10px 0 0}#plan-details summary{font-weight:600}#plan-details #shopping{margin-bottom:8px}#recipe{background:#fff;border:1px solid #cbd8cf;border-radius:12px;padding:18px;margin:12px 0 20px}#recipe h2{font-size:1.12rem;margin:0 0 5px}#full-plan,#remaining-components{padding:0 10px 8px}#full-plan h2{font-size:1rem}#full-plan h3,#remaining-components h3{font-size:.9rem;margin:12px 0 4px}#full-plan p{white-space:pre-wrap;line-height:1.45;margin:0 0 10px}#remaining-components ul{margin:6px 0;padding-left:22px}
  #dashboard{padding:18px 0 26px}#dashboard .eyebrow{font-size:.72rem;letter-spacing:.16em;font-weight:700;color:#55735c;margin:0 0 6px}#dashboard h2{font-size:clamp(1.8rem,6vw,3rem);line-height:1.1;margin:0 0 16px}#dashboard h3{margin:0 0 12px;font-size:1.12rem}#dashboard .dish-actions{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:22px}#dashboard .dish-actions button{flex:1 1 120px;min-height:48px}#dashboard nav{display:flex;gap:8px;overflow-x:auto;padding:0 0 14px}#dashboard nav a{white-space:nowrap;border-radius:999px;padding:8px 12px;background:#e8eee8;text-decoration:none;color:#234a34;font-size:.86rem}#dashboard .primary-cards{display:grid;grid-template-columns:1fr;gap:14px}#dashboard .dash-panel{background:#fff;border:1px solid #d8ded7;border-radius:16px;padding:18px;scroll-margin-top:18px}#dashboard .dash-panel.primary{background:#f0f5ed;border-color:#c8d9ca}#dashboard .dash-secondary{display:grid;gap:14px;margin-top:14px}#dashboard .empty{color:#5d6b61;line-height:1.45;margin:0}#dashboard .recipe-card{display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #d8ded7}#dashboard .recipe-card:first-child{border-top:0}#dashboard .recipe-card-main{flex:1;min-width:0}#dashboard .recipe-card strong{display:block;line-height:1.25}#dashboard .recipe-card small{display:block;color:#617066;margin-top:4px}#dashboard .recipe-card button,#dashboard .shopping-link{font-size:.82rem;padding:8px 11px;white-space:nowrap}#dashboard .image-fallback{width:72px;height:72px;flex:0 0 72px;border-radius:12px;background:radial-gradient(circle at center,#fff 0 25%,#cfe0cf 26% 41%,#e7eee2 42% 100%);border:1px solid #cbdac9;display:grid;place-items:center;color:#4d7254;font-size:1.3rem}#dashboard dialog{max-width:min(92vw,700px);border:1px solid #cbd8cf;border-radius:16px;padding:22px;box-shadow:0 18px 60px #1f2b2444}#dashboard dialog::backdrop{background:#142119aa}#dashboard dialog h3{font-size:1.5rem}#dashboard dialog h4{margin:18px 0 5px}#dashboard dialog p{white-space:pre-wrap;line-height:1.5}#dashboard .detail-meta{color:#5d6b61}#dashboard .detail-close{float:right}body:has(#dashboard) #messages{min-height:20vh}
  @media(min-width:700px){#dashboard .primary-cards{grid-template-columns:1fr 1fr}#dashboard .dash-secondary{grid-template-columns:repeat(3,1fr)}#dashboard .dish-actions{max-width:520px}}
</style>`;

const LOGIN = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__APP_TITLE__</title>__STYLE__</head>
<body><header><h1>Snap n Dish · owner review</h1></header><main><h2>Review access</h2><p>__REVIEW_LOGIN_DESCRIPTION__</p><form id="login"><input id="code" type="password" autocomplete="off" aria-label="Review access code" required><p><button>Open review</button></p></form><p id="status" role="status"></p></main>
<script nonce="__NONCE__">document.getElementById('login').addEventListener('submit',async function(e){e.preventDefault();const s=document.getElementById('status');s.textContent='Checking…';const r=await fetch('/api/review/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:document.getElementById('code').value})});if(r.ok)location.href='/review';else s.textContent='Review code not accepted.'});</script></body></html>`;

const DASHBOARD = String.raw`<section id="dashboard" aria-label="Home dashboard">
  <p class="eyebrow">YOUR KITCHEN</p><h2>What are we dishing?</h2>
  <div class="dish-actions" aria-label="Ask Snap"><button id="dash-snap" type="button">Snap It</button><button id="dash-write" type="button">Write It</button><button id="dash-talk" type="button">Talk It</button></div>
  <nav aria-label="Dashboard sections"><a href="#dash-today">Today’s Cooks</a><a href="#dash-shopping">Shopping List</a><a href="#dash-future">Future Cooks</a><a href="#dash-history">Previously Cooked</a><a href="#dash-favorites">Favorites</a></nav>
  <div class="primary-cards"><section id="dash-today" class="dash-panel primary"><h3>Today’s Cooks</h3><div id="dash-today-list"><p class="empty">No cooks selected today. Ask Snap what to make.</p></div></section>
  <section id="dash-shopping" class="dash-panel primary"><h3>Shopping List</h3><div id="dash-shopping-list"><p class="empty">Choose a meal to see its Shopping list.</p></div></section></div>
  <div class="dash-secondary"><section id="dash-future" class="dash-panel"><h3>Future Cooks</h3><div id="dash-future-list"><p class="empty">No recipes saved for later yet.</p></div></section>
  <section id="dash-history" class="dash-panel"><h3>Previously Cooked</h3><div id="dash-history-list"><p class="empty">Accepted recipes will appear here. Cooking is not assumed.</p></div></section>
  <section id="dash-favorites" class="dash-panel"><h3>Favorites</h3><div id="dash-favorites-list"><p class="empty">No Favorites saved yet.</p></div></section></div>
  <dialog id="dash-recipe-dialog" aria-label="Saved recipe"><button id="dash-detail-close" class="detail-close" type="button">Close</button><div id="dash-recipe-detail"></div></dialog>
</section>`;

const CHAT = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__APP_TITLE__</title>__STYLE__</head>
<body data-stage1b="__STAGE1B__" data-next-flow="__NEXT_FLOW__" data-meal-package="__MEAL_PACKAGE__"><header><h1>Snap n Dish</h1></header><main><details><summary>Start a new conversation or add context</summary><label for="context">What should Snap know about your kitchen, tastes, or household? Optional and editable only by starting a new session.</label><textarea id="context" maxlength="2000" placeholder="For example: two people, a grill and skillet..."></textarea><button id="new">New conversation</button><div id="pair-tools" hidden><p><button id="pair" type="button">Continue on another device</button></p><label for="pair-link">Open this private, one-use link on your other device within 10 minutes:</label><input id="pair-link" readonly></div><div id="return-tools" hidden><p>Bring me back to this conversation:</p><select id="return-minutes" aria-label="Reminder delay">__REMINDER_TEST_OPTION__<option value="5">In 5 minutes</option><option value="15">In 15 minutes</option></select><button id="remind" type="button">Remind me</button></div></details><div id="messages" aria-live="polite"></div><section id="now" aria-label="Now" hidden><h2>NOW</h2><div id="now-text"></div></section><details id="plan-details" hidden open><summary id="plan-summary">Shopping list</summary><div id="legacy-plan-slot"></div><section id="shopping" aria-label="Shopping list" hidden></section><div id="remaining-components" hidden></div></details><section id="recipe" aria-label="Cooking plan" hidden><h2>Complete cooking plan</h2><div id="recipe-plan-slot"></div></section><p id="status" role="status"></p><button id="recover-talk" type="button" hidden>End interrupted Talk It</button><button id="retry" type="button" hidden>Retry Snap’s reply</button><p id="ask-snap" hidden>ASK SNAP</p><form id="chat"><textarea id="input" maxlength="4000" placeholder="What are we making?" aria-label="Message to Snap"></textarea><span id="photo-tools" hidden><label for="photo">Photo</label><input id="photo" type="file" accept="image/*" capture="environment"></span><button id="talk" type="button" hidden>Talk It</button><button id="send">Send</button></form><audio id="snap-audio" autoplay></audio></main>
<script nonce="__NONCE__">
let session=null,generation=0,pendingReader=null,pollTimer=null,voice=null;const messages=document.getElementById('messages'),shopping=document.getElementById('shopping'),nowPanel=document.getElementById('now'),nowText=document.getElementById('now-text'),askSnap=document.getElementById('ask-snap'),recipe=document.getElementById('recipe'),fullPlan=document.createElement('div'),planDetails=document.getElementById('plan-details'),planSummary=document.getElementById('plan-summary'),remainingComponents=document.getElementById('remaining-components'),status=document.getElementById('status'),input=document.getElementById('input'),send=document.getElementById('send'),retry=document.getElementById('retry'),stage1b=document.body.dataset.stage1b==='true',nextFlow=document.body.dataset.nextFlow==='true',mealPackage=document.body.dataset.mealPackage==='true',photo=document.getElementById('photo'),talk=document.getElementById('talk'),snapAudio=document.getElementById('snap-audio');fullPlan.id='full-plan';const pendingKey='sndlab-pending';if(stage1b){document.getElementById('pair-tools').hidden=false;document.getElementById('return-tools').hidden=false;document.getElementById('photo-tools').hidden=false;talk.hidden=false}
function pending(){try{return JSON.parse(localStorage.getItem(pendingKey))}catch{return null}}
function clearPending(){localStorage.removeItem(pendingKey);retry.hidden=true;if(pollTimer)clearTimeout(pollTimer)}
function displayText(text){return text.replace(/\*\*/g,'').replace(/^#{1,6}\s+/gm,'').replace(/^[-*]\s+/gm,'• ')}
function bubble(role,text,turn){const e=document.createElement('div');e.className='msg '+role;if(role==='snap'&&turn?.id===session?.cooking_progress?.current_action_turn_id)e.classList.add('current-action');const body=document.createElement('div');body.textContent=role==='snap'?displayText(text||''):(text||((role==='user'&&turn?.image_id)?'Photo':''));e.appendChild(body);if(role==='user'&&turn?.image_id&&stage1b){const img=document.createElement('img');img.src='/api/sessions/'+encodeURIComponent(session.id)+'/images/'+encodeURIComponent(turn.image_id);img.alt='Photo shared with Snap';img.style.maxWidth='min(260px,70vw)';img.style.display='block';img.style.marginTop='8px';e.appendChild(img)}
if(role==='snap'&&turn?.id){const controls=document.createElement('div');controls.className='feedback';const buttons=[];const feedbackSessionId=session.id;
for(const [rating,label] of [['good','Good'],['missed_it','Missed It']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label','Mark this Snap reply '+label);b.setAttribute('aria-pressed',String(turn.feedback===rating));buttons.push(b);controls.appendChild(b);
b.onclick=async()=>{for(const x of buttons)x.disabled=true;try{const r=await fetch('/api/sessions/'+encodeURIComponent(feedbackSessionId)+'/turns/'+encodeURIComponent(turn.id)+'/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating})});if(!r.ok)throw Error('feedback failed');turn.feedback=rating;for(const x of buttons)x.setAttribute('aria-pressed',String(x===b));if(session?.id===feedbackSessionId)status.textContent='Feedback saved.'}catch{if(session?.id===feedbackSessionId)status.textContent='Could not save feedback. Please try again.'}finally{for(const x of buttons)x.disabled=false}}}
if(stage1b&&!nextFlow){const save=document.createElement('button');save.type='button';save.textContent=session.meal_source_turn_id===turn.id?'Active meal':'Use this meal';save.disabled=session.meal_source_turn_id===turn.id;controls.appendChild(save);save.onclick=async()=>{if(voice||session.active_voice_id){status.textContent='End Talk It before changing the active meal.';return}const myGeneration=generation,expectedMealRevision=session.meal_revision,expectedRevision=session.revision;save.disabled=true;try{const r=await fetch('/api/sessions/'+encodeURIComponent(feedbackSessionId)+'/meal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assistantTurnId:turn.id,expectedMealRevision,expectedRevision})});if(!r.ok)throw Error('save failed');if(myGeneration===generation&&session?.id===feedbackSessionId){await load(feedbackSessionId,myGeneration);status.textContent='Meal saved.'}}catch{if(myGeneration===generation&&session?.id===feedbackSessionId){status.textContent='Could not save that meal. Refresh and try again.';save.disabled=false}}}}
e.appendChild(controls)}messages.appendChild(e);e.scrollIntoView({block:'end'});return body}
function renderShopping(){shopping.replaceChildren();const plan=session?.meal_plan;shopping.hidden=!plan;planDetails.hidden=!plan;if(!plan)return;const heading=document.createElement('h2');heading.textContent='Shopping for '+plan.meal;shopping.appendChild(heading);const note=document.createElement('p');note.className='shopping-note';note.textContent='Checked = you have it. Unchecked = buy it. Assumed staples can be changed.';shopping.appendChild(note);for(const section of plan.sections){const title=document.createElement('h3');title.textContent=section.section;shopping.appendChild(title);for(const item of section.items){const label=document.createElement('label'),box=document.createElement('input'),description=document.createElement('span');box.type='checkbox';box.checked=item.checked;box.setAttribute('aria-label',item.name+' — '+item.quantity);description.textContent=item.name+' — '+item.quantity;label.append(box,description);if(item.have_status==='assumed'){const assumed=document.createElement('span');assumed.className='assumed';assumed.textContent='assumed';label.appendChild(assumed)}if(item.quantity_changed){const changed=document.createElement('span');changed.className='assumed';changed.textContent='quantity changed · check what you have';label.appendChild(changed)}box.onchange=async()=>{box.disabled=true;const id=session.id,expected=session.shopping_revision,wanted=box.checked;try{const r=await fetch('/api/sessions/'+encodeURIComponent(id)+'/shopping/'+encodeURIComponent(item.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedShoppingRevision:expected,checked:wanted})});if(!r.ok)throw Error('shopping update failed');const result=await r.json();if(session?.id===id){session.shopping_revision=result.shoppingRevision;session.meal_plan=result.mealPlan;syncVoiceState(voice);renderShopping()}}catch{if(session?.id===id){await load(id,generation);status.textContent='Shopping list changed elsewhere or could not save. Please try again.'}}};shopping.appendChild(label)}}}
function renderMore(){
  const cooking=session?.cooking_progress,plan=session?.meal_plan,mode=cooking?'cooking':'shopping';
  document.body.classList.toggle('cooking',Boolean(cooking));
  if(planDetails.dataset.mode!==mode){planDetails.open=mealPackage?!cooking:true;planDetails.dataset.mode=mode}
  planSummary.textContent=cooking?(mealPackage?'MORE · Shopping and meal':'MORE · Full Plan, meal, ingredients'):'Shopping list';
  nowPanel.hidden=!cooking;askSnap.hidden=!cooking;nowText.textContent=cooking?.current_action||'';
  const sections=mealPackage?(cooking?.full_plan||plan?.full_plan):cooking?.full_plan;
  const slot=document.getElementById(mealPackage?'recipe-plan-slot':'legacy-plan-slot');slot.appendChild(fullPlan);
  recipe.hidden=!mealPackage||!sections?.length;
  fullPlan.replaceChildren();fullPlan.hidden=!sections?.length;
  if(sections?.length){
    if(!mealPackage){const heading=document.createElement('h2');heading.textContent='Full cooking plan';fullPlan.appendChild(heading)}
    for(const section of sections){const title=document.createElement('h3'),directions=document.createElement('p');title.textContent=section.title;directions.textContent=section.directions;fullPlan.append(title,directions)}
  }
  remainingComponents.replaceChildren();remainingComponents.hidden=!cooking||Boolean(sections?.length);
  const parts=cooking?.remaining_components||[];
  if(parts.length&&!sections?.length){const heading=document.createElement('h3');heading.textContent='Still to make';remainingComponents.appendChild(heading);const list=document.createElement('ul');for(const part of parts){const item=document.createElement('li');item.textContent=part;list.appendChild(item)}remainingComponents.appendChild(list)}
}
function render(){messages.replaceChildren();if(!session){renderShopping();renderMore();if(dashboardEnabled)queueMicrotask(refreshDashboard);return}for(const t of session.turns)bubble(t.role==='user'?'user':'snap',t.text,t);renderShopping();renderMore();if(dashboardEnabled)queueMicrotask(refreshDashboard);if(session.cooking_progress&&!mealPackage)nowPanel.scrollIntoView({block:'nearest'})}
function syncVoiceState(v){if(!v||!session||v.sessionId!==session.id||!v.baseInstructions||v.dc?.readyState!=='open')return;const cooking=session.cooking_progress;const latest='\n\nLatest application-accepted state supersedes any older state above. Meal revision '+session.meal_revision+', shopping revision '+session.shopping_revision+', cooking revision '+session.cooking_revision+'. Meal, Shopping and full recipe: '+JSON.stringify(session.meal_plan)+'. Cooking guidance and customer reports: '+JSON.stringify(cooking);const forceTool=Boolean(v.behaviorVersion?.startsWith('stage1b-cooking-v1')&&cooking);const toolChoice=forceTool?'required':'auto';v.dc.send(JSON.stringify({type:'session.update',session:{type:'realtime',instructions:(cooking&&v.cookingInstructions?v.cookingInstructions:v.baseInstructions)+latest,tool_choice:toolChoice}}))}
async function load(id,expectedGeneration=generation){const r=await fetch('/api/sessions/'+encodeURIComponent(id));if(expectedGeneration!==generation)return;if(!r.ok){localStorage.removeItem('sndlab-session');session=null;status.textContent='Start by telling Snap what you want to make.';return}const loaded=await r.json();if(expectedGeneration!==generation)return;const priorPlanRevision=session?.id===id?session.meal_revision:null;session=loaded;localStorage.setItem('sndlab-session',id);if(loaded.meal_plan&&loaded.meal_revision!==priorPlanRevision)planDetails.open=true;render();if(loaded.meal_plan&&loaded.meal_revision!==priorPlanRevision)shopping.scrollIntoView({block:'start'});const interrupted=stage1b&&loaded.active_voice_id&&!voice;document.getElementById('recover-talk').hidden=!interrupted;status.textContent=interrupted?'Talk It was interrupted. End it here to continue.':'Ready';resumePending()}
function recordVisibleMetric(kind,turnId,started){if(!stage1b||!session||!turnId||!Number.isFinite(started))return;const id=session.id,revision=['shopping_visible','full_plan_visible','meal_speech_delta_proxy'].includes(kind)?session.meal_revision:session.cooking_revision;requestAnimationFrame(()=>{if(session?.id!==id)return;const visible=kind==='shopping_visible'?!shopping.hidden&&!planDetails.hidden&&planDetails.open:kind==='full_plan_visible'?!recipe.hidden&&Boolean(fullPlan.textContent.trim()):kind==='now_visible'?!nowPanel.hidden&&Boolean(nowText.textContent.trim()):true;if(!visible)return;const elapsedMs=Math.max(0,Math.round(performance.now()-started));fetch('/api/sessions/'+encodeURIComponent(id)+'/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceTurnId:turnId,kind,revision,elapsedMs})}).catch(()=>{})})}
async function create(){if(voice)await endVoice('new_conversation');const myGeneration=++generation;clearPending();if(pendingReader){pendingReader.cancel().catch(()=>{});pendingReader=null}const r=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context:document.getElementById('context').value})});if(myGeneration!==generation)return;if(!r.ok){status.textContent='Could not create conversation.';return}const x=await r.json();await load(x.id,myGeneration);document.querySelector('details').open=false;input.focus()}
document.getElementById('new').onclick=create;
if(stage1b){document.getElementById('pair').onclick=async()=>{if(!session)return;const r=await fetch('/api/pair/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:session.id})});if(!r.ok){status.textContent='Could not prepare device link.';return}const x=await r.json();const link=location.origin+'/?pair='+encodeURIComponent(x.code);document.getElementById('pair-link').value=link;document.getElementById('pair-link').select();status.textContent='Private device link is ready.'};const pairCode=new URL(location.href).searchParams.get('pair');if(pairCode){history.replaceState(null,'','/');fetch('/api/pair/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:pairCode})}).then(async r=>{if(!r.ok)throw Error('pair failed');const x=await r.json();generation++;await load(x.sessionId,generation)}).catch(()=>status.textContent='Device link expired or already used. Make a new link on the first device.')}}
async function resumePending(){const p=pending();if(!p||!session||p.sessionId!==session.id)return;const myGeneration=generation;try{const r=await fetch('/api/sessions/'+encodeURIComponent(p.sessionId)+'/turns/'+encodeURIComponent(p.turnId));if(myGeneration!==generation||session?.id!==p.sessionId)return;const x=await r.json();if(x.status==='accepted'){clearPending();await load(p.sessionId,myGeneration)}else if(x.status==='pending'){status.textContent='Snap is finishing your last reply…';pollTimer=setTimeout(resumePending,1500)}else{status.textContent=x.status==='error'?'Snap could not finish your last reply.':'The last request was interrupted.';retry.hidden=false}}catch{status.textContent='Could not check the last reply. Retry when connected.';retry.hidden=false}}
async function sendTurn(p){const {sessionId,turnId,text,expectedRevision,imageId}=p,myGeneration=generation,started=performance.now(),beforeMeal=session?.meal_revision,beforeCooking=session?.cooking_revision;send.disabled=true;retry.hidden=true;status.textContent='Snap is thinking…';try{const r=await fetch('/api/sessions/'+encodeURIComponent(sessionId)+'/turns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,turnId,expectedRevision,imageId})});if(myGeneration!==generation||session?.id!==sessionId)return;if(r.status===409){clearPending();status.textContent='This conversation changed elsewhere. Refreshing…';await load(sessionId,myGeneration);return}if(!r.ok||!r.body){status.textContent='Could not send. Retry when connected.';retry.hidden=false;return}if(r.headers.get('Content-Type')?.includes('application/json')){await resumePending();return}
const reader=r.body.getReader(),decoder=new TextDecoder();pendingReader=reader;let buf='',answer=null,answerRaw='',accepted=false,completed=false,stale=false,proposalStale=false;while(true){const x=await reader.read();if(x.done||myGeneration!==generation||session?.id!==sessionId)break;buf+=decoder.decode(x.value,{stream:true});buf=buf.replace(/\r\n/g,'\n');let i;while((i=buf.indexOf('\n\n'))>=0){const frame=buf.slice(0,i);buf=buf.slice(i+2);const line=frame.split('\n').find(v=>v.startsWith('data: '));if(!line)continue;const v=JSON.parse(line.slice(6));if(v.type==='accepted'){accepted=true;session.revision=v.revision;bubble('user',text,{image_id:imageId});answer=bubble('snap','');status.textContent='Snap is responding…'}else if(v.type==='delta'&&answer){answerRaw+=v.text;answer.textContent=displayText(answerRaw);answer.scrollIntoView({block:'end'})}else if(v.type==='complete'){completed=true;proposalStale=Boolean(v.proposalStale);status.textContent='Ready'}else if(v.type==='stale'){stale=true;clearPending();status.textContent='A newer message superseded this reply.'}else if(v.type==='error'){status.textContent='Snap could not finish. Retry the reply.';retry.hidden=false}}}
if(myGeneration===generation&&session?.id===sessionId){if(completed)clearPending();if(accepted||stale){await load(sessionId,myGeneration);if(completed&&!stale){if(session?.meal_revision!==beforeMeal&&session?.meal_plan){recordVisibleMetric('shopping_visible',turnId,started);if(mealPackage)recordVisibleMetric('full_plan_visible',turnId,started)}if(session?.cooking_revision!==beforeCooking&&session?.cooking_progress)recordVisibleMetric('now_visible',turnId,started)}if(proposalStale)status.textContent='Your meal or shopping changed while Snap planned. Your latest choices were kept; ask Snap to continue from here.';if(stale)status.textContent='A newer message superseded this reply.'}else await resumePending()}
}catch{if(myGeneration===generation&&session?.id===sessionId){status.textContent='Connection interrupted. Checking the saved turn…';await resumePending()}}finally{if(myGeneration===generation){pendingReader=null;send.disabled=false}}}
document.getElementById('chat').addEventListener('submit',async function(e){e.preventDefault();if(!session){await create();if(!session)return}const text=input.value.trim(),file=stage1b?photo.files[0]:null;if(!text&&!file)return;const sessionId=session.id,myGeneration=generation;send.disabled=true;let imageId;try{if(file){if(file.size>10_000_000)throw Error('Photo is too large.');status.textContent='Preparing photo…';const bitmap=await createImageBitmap(file);const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));if(!blob||blob.size>2_000_000)throw Error('Photo is too large after resizing.');if(myGeneration!==generation||session?.id!==sessionId)return;const uploaded=await fetch('/api/sessions/'+encodeURIComponent(sessionId)+'/images',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});if(!uploaded.ok)throw Error('Photo upload failed.');imageId=(await uploaded.json()).imageId}if(myGeneration!==generation||session?.id!==sessionId)return;const p={sessionId,turnId:crypto.randomUUID(),text,imageId,expectedRevision:session.revision};localStorage.setItem(pendingKey,JSON.stringify(p));input.value='';photo.value='';await sendTurn(p)}catch(error){if(myGeneration===generation&&session?.id===sessionId)status.textContent=error.message||'Could not attach photo.'}finally{if(myGeneration===generation)send.disabled=false}});
retry.onclick=()=>{const p=pending();if(p&&session?.id===p.sessionId)sendTurn(p)};
function voicePost(v,payload){return fetch('/api/sessions/'+encodeURIComponent(v.sessionId)+'/voice/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceSessionId:v.id,...payload})}).then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.error||'Voice transcript could not be saved');return result})}
function voiceQueue(v,operation){v.work=v.work.then(operation).catch(error=>{v.syncFailed=true;v.failureCode=/^[A-Z_0-9]{3,64}$/.test(error?.message||'')?error.message:'VOICE_SYNC_ERROR';if(voice===v){status.textContent=error.message||'Voice sync failed. End Talk and try again.';queueMicrotask(()=>{if(voice===v)endVoice()})}})}
function voiceOwnedVersion(v){return v.behaviorVersion?.startsWith('stage1b-cooking-v2')||v.behaviorVersion?.startsWith('stage1b-meal-package-')}
function drainVoice(v){
  if(voiceOwnedVersion(v))return drainVoiceV2(v);
  return drainVoiceLegacy(v);
}
function voiceContext(v,itemId){
  if([...v.completedOutputs].some(id=>!v.contextOrder.includes(id)))return null;
  const allowed=new Set([...v.acceptedUsers.keys(),...v.completedOutputs,...v.toolOutputs]);
  const ids=v.contextOrder.filter(id=>allowed.has(id));
  if(!ids.includes(itemId)||ids.length>128)return null;
  return ids.map(id=>({type:'item_reference',id}));
}
function requestVoiceResponse(v,itemId,phase,options={}){
  if(v.closing||voice!==v||generation!==v.generation||v.activeRequest||v.processingResponse||v.toolPending||
    v.speechActive||v.inputJobs>0||v.inputCursor<v.committedInputs.length||v.dc?.readyState!=='open')return false;
  if(session?.revision!==v.acceptedUsers.get(itemId)?.revision){
    voiceDiagnostic(v,'input_skipped',{itemId,reason:'superseded'});return false;
  }
  const input=voiceContext(v,itemId);
  if(!input){
    if(v.contextOrder.includes(itemId)&&![...v.completedOutputs].some(id=>!v.contextOrder.includes(id))){
      voiceDiagnostic(v,'response_ownership_rejected',{itemId,reason:'missing'});endVoice('ownership_error')
    }
    return false;
  }
  const requestId='req_'+crypto.randomUUID().replaceAll('-','');
  const request={requestId,itemId,phase,responseId:null};
  v.requests.set(requestId,request);v.activeRequest=request;
  const response={conversation:'auto',input,
    metadata:{snap_request_id:requestId,snap_origin_item_id:itemId,snap_phase:phase},
    ...(options.tool_choice?{tool_choice:options.tool_choice}:{}),
    ...(options.instructions?{instructions:options.instructions}:{})};
  voiceDiagnostic(v,'response_requested',{itemId,requestId});
  try{v.dc.send(JSON.stringify({type:'response.create',event_id:requestId,response}))}
  catch{voiceOwnershipFailure(v,null,itemId,'failed');return false}
  return true;
}
function scheduleVoiceResponse(v){
  if(v.closing||voice!==v||generation!==v.generation||v.activeRequest||v.processingResponse||v.toolPending||v.pendingToolOutput||
    v.speechActive||v.inputJobs>0||v.inputCursor<v.committedInputs.length)return;
  while(v.pendingInputs.length){
    const itemId=v.pendingInputs[0];
    if(!v.acceptedUsers.has(itemId)){v.pendingInputs.shift();continue}
    if(session?.revision!==v.acceptedUsers.get(itemId)?.revision){v.pendingInputs.shift();voiceDiagnostic(v,'input_skipped',{itemId,reason:'superseded'});continue}
    if(v.pendingInputs.length>1){v.pendingInputs.shift();voiceDiagnostic(v,'input_skipped',{itemId,reason:'superseded'});continue}
    if(requestVoiceResponse(v,itemId,'input'))v.pendingInputs.shift();
    return;
  }
  if(v.readyContinuation){
    const continuation=v.readyContinuation;v.readyContinuation=null;
    if(session?.revision!==v.acceptedUsers.get(continuation.itemId)?.revision){
      voiceDiagnostic(v,'input_skipped',{itemId:continuation.itemId,reason:'superseded'});return;
    }
    if(!requestVoiceResponse(v,continuation.itemId,'continuation',
      {instructions:continuation.guidance,tool_choice:continuation.toolChoice}))
      v.readyContinuation=continuation;
  }
}
function processVoiceInputs(v){
  v.inputJobs=(v.inputJobs||0)+1;
  voiceQueue(v,async()=>{
    let completed=false;
    try{
      if(v.syncFailed)return;
      while(v.inputCursor<v.committedInputs.length){
        const itemId=v.committedInputs[v.inputCursor],result=v.inputResults.get(itemId);
        if(!result)break;
        v.inputCursor++;
        if(result.outcome!=='nonempty'){
          voiceDiagnostic(v,'input_skipped',{itemId,reason:result.outcome==='failed'?'failed':'missing'});
          continue;
        }
        const accepted=await voicePost(v,{type:'user',itemId,transcript:result.transcript,usage:result.usage});
        v.acceptedUsers.set(itemId,accepted);
        if(voice===v&&!v.closing){session.revision=accepted.revision;bubble('user',result.transcript+'  · spoken');v.pendingInputs.push(itemId)}
      }
      completed=true;
    }finally{
      v.inputJobs--;
      if(completed&&v.inputJobs===0){drainVoice(v);scheduleVoiceResponse(v)}
    }
  });
}
function drainVoiceV2(v){
  if(v.closing||voice!==v||v.toolPending||v.processingResponse||
    v.speechActive||v.inputJobs>0||v.inputCursor<v.committedInputs.length)return;
  while(v.responses.length){
    const owned=v.responses.shift(),response=owned.response,itemId=owned.itemId;
    if(response.status!=='completed'){scheduleVoiceResponse(v);continue}
    if(!v.acceptedUsers.has(itemId)){
      voiceDiagnostic(v,'response_ownership_rejected',{itemId,responseId:response.id,reason:'missing'});
      endVoice('ownership_error');return;
    }
    v.processingResponse=true;
    const parts=(response.output||[]).flatMap(item=>item.content||[]);
    const spoken=parts.map(part=>part.transcript||part.text||'').join(' ').trim()||v.responseTexts.get(response.id)||'';
    const toolCall=(response.output||[]).find(item=>item.type==='function_call'&&['publish_meal_plan','update_cooking_progress'].includes(item.name));
    if(toolCall){
      if(typeof toolCall.call_id!=='string'||!toolCall.call_id){
        voiceOwnershipFailure(v,response.id,itemId,'missing');return;
      }
      v.toolPending=true;
      const prior=v.pendingTool?.itemId===itemId?v.pendingTool:null;
      const attempt=(v.repairAttempts.get(itemId)||0)+1;
      const intro=[prior?.intro,spoken].filter(Boolean).join('\n\n');
      const usage=[...(prior?.usages||[]),response.usage].filter(Boolean);
      const fullMs=v.speechStopped?Math.round(performance.now()-v.speechStopped):null;
      voiceQueue(v,async()=>{
        const result=await voicePost(v,{type:'proposal',responseId:response.id,userItemId:itemId,
          call:{name:toolCall.name,arguments:toolCall.arguments},usage:response.usage,fullMs});
        v.pendingTool={itemId,intro:result.accepted?intro:'',usages:usage};
        if(result.status==='stale_rejected'){
          v.pendingTool=null;v.toolPending=false;v.processingResponse=false;
          if(voice===v&&generation===v.generation&&session?.id===v.sessionId){
            await load(v.sessionId,v.generation);
            status.textContent='Your shopping or meal state changed while Snap was planning. Ask Snap to continue from the current plan.';
          }
          drainVoice(v);scheduleVoiceResponse(v);return;
        }
        for(const output of response.output||[])if(output.id)v.completedOutputs.add(output.id);
        if(result.accepted&&voice===v&&generation===v.generation&&session?.id===v.sessionId){
          await load(v.sessionId,v.generation);
          syncVoiceState(v);
          const turnId=v.acceptedUsers.get(itemId)?.turnId;
          const kind=result.operation==='meal'?'shopping_visible':'now_visible';
          recordVisibleMetric(kind,turnId,v.speechStopped);
          if(kind==='shopping_visible'&&mealPackage)recordVisibleMetric('full_plan_visible',turnId,v.speechStopped);
          v.awaitingUsefulSpeech={turnId,started:v.speechStopped,
            kind:kind==='shopping_visible'?'meal_speech_delta_proxy':'now_speech_delta_proxy'};
        }
        if(!result.accepted)v.repairAttempts.set(itemId,attempt);
        const canRepair=!result.accepted&&attempt<2;
        const outcome={accepted:result.accepted===true,operation:result.operation||toolCall.name,
          reason:result.reason||null,meal:result.accepted?session?.meal_plan?.meal:null,
          now:result.accepted?session?.cooking_progress?.current_action:null};
        if(!v.closing&&voice===v&&v.dc?.readyState==='open'){
          const outputId='item_'+crypto.randomUUID().replaceAll('-','');
          v.pendingToolOutput={id:outputId,itemId};
          v.dc.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',
            id:outputId,call_id:toolCall.call_id,output:JSON.stringify(outcome)}}));
          const guidance=result.accepted
            ? result.operation==='meal'
              ? 'The complete meal package, Shopping and recipe were accepted and are visible. Speak a brief natural transition naming the meal. Do not read the shopping list or recipe aloud.'
              : 'The coordinated plan and Now guidance were accepted and are visible. Speak the useful Now guidance briefly. Do not read Full Plan aloud or demand routine acknowledgements.'
            : canRepair
              ? 'The application rejected your proposal: '+result.reason+'. Correct the tool arguments and call the same tool again before claiming success. The full_plan and remaining_components fields must be JSON arrays or null, never strings.'
              : 'The application could not save that proposal: '+result.reason+'. Explain the problem plainly and give useful safe conversational help or one necessary question. Do not claim a plan, list, or cooking state was saved.';
          v.pendingToolOutput.guidance=guidance;
          v.pendingToolOutput.toolChoice=result.accepted||!canRepair?'none':'auto';
        }
        v.toolPending=false;v.processingResponse=false;
        drainVoice(v);scheduleVoiceResponse(v);
      });
      return;
    }
    if(!spoken){v.processingResponse=false;scheduleVoiceResponse(v);continue}
    const prior=v.pendingTool?.itemId===itemId?v.pendingTool:null;
    v.pendingTool=null;v.repairAttempts.delete(itemId);
    const transcriptText=[prior?.intro,spoken].filter(Boolean).join('\n\n');
    const usageParts=[response.usage].filter(Boolean);
    const usage=usageParts.length?{input_tokens:usageParts.reduce((n,u)=>n+(u.input_tokens||0),0),
      output_tokens:usageParts.reduce((n,u)=>n+(u.output_tokens||0),0)}:null;
    const firstUsefulMs=v.firstUseful.get(response.id)??null;
    const fullMs=v.speechStopped?Math.round(performance.now()-v.speechStopped):null;
    voiceQueue(v,async()=>{
      const result=await voicePost(v,{type:'assistant',responseId:response.id,userItemId:itemId,
        transcript:transcriptText,firstUsefulMs,fullMs,usage});
      if(result.status==='accepted')for(const output of response.output||[])if(output.id)v.completedOutputs.add(output.id);
      if(voice===v&&generation===v.generation&&session?.id===v.sessionId){
        await load(v.sessionId,v.generation);
        status.textContent=result.status==='stale_rejected'?'An earlier spoken reply was superseded.':'Talk to Snap, or end Talk It to type.';
      }
      v.processingResponse=false;drainVoice(v);scheduleVoiceResponse(v);
    });
    return;
  }
  scheduleVoiceResponse(v);
}
function drainVoiceLegacy(v){while(v.responses.length&&v.userOrder.length){const itemId=v.userOrder[0],transcript=v.transcripts.get(itemId);if(!transcript||!v.acceptedUsers.has(itemId))return;const response=v.responses.shift();if(response.status!=='completed')continue;const parts=(response.output||[]).flatMap(item=>item.content||[]);const text=parts.map(part=>part.transcript||part.text||'').join(' ').trim()||v.responseTexts.get(response.id)||'';const toolCall=(response.output||[]).find(item=>item.type==='function_call'&&['publish_meal_plan','update_cooking_progress'].includes(item.name));if(!text&&toolCall){v.pendingTool={call:toolCall,usage:response.usage};if(v.dc?.readyState==='open'){v.dc.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:toolCall.call_id,output:JSON.stringify({status:'proposal_received'})}}));v.dc.send(JSON.stringify({type:'response.create',response:{tool_choice:'none',instructions:toolCall.name==='publish_meal_plan'?'Speak a brief natural transition and complete meal. The shopping list is shown visually; do not read the items aloud.':'Speak the useful Now guidance or answer naturally. The full coordinated plan is visible; do not read the plan or shopping list aloud, and do not demand routine acknowledgements.'}}))}continue}if(!text)continue;v.userOrder.shift();const chosenCall=toolCall||v.pendingTool?.call||null;const extraUsage=v.pendingTool?.usage;v.pendingTool=null;const usage=response.usage&&extraUsage?{...response.usage,input_tokens:(response.usage.input_tokens||0)+(extraUsage.input_tokens||0),output_tokens:(response.usage.output_tokens||0)+(extraUsage.output_tokens||0)}:response.usage;const firstUsefulMs=v.firstUseful.get(response.id)??null,fullMs=v.speechStopped?Math.round(performance.now()-v.speechStopped):null;voiceQueue(v,async()=>{const result=await voicePost(v,{type:'assistant',responseId:response.id,userItemId:itemId,transcript:text,firstUsefulMs,fullMs,usage,planCall:chosenCall?.name==='publish_meal_plan'?{name:chosenCall.name,arguments:chosenCall.arguments}:null,cookingCall:chosenCall?.name==='update_cooking_progress'?{name:chosenCall.name,arguments:chosenCall.arguments}:null});if(toolCall&&v.dc?.readyState==='open')v.dc.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:toolCall.call_id,output:JSON.stringify({accepted:toolCall.name==='publish_meal_plan'?result.planAccepted===true:result.cookingAccepted===true})}}));if(result.status==='stale_rejected'){if(voice===v&&generation===v.generation&&session?.id===v.sessionId){await load(v.sessionId,v.generation);status.textContent='An earlier spoken reply was superseded.'}return}if(voice===v&&generation===v.generation&&session?.id===v.sessionId){await load(v.sessionId,v.generation);if(result.planAccepted||result.cookingAccepted)syncVoiceState(v);status.textContent='Talk to Snap, or end Talk It to type.'}})}}
function voiceDiagnostic(v,kind,details={}){
  try{
    const item={seq:(v.diagnosticSeq=(v.diagnosticSeq||0)+1),
      ms:Math.min(3600000,Math.max(0,Math.round(performance.now()-(v.diagnosticStarted??=performance.now())))),kind};
    for(const key of ['itemId','responseId','requestId','outputId'])if(typeof details[key]==='string'&&/^[A-Za-z0-9_-]{4,80}$/.test(details[key]))item[key]=details[key];
    if(['in_progress','completed','cancelled','failed','incomplete','other'].includes(details.status))item.status=details.status;
    if(['new','connecting','connected','disconnected','failed','closed','checking','completed'].includes(details.connection))item.connection=details.connection;
    if(['empty','nonempty','failed'].includes(details.outcome))item.outcome=details.outcome;
    if(['turn_detected','client_cancelled','max_output_tokens','content_filter','unknown','mismatch','missing','superseded','failed'].includes(details.reason))item.reason=details.reason;
    const events=v.diagnostics??=[];
    if(events.length===64){events.splice(8,1);v.diagnosticDropped=(v.diagnosticDropped||0)+1}
    events.push(item);
  }catch{/* Diagnostics cannot affect Talk It. */}
}
function rememberVoiceItem(v,e){
  const id=e.item?.id;if(!id)return;
  if(v.contextOrder.includes(id))return;
  const previous=e.previous_item_id;
  if(previous&&previous!=='root'&&!v.contextOrder.includes(previous)){
    voiceDiagnostic(v,'response_ownership_rejected',{itemId:id,reason:'missing'});
    endVoice('ownership_error');return;
  }
  if(previous==='root')v.contextOrder.unshift(id);
  else if(previous){v.contextOrder.splice(v.contextOrder.indexOf(previous)+1,0,id)}
  else v.contextOrder.push(id);
  if(v.contextOrder.length>128){endVoice('ownership_error');return}
  if(e.item.type==='message'&&e.item.role==='user')voiceDiagnostic(v,'input_item_created',{itemId:id});
  if(v.pendingToolOutput?.id===id){
    const continuation=v.pendingToolOutput;v.pendingToolOutput=null;v.toolOutputs.add(id);
    voiceDiagnostic(v,'tool_output_created',{itemId:continuation.itemId,outputId:id});
    v.readyContinuation=continuation;scheduleVoiceResponse(v);
  }else scheduleVoiceResponse(v);
}
function voiceOwnershipFailure(v,responseId,itemId,reason){
  voiceDiagnostic(v,'response_ownership_rejected',{responseId,itemId,reason});
  v.failureCode='VOICE_OWNERSHIP_ERROR';v.syncFailed=true;
  endVoice('ownership_error');
}
function ownedVoiceResponse(v,response){
  const metadata=response?.metadata,requestId=metadata?.snap_request_id;
  const request=v.requests.get(requestId);
  if(!request||request!==v.activeRequest||metadata.snap_origin_item_id!==request.itemId||
    metadata.snap_phase!==request.phase||typeof response.conversation_id!=='string'||!response.conversation_id){
    voiceOwnershipFailure(v,response?.id,metadata?.snap_origin_item_id,'mismatch');return null;
  }
  return request;
}
function voiceEventLegacy(v,e){
  if(e.type==='input_audio_buffer.speech_started'){voiceDiagnostic(v,'speech_started');v.speechStopped=null;status.textContent='Listening…'}
  else if(e.type==='input_audio_buffer.speech_stopped'){voiceDiagnostic(v,'speech_stopped');v.speechStopped=performance.now();status.textContent='Snap is listening and thinking…'}
  else if(e.type==='input_audio_buffer.committed'&&e.item_id){voiceDiagnostic(v,'input_committed',{itemId:e.item_id});if(!v.userOrder.includes(e.item_id))v.userOrder.push(e.item_id)}
  else if(e.type==='conversation.item.input_audio_transcription.completed'&&e.item_id){voiceDiagnostic(v,'transcription_completed',{itemId:e.item_id,outcome:e.transcript?.trim()?'nonempty':'empty'});if(!v.userOrder.includes(e.item_id))v.userOrder.push(e.item_id);v.transcripts.set(e.item_id,e.transcript||'');if(e.transcript?.trim()){bubble('user',e.transcript+'  · spoken');voiceQueue(v,async()=>{const accepted=await voicePost(v,{type:'user',itemId:e.item_id,transcript:e.transcript,usage:e.usage});v.acceptedUsers.set(e.item_id,accepted);session.revision=accepted.revision;drainVoice(v)})}else{v.syncFailed=true;v.failureCode='EMPTY_TRANSCRIPT';status.textContent='Speech was not clear enough to save. Talk It is ending so the transcript stays accurate.';endVoice('empty_transcript')}}
  else if(e.type==='conversation.item.input_audio_transcription.failed')voiceDiagnostic(v,'transcription_failed',{itemId:e.item_id,outcome:'failed'});
  else if(e.type==='response.created'&&e.response?.id)voiceDiagnostic(v,'response_created',{responseId:e.response.id,status:'in_progress'});
  else if(e.type==='response.output_audio_transcript.delta'&&e.response_id&&e.delta){v.diagnosticFirstAudio??=new Set();if(!v.diagnosticFirstAudio.has(e.response_id)){v.diagnosticFirstAudio.add(e.response_id);voiceDiagnostic(v,'audio_transcript_started',{responseId:e.response_id})}const prior=v.responseTexts.get(e.response_id)||'';v.responseTexts.set(e.response_id,prior+e.delta);if(!v.firstUseful.has(e.response_id)&&v.speechStopped)v.firstUseful.set(e.response_id,Math.round(performance.now()-v.speechStopped));if(!v.partial){v.partial=bubble('snap','');v.partialResponseId=e.response_id}if(v.partialResponseId===e.response_id)v.partial.textContent=displayText(v.responseTexts.get(e.response_id));status.textContent='Snap is speaking…'}
  else if(e.type==='response.output_audio_transcript.done'&&e.response_id){voiceDiagnostic(v,'audio_transcript_done',{responseId:e.response_id});if(e.transcript)v.responseTexts.set(e.response_id,e.transcript)}
  else if(e.type==='response.done'&&e.response?.id){voiceDiagnostic(v,'response_done',{responseId:e.response.id,status:e.response.status});v.responses.push(e.response);v.partial=null;v.partialResponseId=null;drainVoice(v)}
  else if(e.type==='error'){voiceDiagnostic(v,'provider_error');status.textContent='Talk It had a connection error. End Talk and try again.'}
}
function voiceEvent(v,e){if(voice!==v||generation!==v.generation)return;
if(!voiceOwnedVersion(v))return voiceEventLegacy(v,e);
if(e.type==='input_audio_buffer.speech_started'){voiceDiagnostic(v,'speech_started');v.speechActive=true;v.speechStopped=null;status.textContent='Listening…'}
else if(e.type==='input_audio_buffer.speech_stopped'){voiceDiagnostic(v,'speech_stopped');v.speechStopped=performance.now();status.textContent='Snap is listening and thinking…'}
else if(e.type==='input_audio_buffer.committed'&&e.item_id){voiceDiagnostic(v,'input_committed',{itemId:e.item_id});v.speechActive=false;if(!v.committedInputs.includes(e.item_id)){v.committedInputs.push(e.item_id);processVoiceInputs(v)}}
else if(e.type==='conversation.item.created'||e.type==='conversation.item.added')rememberVoiceItem(v,e);
else if(e.type==='conversation.item.input_audio_transcription.completed'&&e.item_id){const outcome=e.transcript?.trim()?'nonempty':'empty';voiceDiagnostic(v,'transcription_completed',{itemId:e.item_id,outcome});if(!v.inputResults.has(e.item_id)){v.inputResults.set(e.item_id,{outcome,transcript:e.transcript||'',usage:e.usage});processVoiceInputs(v)}if(outcome==='empty')status.textContent='I did not catch that. You can keep talking.'}
else if(e.type==='conversation.item.input_audio_transcription.failed'&&e.item_id){voiceDiagnostic(v,'transcription_failed',{itemId:e.item_id,outcome:'failed'});if(!v.inputResults.has(e.item_id)){v.inputResults.set(e.item_id,{outcome:'failed'});processVoiceInputs(v)}}
else if(e.type==='response.created'&&e.response?.id){const owner=ownedVoiceResponse(v,e.response);if(owner){if(owner.responseId&&owner.responseId!==e.response.id){voiceOwnershipFailure(v,e.response.id,owner.itemId,'mismatch');return}owner.responseId=e.response.id;v.responseOwners.set(e.response.id,owner);voiceDiagnostic(v,'response_created',{responseId:e.response.id,itemId:owner.itemId,requestId:owner.requestId,status:'in_progress'})}}
else if((e.type==='response.output_item.added'||e.type==='response.output_item.done')&&e.response_id&&e.item?.id){voiceDiagnostic(v,e.type.endsWith('added')?'response_output_started':'response_output_done',{responseId:e.response_id,outputId:e.item.id});v.outputOwners.set(e.item.id,e.response_id)}
else if(e.type==='response.output_audio_transcript.delta'&&e.response_id&&e.delta){if(!v.responseOwners.has(e.response_id)){voiceOwnershipFailure(v,e.response_id,null,'missing');return}v.diagnosticFirstAudio??=new Set();if(!v.diagnosticFirstAudio.has(e.response_id)){v.diagnosticFirstAudio.add(e.response_id);voiceDiagnostic(v,'audio_transcript_started',{responseId:e.response_id})}const prior=v.responseTexts.get(e.response_id)||'';v.responseTexts.set(e.response_id,prior+e.delta);if(!v.firstUseful.has(e.response_id)&&v.speechStopped)v.firstUseful.set(e.response_id,Math.round(performance.now()-v.speechStopped));if(v.awaitingUsefulSpeech&&/\S/.test(e.delta)){recordVisibleMetric(v.awaitingUsefulSpeech.kind,v.awaitingUsefulSpeech.turnId,v.awaitingUsefulSpeech.started);v.awaitingUsefulSpeech=null}if(!v.partial){v.partial=bubble('snap','');v.partialResponseId=e.response_id}if(v.partialResponseId===e.response_id)v.partial.textContent=displayText(v.responseTexts.get(e.response_id));status.textContent='Snap is speaking…'}
else if(e.type==='response.output_audio_transcript.done'&&e.response_id){voiceDiagnostic(v,'audio_transcript_done',{responseId:e.response_id});if(e.transcript)v.responseTexts.set(e.response_id,e.transcript)}
else if(e.type==='response.done'&&e.response?.id){const response=e.response;if(v.doneResponses.has(response.id))return;const owner=ownedVoiceResponse(v,response);if(!owner||owner.responseId!==response.id){voiceOwnershipFailure(v,response.id,owner?.itemId,'mismatch');return}if(response.status==='completed'&&(!Array.isArray(response.output)||response.output.some(item=>typeof item.id!=='string'||!item.id))){voiceOwnershipFailure(v,response.id,owner.itemId,'missing');return}v.doneResponses.add(response.id);v.activeRequest=null;const reason=['turn_detected','client_cancelled','max_output_tokens','content_filter'].includes(response.status_details?.reason)?response.status_details.reason:'unknown';voiceDiagnostic(v,'response_done',{responseId:response.id,itemId:owner.itemId,requestId:owner.requestId,status:response.status,reason});if((response.status!=='completed'||((v.behaviorVersion?.startsWith('stage1b-cooking-v2')||v.behaviorVersion?.startsWith('stage1b-meal-package-'))&&response.output?.some(item=>item.type==='function_call')))&&v.partial?.parentElement)v.partial.parentElement.remove();v.responses.push({response,itemId:owner.itemId});v.partial=null;v.partialResponseId=null;drainVoice(v)}
else if(e.type==='error'){voiceDiagnostic(v,'provider_error',{requestId:v.activeRequest?.requestId,itemId:v.activeRequest?.itemId,reason:'failed'});v.syncFailed=true;v.failureCode='REALTIME_PROVIDER_ERROR';endVoice('provider_error')}}
async function endVoice(reason='manual'){const v=voice;if(!v)return;v.closing=true;voiceDiagnostic(v,'shutdown');voice=null;talk.disabled=true;talk.textContent='Talk It';input.disabled=false;photo.disabled=false;send.disabled=false;try{let pending;do{pending=v.work;await pending}while(v.work!==pending);if(v.id)await fetch('/api/sessions/'+encodeURIComponent(v.sessionId)+'/voice/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceSessionId:v.id,failureCode:v.failureCode,diagnostics:{stopReason:reason,dropped:v.diagnosticDropped||0,events:v.diagnostics||[]}})})}catch{}finally{v.mic?.getTracks().forEach(track=>track.stop());v.dc?.close();v.pc?.close();snapAudio.srcObject=null;talk.disabled=false;if(session?.id===v.sessionId)await load(v.sessionId,generation);status.textContent=v.syncFailed?'Voice ended with an unsaved transcript. Review the conversation.':'Talk It ended. Continue by typing or start Talk It again.'}}
async function startVoice(){if(!stage1b||voice)return;if(!session){await create();if(!session)return}if(pending()){status.textContent='Wait for Snap to finish the pending reply first.';return}const v={sessionId:session.id,generation,work:Promise.resolve(),userOrder:[],responses:[],transcripts:new Map(),acceptedUsers:new Map(),responseTexts:new Map(),firstUseful:new Map(),speechStopped:null,speechActive:false,syncFailed:false,failureCode:null,pendingTool:null,toolPending:false,repairAttempts:new Map(),awaitingUsefulSpeech:null,baseInstructions:null,cookingInstructions:null,behaviorVersion:null,committedInputs:[],inputResults:new Map(),inputCursor:0,pendingInputs:[],contextOrder:[],completedOutputs:new Set(),toolOutputs:new Set(),requests:new Map(),responseOwners:new Map(),outputOwners:new Map(),doneResponses:new Set(),activeRequest:null,processingResponse:false,pendingToolOutput:null};voice=v;talk.disabled=true;send.disabled=true;input.disabled=true;photo.disabled=true;status.textContent='Connecting Talk It…';try{v.mic=await navigator.mediaDevices.getUserMedia({audio:true});if(voice!==v)throw Error('Voice session changed');v.pc=new RTCPeerConnection();v.pc.onconnectionstatechange=()=>voiceDiagnostic(v,'peer_connection_state',{connection:v.pc.connectionState});v.pc.oniceconnectionstatechange=()=>voiceDiagnostic(v,'ice_connection_state',{connection:v.pc.iceConnectionState});v.mic.getAudioTracks()[0].onended=()=>voiceDiagnostic(v,'mic_ended');v.pc.ontrack=e=>{snapAudio.srcObject=e.streams[0];snapAudio.play().catch(()=>status.textContent='Tap Talk It to enable audio playback.')};v.pc.addTrack(v.mic.getAudioTracks()[0],v.mic);v.dc=v.pc.createDataChannel('oai-events');v.dc.onmessage=message=>{try{voiceEvent(v,JSON.parse(message.data))}catch{status.textContent='Could not read a voice event.'}};v.dc.onopen=()=>voiceDiagnostic(v,'data_channel_open');v.dc.onerror=()=>voiceDiagnostic(v,'data_channel_error');v.dc.onclose=()=>{if(voice===v){voiceDiagnostic(v,'data_channel_closed');endVoice('data_channel_closed')}};const offer=await v.pc.createOffer();await v.pc.setLocalDescription(offer);if(v.pc.iceGatheringState!=='complete')await new Promise(resolve=>{const changed=()=>{if(v.pc.iceGatheringState==='complete'){clearTimeout(timeout);v.pc.removeEventListener('icegatheringstatechange',changed);resolve()}};const timeout=setTimeout(()=>{v.pc.removeEventListener('icegatheringstatechange',changed);resolve()},4000);v.pc.addEventListener('icegatheringstatechange',changed)});const r=await fetch('/api/sessions/'+encodeURIComponent(v.sessionId)+'/voice/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sdp:v.pc.localDescription.sdp,expectedRevision:session.revision})});const result=await r.json();if(!r.ok)throw Error(result.error||'Talk It could not connect');v.id=result.voiceSessionId;v.baseInstructions=result.syncInstructions||null;v.cookingInstructions=result.cookingSyncInstructions||null;v.behaviorVersion=result.behaviorVersion||null;await v.pc.setRemoteDescription({type:'answer',sdp:result.sdp});voiceDiagnostic(v,'voice_connected');if(voice!==v)throw Error('Voice session changed');talk.disabled=false;talk.textContent='End Talk It';status.textContent='Talk to Snap. Your words and Snap’s reply will appear here.'}catch(error){if(voice===v){const reason=error.message||'Talk It could not start.';await endVoice('connect_error');status.textContent=reason}}}
talk.onclick=()=>voice?endVoice():startVoice();
if(stage1b)document.getElementById('recover-talk').onclick=async()=>{if(!session?.active_voice_id)return;const id=session.id,voiceSessionId=session.active_voice_id;const r=await fetch('/api/sessions/'+encodeURIComponent(id)+'/voice/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceSessionId})});if(r.ok){await load(id,generation);status.textContent='Talk It ended. You can continue here.'}else status.textContent='Could not end Talk It. Refresh and try again.'};
function pushKey(base64url){const binary=atob(base64url.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(binary,c=>c.charCodeAt(0))}
if(stage1b)document.getElementById('remind').onclick=async()=>{if(!session){status.textContent='Start a conversation before setting a return reminder.';return}if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){status.textContent='This browser does not support closed-app reminders.';return}const reminderSessionId=session.id,button=document.getElementById('remind'),minutes=Number(document.getElementById('return-minutes').value);button.disabled=true;try{const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifications were not allowed.');const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});const ready=await navigator.serviceWorker.ready;const config=await fetch('/api/push/config');if(!config.ok)throw Error('Reminders are unavailable here.');const {publicKey}=await config.json();const subscription=await ready.pushManager.getSubscription()||await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKey(publicKey)});const saved=await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON()})});if(!saved.ok)throw Error('Could not save this device for reminders.');const scheduled=await fetch('/api/sessions/'+encodeURIComponent(reminderSessionId)+'/return',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({minutes})});if(!scheduled.ok)throw Error('Could not schedule this reminder.');const result=await scheduled.json();status.textContent='Reminder set for '+new Date(result.dueAt).toLocaleTimeString()+'. You may close the app.'}catch(error){status.textContent=error.message||'Could not set a reminder.'}finally{button.disabled=false}};
const deepLink=new URL(location.href).searchParams.get('session');const saved=deepLink&&/^[0-9a-f-]{36}$/i.test(deepLink)?deepLink:localStorage.getItem('sndlab-session');if(saved)load(saved);else status.textContent='Start by telling Snap what you want to make.';
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session&&!voice)load(session.id,generation)});
</script></body></html>`;

const DASHBOARD_SCRIPT = String.raw`
const dashDialog=document.getElementById('dash-recipe-dialog');
function dashEmpty(id,message){const target=document.getElementById(id);target.replaceChildren();const p=document.createElement('p');p.className='empty';p.textContent=message;target.appendChild(p)}
function dashCard(row,kind){const card=document.createElement('div');card.className='recipe-card';const image=document.createElement('div');image.className='image-fallback';image.setAttribute('role','img');image.setAttribute('aria-label','No recipe photograph available');image.textContent='✦';const info=document.createElement('div');info.className='recipe-card-main';const title=document.createElement('strong');title.textContent=row.meal;const meta=document.createElement('small');meta.textContent=String(row.servings)+' servings · '+(kind==='history'?'Selected recipe; cooking not confirmed':'Accepted recipe');info.append(title,meta);const open=document.createElement('button');open.type='button';open.textContent=kind==='today'&&row.session_available?'Open cook':'View recipe';open.onclick=async()=>{if(kind==='today'&&row.session_available){const target=row.source_session_id;generation++;await load(target,generation);if(session?.id===target){document.getElementById('recipe').scrollIntoView({block:'start'});return}}await openDashRecipe(row.recipe_version_id)};card.append(image,info,open);return card}
function dashList(id,rows,kind,empty){if(!rows?.length){dashEmpty(id,empty);return}const target=document.getElementById(id);target.replaceChildren();for(const row of rows)target.appendChild(dashCard(row,kind))}
function dashShopping(){const target=document.getElementById('dash-shopping-list');target.replaceChildren();const plan=session?.meal_plan;if(!plan){dashEmpty('dash-shopping-list','Choose a meal to see its Shopping list.');return}const p=document.createElement('p');p.textContent='Shopping for '+plan.meal+'. Your checklist choices remain in the current cook.';const open=document.createElement('button');open.type='button';open.className='shopping-link';open.textContent='Open Shopping';open.onclick=()=>{planDetails.open=true;shopping.scrollIntoView({block:'start'})};target.append(p,open)}
async function openDashRecipe(id){const r=await fetch('/api/dashboard/recipes/'+encodeURIComponent(id));if(!r.ok){status.textContent='This recipe is unavailable.';return}const entry=await r.json();const target=document.getElementById('dash-recipe-detail');target.replaceChildren();const title=document.createElement('h3');title.textContent=entry.meal;const meta=document.createElement('p');meta.className='detail-meta';meta.textContent=entry.servings+' servings · Selected '+new Date(entry.accepted_at).toLocaleDateString()+'. Cooking is not confirmed.';target.append(title,meta);for(const section of entry.recipe.full_plan||[]){const heading=document.createElement('h4'),directions=document.createElement('p');heading.textContent=section.title;directions.textContent=section.directions;target.append(heading,directions)}dashDialog.showModal()}
let dashRefreshGeneration=0;
async function refreshDashboard(){if(!dashboardEnabled)return;const refresh=++dashRefreshGeneration;dashShopping();try{const r=await fetch('/api/dashboard');if(!r.ok)throw Error('dashboard unavailable');const data=await r.json();if(refresh!==dashRefreshGeneration)return;const today=(data.active_cooks||[]).filter(row=>new Date(row.selected_at).toDateString()===new Date().toDateString());dashList('dash-today-list',today,'today','No cooks selected today. Ask Snap what to make.');dashList('dash-future-list',data.future_cooks,'future','No recipes saved for later yet.');dashList('dash-history-list',data.previously_cooked,'history','Accepted recipes will appear here. Cooking is not assumed.');dashList('dash-favorites-list',data.favorites,'favorite','No Favorites saved yet.')}catch{if(refresh!==dashRefreshGeneration)return;dashEmpty('dash-today-list','Start a conversation to see your cooks.');dashEmpty('dash-future-list','No recipes saved for later yet.');dashEmpty('dash-history-list','Accepted recipes will appear here. Cooking is not assumed.');dashEmpty('dash-favorites-list','No Favorites saved yet.')}}
document.getElementById('dash-detail-close').onclick=()=>dashDialog.close();
document.getElementById('dash-snap').onclick=()=>{photo.scrollIntoView({block:'center'});photo.click()};
document.getElementById('dash-write').onclick=()=>{input.scrollIntoView({block:'center'});input.focus()};
document.getElementById('dash-talk').onclick=()=>talk.click();
refreshDashboard();
`;

const REVIEW = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Snap n Dish review</title>__STYLE__</head>
<body><header><h1>__REVIEW_HEADING__</h1><nav><a href="/">Back to Snap</a></nav></header><main><p>__REVIEW_DESCRIPTION__ Conversation text and accepted state events are shown separately.</p><div id="review-list"></div><h2 id="title">Select a session</h2><pre id="timeline"></pre><div id="review-images"></div></main>
<script nonce="__NONCE__">const list=document.getElementById('review-list'),timeline=document.getElementById('timeline'),title=document.getElementById('title'),images=document.getElementById('review-images');
async function show(id){const r=await fetch('/api/review/sessions/'+encodeURIComponent(id));if(!r.ok){timeline.textContent='Unable to load session';return}const x=await r.json();title.textContent='Session '+id+' · revision '+x.session.revision;timeline.textContent=x.timeline.map(v=>v.at+'  '+v.kind+'  revision '+v.revision+'\n'+(v.text||v.details||'')).join('\n\n');images.replaceChildren();for(const v of x.timeline){if(!v.image_id)continue;const heading=document.createElement('p');heading.textContent='Photo from '+v.at;const image=document.createElement('img');image.src='/api/sessions/'+encodeURIComponent(id)+'/images/'+encodeURIComponent(v.image_id);image.alt='Photo shared with Snap';image.style.maxWidth='min(440px,100%)';images.append(heading,image)}}
fetch('/api/review/sessions').then(r=>r.json()).then(x=>{for(const s of x.sessions){const b=document.createElement('button');b.textContent=s.created_at+' · '+s.id+' · '+s.turn_count+' turns · $'+Number(s.estimated_usd||0).toFixed(3);b.onclick=()=>show(s.id);list.appendChild(b)}}).catch(()=>list.textContent='Unable to load sessions');</script></body></html>`;

export function page(kind, nonce, stage1b = false, nextFlow = false, mealPackage = false, production = false, dashboard = false) {
  let source = kind === 'login' ? LOGIN : kind === 'review' ? REVIEW : CHAT;
  if (kind === 'chat') source = source.replace('let session=null',
    'const dashboardEnabled=' + String(dashboard && stage1b && !production) + ';let session=null');
  if (kind === 'chat' && dashboard && stage1b && !production)
    source = source.replace('<main>', '<main>' + DASHBOARD)
      .replace('</script></body></html>', DASHBOARD_SCRIPT + '</script></body></html>');
  return source.replace('__STYLE__', STYLE).replaceAll('__NONCE__', nonce)
    .replace('__STAGE1B__', String(stage1b)).replace('__NEXT_FLOW__', String(nextFlow))
    .replace('__MEAL_PACKAGE__', String(mealPackage))
    .replace('__APP_TITLE__', production ? 'Snap n Dish' : 'Snap n Dish Live Lab')
    .replace('__REMINDER_TEST_OPTION__', production ? '' : '<option value="1">In 1 minute (test)</option>')
    .replace('__REVIEW_HEADING__', production ? 'Snap n Dish session review' : 'Live Lab session review')
    .replace('__REVIEW_LOGIN_DESCRIPTION__', production
      ? 'Enter the private review code to inspect conversations.'
      : 'Enter the private review code to inspect test sessions.')
    .replace('__REVIEW_DESCRIPTION__', production ? 'Chronological private conversation records.' : 'Chronological private test records.');
}
