import test from 'node:test';
import assert from 'node:assert/strict';
import {repositoryName,recommend,expiry,refreshCalendar,sourceFromRelease,handoffPrompt,secureOrigin} from '../core.mjs';
test('route recommendation respects native and paid requirements',()=>{
  assert.equal(recommend(),'pwa');assert.equal(recommend({native:true}),'sidestore');assert.equal(recommend({native:true,paid:true}),'testflight');
});
test('repository rejects traversal, URL credentials and unsupported hosts',()=>{
  assert.equal(repositoryName('https://github.com/GuangzhiSu/iOS-app-builder.git'),'GuangzhiSu/iOS-app-builder');
  for(const bad of ['a/..','a/.','https://evil.test/a/b','a/b/c','a/b?x=1','https://x@y.github.com/a/b'])assert.throws(()=>repositoryName(bad));
});
test('secure origin protects credentials and remote HTTPS',()=>{
  assert.equal(secureOrigin('https://build.example/'),'https://build.example');
  for(const bad of ['http://build.example','https://user:password@build.example','https://build.example/path','https://build.example/?key=x'])assert.throws(()=>secureOrigin(bad));
});
test('expiry handles exact boundary, future and absent refreshes',()=>{
  const start=Date.parse('2026-11-01T12:00:00Z');
  assert.equal(expiry(new Date(start).toISOString(),start).remaining,7);
  assert.equal(expiry(new Date(start).toISOString(),start+7*86400000).expired,true);
  assert.equal(expiry(new Date(start).toISOString(),start-1),null);
  assert.equal(expiry(null),null);
});
test('calendar is a one-time day-five reminder, never a fake refresh',()=>{
  const text=refreshCalendar('2026-11-01T12:00:00Z');
  assert.ok(text.includes('DTSTART:20261106T120000Z'));assert.ok(text.includes('\r\nEND:VCALENDAR'));assert.ok(!text.includes('RRULE'));
  assert.throws(()=>refreshCalendar(null));
});
const release={published_at:'2026-11-01T12:00:00Z',body:'<!-- pocket-build:{"bundleIdentifier":"com.allen.pocketbuild","version":"1.0.2","buildVersion":"2"} -->',assets:[{name:'PocketBuild-unsigned.ipa',size:1234,browser_download_url:'https://github.com/a/b/releases/download/v1.0.2/PocketBuild-unsigned.ipa'}]};
test('source uses actual metadata and refuses missing or foreign assets',()=>{
  const s=sourceFromRelease('a/b',release);assert.equal(s.apps[0].versions[0].size,1234);assert.equal(s.apps[0].bundleIdentifier,'com.allen.pocketbuild');
  assert.throws(()=>sourceFromRelease('a/b',{...release,body:''}));
  assert.throws(()=>sourceFromRelease('a/b',{...release,assets:[{...release.assets[0],browser_download_url:'https://evil.test/app.ipa'}]}));
});
test('handoff identifies repository and does not imply code already exists',()=>{
  const p=handoffPrompt({repository:'a/b',route:'sidestore',idea:'离线照片工具'});
  assert.ok(p.includes('https://github.com/a/b'));assert.ok(p.includes('离线照片工具'));assert.ok(p.includes('构建成功不等于手机安装成功'));
});
