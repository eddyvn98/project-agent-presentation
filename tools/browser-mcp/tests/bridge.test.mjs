import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {settings,safeUrl} from '../src/config.mjs';
import {makeServer} from '../src/server.mjs';
const allowed=settings().allowed;
test('allowlist blocks external sites and different ports',()=>{
  assert.equal(safeUrl('http://localhost:3002/account/agent-skills',allowed),'http://localhost:3002/account/agent-skills');
  for(const url of ['https://example.com','http://localhost:3003/','file:///tmp/a','http://user:pw@localhost:3002'])
    assert.throws(()=>safeUrl(url,allowed));
});
test('MCP protocol and browser tools list',async()=>{
  const server=makeServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  after(()=>server.close());
  const port=server.address().port;
  const post=(body,origin)=>fetch(`http://127.0.0.1:${port}/mcp`,{
    method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)
  });
  let r=await post({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});
  assert.equal(r.status,200);assert.equal((await r.json()).result.protocolVersion,'2025-11-25');
  r=await post({jsonrpc:'2.0',id:2,method:'tools/list'});
  const names=(await r.json()).result.tools.map(x=>x.name);
  assert.ok(names.includes('browser_click'));assert.ok(names.includes('browser_screenshot'));
  r=await post({jsonrpc:'2.0',id:3,method:'tools/list'},'https://evil.example');
  assert.equal(r.status,403);
});
test('Chromium CDP click and screenshot (optional integration)',{skip:!process.env.CHROME_BIN},async()=>{
  const {spawn}=await import('node:child_process');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {devtools,withTab,evaluate,mouseClick}=await import('../src/cdp.mjs');
  const dir=await mkdtemp(join(tmpdir(),'browser-mcp-'));
  const child=spawn(process.env.CHROME_BIN,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--remote-debugging-port=9223','--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${dir}`,'about:blank'],{stdio:'ignore'});
  try{
    let tab;
    for(let i=0;i<50;i++){
      try{tab=(await devtools('/json/list',settings())).find(t=>t.type==='page');if(tab)break;}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(tab);
    await withTab(tab,async cdp=>{
      await evaluate(cdp,`document.body.innerHTML='<button id="btn">Go</button><span id="state">Ready</span>';document.getElementById('btn').onclick=()=>document.getElementById('state').innerText='Clicked';`);
      await mouseClick(cdp,'#btn');
      assert.equal(await evaluate(cdp,`document.getElementById('state').innerText`),'Clicked');
      const shot=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:65});
      assert.ok(shot.data.length>100);
    });
  }finally{
    child.kill('SIGKILL');
    await new Promise(r=>child.once('exit',r));
    await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
