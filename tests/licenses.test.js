'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{rows}=require('../org.streamhub.controller.sdPlugin/bin/licenses');
test('license readout matches native features with numeric capacities and YES/NO capabilities',()=>{
 const counts={input:32,MOJOPRO:8,activeOutputs:32,physicalOutput:0,IPOutput:32,NDIInput:32,NDIOutput:16,WebRTCInput:4,encoder:4,FTPPush:4,HotSpot:4,videoReturn:4};
 const booleans={IPInput:true,SRTOutputsOnly:false,playback:true,record:true,intercom:true,AES67:true,AES:false,FourK:true,multiView:true};const features={};for(const [k,v]of Object.entries(counts))features[k]=[{count:v}];for(const [k,v]of Object.entries(booleans))features[k]={enabled:v};const result=rows({status:'VALID',orionConnectionStatus:true,features,license:counts});
 const get=label=>result.find(r=>r.label===label).value;assert.equal(get('INPUTS'),'32');assert.equal(get('MOJO PRO'),'8');assert.equal(get('INTERCOM'),'YES');assert.equal(get('AES ENCRYPTION'),'NO');assert.equal(get('PHYSICAL OUT'),'0');assert.equal(get('DATA BRIDGE'),'4');assert.equal(get('LICENSE'),'VALID');assert.equal(get('LIVE GUEST'),'4');assert.equal(result.filter(r=>r.value==='NOT REPORTED').length,0);
});
test('missing native license data is unavailable, operational metadata is not substituted, and expired capacity is excluded',()=>{
 const partial=rows({}, {allowedIntercom:1,allowedEncoders:4});assert.deepEqual(partial,[{label:'LICENSE DATA',value:'UNAVAILABLE'}]);
 const full=rows({features:{input:[{count:16},{count:8,expirationDate:'2000-01-01'},{count:4,expirationDate:'2080-01-01'}]}});assert.equal(full.find(r=>r.label==='INPUTS').value,'20');assert.ok(full.some(r=>r.label==='INPUTS TERM'&&r.value==='4 / 2080-01-01'));
});

test('actual StreamHub wire format decodes JSON license plus features wrapper and prefers licensed counts over runtime metadata',()=>{
 const raw={status:'valid',orionConnectionStatus:true,license:JSON.stringify({input:32,MOJOPRO:8,NDIInput:16,encoder:4,intercom:true}),features:JSON.stringify({features:{input:[{count:32,expirationDate:''}],MOJOPRO:[{count:8,expirationDate:''}],NDIInput:[{count:32,max:64,expirationDate:''}],encoder:[{count:4,expirationDate:''}],intercom:{enabled:true,expirationDate:''},AES:{enabled:false},AES67:{enabled:true},multiView:{enabled:true},activeOutputs:[{count:32}],HotSpot:[{count:4}],videoReturn:[{count:4}]}})};
 const values=rows(raw,{NDIInput:8});const get=label=>values.find(v=>v.label===label).value;assert.equal(get('NDI INPUTS'),'32');assert.equal(get('MOJO PRO'),'8');assert.equal(get('INTERCOM'),'YES');assert.equal(get('AES ENCRYPTION'),'NO');assert.equal(get('AES67 INTERCOM'),'YES');assert.equal(get('MULTIVIEW'),'YES');assert.equal(get('DATA BRIDGE'),'4');assert.equal(get('LICENSE'),'VALID');
 const {normalize}=require('../org.streamhub.controller.sdPlugin/bin/licenses');assert.deepEqual(normalize(normalize(raw)),normalize(raw));
});
