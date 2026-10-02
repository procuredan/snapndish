import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { page } from '../live-lab/ui.mjs';

const candidates = [process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean);
const chrome = candidates.find(candidate => fs.existsSync(candidate));

test('real browser executes voice state sync, tool-result ordering and accepted Shopping/Now rendering',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`
<script>
(async()=>{
  const fail=message=>{document.body.dataset.regression='FAIL: '+message};
  try {
    const id='11111111-1111-4111-8111-111111111111';
    const turnId='22222222-2222-4222-8222-222222222222';
    const plan={meal:'Ginger chicken with rice and cucumber salad',servings:2,sections:[
      {section:'Produce',items:[{id:'33333333-3333-4333-8333-333333333333',name:'Cucumber',quantity:'1',checked:false,have_status:'need'}]}]};
    const cooking={current_action:'Start the rice, then slice cucumber while it cooks.',full_plan:[
      {title:'Rice',directions:'Cook rice until tender.'},
      {title:'Chicken and salad',directions:'Cook chicken safely, then dress cucumber and plate.'}],
      remaining_components:null,reports:[],current_action_turn_id:null};
    const base={id,revision:1,turns:[],meal_plan:plan,meal_revision:1,shopping_revision:1,
      cooking_progress:null,cooking_revision:0,active_voice_id:null};
    session=structuredClone(base);
    render();
    if(shopping.hidden||planDetails.hidden||!planDetails.open)throw Error('accepted Shopping did not open');
    const sent=[];
    const channel={readyState:'open',send:value=>sent.push(JSON.parse(value))};
    const sync={sessionId:id,baseInstructions:'Culinary behavior',cookingInstructions:'Cooking behavior',
      behaviorVersion:'stage1b-cooking-v2+voice-bridge-v2',dc:channel};
    syncVoiceState(sync);
    if(!sent.some(event=>event.type==='session.update'))throw Error('voice sync failed');
    session.cooking_progress=structuredClone(cooking);session.cooking_revision=1;render();
    if(nowPanel.hidden||!nowText.textContent.includes('Start the rice')||fullPlan.hidden||!planDetails.open)
      throw Error('Now and Full Plan were not visible together');
    planDetails.open=false;render();
    if(planDetails.open)throw Error('routine rerender overrode deliberate collapse');
    session=structuredClone(base);render();
    const events=[];
    window.fetch=async(url,options)=>{
      if(url.endsWith('/voice/events')){
        const body=JSON.parse(options.body);events.push(body.type);
        if(body.type==='proposal')return new Response(JSON.stringify({status:'accepted',accepted:true,
          operation:'cooking',cookingRevision:1}),{status:200});
        if(body.type==='assistant')return new Response(JSON.stringify({status:'accepted'}),{status:200});
      }
      if(url.endsWith('/metrics'))return new Response(JSON.stringify({accepted:true}),{status:200});
      if(url.endsWith('/api/sessions/'+id))return new Response(JSON.stringify({
        ...base,cooking_progress:cooking,cooking_revision:1}),{status:200});
      throw Error('unexpected fetch '+url);
    };
    const item='audio_item_1';
    const v={id:'44444444-4444-4444-8444-444444444444',sessionId:id,generation,
      behaviorVersion:'stage1b-cooking-v2+voice-bridge-v2',baseInstructions:'Culinary behavior',
      cookingInstructions:'Cooking behavior',dc:channel,work:Promise.resolve(),toolPending:false,
      pendingTool:null,repairAttempts:new Map(),awaitingUsefulSpeech:null,
      userOrder:[item],transcripts:new Map([[item,"Let's cook."]]),
      acceptedUsers:new Map([[item,{turnId,revision:1}]]),responses:[{id:'response_tool_1',status:'completed',
        output:[{type:'function_call',call_id:'call_1',name:'update_cooking_progress',
          arguments:JSON.stringify({current_action:cooking.current_action,full_plan:cooking.full_plan,
            remaining_components:null,customer_report:null,equipment_change:null})}],
        usage:{input_tokens:30,output_tokens:20}}],responseTexts:new Map(),firstUseful:new Map(),
      speechStopped:performance.now(),syncFailed:false};
    voice=v;
    drainVoice(v);await v.work;
    if(events[0]!=='proposal')throw Error('proposal was not first');
    const outputAt=sent.findIndex(event=>event.type==='conversation.item.create'&&
      event.item.type==='function_call_output');
    const speechAt=sent.findIndex((event,index)=>index>outputAt&&event.type==='response.create');
    if(outputAt<0||speechAt<0||sent[outputAt].item.call_id!=='call_1')
      throw Error('real tool output did not precede speech continuation');
    if(nowPanel.hidden||!nowText.textContent.includes('Start the rice')||fullPlan.hidden)
      throw Error('accepted cooking state did not render');
    v.responses.push({id:'response_speech_1',status:'completed',output:[{type:'message',
      content:[{transcript:'Start the rice, then slice the cucumber while it cooks.'}]}],
      usage:{input_tokens:10,output_tokens:10}});
    drainVoice(v);await v.work;
    if(events.at(-1)!=='assistant'||v.userOrder.length)throw Error('spoken continuation not saved');
    const second='audio_item_2';
    v.userOrder.push(second);v.transcripts.set(second,'The cucumber is missing; revise the plan.');
    v.acceptedUsers.set(second,{turnId,revision:2});
    v.responses.push({id:'response_tool_speech',status:'completed',output:[
      {type:'message',content:[{transcript:'I can adjust that.'}]},
      {type:'function_call',call_id:'call_2',name:'update_cooking_progress',
        arguments:JSON.stringify({current_action:'Skip cucumber and dress the greens instead.',
          full_plan:cooking.full_plan,remaining_components:null,customer_report:null,equipment_change:null})}],
      usage:{input_tokens:30,output_tokens:20}});
    const before=events.length;
    drainVoice(v);await v.work;
    if(events.length!==before+1||events.at(-1)!=='proposal')
      throw Error('speech plus tool bypassed acceptance');
    const secondOutput=sent.find(event=>event.type==='conversation.item.create'&&
      event.item.type==='function_call_output'&&event.item.call_id==='call_2');
    if(!secondOutput||!v.pendingTool?.intro.includes('I can adjust that.'))
      throw Error('speech plus tool did not continue from the accepted result');
    document.body.dataset.regression='PASS';
  }catch(error){fail(error.stack||String(error))}
})();
</script>`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapndish-browser-'));
    try {
      const file = path.join(directory, 'bridge.html');
      fs.writeFileSync(file, page('chat', 'browser-test', true, true).replace('</body>', fixture + '</body>'));
      let output;
      try { output = execFileSync(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
        '--disable-gpu', '--disable-background-networking', '--virtual-time-budget=6000',
        `--user-data-dir=${path.join(directory, 'chrome-profile')}`, '--dump-dom', `file://${file}`],
      { encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (error) { output = error.stdout || error.output?.[1] || ''; }
      assert.match(output, /data-regression="PASS"/, output.match(/data-regression="[^"]*/)?.[0] || output.slice(-600));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

test('real browser shows accepted Shopping and complete recipe before optional Now focus',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`
<script>
(async()=>{
  const fail=message=>{document.body.dataset.regression='FAIL: '+message};
  try {
    const plan={meal:'Lemon chicken with rice and cucumber salad',servings:2,
      sections:[{section:'Produce',items:[{id:'33333333-3333-4333-8333-333333333333',
        name:'Cucumber',quantity:'1',checked:false,have_status:'need'}]}],
      full_plan:[{title:'Rice',directions:'Measure 1 cup rice.\n\nCook until tender, then rest covered.'},
        {title:'Chicken and salad',directions:'Cook 1 lb chicken safely; slice cucumber and plate.'}],
      current_action:'Start the rice.'};
    session={id:'11111111-1111-4111-8111-111111111111',revision:1,turns:[],
      meal_plan:plan,meal_revision:1,shopping_revision:1,cooking_progress:null,cooking_revision:1};
    render();
    if(shopping.hidden||planDetails.hidden||!planDetails.open)throw Error('Shopping was not visible');
    if(recipe.hidden||fullPlan.hidden||!fullPlan.textContent.includes('Measure 1 cup rice.'))
      throw Error('complete recipe was not visible at package acceptance');
    if(!fullPlan.querySelector('p')?.textContent.includes('\n\n')||
      getComputedStyle(fullPlan.querySelector('p')).whiteSpace!=='pre-wrap')
      throw Error('natural cooking paragraphs were not preserved');
    if(!nowPanel.hidden)throw Error('Now appeared before customer asked to focus cooking');
    session.cooking_progress={meal_revision:1,current_action:'Start the rice.',full_plan:plan.full_plan,
      remaining_components:['Rice','Chicken and salad'],reports:[]};
    session.cooking_revision=2;render();
    if(nowPanel.hidden||!nowText.textContent.includes('Start the rice'))throw Error('Now focus missing');
    if(recipe.hidden||!fullPlan.textContent.includes('Measure 1 cup rice.'))throw Error('recipe disappeared');
    if(planDetails.hidden||shopping.hidden)throw Error('Shopping was unavailable after focus');
    document.body.dataset.regression='PASS';
  }catch(error){fail(error.stack||String(error))}
})();
</script>`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapndish-package-browser-'));
    try {
      const file = path.join(directory, 'package.html');
      fs.writeFileSync(file, page('chat', 'browser-test', true, true, true).replace('</body>', fixture + '</body>'));
      let output;
      try { output = execFileSync(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check',
        '--disable-gpu', '--disable-background-networking', '--virtual-time-budget=6000',
        `--user-data-dir=${path.join(directory, 'chrome-profile')}`, '--dump-dom', `file://${file}`],
      { encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (error) { output = error.stdout || error.output?.[1] || ''; }
      assert.match(output, /data-regression="PASS"/, output.match(/data-regression="[^"]*/)?.[0] || output.slice(-600));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
