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

test('real browser renders and navigates the V1 dashboard with owned recipe data',
  { skip: !process.env.SNAP_BROWSER_TEST && 'Set SNAP_BROWSER_TEST=1 to run Chrome' }, () => {
    assert.ok(chrome, 'Chrome is required for the browser regression');
    const fixture = String.raw`<script>
(async()=>{
  try {
    const id='11111111-1111-4111-8111-111111111111';
    const recipeId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const plan={meal:'Ginger chicken and rice',servings:2,sections:[
      {section:'Produce',items:[{id:'33333333-3333-4333-8333-333333333333',
        name:'Ginger',quantity:'1 knob',checked:false,have_status:'need'}]}],
      full_plan:[{title:'Cook',directions:'Cook the chicken safely and serve over rice.'}]};
    window.fetch=async url=>{
      if(url==='/api/dashboard')return new Response(JSON.stringify({active_cooks:[{
        id,source_session_id:id,selected_at:new Date().toISOString(),status:'selected',
        recipe_version_id:recipeId,meal:plan.meal,servings:2,session_available:1}],
        previously_cooked:[{recipe_version_id:recipeId,meal:plan.meal,servings:2,
          accepted_at:new Date().toISOString(),status:'selected'}],future_cooks:[],favorites:[]}));
      if(url==='/api/dashboard/recipes/'+recipeId)return new Response(JSON.stringify({
        id:recipeId,meal:plan.meal,servings:2,accepted_at:new Date().toISOString(),recipe:plan}));
      if(url==='/api/sessions/'+id)return new Response(JSON.stringify({id,revision:1,turns:[],
        meal_plan:plan,meal_revision:1,shopping_revision:1,cooking_progress:null,cooking_revision:0}));
      throw Error('Unexpected request '+url);
    };
    session={id,revision:1,turns:[],meal_plan:plan,meal_revision:1,shopping_revision:1,
      cooking_progress:null,cooking_revision:0};
    render();
    await new Promise(resolve=>setTimeout(resolve,100));
    if(!document.getElementById('dash-today-list').textContent.includes(plan.meal))
      throw Error('Today card missing');
    if(!document.getElementById('dash-history-list').textContent.includes('cooking not confirmed'))
      throw Error('History claims physical cooking');
    if(!document.getElementById('dash-shopping-list').textContent.includes(plan.meal))
      throw Error('Shopping is disconnected from accepted state');
    document.querySelector('#dash-history-list button').click();
    await new Promise(resolve=>setTimeout(resolve,50));
    if(!document.getElementById('dash-recipe-dialog').open||
      !document.getElementById('dash-recipe-detail').textContent.includes('Cook the chicken safely'))
      throw Error('Immutable recipe detail did not open');
    document.getElementById('dash-detail-close').click();
    document.getElementById('dash-write').click();
    if(document.activeElement!==document.getElementById('input'))throw Error('Write It did not focus conversation');
    document.querySelector('#dash-shopping-list button').click();
    if(shopping.hidden||!planDetails.open)throw Error('Shopping navigation failed');
    const expectedLayout=new URL(location.href).searchParams.get('layout');
    const columns=getComputedStyle(document.querySelector('#dashboard .primary-cards'))
      .gridTemplateColumns.split(' ').length;
    if(expectedLayout==='mobile'&&(window.innerWidth>=700||columns!==1))
      throw Error('Mobile layout did not keep one card column');
    if(expectedLayout==='desktop'&&(window.innerWidth<700||columns!==2))
      throw Error('Desktop layout did not show two card columns');
    document.body.dataset.regression='PASS';
  }catch(error){document.body.dataset.regression='FAIL: '+(error.stack||String(error))}
})();
</script>`;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snapndish-dashboard-'));
    try {
      const file = path.join(directory, 'dashboard.html');
      fs.writeFileSync(file, page('chat', 'browser-test', true, true, true, false, true)
        .replace('</body>', fixture + '</body>'));
      for (const [layout, width, height] of [['mobile', 390, 844], ['desktop', 1280, 900]]) {
        let output;
        try { output = execFileSync(chrome, ['--headless=new', '--no-first-run',
          '--no-default-browser-check', '--disable-gpu', '--disable-background-networking',
          `--window-size=${width},${height}`, '--virtual-time-budget=6000',
          `--user-data-dir=${path.join(directory, 'chrome-' + layout)}`,
          '--dump-dom', `file://${file}?layout=${layout}`],
        { encoding: 'utf8', timeout: 35_000, stdio: ['ignore', 'pipe', 'ignore'] }); }
        catch (error) { output = error.stdout || error.output?.[1] || ''; }
        assert.match(output, /data-regression="PASS"/,
          layout + ': ' + (output.match(/data-regression="[^"]*/)?.[0] || output.slice(-600)));
      }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
