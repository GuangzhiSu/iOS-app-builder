import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubClient,validateRequest,matchPending} from '../github.mjs';
import {shortcutURL,refreshCallback} from '../refresh.mjs';
import {resolveBuild} from '../automation/resolve-request.mjs';
import {signingReadiness} from '../automation/signing-readiness.mjs';
const now=Date.parse('2026-11-24T15:00:00Z'),sha='a'.repeat(40);
const request={id:'pb-agent-test-123',mode:'sidestore',createdAt:new Date(now).toISOString()};
test('ChatGPT file request selects exact mode and never evaluates extra fields',async()=>{
  const plan=await resolveBuild({eventName:'push',event:{},sha,changedFiles:['.pocketbuild/request.json'],readRequest:async()=>request,now});
  assert.equal(plan.id,request.id);assert.equal(plan.mode,'sidestore');assert.equal(plan.sha,sha);assert.equal(plan.source,'chatgpt-request');
  await assert.rejects(resolveBuild({eventName:'push',event:{},sha,changedFiles:['.pocketbuild/request.json'],readRequest:async()=>({...request,command:'echo anything'}),now}));
});
test('old TestFlight request cannot accidentally turn a later source push into signing',async()=>{
  const p=await resolveBuild({eventName:'push',event:{},sha,changedFiles:['native/PocketBuild.swift'],readRequest:async()=>{throw Error('Stale request must not be read');},now});
  assert.equal(p.mode,'sidestore');assert.equal(p.source,'source-push');
});
test('expired, future, injected and unknown build requests fail closed',()=>{
  for(const data of [{...request,createdAt:new Date(now-86400001).toISOString()},{...request,createdAt:new Date(now+300001).toISOString()},{...request,id:'bad\nmode=testflight'},{...request,mode:'shell'}])assert.throws(()=>validateRequest(data,now));
});
test('dispatch and schedule route explicitly, without reading request files',async()=>{
  const readRequest=async()=>{throw Error('Should not read file');};
  const p=await resolveBuild({eventName:'workflow_dispatch',event:{inputs:{distribution:'testflight',request_id:'pb-dispatch-123'}},sha,readRequest,now});
  assert.equal(p.mode,'testflight');
  assert.equal((await resolveBuild({eventName:'schedule',event:{},sha,readRequest,now})).mode,'testflight');
});
test('browser direct dispatch sends credentials only to the fixed GitHub host and returns exact run',async()=>{
  const calls=[];
  const c=new GitHubClient({repository:'a/b',token:'test-only-token-at-least-20-chars',fetcher:async(url,options)=>{calls.push({url,options});if(url.endsWith('/dispatches'))return Response.json({workflow_run_id:17});if(url.endsWith('ios-build.yml'))return Response.json({id:1});return Response.json({default_branch:'main'});}});
  await c.connect();const r=await c.dispatch('sidestore','pb-dispatch-123');
  assert.equal(r.runId,17);assert.equal(r.requestId,'pb-dispatch-123');assert.equal(r.accepted,true);
  assert.ok(calls.every(x=>x.url.startsWith('https://api.github.com/repos/a/b')));
  const dispatch=calls.at(-1);assert.equal(dispatch.options.redirect,'error');assert.equal(dispatch.options.credentials,'omit');
  assert.deepEqual(JSON.parse(dispatch.options.body),{ref:'main',inputs:{distribution:'sidestore',request_id:'pb-dispatch-123'}});
  c.disconnect();await assert.rejects(c.dispatch('sidestore','pb-second-test'));
});
test('GitHub errors are not successful builds, and 204 remains pending',async()=>{
  const denied=new GitHubClient({repository:'a/b',token:'test-only-token-at-least-20-chars',fetcher:async()=>new Response(null,{status:403})});
  await assert.rejects(denied.dispatch('sidestore','pb-denied-test'),/权限不足/);
  const accepted=new GitHubClient({repository:'a/b',token:'test-only-token-at-least-20-chars',fetcher:async()=>new Response(null,{status:204})});
  assert.equal((await accepted.dispatch('sidestore','pb-accepted-test')).runId,null);
});
test('pending request never matches an unrelated successful run',()=>{
  const runs=[{id:1,title:'unrelated',conclusion:'success',sha:'b'.repeat(40)},{id:2,title:'iOS pb-match-me',sha}];
  assert.equal(matchPending({requestId:'pb-not-here'},runs),null);
  assert.equal(matchPending({requestId:'pb-match-me'},runs).id,2);
  assert.equal(matchPending({runId:2},runs).id,2);
  assert.equal(matchPending({commitSHA:sha},runs).id,2);
});
test('delivery selects the request-matched IPA instead of an unrelated latest release',async()=>{
  const c=new GitHubClient({repository:'a/b',fetcher:async()=>Response.json([
    {tag_name:'v1.0.9',body:'<!-- pocket-build:{"requestId":"pb-unrelated"} -->',assets:[{name:'PocketBuild-unsigned.ipa',browser_download_url:'https://github.com/a/b/releases/download/v1.0.9/app.ipa'}]},
    {tag_name:'v1.0.8',body:'<!-- pocket-build:{"requestId":"pb-correct-id"} -->',assets:[{name:'PocketBuild-unsigned.ipa',browser_download_url:'https://github.com/a/b/releases/download/v1.0.8/app.ipa'}]}
  ])});
  assert.equal((await c.delivery({requestId:'pb-correct-id'})).version,'v1.0.8');
  assert.equal(await c.delivery({requestId:'pb-missing-id'}),null);
});
test('shortcut callback reports execution only, never certificate verification',()=>{
  const id='pb-refresh-test';const link=new URL(shortcutURL({name:'Pocket Build Refresh',returnURL:'https://example.test/app/?key=remove',attemptId:id}));
  assert.equal(link.protocol,'shortcuts:');const callback=link.searchParams.get('x-success');assert.ok(!callback.includes('key='));
  const pending={id,startedAt:new Date(now).toISOString()};
  assert.deepEqual(refreshCallback(callback,pending,now),{id,status:'completed',returnedAt:new Date(now).toISOString(),verified:false});
  assert.equal(refreshCallback(callback,{...pending,id:'other'},now).status,'unrecognized');
  assert.equal(refreshCallback(callback,{...pending,startedAt:'invalid'},now).status,'unrecognized');
  assert.equal(refreshCallback(callback,pending,now+3600001).status,'unrecognized');
  assert.throws(()=>shortcutURL({name:'X',returnURL:'https://user:password@example.test',attemptId:id}));
});
test('signing readiness reports missing names, never secret values',()=>{
  const missing=signingReadiness({IOS_P12_PASSWORD:'sensitive-test-value'});
  assert.equal(missing.ready,false);assert.ok(missing.missing.includes('IOS_P12_BASE64'));assert.ok(!JSON.stringify(missing).includes('sensitive-test-value'));
  const env={IOS_P12_BASE64:'YWJj',IOS_P12_PASSWORD:'test',IOS_PROFILE_BASE64:'YWJj',ASC_KEY_BASE64:'YWJj',ASC_KEY_ID:'ABC1234567',ASC_ISSUER_ID:'12345678-1234-1234-1234-123456789abc'};
  assert.equal(signingReadiness(env).ready,true);assert.equal(signingReadiness({...env,ASC_KEY_BASE64:'invalid!'}).ready,false);
});
