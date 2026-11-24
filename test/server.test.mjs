import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {createApp} from '../server.mjs';
const key='test-only-control-key-32-characters-long';
const env={APP_API_KEY:key,GITHUB_TOKEN:'test-only-token',GITHUB_REPOSITORIES:'a/b',GITHUB_REF:'main'};
async function fixture(t,options={}){
  const server=createApp({env,...options});
  // Exercise the real HTTP request handler in-process; no network permission needed.
  return (path,options={})=>new Promise(resolve=>{
    const req=Readable.from(options.body?[Buffer.from(options.body)]:[]);
    req.url=path;req.method=options.method||'GET';
    req.headers={host:'127.0.0.1',authorization:'Bearer '+key,'content-type':'application/json'};
    for(const [k,v]of Object.entries(options.headers||{}))req.headers[k.toLowerCase()]=v;
    let status=200,responseHeaders={};
    const res={writeHead(s,h){status=s;responseHeaders=h;},end(data){resolve(new Response(data,{status,headers:responseHeaders}));}};
    server.emit('request',req,res);
  });
}
test('auth, allowlist, CORS and method validation precede GitHub mutations',async t=>{
  let calls=0;const call=await fixture(t,{fetcher:async()=>{calls++;throw Error('Should not call GitHub');}});
  assert.equal((await call('/api/config',{headers:{Authorization:'wrong'}})).status,401);
  assert.equal((await call('/api/config',{headers:{Origin:'https://evil.test'}})).status,403);
  assert.equal((await call('/api/build',{method:'POST',body:JSON.stringify({repository:'x/y',mode:'sidestore'})})).status,403);
  assert.equal((await call('/api/build',{method:'POST',body:JSON.stringify({repository:'a/b',mode:'invalid'})})).status,400);
  assert.equal(calls,0);
});
test('dispatch passes only configured ref and rate limits repeated paid work',async t=>{
  const calls=[];const call=await fixture(t,{fetcher:async(url,options)=>{calls.push({url,options});return new Response(null,{status:204});}});
  const body=JSON.stringify({repository:'a/b',mode:'testflight',ref:'attacker-branch'});
  const first=await call('/api/build',{method:'POST',body});assert.equal(first.status,202);
  assert.equal((await first.json()).accepted,true);
  assert.deepEqual(JSON.parse(calls[0].options.body),{ref:'main',inputs:{distribution:'testflight'}});
  assert.equal((await call('/api/build',{method:'POST',body})).status,429);
  assert.equal(calls.length,1);
});
test('GitHub errors remain failures and do not leak provider messages',async t=>{
  const call=await fixture(t,{fetcher:async()=>new Response('secret-provider-debug',{status:403})});
  const r=await call('/api/build',{method:'POST',body:JSON.stringify({repository:'a/b',mode:'sidestore'})});
  assert.equal(r.status,502);assert.ok(!(await r.text()).includes('secret-provider-debug'));
});
test('static server never exposes source, environment or private key paths',async t=>{
  const call=await fixture(t);
  assert.equal((await call('/')).status,200);
  for(const path of ['/.env','/server.mjs','/native/testflight.sh','/package.json','/toString'])assert.equal((await call(path)).status,404);
  assert.equal((await call('/api/config')).headers.get('cache-control'),'no-store');
});
test('unconfigured deployment cannot silently dispatch anything',async t=>{
  const call=await fixture(t,{env:{}});
  assert.equal((await call('/api/config')).status,503);
  assert.equal((await (await call('/api/health')).json()).configured,false);
});
test('build status is provider data, not installation status',async t=>{
  const call=await fixture(t,{fetcher:async()=>Response.json({workflow_runs:[{id:7,status:'completed',conclusion:'failure',html_url:'https://github.com/a/b/actions/runs/7',display_title:'failed build',created_at:'2026-11-01T00:00:00Z'}]})});
  const r=await call('/api/status?repository=a%2Fb');assert.equal(r.status,200);
  assert.equal((await r.json()).runs[0].conclusion,'failure');
});

test('real HTTP transport smoke test in CI',{skip:!process.env.CI},async t=>{
  const server=createApp({env});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/config',{headers:{Authorization:'Bearer '+key}});
  assert.equal(r.status,200);assert.deepEqual((await r.json()).repositories,['a/b']);
});
