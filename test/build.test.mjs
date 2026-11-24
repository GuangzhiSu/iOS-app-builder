import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('static export has working relative paths and real PNG icons',()=>{
  execFileSync(process.execPath,['prepare.mjs'],{cwd:root});
  const manifest=JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest',import.meta.url),'utf8'));
  for(const icon of manifest.icons){
    const url=new URL('../dist/'+icon.src.replace('./',''),import.meta.url);
    assert.ok(existsSync(url));assert.equal(readFileSync(url).subarray(1,4).toString(),'PNG');
  }
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g))assert.ok(existsSync(new URL('../dist/'+match[1],import.meta.url)),match[1]);
  assert.ok(!existsSync(new URL('../dist/.env',import.meta.url)));
  assert.ok(!existsSync(new URL('../dist/server.mjs',import.meta.url)));
});
