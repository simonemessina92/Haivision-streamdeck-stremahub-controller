'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const root='../org.streamhub.controller.sdPlugin/bin/';
const {configuration,statistics,LiveDetails}=require(root+'channel-details');
const {Engine}=require(root+'engine'),createClient=require(root+'client');
test('network identifiers render on intact lines and numbered parts retain every character',()=>{
 const {tiles}=require(root+'channel-details'),{svg}=require(root+'render');
 for(const [label,value]of [['LOCAL IP 1','192.168.100.200'],['MAC ADDRESS','AA:BB:CC:DD:EE:FF'],['PUBLIC HOST','streamhub.production.example.test'],['ADDRESS','https://streamhub.production.example.test:8896/']]){
  const parts=tiles([{label,value}]);assert.equal(parts.map(p=>p.displayLines.at(-1)).join(''),value);if(label==='LOCAL IP 1')assert.equal(parts.length,1);
  for(const [n,part]of parts.entries()){assert.ok(part.displayLines.length<=4);assert.ok(part.displayLines.at(-1).length<=16);const image=svg({...part,kind:'heading',color:'#d5dce5'});const texts=[...image.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]);assert.deepEqual(texts,part.displayLines);if(parts.length>1)assert.ok(part.displayLines.includes('PART '+(n+1)+' / '+parts.length));}
 }
 const safeParts=tiles(configuration({uri:'srt://user:secret@streamhub.production.example.test:5000?token=secret'}));assert.ok(!JSON.stringify(safeParts).includes('secret'));
});
test('channel readouts exclude secrets and URL credentials, preserve zero and native units',()=>{
 const entries=configuration({mode:'SRT',port:5000,delay:120,password:'private',passphrase:'private',streamKey:'private',uri:'srt://user:private@host:5000?passphrase=private',nested:{password:'private'}});
 assert.ok(entries.some(e=>e.label==='LATENCY (ms)'&&e.value==='120'));assert.ok(entries.some(e=>e.value==='srt://host:5000'));assert.ok(!JSON.stringify(entries).includes('private'));
 assert.deepEqual(statistics({video:[{rx_bitrate:0,cur_rx_lost_packets:0}],link:[{rtt:12}]}).map(e=>e.value),['0','0','12']);
});
test('native input and output statistics follow reported IDs and expire or reject replaced sources',()=>{
 const d=new LiveDetails();d.receive('inputStatsChange',null,{'2':{video:[{rx_bitrate:1200}]}},[{}, {hardwareIdentifier:'unit-b'}]);
 assert.equal(d.get('input:1'),null);assert.equal(d.get('input:2','unit-b').row.video[0].rx_bitrate,1200);assert.equal(d.get('input:2','replacement'),null);
 d.receive('getOutputStats',{IPOutput:[{configKey:7,bitrate:0,outVideoPktDrop:3}]},null,[]);assert.equal(d.get('IP:7').row.bitrate,0);
 d.rows.get('IP:7').time-=16000;assert.equal(d.get('IP:7'),null);d.clear();assert.equal(d.rows.size,0);
});
test('encoder STATUS DETAILS shows read-only config and stats, preserves power and selection on back',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});const encoder=e.s.encoders[0];encoder.configuration=configuration({encoderVideoType:'H264',videoBitrate:6000});encoder.streamStats=statistics({videoBitrate:5800});
 await e.execute({type:'section',section:'ENCODERS'});await e.execute({type:'encoder',id:encoder.id});const power=encoder.enabled;
 await e.execute(e.keys()[30].command);assert.equal(e.s.selected.asset,'encoder');assert.equal(e.keys()[2].active,true);assert.ok(e.keys().some(k=>k.title.includes('H264')));
 await e.execute({type:'detailsTab',tab:'STATS'});assert.ok(e.keys().some(k=>k.title.includes('5800')));assert.equal(encoder.enabled,power);
 await e.execute(e.keys()[4].command);assert.equal(e.s.view,'encoder');assert.equal(e.s.selected.id,encoder.id);
});

test('long field values remain fully visible within four lines per key',()=>{
 const {tiles}=require(root+'channel-details'),{wrap}=require(root+'render'),value='abcdefghijklmnopqrstuvwxyz0123456789'.repeat(5),entries=tiles([{label:'DESTINATION ADDRESS',value}]);
 assert.ok(entries.length>1);assert.equal(entries.map(e=>e.title.split('\n').slice(2).join('')).join(''),value);for(const e of entries)assert.equal(wrap(e.title).join('\n'),e.title);
});

test('preview frames without bitrate do not replace available encoder statistics',()=>{
 const d=new LiveDetails();d.receive('encoderPreviewChange',{encoderId:1,videoBitrate:0,audioBitrate:128});d.receive('encoderPreviewChange',{encoderId:1,thumbnail:'frame'});assert.equal(d.get('encoder:1').row.audioBitrate,128);
});
