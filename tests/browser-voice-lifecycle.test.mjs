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

test('real browser captures the catfish interruption lifecycle without recording speech content',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`<script>
(async()=>{
  try{
    const id='11111111-1111-4111-8111-111111111111';
    const voiceId='22222222-2222-4222-8222-222222222222';
    const followup='item_catfish_followup',empty='item_background_sound',responseId='resp_catfish_followup';
    const saved={id,revision:2,active_voice_id:null,meal_plan:null,meal_revision:0,
      shopping_revision:0,cooking_progress:null,cooking_revision:0,turns:[
        {id:'33333333-3333-4333-8333-333333333333',role:'user',text:'Catfish.',revision:1},
        {id:'44444444-4444-4444-8444-444444444444',role:'assistant',text:'Which direction sounds most appealing?',revision:1},
        {id:'55555555-5555-4555-8555-555555555555',role:'user',text:'A whole fried catfish.',revision:2}]};
    session={...saved,active_voice_id:voiceId};
    let stopped;
    const stopSeen=new Promise(resolve=>{stopped=resolve});
    window.fetch=async(url,options)=>{
      if(url.endsWith('/voice/stop')){stopped(JSON.parse(options.body));return new Response(JSON.stringify({stopped:true}))}
      if(url.endsWith('/api/sessions/'+id))return new Response(JSON.stringify(saved));
      throw Error('Unexpected request '+url);
    };
    const v={id:voiceId,sessionId:id,generation,work:Promise.resolve(),userOrder:[followup],
      transcripts:new Map([[followup,'A whole fried catfish.']]),
      acceptedUsers:new Map([[followup,{revision:2,turnId:saved.turns[2].id}]]),
      responses:[],responseTexts:new Map(),firstUseful:new Map(),speechStopped:null,
      behaviorVersion:'stage1b-meal-package-v5.1+voice-bridge-v2',
      mic:{getTracks:()=>[{stop(){}}]},dc:{readyState:'open',close(){}},pc:{close(){}}};
    voice=v;
    voiceEvent(v,{type:'response.created',response:{id:responseId}});
    voiceEvent(v,{type:'response.output_audio_transcript.delta',response_id:responseId,delta:'A useful idea'});
    voiceEvent(v,{type:'response.done',response:{id:responseId,status:'cancelled',output:[]}});
    voiceEvent(v,{type:'input_audio_buffer.speech_started'});
    voiceEvent(v,{type:'input_audio_buffer.committed',item_id:empty});
    voiceEvent(v,{type:'conversation.item.input_audio_transcription.completed',item_id:empty,transcript:''});
    const stop=await stopSeen;
    if(stop.failureCode!=='EMPTY_TRANSCRIPT'||stop.diagnostics.stopReason!=='empty_transcript')
      throw Error('empty transcription did not preserve its shutdown reason');
    const events=stop.diagnostics.events;
    if(!events.some(x=>x.kind==='response_done'&&x.responseId===responseId&&x.status==='cancelled')||
      !events.some(x=>x.kind==='transcription_completed'&&x.itemId===empty&&x.outcome==='empty'))
      throw Error('response cancellation and empty transcription were not correlated');
    if(JSON.stringify(stop.diagnostics).includes('A useful idea')||
      JSON.stringify(stop.diagnostics).includes('A whole fried catfish'))
      throw Error('private transcript content entered diagnostics');
    await new Promise(resolve=>setTimeout(resolve,20));
    if(voice!==null||session?.revision!==2||session?.turns?.length!==3)
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
