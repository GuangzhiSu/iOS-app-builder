import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
function crc32(buf){let crc=0xffffffff;for(const b of buf){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length);return out;}
function icon(size){
  const data=Buffer.alloc((size*3+1)*size);
  for(let y=0;y<size;y++){const row=y*(size*3+1);for(let x=0;x<size;x++){
    const a=x/size,b=y/size;
    const stem=a>.27&&a<.39&&b>.27&&b<.79;
    const ring=((a-.43)**2+(b-.45)**2<.18**2)&&!((a-.43)**2+(b-.45)**2<.08**2);
    const dot=(a-.72)**2+(b-.68)**2<.065**2;
    const c=stem||ring||dot?[23,41,30]:[179,237,202];
    for(let k=0;k<3;k++)data[row+1+x*3+k]=c[k];
  }}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
}
const dist=resolve(root,'dist'),assets=resolve(root,'native/Assets.xcassets'),appicon=resolve(assets,'AppIcon.appiconset');
await mkdir(dist,{recursive:true});await mkdir(appicon,{recursive:true});
for(const name of ['index.html','style.css','app.mjs','core.mjs','sw.js','manifest.webmanifest','icon.svg'])await copyFile(resolve(root,name),resolve(dist,name));
for(const [size,name] of [[192,'icon-192.png'],[512,'icon-512.png'],[180,'apple-touch-icon.png']])await writeFile(resolve(dist,name),icon(size));
await writeFile(resolve(appicon,'AppIcon.png'),icon(1024));
await writeFile(resolve(appicon,'Contents.json'),JSON.stringify({images:[{filename:'AppIcon.png',idiom:'universal',platform:'ios',size:'1024x1024'}],info:{author:'xcode',version:1}},null,2));
await writeFile(resolve(assets,'Contents.json'),JSON.stringify({info:{author:'xcode',version:1}}));
await writeFile(resolve(dist,'.nojekyll'),'');
console.log('Static PWA and native app icons generated.');
