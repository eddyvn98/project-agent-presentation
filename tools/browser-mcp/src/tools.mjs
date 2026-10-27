import { settings,safeUrl,requireTab } from './config.mjs';
import { devtools,evaluate,waitBounds,mouseClick,keyPress,withTab } from './cdp.mjs';
const string={type:'string'};
const shape=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const tab={tab_id:string};
export const definitions=[
 ['browser_status','Check Chrome debug connection',shape({}),true],
 ['browser_tabs','List approved Chrome tabs',shape({}),true],
 ['browser_open','Open approved URL',shape({url:string},['url'])],
 ['browser_navigate','Navigate approved tab',shape({...tab,url:string},['tab_id','url'])],
 ['browser_snapshot','Read page and controls (not input values)',shape(tab,['tab_id']),true],
 ['browser_click','Click unique CSS selector',shape({...tab,selector:string},['tab_id','selector'])],
 ['browser_fill','Fill text input or textarea',shape({...tab,selector:string,text:string},['tab_id','selector','text'])],
 ['browser_press','Press Enter, Tab or Escape',shape({...tab,key:{type:'string',enum:['Enter','Tab','Escape']}},['tab_id','key'])],
 ['browser_screenshot','Screenshot approved tab as JPEG',shape(tab,['tab_id']),true]
].map(([name,description,inputSchema,readOnly])=>({name,description,inputSchema,...(readOnly?{annotations:{readOnlyHint:true}}:{})}));
const config=settings();
const tabs=()=>devtools('/json/list',config);
const chosen=async id=>requireTab(await tabs(),id,config.allowed);
const allowedTab=async (id,fn)=>withTab(await chosen(id),async cdp=>{
  safeUrl(await evaluate(cdp,'location.href'),config.allowed);
  return fn(cdp);
});
const selector=s=>{
  if(typeof s!=='string'||!s.trim()||s.length>256)throw new Error('Invalid selector');
  return s;
};
export async function execute(name,input={}){
  switch(name){
    case 'browser_status':{
      const v=await devtools('/json/version',config);
      return {connected:true,browser:v.Browser,allowed_origins:[...config.allowed]};
    }
    case 'browser_tabs':return (await tabs()).filter(t=>{
      try{requireTab([t],t.id,config.allowed);return true;}catch{return false;}
    }).map(t=>({id:t.id,title:t.title,url:t.url}));
    case 'browser_open':{
      const url=safeUrl(input.url,config.allowed);
      const t=await devtools(`/json/new?${encodeURIComponent(url)}`,config,'PUT');
      for(let i=0;i<30;i++){
        const current=(await tabs()).find(p=>p.id===t.id);
        if(current){try{safeUrl(current.url,config.allowed);return {id:t.id,url:current.url};}catch{}}
        await new Promise(r=>setTimeout(r,100));
      }
      throw new Error('New tab did not reach approved origin');
    }
    case 'browser_navigate':{
      const url=safeUrl(input.url,config.allowed);
      return allowedTab(input.tab_id,async cdp=>{
        await cdp.send('Page.enable');
        const result=await cdp.send('Page.navigate',{url});
        if(result.errorText)throw new Error(result.errorText);
        return {tab_id:input.tab_id,url};
      });
    }
    case 'browser_snapshot':return allowedTab(input.tab_id,cdp=>evaluate(cdp,`(() => ({
      title:document.title,url:location.href,
      text:(document.body?.innerText||'').slice(0,16000),
      controls:[...document.querySelectorAll('button,a,input,textarea,select')].slice(0,80).map(e=>({
        tag:e.tagName.toLowerCase(),
        label:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||'').slice(0,120)
      }))
    }))()`));
    case 'browser_click':return allowedTab(input.tab_id,async cdp=>{
      await mouseClick(cdp,selector(input.selector));return {clicked:true};
    });
    case 'browser_fill':return allowedTab(input.tab_id,async cdp=>{
      selector(input.selector);
      if(typeof input.text!=='string'||input.text.length>5000)throw new Error('Invalid text');
      await waitBounds(cdp,input.selector);
      const ok=await evaluate(cdp,`(() => {
        const e=document.querySelector(${JSON.stringify(input.selector)});
        if(!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement)||e.disabled||e.readOnly||e.type==='password')return false;
        e.focus();e.select();return true;
      })()`);
      if(!ok)throw new Error('Unsupported or sensitive field');
      const mac=await evaluate(cdp,`/Mac/.test(navigator.platform)`);
      const modifiers=mac?4:2;
      for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers});
      await cdp.send('Input.insertText',{text:input.text});
      return {filled:true,length:input.text.length};
    });
    case 'browser_press':return allowedTab(input.tab_id,async cdp=>{
      await keyPress(cdp,input.key);return {pressed:input.key};
    });
    case 'browser_screenshot':return allowedTab(input.tab_id,async cdp=>{
      await cdp.send('Page.enable');
      const shot=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:65,captureBeyondViewport:false});
      if(!shot.data||shot.data.length>3000000)throw new Error('Screenshot too large');
      return {__image:shot.data,mimeType:'image/jpeg'};
    });
    default:throw new Error('Unknown tool');
  }
}
export const isKnownTool=name=>definitions.some(t=>t.name===name);
