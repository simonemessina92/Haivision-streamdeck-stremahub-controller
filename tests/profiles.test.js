'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../org.streamhub.controller.sdPlugin');
test('installer supplies one complete 32-key XL panel without embedded credentials',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));assert.equal(manifest.Profiles.length,1);assert.equal(manifest.Profiles[0].AutoInstall,true);
 const directory=path.join(root,'profiles');assert.deepEqual(fs.readdirSync(directory),['StreamHub XL.streamDeckProfile']);
 const b=fs.readFileSync(path.join(directory,'StreamHub XL.streamDeckProfile')),entries=[];let p=0;while(b.readUInt32LE(p)===0x04034b50){const size=b.readUInt32LE(p+18),name=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28),offset=p+30+name+extra;entries.push(JSON.parse(b.subarray(offset,offset+size)));p=offset+size;}
 const profile=entries.find(e=>e.Pages);assert.equal(profile.Pages.Pages.length,1);assert.equal(profile.InstalledByPluginUUID,manifest.UUID);
 const actions=entries.find(e=>e.Controllers?.[0].Actions)?.Controllers[0].Actions;assert.equal(Object.keys(actions).length,32);assert.equal(new Set(Object.values(actions).map(a=>a.ActionID)).size,32);
 for(let row=0;row<4;row++)for(let col=0;col<8;col++)assert.equal(actions[col+','+row].Settings.slot,row*8+col);
 assert.doesNotMatch(JSON.stringify(entries),/previewPassword|previewToken|api_key/);
 const html=fs.readFileSync(path.join(root,'inspector.html'),'utf8');assert.doesNotMatch(html,/placeholder="\d+\.\d+\.\d+\.\d+"/);
});
