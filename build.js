'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const root = __dirname, out = path.join(root, 'org.streamhub.controller.sdPlugin');
fs.mkdirSync(path.join(out, 'bin'), {recursive:true});
fs.mkdirSync(path.join(out, 'images'), {recursive:true});
fs.mkdirSync(path.join(out, 'profiles'), {recursive:true});
// The REST client and camera model are part of this standalone project.
for(const name of ['client.js','rcp.js'])fs.copyFileSync(path.join(root,'src',name),path.join(out,'bin',name));
for (const name of ['plugin.js','layout.js','engine.js','hold.js','demo.js','rest-extra.js','render.js','native-previews.js','outputs.js','bulk.js','camera-control.js','assets.js','clipboard.js','diagnostics.js']) fs.copyFileSync(path.join(root,'src',name),path.join(out,'bin',name));
fs.copyFileSync(path.join(root,'src/inspector.html'),path.join(out,'inspector.html'));
function crc32(b) {let crc=0xffffffff;for(const v of b){crc^=v;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function png(size) {
 const pixels=Buffer.alloc((size*4+1)*size);
 for(let y=0;y<size;y++){const row=y*(size*4+1);for(let x=0;x<size;x++){const i=row+1+x*4;const bar=(x>size*.2&&x<size*.8&&y>size*.45&&y<size*.55)||(x>size*.45&&x<size*.55&&y>size*.2&&y<size*.8);pixels[i]=bar?35:13;pixels[i+1]=bar?205:23;pixels[i+2]=bar?220:38;pixels[i+3]=255;}}
 const chunk=(type,data)=>{const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
for(const [name,size] of [['plugin',256],['plugin@2x',512],['category',28],['category@2x',56],['action',20],['action@2x',40],['key',72],['key@2x',144]]) fs.writeFileSync(path.join(out,'images',name+'.png'),png(size));
for(const name of ['plugin','plugin@2x','category','category@2x','action','action@2x'])fs.copyFileSync(path.join(root,'src/images',name+'.png'),path.join(out,'images',name+'.png'));
const manifest={
 Author:'StreamHub Controller Project',Name:'Haivision StreamHub Controller',Description:'Independent controller for Haivision StreamHub on Stream Deck XL and Stream Deck Mobile with a 32-key 8 x 4 layout. Control inputs, outputs, encoders and Mojo Pro devices, monitor previews, route sources and switch saved StreamHubs from one complete 32-key panel.',
 Version:'0.14.0.2',SDKVersion:2,CodePath:'bin/plugin.js',Nodejs:{Version:'24'},
 Software:{MinimumVersion:'7.1'},OS:[{Platform:'windows',MinimumVersion:'10'}],
 Icon:'images/plugin',Category:'Haivision StreamHub Controller',CategoryIcon:'images/category',UUID:'org.streamhub.controller',
 Actions:[{UUID:'org.streamhub.controller.surface',Name:'StreamHub XL surface',VisibleInActionsList:false,Icon:'images/action',Controllers:['Keypad'],PropertyInspectorPath:'inspector.html',
 States:[{Image:'images/key',TitleAlignment:'middle',FontSize:12}],Tooltip:'Configure this page from its ONLINE / OFFLINE key.'},{UUID:'org.streamhub.controller.open',Name:'Open StreamHub XL',Icon:'images/action',Controllers:['Keypad'],PropertyInspectorPath:'inspector.html',States:[{Image:'images/key',TitleAlignment:'middle',FontSize:12}],Tooltip:'Choose a saved StreamHub, then press to open its complete 32-key XL controller.'}],
 Profiles:[{Name:'profiles/StreamHub XL',DeviceType:2,AutoInstall:true,DontAutoSwitchWhenInstalled:false}]
};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
const profileId='BA82C638-70DB-4F5D-A293-77D610E70101',pageId='F7DB3788-0D06-41D0-A76C-D02669435301';
const actions={};
for(let row=0;row<4;row++)for(let col=0;col<8;col++){
 const slot=row*8+col;
 actions[col+','+row]={ActionID:crypto.randomUUID(),LinkedTitle:true,Name:'StreamHub XL',Resources:null,State:0,
 UUID:'org.streamhub.controller.surface',Plugin:{UUID:manifest.UUID,Name:manifest.Name,Version:manifest.Version},
 Settings:{slot},States:[{Title:'',ShowTitle:true,TitleAlignment:'middle',FontSize:12,TitleColor:'#ffffff',FontFamily:'',FontStyle:'',FontUnderline:false,OutlineThickness:1}]};
}
const defaultId='9C0D4CEC-83C0-4701-B7F1-BF93B530164E';
const profileManifest={Device:{Model:'20GAT9901',UUID:''},Name:'StreamHub XL',ReadOnly:false,InstalledByPluginUUID:manifest.UUID,PreconfiguredName:'profiles/StreamHub XL',Pages:{Current:pageId.toLowerCase(),Default:defaultId.toLowerCase(),Pages:[pageId.toLowerCase()]},Version:'3.0'};
const pageManifest={Controllers:[{Type:'Keypad',Actions:actions}],Icon:'',Name:'StreamHub'};
const entries=[
 [profileId+'.sdProfile/manifest.json',Buffer.from(JSON.stringify(profileManifest))],
 [profileId+'.sdProfile/Profiles/'+defaultId+'/manifest.json',Buffer.from(JSON.stringify({Controllers:[{Type:'Keypad',Actions:null}],Icon:'',Name:''}))],
 [profileId+'.sdProfile/Profiles/'+pageId+'/manifest.json',Buffer.from(JSON.stringify(pageManifest))]
];
function zip(entries){
 const locals=[],centrals=[];let offset=0;
 for(const [name,data]of entries){
  const n=Buffer.from(name),crc=crc32(data),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,n,data);centrals.push(central,n);offset+=local.length+n.length+data.length;
 }
 const cd=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,cd,end]);
}
fs.writeFileSync(path.join(out,'profiles/StreamHub XL.streamDeckProfile'),zip(entries));
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.copyFileSync(path.join(out,'profiles/StreamHub XL.streamDeckProfile'),path.join(root,'dist/StreamHub XL.streamDeckProfile'));
// Remove obsolete generated variants from the current distribution only.
for(const directory of [path.join(out,'profiles'),path.join(root,'dist')])for(const name of fs.readdirSync(directory))if(/^StreamHub XL (?:[2-9]|10) Pages\.streamDeckProfile$/.test(name))fs.unlinkSync(path.join(directory,name));
console.log('Built standalone plugin and one complete XL panel with saved StreamHub switching.');
