export function repositoryName(value) {
  const name = String(value ?? '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '').replace(/\.git$/, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(name) || ['.','..'].includes(name.split('/')[1])) throw new Error('请输入 owner/repo 格式的仓库');
  return name;
}
export function secureOrigin(value) {
  const u=new URL(value);
  if(u.username||u.password||u.search||u.hash||u.pathname!=='/') throw new Error('请输入不含路径或凭据的服务器 origin');
  if(u.protocol!=='https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))) throw new Error('远程地址必须使用 HTTPS');
  return u.origin;
}
export function recommend({native=false,paid=false}={}) { return !native?'pwa':paid?'testflight':'sidestore'; }
export function expiry(lastRefresh, now=Date.now()) {
  const t=Date.parse(lastRefresh);
  if(!Number.isFinite(t)||t>now) return null;
  const expires=t+7*86400000;
  return {expires,remaining:Math.max(0,Math.ceil((expires-now)/86400000)),expired:now>=expires};
}
export function refreshCalendar(lastRefresh) {
  const t=Date.parse(lastRefresh);
  if(!Number.isFinite(t)) throw new Error('请先记录成功续签时间');
  const utc=x=>new Date(x).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pocket Build//Refresh//ZH','BEGIN:VEVENT','UID:refresh-'+t+'@pocketbuild.local','DTSTAMP:'+utc(Date.now()),'DTSTART:'+utc(t+5*86400000),'DTEND:'+utc(t+5*86400000+900000),'SUMMARY:检查 SideStore 并刷新应用','DESCRIPTION:这只是检查提醒。连接 Wi-Fi 和 LocalDevVPN，在 SideStore 核对真实到期时间。','BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:检查应用签名','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
export function sourceFromRelease(repo,release) {
  repo=repositoryName(repo);
  const match=/<!-- pocket-build:(\{[^\n]*\}) -->/.exec(release.body??'');
  if(!match) throw new Error('Release 缺少版本与 Bundle ID 元数据，不能猜测');
  const m=JSON.parse(match[1]);
  if(!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(m.bundleIdentifier??'')||!/^\d+\.\d+\.\d+$/.test(m.version??'')) throw new Error('Release 元数据格式错误');
  if(!Number.isFinite(Date.parse(release.published_at))) throw new Error('Release 尚未发布');
  const asset=release.assets?.find(x=>x.name==='PocketBuild-unsigned.ipa');
  const u=asset && new URL(asset.browser_download_url);
  if(!u||u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||!u.pathname.startsWith('/'+repo+'/releases/download/')||!Number.isSafeInteger(asset.size)||asset.size<=0) throw new Error('没有此仓库有效的 IPA 下载');
  return {name:'Pocket Build · '+repo,identifier:'pocketbuild.'+repo.replace(/[^A-Za-z0-9]/g,'.'),apps:[{name:'Pocket Build',bundleIdentifier:m.bundleIdentifier,developerName:repo.split('/')[0],localizedDescription:'Unsigned cloud build. Sign with SideStore on your device.',iconURL:'https://github.com/'+repo.split('/')[0]+'.png',versions:[{version:m.version,buildVersion:String(m.buildVersion??'1'),date:release.published_at,localizedDescription:'Unsigned IPA. Verify this release, then sign with SideStore.',downloadURL:u.href,size:asset.size}],appPermissions:{entitlements:[],privacy:{}}}],news:[]};
}
export function handoffPrompt({idea,route,repository}) {
  return '请在 https://github.com/'+repositoryName(repository)+' 实现以下需求：\n\n'+String(idea).trim().slice(0,6000)+'\n\n交付路线：'+route+'。\n先检查仓库与 AGENTS.md。PWA 请保留 manifest 和离线策略；原生请修改 native/ SwiftUI，并同步构建配置。\n保留 ios-build.yml 的 workflow_dispatch 接口和 Release 元数据。不要提交 Apple 密码、设备配对文件或签名材料。\n运行适当检查，在授权范围内提交源码。提交后再发起云端构建；构建成功不等于手机安装成功。\n免费签名需要 SideStore 在手机签名和刷新；不要承诺永久签名或保证后台运行。\n';
}
