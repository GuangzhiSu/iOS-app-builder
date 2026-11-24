export function shortcutURL({name,returnURL,attemptId}) {
  if(!String(name).trim()||String(name).length>100)throw new Error('请输入快捷指令名称');
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(attemptId))throw new Error('刷新尝试编号无效');
  const base=new URL(returnURL);
  if(base.protocol!=='https:' && !(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw new Error('回调地址必须为 HTTPS');
  if(base.username||base.password)throw new Error('回调地址不能包含凭据');
  base.search='';base.hash='';
  const link=new URL('shortcuts://x-callback-url/run-shortcut');link.searchParams.set('name',name.trim());
  for(const [key,status]of [['x-success','completed'],['x-error','failed'],['x-cancel','cancelled']]){
    const callback=new URL(base);callback.searchParams.set('refresh_attempt',attemptId);callback.searchParams.set('refresh_status',status);link.searchParams.set(key,callback.href);
  }
  return link.href;
}
export function refreshCallback(url,pending,now=Date.now()) {
  const p=new URL(url).searchParams;
  if(!p.has('refresh_attempt'))return null;
  const status=p.get('refresh_status');
  const started=Date.parse(pending?.startedAt);
  if(!pending||!Number.isFinite(started)||p.get('refresh_attempt')!==pending.id||now-started>3600000||started>now||!['completed','failed','cancelled'].includes(status))return {status:'unrecognized',verified:false};
  return {id:pending.id,status,returnedAt:new Date(now).toISOString(),verified:false};
}
