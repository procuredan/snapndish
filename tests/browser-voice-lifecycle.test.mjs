import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { page } from '../live-lab/ui.mjs';

const chrome = [process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
  .filter(Boolean).find(candidate => fs.existsSync(candidate));

test('real browser stops queued voice saves after the first ordered transcript fails',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`<script>
(async()=>{
  try{
    const id='11111111-1111-4111-8111-111111111111';
    const first='item_failed_save',second='item_later_save';
    session={id,revision:0,turns:[],meal_plan:null,meal_revision:0,
      shopping_revision:0,cooking_progress:null,cooking_revision:0};
    const posts=[],sent=[];let stop;
    window.fetch=async(url,options)=>{
      if(url.endsWith('/voice/events')){posts.push(JSON.parse(options.body));
        return new Response(JSON.stringify({error:'STALE_REVISION'}),{status:409})}
      if(url.endsWith('/voice/stop')){stop=JSON.parse(options.body);return new Response('{}')}
      if(url.endsWith('/api/sessions/'+id))return new Response(JSON.stringify(session));
      throw Error('unexpected request '+url);
    };
    const v={id:'22222222-2222-4222-8222-222222222222',sessionId:id,generation,
      behaviorVersion:'stage1b-meal-package-v5.1+voice-bridge-v2',work:Promise.resolve(),
      dc:{readyState:'open',send:value=>sent.push(JSON.parse(value)),close(){}},
      mic:{getTracks:()=>[{stop(){}}]},pc:{close(){}},
      acceptedUsers:new Map(),committedInputs:[],inputResults:new Map(),inputCursor:0,pendingInputs:[],
      contextOrder:[],completedOutputs:new Set(),toolOutputs:new Set(),requests:new Map(),
      responseOwners:new Map(),outputOwners:new Map(),doneResponses:new Set(),responses:[],
      responseTexts:new Map(),firstUseful:new Map(),activeRequest:null,processingResponse:false,
      toolPending:false,speechActive:false};
    voice=v;
    for(const itemId of [first,second]){
      voiceEvent(v,{type:'input_audio_buffer.committed',item_id:itemId});
      voiceEvent(v,{type:'conversation.item.created',item:{id:itemId,type:'message',role:'user'}});
      voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:itemId,
        transcript:itemId===first?'I have deer tenderloins.':'Actually, use elk.'});
    }
    await v.work;await new Promise(resolve=>setTimeout(resolve,20));
    if(posts.length!==1||posts[0].itemId!==first||sent.length||
      !stop||stop.failureCode!=='STALE_REVISION'||session.revision!==0)
      throw Error('later input crossed a failed ordered save');
    document.body.dataset.regression='PASS';
  }catch(error){document.body.dataset.regression='FAIL: '+(error.stack||String(error))}
})();
</script>`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapndish-voice-save-fail-'));
    try {
      const file = path.join(directory, 'voice.html');
      fs.writeFileSync(file, page('chat', 'browser-test', true, true, true).replace('</body>', fixture + '</body>'));
      let output;
      try { output = execFileSync(chrome, ['--headless=new', '--no-first-run',
        '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
        '--virtual-time-budget=6000', `--user-data-dir=${path.join(directory, 'chrome-profile')}`,
        '--dump-dom', `file://${file}`],
      { encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (error) { output = error.stdout || error.output?.[1] || ''; }
      assert.match(output, /data-regression="PASS"/,
        output.match(/data-regression="[^"]*/)?.[0] || output.slice(-600));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

test('real browser defers tool continuation while a newer customer interruption is being saved',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`<script>
(async()=>{
  try{
    const id='11111111-1111-4111-8111-111111111111',old='item_older_tool',newer='item_newer_speech';
    session={id,revision:1,turns:[],meal_plan:null,meal_revision:0,shopping_revision:0,
      cooking_progress:null,cooking_revision:0};
    const sent=[],posted=[];let finishSave;
    window.fetch=async(url,options)=>{
      if(!url.endsWith('/voice/events'))throw Error('unexpected request');
      const body=JSON.parse(options.body);posted.push(body);
      if(body.type!=='user')throw Error('older tool result reached application authority');
      return new Promise(resolve=>{finishSave=()=>resolve(new Response(JSON.stringify({
        turnId:'turn_newer',revision:2,status:'accepted'})))});
    };
    const v={id:'22222222-2222-4222-8222-222222222222',sessionId:id,generation,
      behaviorVersion:'stage1b-meal-package-v5.1+voice-bridge-v2',work:Promise.resolve(),
      dc:{readyState:'open',send:value=>sent.push(JSON.parse(value))},
      acceptedUsers:new Map([[old,{turnId:'turn_older',revision:1}]]),
      committedInputs:[],inputResults:new Map(),inputCursor:0,pendingInputs:[],
      contextOrder:[old,'out_older_tool'],completedOutputs:new Set(['out_older_tool']),
      toolOutputs:new Set(),requests:new Map(),responseOwners:new Map(),outputOwners:new Map(),
      doneResponses:new Set(),responses:[],responseTexts:new Map(),firstUseful:new Map(),
      activeRequest:null,processingResponse:false,toolPending:false,speechActive:false,
      pendingToolOutput:{id:'tool_result_ack',itemId:old,guidance:'Continue.',toolChoice:'none'}};
    voice=v;
    voiceEvent(v,{type:'input_audio_buffer.speech_started'});
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:'out_older_tool',
      item:{id:'tool_result_ack',type:'function_call_output'}});
    if(sent.length||!v.readyContinuation)throw Error('tool continuation ignored active speech');
    voiceEvent(v,{type:'input_audio_buffer.speech_stopped'});
    if(sent.length)throw Error('speech stop requested older continuation before commit');
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:newer});
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:'tool_result_ack',
      item:{id:newer,type:'message',role:'user'}});
    if(sent.length)throw Error('older continuation raced pending transcription');
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:newer,
      transcript:'Actually, use the oven.'});
    await Promise.resolve();await Promise.resolve();
    if(!finishSave)throw Error('newer transcript save did not start');
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:newer,
      item:{id:'out_late_provider_item',type:'message',role:'assistant'}});
    if(sent.length)throw Error('older continuation raced in-flight transcript save');
    finishSave();
    await v.work;
    const requests=sent.filter(event=>event.type==='response.create');
    if(posted.length!==1||requests.length!==1||
      requests[0].response.metadata.snap_origin_item_id!==newer||
      requests[0].response.metadata.snap_phase!=='input')
      throw Error('tool continuation superseded the genuine customer interruption');
    document.body.dataset.regression='PASS';
  }catch(error){document.body.dataset.regression='FAIL: '+(error.stack||String(error))}
})();
</script>`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapndish-voice-tool-race-'));
    try {
      const file = path.join(directory, 'voice.html');
      fs.writeFileSync(file, page('chat', 'browser-test', true, true, true).replace('</body>', fixture + '</body>'));
      let output;
      try { output = execFileSync(chrome, ['--headless=new', '--no-first-run',
        '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
        '--virtual-time-budget=6000', `--user-data-dir=${path.join(directory, 'chrome-profile')}`,
        '--dump-dom', `file://${file}`],
      { encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (error) { output = error.stdout || error.output?.[1] || ''; }
      assert.match(output, /data-regression="PASS"/,
        output.match(/data-regression="[^"]*/)?.[0] || output.slice(-600));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

test('real browser preserves catfish cancellation, skips empty audio, and owns subsequent trout speech',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`<script>
(async()=>{
  try{
    const id='11111111-1111-4111-8111-111111111111';
    const voiceId='22222222-2222-4222-8222-222222222222';
    const followup='item_catfish_followup',empty='item_background_sound',next='item_trout_next',responseId='resp_catfish_followup';
    const saved={id,revision:2,active_voice_id:null,meal_plan:null,meal_revision:0,
      shopping_revision:0,cooking_progress:null,cooking_revision:0,turns:[
        {id:'33333333-3333-4333-8333-333333333333',role:'user',text:'Catfish.',revision:1},
        {id:'44444444-4444-4444-8444-444444444444',role:'assistant',text:'Which direction sounds most appealing?',revision:1},
        {id:'55555555-5555-4555-8555-555555555555',role:'user',text:'A whole fried catfish.',revision:2}]};
    session={...saved,active_voice_id:voiceId};
    let stopped;const sent=[],posted=[];
    const stopSeen=new Promise(resolve=>{stopped=resolve});
    window.fetch=async(url,options)=>{
      if(url.endsWith('/voice/events')){const body=JSON.parse(options.body);posted.push(body);if(body.type==='user'){saved.revision++;const turnId='turn_'+saved.revision;saved.turns.push({id:turnId,role:'user',text:body.transcript,revision:saved.revision});return new Response(JSON.stringify({turnId,revision:saved.revision,status:'accepted'}))}if(body.type==='assistant')return new Response(JSON.stringify({status:body.responseId==='resp_stale'?'stale_rejected':'accepted'}));throw Error('Unexpected voice event')}
      if(url.endsWith('/voice/stop')){stopped(JSON.parse(options.body));return new Response(JSON.stringify({stopped:true}))}
      if(url.endsWith('/api/sessions/'+id))return new Response(JSON.stringify(saved));
      throw Error('Unexpected request '+url);
    };
    const request={requestId:'req_catfish_followup',itemId:followup,phase:'input',responseId:null};
    const v={id:voiceId,sessionId:id,generation,work:Promise.resolve(),userOrder:[followup],
      transcripts:new Map([[followup,'A whole fried catfish.']]),
      acceptedUsers:new Map([[followup,{revision:2,turnId:saved.turns[2].id}]]),
      responses:[],responseTexts:new Map(),firstUseful:new Map(),speechStopped:null,
      repairAttempts:new Map(),
      committedInputs:[followup],inputResults:new Map(),inputCursor:1,pendingInputs:[],
      contextOrder:[followup],completedOutputs:new Set(),toolOutputs:new Set(),
      requests:new Map([[request.requestId,request]]),responseOwners:new Map(),
      outputOwners:new Map(),doneResponses:new Set(),activeRequest:request,processingResponse:false,
      pendingToolOutput:null,
      behaviorVersion:'stage1b-meal-package-v5.1+voice-bridge-v2',
      mic:{getTracks:()=>[{stop(){}}]},dc:{readyState:'open',send:value=>sent.push(JSON.parse(value)),close(){}},pc:{close(){}}};
    voice=v;
    const metadata={snap_request_id:request.requestId,snap_origin_item_id:followup,snap_phase:'input'};
    voiceEvent(v,{type:'response.created',response:{id:responseId,metadata,conversation_id:'conv_catfish'}});
    voiceEvent(v,{type:'response.output_audio_transcript.delta',response_id:responseId,delta:'A useful idea'});
    voiceEvent(v,{type:'response.done',response:{id:responseId,metadata,conversation_id:'conv_catfish',status:'cancelled',status_details:{reason:'turn_detected'},output:[]}});
    voiceEvent(v,{type:'input_audio_buffer.speech_started'});
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:empty});
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:followup,item:{id:empty,type:'message',role:'user'}});
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:empty,transcript:''});
    await v.work;
    if(voice!==v||v.failureCode||posted.length||sent.length)
      throw Error('empty transcription ended Talk It or created a customer turn');
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:next});
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:empty,item:{id:next,type:'message',role:'user'}});
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:next,transcript:'Actually, trout.'});
    await v.work;
    const created=sent.find(event=>event.type==='response.create');
    if(posted.length!==1||posted[0].itemId!==next||!created||
      created.response.metadata.snap_origin_item_id!==next||created.response.input.some(ref=>ref.id===empty))
      throw Error('next speech was not separately owned');
    const secondResponse={id:'resp_trout_next',metadata:created.response.metadata,
      conversation_id:'conv_catfish',status:'in_progress',output:[]};
    voiceEvent(v,{type:'response.created',response:secondResponse});
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:next,
      item:{id:'out_trout_next',type:'message',role:'assistant'}});
    voiceEvent(v,{type:'response.done',response:{...secondResponse,status:'completed',
      output:[{id:'out_trout_next',type:'message',content:[{transcript:'Let us make trout.'}]}]}});
    await v.work;
    voiceEvent(v,{type:'response.done',response:{...secondResponse,status:'completed',output:[]}});
    if(posted.length!==2||posted[1].type!=='assistant'||posted[1].userItemId!==next)
      throw Error('accepted reply did not retain its originating customer input');
    const older='item_late_original',newer='item_late_correction';
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:older});
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:'out_trout_next',
      item:{id:older,type:'message',role:'user'}});
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:older,
      transcript:'Cook the trout over charcoal.'});
    await v.work;
    const staleRequest=sent.filter(event=>event.type==='response.create').at(-1);
    if(staleRequest?.response.metadata.snap_origin_item_id!==older)
      throw Error('original input did not receive a response request');
    voiceEvent(v,{type:'response.created',response:{id:'resp_stale',
      metadata:staleRequest.response.metadata,conversation_id:'conv_catfish'}});
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:newer});
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:older,
      item:{id:newer,type:'message',role:'user'}});
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:newer,
      transcript:'Actually, use the oven.'});
    await v.work;
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:newer,
      item:{id:'out_stale',type:'message',role:'assistant'}});
    voiceEvent(v,{type:'response.done',response:{id:'resp_stale',
      metadata:staleRequest.response.metadata,conversation_id:'conv_catfish',status:'completed',
      output:[{id:'out_stale',type:'message',content:[{transcript:'Use charcoal.'}]}]}});
    await v.work;
    const correctionRequest=sent.filter(event=>event.type==='response.create').at(-1);
    if(correctionRequest?.response.metadata.snap_origin_item_id!==newer||
      correctionRequest.response.input.some(ref=>ref.id==='out_stale')||
      !correctionRequest.response.input.some(ref=>ref.id==='out_trout_next'))
      throw Error('stale completed output contaminated the next response context');
    await endVoice();
    const stop=await stopSeen;
    if(stop.failureCode||stop.diagnostics.stopReason!=='manual')
      throw Error('empty transcription incorrectly marked voice failure');
    const events=stop.diagnostics.events;
    if(!events.some(x=>x.kind==='response_done'&&x.responseId===responseId&&x.status==='cancelled')||
      !events.some(x=>x.kind==='transcription_completed'&&x.itemId===empty&&x.outcome==='empty'))
      throw Error('response cancellation and empty transcription were not correlated');
    if(JSON.stringify(stop.diagnostics).includes('A useful idea')||
      JSON.stringify(stop.diagnostics).includes('A whole fried catfish'))
      throw Error('private transcript content entered diagnostics');
    await new Promise(resolve=>setTimeout(resolve,20));
    if(voice!==null||session?.revision!==5||session?.turns?.length!==6)
      throw Error('accepted conversation did not survive voice stop');
    document.body.dataset.regression='PASS';
  }catch(error){document.body.dataset.regression='FAIL: '+(error.stack||String(error))}
})();
</script>`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapndish-voice-diagnostic-'));
    try {
      const file = path.join(directory, 'voice.html');
      fs.writeFileSync(file, page('chat', 'browser-test', true, true, true).replace('</body>', fixture + '</body>'));
      let output;
      try { output = execFileSync(chrome, ['--headless=new', '--no-first-run',
        '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
        '--virtual-time-budget=6000', `--user-data-dir=${path.join(directory, 'chrome-profile')}`,
        '--dump-dom', `file://${file}`],
      { encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (error) { output = error.stdout || error.output?.[1] || ''; }
      assert.match(output, /data-regression="PASS"/,
        output.match(/data-regression="[^"]*/)?.[0] || output.slice(-600));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

test('real browser never schedules a response after End Talk It while transcript save completes',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`<script>
(async()=>{
  try{
    const id='11111111-1111-4111-8111-111111111111';
    const voiceId='22222222-2222-4222-8222-222222222222';
    const itemId='item_trout_close';
    const saved={id,revision:0,active_voice_id:voiceId,meal_plan:null,meal_revision:0,
      shopping_revision:0,cooking_progress:null,cooking_revision:0,turns:[]};
    session=saved;
    const sent=[];let finishSave,stop;
    window.fetch=async(url,options)=>{
      if(url.endsWith('/voice/events')){
        const body=JSON.parse(options.body);if(body.type!=='user')throw Error('Reply posted after close');
        return new Promise(resolve=>{finishSave=()=>{
          saved.revision=1;saved.turns.push({id:'turn_trout_close',role:'user',text:body.transcript,revision:1});
          resolve(new Response(JSON.stringify({turnId:'turn_trout_close',revision:1,status:'accepted'})));
        }});
      }
      if(url.endsWith('/voice/stop')){stop=JSON.parse(options.body);return new Response(JSON.stringify({stopped:true}))}
      if(url.endsWith('/api/sessions/'+id))return new Response(JSON.stringify(saved));
      throw Error('Unexpected request '+url);
    };
    const v={id:voiceId,sessionId:id,generation,work:Promise.resolve(),userOrder:[],responses:[],
      transcripts:new Map(),acceptedUsers:new Map(),responseTexts:new Map(),firstUseful:new Map(),
      speechStopped:null,syncFailed:false,failureCode:null,pendingTool:null,toolPending:false,
      repairAttempts:new Map(),awaitingUsefulSpeech:null,
      behaviorVersion:'stage1b-meal-package-v5.1+voice-bridge-v2',
      committedInputs:[],inputResults:new Map(),inputCursor:0,pendingInputs:[],contextOrder:[],
      completedOutputs:new Set(),toolOutputs:new Set(),requests:new Map(),responseOwners:new Map(),
      outputOwners:new Map(),doneResponses:new Set(),activeRequest:null,processingResponse:false,
      pendingToolOutput:null,
      mic:{getTracks:()=>[{stop(){}}]},dc:{readyState:'open',send:value=>sent.push(JSON.parse(value)),close(){}},
      pc:{close(){}}};
    voice=v;
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:itemId});
    voiceEvent(v,{type:'conversation.item.created',item:{id:itemId,type:'message',role:'user'}});
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:itemId,
      transcript:'Please make trout.'});
    await Promise.resolve();await Promise.resolve();
    if(!finishSave)throw Error('transcript save was not pending');
    const ending=endVoice();
    finishSave();await ending;
    if(!stop||stop.diagnostics.stopReason!=='manual'||sent.some(event=>event.type==='response.create')||
      saved.turns.length!==1||voice!==null)
      throw Error('closed Talk It issued a response or lost the committed customer turn');
    document.body.dataset.regression='PASS';
  }catch(error){document.body.dataset.regression='FAIL: '+(error.stack||String(error))}
})();
</script>`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapndish-voice-close-'));
    try {
      const file = path.join(directory, 'voice.html');
      fs.writeFileSync(file, page('chat', 'browser-test', true, true, true).replace('</body>', fixture + '</body>'));
      let output;
      try { output = execFileSync(chrome, ['--headless=new', '--no-first-run',
        '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
        '--virtual-time-budget=6000', `--user-data-dir=${path.join(directory, 'chrome-profile')}`,
        '--dump-dom', `file://${file}`],
      { encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (error) { output = error.stdout || error.output?.[1] || ''; }
      assert.match(output, /data-regression="PASS"/,
        output.match(/data-regression="[^"]*/)?.[0] || output.slice(-600));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

test('real browser orders transcription results and fails closed on mismatched response identity',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`<script>
(async()=>{
  try{
    const id='11111111-1111-4111-8111-111111111111';
    const voiceId='22222222-2222-4222-8222-222222222222';
    const first='item_deer_original',second='item_deer_correction';
    const saved={id,revision:0,active_voice_id:voiceId,meal_plan:null,meal_revision:0,
      shopping_revision:0,cooking_progress:null,cooking_revision:0,turns:[]};
    session=saved;
    const sent=[],posts=[];let stop;
    window.fetch=async(url,options)=>{
      if(url.endsWith('/voice/events')){
        const body=JSON.parse(options.body);posts.push(body);
        if(body.type!=='user')throw Error('A mismatched response reached application authority');
        saved.revision++;const turnId='turn_deer_'+saved.revision;
        saved.turns.push({id:turnId,role:'user',text:body.transcript,revision:saved.revision});
        return new Response(JSON.stringify({turnId,revision:saved.revision,status:'accepted'}));
      }
      if(url.endsWith('/voice/stop')){stop=JSON.parse(options.body);return new Response(JSON.stringify({stopped:true}))}
      if(url.endsWith('/api/sessions/'+id))return new Response(JSON.stringify(saved));
      throw Error('Unexpected request '+url);
    };
    const v={id:voiceId,sessionId:id,generation,work:Promise.resolve(),userOrder:[],responses:[],
      transcripts:new Map(),acceptedUsers:new Map(),responseTexts:new Map(),firstUseful:new Map(),
      speechStopped:null,syncFailed:false,failureCode:null,pendingTool:null,toolPending:false,
      repairAttempts:new Map(),awaitingUsefulSpeech:null,
      behaviorVersion:'stage1b-meal-package-v5.1+voice-bridge-v2',
      committedInputs:[],inputResults:new Map(),inputCursor:0,pendingInputs:[],contextOrder:[],
      completedOutputs:new Set(),toolOutputs:new Set(),requests:new Map(),responseOwners:new Map(),
      outputOwners:new Map(),doneResponses:new Set(),activeRequest:null,processingResponse:false,
      pendingToolOutput:null,
      mic:{getTracks:()=>[{stop(){}}]},dc:{readyState:'open',send:value=>sent.push(JSON.parse(value)),close(){}},
      pc:{close(){}}};
    voice=v;
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:first});
    voiceEvent(v,{type:'conversation.item.created',item:{id:first,type:'message',role:'user'}});
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:second});
    voiceEvent(v,{type:'conversation.item.created',previous_item_id:first,
      item:{id:second,type:'message',role:'user'}});
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:second,
      transcript:'Actually, make that elk.'});
    await v.work;
    if(posts.length||sent.length)throw Error('later transcription overtook committed input');
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:first,
      transcript:'I have deer tenderloins.'});
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:second,
      transcript:'Actually, make that elk.'});
    await v.work;
    const request=sent.find(event=>event.type==='response.create');
    if(posts.length!==2||posts[0].itemId!==first||posts[1].itemId!==second||!request||
      request.response.metadata.snap_origin_item_id!==second||
      !request.response.input.some(ref=>ref.id===first)||
      sent.filter(event=>event.type==='response.create').length!==1)
      throw Error('late/duplicate transcription changed accepted order or response owner');
    voiceEvent(v,{type:'response.created',response:{id:'resp_wrong_owner',
      metadata:{...request.response.metadata,snap_origin_item_id:first},
      conversation_id:'conv_deer',status:'in_progress'}});
    await new Promise(resolve=>setTimeout(resolve,25));
    if(!stop||stop.failureCode!=='VOICE_OWNERSHIP_ERROR'||
      stop.diagnostics.stopReason!=='ownership_error'||
      posts.some(post=>post.type==='assistant')||saved.turns.length!==2)
      throw Error('mismatched response did not fail closed with accepted input intact');
    voiceEvent(v,{type:'response.done',response:{id:'resp_wrong_owner',status:'completed'}});
    if(posts.length!==2)throw Error('late completion changed application state');
    document.body.dataset.regression='PASS';
  }catch(error){document.body.dataset.regression='FAIL: '+(error.stack||String(error))}
})();
</script>`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapndish-voice-order-'));
    try {
      const file = path.join(directory, 'voice.html');
      fs.writeFileSync(file, page('chat', 'browser-test', true, true, true).replace('</body>', fixture + '</body>'));
      let output;
      try { output = execFileSync(chrome, ['--headless=new', '--no-first-run',
        '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
        '--virtual-time-budget=6000', `--user-data-dir=${path.join(directory, 'chrome-profile')}`,
        '--dump-dom', `file://${file}`],
      { encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch (error) { output = error.stdout || error.output?.[1] || ''; }
      assert.match(output, /data-regression="PASS"/,
        output.match(/data-regression="[^"]*/)?.[0] || output.slice(-600));
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
