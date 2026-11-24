import {repositoryName} from './core.mjs';

export function requestId() { return 'pb-' + crypto.randomUUID(); }
export function validateRequest(value, now=Date.now()) {
  if(!value || !/^[A-Za-z0-9_-]{8,80}$/.test(value.id??''))throw new Error('构建请求缺少有效 id');
  if(!['sidestore','testflight'].includes(value.mode))throw new Error('构建模式必须为 sidestore 或 testflight');
  const created=Date.parse(value.createdAt);
  if(!Number.isFinite(created)||created>now+300000||now-created>86400000)throw new Error('构建请求已过期或时间无效，请创建新请求');
  if(Object.keys(value).some(k=>!['id','mode','createdAt'].includes(k)))throw new Error('构建请求包含未支持的字段');
  return {id:value.id,mode:value.mode,createdAt:new Date(created).toISOString()};
}
export function normalizeRun(run,repo) {
  repo=repositoryName(repo);
  if(!Number.isSafeInteger(run.id)||run.id<1)throw new Error('GitHub 返回了无效构建编号');
  const url=new URL(run.html_url);
  if(url.origin!=='https://github.com'||!url.pathname.startsWith('/'+repo+'/actions/runs/'))throw new Error('构建链接与仓库不匹配');
  return {id:run.id,title:run.display_title,status:run.status,conclusion:run.conclusion,url:url.href,createdAt:run.created_at,sha:run.head_sha};
}
export class GitHubClient {
  #token; #fetch;
  constructor({repository,token='',fetcher=fetch}) {this.repository=repositoryName(repository);this.#token=token;this.#fetch=fetcher;this.ref='main';}
  async #request(suffix,{method='GET',body}={}) {
    const response=await this.#fetch('https://api.github.com/repos/'+this.repository+suffix,{
      method,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10',...(this.#token?{Authorization:'Bearer '+this.#token}:{}),...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(25000)
    });
    if(!response.ok){const errors={401:'GitHub 令牌无效或已过期',403:'GitHub 权限不足或受到频率限制',404:'仓库或工作流不可访问，请检查所选仓库授权',422:'工作流拒绝请求，请确认使用最新版 ios-build.yml',429:'GitHub 请求过于频繁，请稍后重试'};const e=new Error(errors[response.status]||'GitHub 请求失败：'+response.status);e.status=response.status;throw e;}
    return response.status===204?null:response.json();
  }
  async connect() {
    if(this.#token.trim().length<20)throw new Error('请输入只授权目标仓库的 GitHub 访问令牌');
    const repo=await this.#request('');
    await this.#request('/actions/workflows/ios-build.yml');
    this.ref=repo.default_branch||'main';
    return {repository:this.repository,ref:this.ref}; // Read success does not prove Actions write permission.
  }
  async dispatch(mode,id=requestId()) {
    if(!this.#token)throw new Error('请先连接 GitHub');
    validateRequest({id,mode,createdAt:new Date().toISOString()});
    const data=await this.#request('/actions/workflows/ios-build.yml/dispatches',{method:'POST',body:{ref:this.ref,inputs:{distribution:mode,request_id:id}}});
    const runId=data?.workflow_run_id??null;
    if(runId!==null&&(!Number.isSafeInteger(runId)||runId<1))throw new Error('GitHub 返回了无效 run ID；请先检查构建记录，不要重复提交');
    return {accepted:true,requestId:id,runId,repository:this.repository,mode,createdAt:new Date().toISOString(),message:'GitHub 已接受构建请求；安装尚未完成'};
  }
  async runs(){const d=await this.#request('/actions/workflows/ios-build.yml/runs?per_page=30&branch='+encodeURIComponent(this.ref));return d.workflow_runs.map(r=>normalizeRun(r,this.repository));}
  async run(id){if(!Number.isSafeInteger(id)||id<1)throw new Error('构建编号无效');return normalizeRun(await this.#request('/actions/runs/'+id),this.repository);}
  async release(){return this.#request('/releases/latest');}
  async delivery(pending){
    if(!pending?.requestId&&!pending?.commitSHA)return null;
    const releases=await this.#request('/releases?per_page=20');
    const release=releases.find(r=>{try{const match=/<!-- pocket-build:(\{[^\n]*\}) -->/.exec(r.body??'');if(!match)return false;const m=JSON.parse(match[1]);return pending.requestId?m.requestId===pending.requestId:m.sourceCommit===pending.commitSHA;}catch{return false;}});
    if(!release)return null;
    const asset=release.assets?.find(a=>a.name==='PocketBuild-unsigned.ipa');
    if(!asset)return null;
    const u=new URL(asset.browser_download_url);
    if(u.origin!=='https://github.com'||!u.pathname.startsWith('/'+this.repository+'/releases/download/'))throw new Error('安装包链接与仓库不匹配');
    return {version:release.tag_name,downloadURL:u.href};
  }
  disconnect(){this.#token='';}
}
export function matchPending(pending,runs) {
  if(!pending)return null;
  return runs.find(r=>pending.runId?r.id===pending.runId:(pending.commitSHA?r.sha===pending.commitSHA:r.title?.includes(pending.requestId)))??null;
}
