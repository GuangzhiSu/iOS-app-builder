const CACHE='pocket-build-v2',SHELL=['./','./index.html','./style.css','./app.mjs','./core.mjs','./github.mjs','./refresh.mjs','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pocket-build-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url),base=new URL('./',self.location.href),allowed=SHELL.map(p=>new URL(p,base).pathname);
  if(e.request.method!=='GET'||u.origin!==base.origin||u.search||!allowed.includes(u.pathname)||e.request.headers.has('Authorization'))return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request)));
});

