import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {validateRequest} from '../github.mjs';

export async function resolveBuild({eventName,event,sha,changedFiles=[],readRequest,now=Date.now()}) {
  if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('Invalid source commit');
  let mode='sidestore',id='commit-'+sha.slice(0,16),source='source-push';
  if(eventName==='schedule'){mode='testflight';id='scheduled-'+sha.slice(0,16);source='schedule';}
  else if(eventName==='workflow_dispatch'){
    mode=event.inputs?.distribution||'sidestore';id=event.inputs?.request_id||id;source='workflow-dispatch';
    validateRequest({id,mode,createdAt:new Date(now).toISOString()},now);
  } else if(eventName==='push'&&changedFiles.includes('.pocketbuild/request.json')) {
    const r=validateRequest(await readRequest(),now);mode=r.mode;id=r.id;source='chatgpt-request';
  } else if(eventName!=='push')throw new Error('Unsupported build event');
  return {mode,id,source,sha};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
  const sha=process.env.GITHUB_SHA;
  let changedFiles=[];
  if(process.env.GITHUB_EVENT_NAME==='push'){
    const before=event.before;
    if(!/^[a-f0-9]{40}$/.test(before??''))throw new Error('Invalid before commit');
    const args=/^0{40}$/.test(before)?['show','--pretty=','--name-only',sha]:['diff','--name-only',before,sha];
    changedFiles=execFileSync('git',args,{encoding:'utf8'}).trim().split(/\r?\n/);
  }
  const plan=await resolveBuild({eventName:process.env.GITHUB_EVENT_NAME,event,sha,changedFiles,readRequest:async()=>JSON.parse(await readFile('.pocketbuild/request.json','utf8'))});
  await writeFile(process.env.GITHUB_OUTPUT,'mode='+plan.mode+'\nrequest_id='+plan.id+'\n',{flag:'a'});
  await writeFile(process.env.GITHUB_STEP_SUMMARY,'## Build request\n\n- Request: `'+plan.id+'`\n- Mode: `'+plan.mode+'`\n- Source: `'+plan.source+'`\n- Commit: `'+plan.sha+'`\n',{flag:'a'});
}
