import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {repositoryName,secureOrigin,sourceFromRelease} from './core.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const routes={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.mjs':['app.mjs','text/javascript'],'/core.mjs':['core.mjs','text/javascript'],'/github.mjs':['github.mjs','text/javascript'],'/refresh.mjs':['refresh.mjs','text/javascript'],'/style.css':['style.css','text/css'],'/sw.js':['sw.js','text/javascript'],'/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'],'/icon.svg':['icon.svg','image/svg+xml'],'/icon-192.png':['dist/icon-192.png','image/png'],'/icon-512.png':['dist/icon-512.png','image/png'],'/apple-touch-icon.png':['dist/apple-touch-icon.png','image/png']};
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"};
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function readBody(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>12000)throw Object.assign(new Error('Request too large'),{status:413});}try{return JSON.parse(text);}catch{throw Object.assign(new Error('Expected JSON body'),{status:400});}}
export function createApp({env=process.env,fetcher=fetch}={}){
  const key=env.APP_API_KEY??'',token=env.GITHUB_TOKEN??'';
  const repositories=(env.GITHUB_REPOSITORIES??'').split(',').map(x=>x.trim()).filter(Boolean).map(repositoryName);
  const ref=env.GITHUB_REF||'main',origin=env.PUBLIC_URL?secureOrigin(env.PUBLIC_URL):null;
  const dispatched=new Map();
  async function gh(path,options={}){
    if(!token)throw Object.assign(new Error('后端尚未配置 GITHUB_TOKEN'),{status:503});
    const r=await fetcher('https://api.github.com'+path,{...options,signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'Pocket-Build','Content-Type':'application/json'}});
    if(!r.ok)throw Object.assign(new Error('GitHub 返回 '+r.status+'；检查仓库权限、分支与工作流'),{status:502});
    return r.status===204?null:r.json();
  }
  return http.createServer(async(req,res)=>{
    const send=(status,data,extra={})=>{res.writeHead(status,{...headers,'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));};
    try{
      const u=new URL(req.url,'http://localhost');
      // No permissive CORS. Browser sends the control key only to this server.
      if(req.headers.origin&&req.headers.origin!==(origin??'http://'+req.headers.host))return send(403,{error:'禁止跨域请求，请从后端同一域名打开控制台'});
      if(u.pathname==='/api/health'&&req.method==='GET')return send(200,{ok:true,configured:key.length>=32&&!!token&&repositories.length>0});
      if(u.pathname==='/api/openapi.json'&&req.method==='GET'){
        const schema=JSON.parse(await readFile(resolve(root,'openapi.json'),'utf8'));
        if(origin)schema.servers=[{url:origin}];
        return send(200,schema);
      }
      if(u.pathname.startsWith('/api/')){
        if(key.length<32)return send(503,{error:'后端尚未配置至少 32 字符的 APP_API_KEY'});
        if(!equal(req.headers.authorization??'','Bearer '+key))return send(401,{error:'需要有效控制台 API Key'});
        if(u.pathname==='/api/config'&&req.method==='GET')return send(200,{repositories,ref,githubConfigured:!!token});
        const p=req.method==='POST'?await readBody(req):Object.fromEntries(u.searchParams);
        const repo=repositoryName(p.repository);
        if(!repositories.includes(repo))return send(403,{error:'仓库不在 GITHUB_REPOSITORIES 白名单中'});
        if(u.pathname==='/api/status'&&req.method==='GET'){
          const result=await gh('/repos/'+repo+'/actions/workflows/ios-build.yml/runs?per_page=10');
          return send(200,{repository:repo,runs:result.workflow_runs.map(r=>({id:r.id,status:r.status,conclusion:r.conclusion,url:r.html_url,title:r.display_title,createdAt:r.created_at,sha:r.head_sha}))});
        }
        if(u.pathname==='/api/build'&&req.method==='POST'){
          if(!['sidestore','testflight'].includes(p.mode))return send(400,{error:'mode 必须为 sidestore 或 testflight'});
          const now=Date.now();
          if(now-(dispatched.get(repo)??0)<60000)return send(429,{error:'每个仓库每分钟最多一次构建'});
          dispatched.set(repo,now);
          const id='pb-'+randomUUID();
          let dispatch;
          try{dispatch=await gh('/repos/'+repo+'/actions/workflows/ios-build.yml/dispatches',{method:'POST',body:JSON.stringify({ref,inputs:{distribution:p.mode,request_id:id}})});}catch(e){dispatched.delete(repo);throw e;}
          return send(202,{accepted:true,repository:repo,ref,requestId:id,runId:dispatch?.workflow_run_id??null,createdAt:new Date().toISOString(),message:'GitHub 已接受请求；请刷新查看实际构建状态',url:'https://github.com/'+repo+'/actions/workflows/ios-build.yml'});
        }
        if(u.pathname==='/api/source'&&req.method==='GET')return send(200,sourceFromRelease(repo,await gh('/repos/'+repo+'/releases/latest')),{'Content-Disposition':'attachment; filename="sidestore-source.json"'});
        return send(404,{error:'API not found'});
      }
      if(!['GET','HEAD'].includes(req.method))return send(405,{error:'Method not allowed'});
      if(!Object.hasOwn(routes,u.pathname))return send(404,{error:'Not found'});
      const [path,type]=routes[u.pathname],bytes=await readFile(resolve(root,path));
      res.writeHead(200,{...headers,'Content-Type':type+(type.startsWith('image/')?'':'; charset=utf-8'),'Cache-Control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch(e){send(e.status??(e.code==='ENOENT'?404:400),{error:e.message==='fetch failed'?'无法连接 GitHub':e.message});}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8787);
  createApp().listen(port,host,()=>console.log('Pocket Build: http://'+host+':'+port));
}

