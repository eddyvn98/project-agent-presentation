const CDP_TIMEOUT = 12000;
export async function devtools(path, config, method = 'GET') {
  const r = await fetch(`http://127.0.0.1:${config.cdpPort}${path}`, { method, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Chrome DevTools HTTP ${r.status}`);
  return r.json();
}
export class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.pending = new Map(); this.seq = 0;
    this.ready = new Promise((resolve,reject)=>{
      this.ws.addEventListener('open',resolve,{once:true});
      this.ws.addEventListener('error',()=>reject(new Error('CDP socket error')),{once:true});
    });
    this.ws.addEventListener('message',({data})=>{
      const msg=JSON.parse(data);
      if(msg.id&&this.pending.has(msg.id)){
        const {resolve,reject,timeout}=this.pending.get(msg.id);
        clearTimeout(timeout);this.pending.delete(msg.id);
        if(msg.error)reject(new Error(msg.error.message));else resolve(msg.result||{});
      }
    });
    this.ws.addEventListener('close',()=>{
      for(const {reject,timeout} of this.pending.values()){clearTimeout(timeout);reject(new Error('CDP socket closed'));}
      this.pending.clear();
    });
  }
  async send(method,params={}){
    await this.ready;
    if(this.ws.readyState!==1)throw new Error('CDP disconnected');
    return new Promise((resolve,reject)=>{
      const id=++this.seq;
      const timeout=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out`));},CDP_TIMEOUT);
      this.pending.set(id,{resolve,reject,timeout});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close(){this.ws.close();}
}
export async function withTab(tab,fn){
  if(!tab.webSocketDebuggerUrl)throw new Error('No CDP socket');
  const cdp=new CDP(tab.webSocketDebuggerUrl);
  try{return await fn(cdp);}finally{cdp.close();}
}
export async function evaluate(cdp,expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:false});
  if(r.exceptionDetails)throw new Error('Page evaluation failed');
  return r.result?.value;
}
async function elementBounds(cdp,selector){
  const value=await evaluate(cdp,`(() => {
    const nodes=[...document.querySelectorAll(${JSON.stringify(selector)})];
    if(nodes.length!==1)return {error:'Expected one element; found '+nodes.length};
    const node=nodes[0],box=node.getBoundingClientRect();
    if(!box.width||!box.height)return {error:'Element not visible'};
    node.scrollIntoView({block:'center',inline:'center'});
    const r=node.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  })()`);
  if(!value||value.error)throw new Error(value?.error||'No element');
  return value;
}
export async function waitBounds(cdp,selector){
  for(let i=0;i<30;i++){
    try{return await elementBounds(cdp,selector);}
    catch(err){if(!String(err.message).includes('found 0')||i===29)throw err;
      await new Promise(resolve=>setTimeout(resolve,100));}
  }
}
export async function mouseClick(cdp,selector){
  const {x,y}=await waitBounds(cdp,selector);
  for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
}
export async function keyPress(cdp,key){
  const map={Enter:13,Tab:9,Escape:27};
  if(!(key in map))throw new Error('Unsupported key');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:map[key]});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:map[key]});
}
