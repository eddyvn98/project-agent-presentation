import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { settings } from './config.mjs';
import { definitions,execute,isKnownTool } from './tools.mjs';
const config=settings();
const reply=(res,status,payload)=>{
  const body=JSON.stringify(payload);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body)});
  res.end(body);
};
const error=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const result=(id,value)=>({jsonrpc:'2.0',id,result:value});
const authorized=req=>{
  if(!config.token)return true;
  const a=Buffer.from(req.headers.authorization||'');
  const b=Buffer.from(`Bearer ${config.token}`);
  return a.length===b.length&&timingSafeEqual(a,b);
};
const validRequest=req=>{
  const port=req.socket.localPort;
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return false;
  const origin=req.headers.origin;
  return !origin||[`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin);
};
export async function processRpc(message){
  const id=message?.id??null;
  if(message?.jsonrpc!=='2.0'||typeof message.method!=='string')return error(id,-32600,'Invalid JSON-RPC');
  if(message.method.startsWith('notifications/'))return null;
  if(id===null)return error(null,-32600,'Missing id');
  switch(message.method){
    case 'initialize':return result(id,{
      protocolVersion:['2025-11-25','2025-06-18'].includes(message.params?.protocolVersion)?message.params.protocolVersion:'2025-11-25',
      capabilities:{tools:{listChanged:false}},
      serverInfo:{name:'local-browser-mcp',version:'0.1.0'},
      instructions:'Only operate approved local web apps. Confirm destructive actions with user.'
    });
    case 'ping':return result(id,{});
    case 'tools/list':return result(id,{tools:definitions});
    case 'tools/call':{
      const name=message.params?.name;
      if(!isKnownTool(name))return error(id,-32602,'Unknown tool');
      try{
        const data=await execute(name,message.params?.arguments||{});
        return result(id,{content:data?.__image?[{type:'image',data:data.__image,mimeType:data.mimeType}]:[{type:'text',text:JSON.stringify(data)}]});
      }catch(e){
        return result(id,{isError:true,content:[{type:'text',text:String(e.message||e)}]});
      }
    }
    default:return error(id,-32601,'Method not found');
  }
}
export function makeServer(){
  return http.createServer(async(req,res)=>{
    if(!validRequest(req))return reply(res,403,{error:'Forbidden origin or host'});
    if(!authorized(req))return reply(res,401,{error:'Unauthorized'});
    if(req.url==='/healthz'&&req.method==='GET')return reply(res,200,{status:'ok'});
    if(req.url!=='/mcp')return reply(res,404,{error:'Not found'});
    if(req.method!=='POST')return reply(res,405,{error:'POST required'});
    if(!req.headers['content-type']?.includes('application/json'))return reply(res,415,{error:'JSON required'});
    try{
      let body='';
      for await(const chunk of req){body+=chunk;if(body.length>128000)return reply(res,413,{error:'Too large'});}
      const output=await processRpc(JSON.parse(body));
      if(output===null){res.writeHead(202);return res.end();}
      return reply(res,200,output);
    }catch{return reply(res,400,error(null,-32700,'Invalid JSON'));}
  });
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href)
  makeServer().listen(config.port,'127.0.0.1',()=>console.error(`Browser MCP ready: http://127.0.0.1:${config.port}/mcp`));
