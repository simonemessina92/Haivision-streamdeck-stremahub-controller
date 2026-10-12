'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'../org.streamhub.controller.sdPlugin/bin'),model=require(root+'/multiview'),{Engine}=require(root+'/engine'),createClient=require(root+'/client'),{NativePreviews}=require(root+'/native-previews');
const config=()=>({name:'Keep name',nbRow:2,nbCol:2,videoChannelIndexes:'[1,2,3,4]',enable:false,showOverlayInfo:true,audioChannelIndex:2,outputStandard:'1080p50',lostStreamMode:3,customPattern:'KEEP'});
test('Multiview resizes by coordinates, keeps overlapping cells and clears removed audio',()=>{
 const original=config(),wide={...original,...model.patch(original,{kind:'resize',axis:'columns',delta:1})};assert.deepEqual(model.decode(wide).cells,[1,2,0,3,4,0]);assert.equal(wide.audioChannelIndex,2);
 const narrow={...original,...model.patch(original,{kind:'resize',axis:'columns',delta:-1})};assert.deepEqual(model.decode(narrow).cells,[1,3]);assert.equal(narrow.audioChannelIndex,0);assert.equal(narrow.outputStandard,'1080p50');assert.equal(narrow.customPattern,'KEEP');
 assert.throws(()=>model.patch({enable:false,nbRow:1,nbCol:1,videoChannelIndexes:'[0]'},{kind:'resize',axis:'rows',delta:-1}),/limited/);
 assert.throws(()=>model.decode({...original,videoChannelIndexes:'[33,0,0,0]'}),/assignments/);assert.deepEqual(model.decode({enable:false,nbRow:1,nbCol:1,videoChannelIndexes:''}).cells,[0]);
});
test('Multiview editor has a real 4 x 4 grid, bounded controls and all-input source selection',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});assert.equal(e.keys()[13].title,'MULTIVIEW');assert.equal(e.keys()[13].color,'#ba9cff');assert.equal(e.keys()[14].command.type,'inputBulkStart');
 await e.execute(e.keys()[13].command);assert.equal(e.s.view,'multiview');assert.equal(e.keys()[12].disabled,true);assert.equal(e.keys()[20].disabled,true);
 for(let n=0;n<3;n++){await e.execute(e.keys()[14].command);await e.execute(e.keys()[22].command);}assert.equal(e.s.multiview.rows,4);assert.equal(e.s.multiview.columns,4);assert.equal(e.keys()[14].disabled,true);assert.equal(e.keys()[22].disabled,true);
 for(let r=0;r<4;r++)for(let c=0;c<4;c++)assert.equal(e.keys()[r*8+c].command.cell,r*4+c);
 await e.execute(e.keys()[27].command);assert.equal(e.s.picker.kind,'multiviewInput');assert.equal(e.s.picker.items.length,e.s.data.inputs.length+1);const source=e.s.picker.items.find(i=>i.command.input===3);await e.execute({type:'choose',item:source});assert.equal(e.s.view,'multiview');assert.equal(e.s.multiview.cells[15],3);assert.equal(e.s.multiview.enabled,false);
 await e.execute(e.keys()[15].command);assert.equal(e.s.multiview.enabled,true);await e.execute(e.keys()[15].command);assert.equal(e.s.multiview.enabled,false);
 await e.execute(e.keys()[27].command);await e.execute({type:'choose',item:e.s.picker.items[0]});assert.equal(e.s.multiview.cells[15],0);
 await e.execute(e.keys()[4].command);assert.equal(e.s.view,'list');e.s.multiviewAvailable=false;assert.equal(e.keys()[13].blank,true);
});
test('native Multiview uses setObjectConfig and confirms real readback while preserving server settings',async()=>{
 const p=new NativePreviews();p.verified=true;p.license={multiView:true};let server=config(),sent=[];const extra={config:async root=>{assert.equal(root,'mosaic');return structuredClone(server);}};
 p.ws={readyState:1,send:packet=>{const event=JSON.parse(packet.slice(2));sent.push(event);assert.equal(event[0],'setObjectConfig');assert.equal(event[1],'mosaic');server=JSON.parse(event[2]);}};
 const state=await p.setMultiview({kind:'resize',axis:'columns',delta:1,expected:model.fingerprint(model.decode(server))},extra);assert.deepEqual(state.cells,[1,2,0,3,4,0]);assert.equal(server.outputStandard,'1080p50');assert.equal(server.enable,false);assert.equal(server.customPattern,'KEEP');
 await p.setMultiview({kind:'power',enabled:true},extra);assert.equal(server.enable,true);assert.equal(sent.length,2);
 await assert.rejects(p.setMultiview({kind:'cell',cell:0,input:3,expected:'stale'},extra),/changed/);assert.equal(sent.length,2);
 p.license.multiView=false;await assert.rejects(p.setMultiview({kind:'power',enabled:false},extra),/licensed/);assert.equal(sent.length,2);p.verified=false;await assert.rejects(p.setMultiview({kind:'power',enabled:false},extra),/Sign in/);
});
test('Multiview does not accept a confirmation returned after the connection changed',async()=>{
 const p=new NativePreviews();p.verified=true;let server=config(),reads=0;
 p.ws={readyState:1,send:packet=>{server=JSON.parse(JSON.parse(packet.slice(2))[2]);}};
 const extra={config:async()=>{reads++;if(reads>1)p.generation++;return structuredClone(server);}};
 await assert.rejects(p.setMultiview({kind:'power',enabled:true},extra),/connection changed/);assert.equal(p.config,null);
});

test('native configuration exposes Multiview only when available and licensed',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});e.s.demo=false;e.native={verified:true,license:{multiView:true},config:{mosaic:config()}};e.syncMultiview();assert.equal(e.s.multiviewAvailable,true);assert.equal(e.s.multiview.rows,2);e.native.license.multiView=false;e.syncMultiview();assert.equal(e.s.multiviewAvailable,false);assert.equal(e.keys()[13].blank,true);
});

test('Multiview input picker uses two pages of sixteen channels with Page, Back and Unassign only',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'multiview'});await e.execute(e.keys()[0].command);
 let k=e.keys();assert.equal(k[0].title,'PAGE\n1 / 2');assert.equal(k[1].title,'BACK');assert.equal(k[8].title,'UNASSIGN');assert.equal(k[2].blank,true);assert.equal(k[3].blank,true);assert.equal(k[5].blank,true);assert.equal(k[16].command.item.command.input,1);assert.equal(k[31].command.item.command.input,16);
 assert.equal(k[16].color,'#ff6969');assert.equal(k[19].color,'#64df96');assert.equal(k[24].color,'#9aa6b4');await e.execute(k[0].command);k=e.keys();assert.equal(k[0].title,'PAGE\n2 / 2');assert.equal(k[16].command.item.command.input,17);assert.equal(k[31].command.item.command.input,32);
 await e.execute(k[8].command);assert.equal(e.s.view,'multiview');assert.equal(e.s.multiview.cells[0],0);
});
test('Multiview previews are LIVE-only and Basic hides label overlays',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'multiview'});const frame={kind:'input',id:3,uid:'demo-2',thumbnail:'data:image/jpeg;base64,/9j/AA==',time:Date.now()},subscriptions=[];
 e.native={get:(kind,id)=>id===3?frame:null,selectInputs:ids=>subscriptions.push(ids),selectInput:()=>{}};e.s.multiview.cells=[3];e.s.data.inputs[2].status=0;e.syncMultiviewPreviews();assert.equal(e.keys()[0].thumbnail,undefined);assert.equal(e.keys()[0].color,'#64df96');
 e.s.data.inputs[2].status=2;e.syncMultiviewPreviews();assert.equal(e.keys()[0].thumbnail,frame.thumbnail);assert.deepEqual(subscriptions.at(-1),[3]);assert.equal(e.keys()[23].title,'BASIC\nOFF');await e.execute(e.keys()[23].command);assert.equal(e.s.multiview.overlay,false);assert.equal(e.keys()[23].title,'BASIC\nON');assert.equal(e.keys()[0].overlay,false);
 e.s.data.inputs[2].status=0;e.syncMultiviewPreviews();assert.equal(e.keys()[0].thumbnail,undefined);assert.deepEqual(subscriptions.at(-1),[]);
});
test('Multiview IP routing requires an encoder and assignment does not enable any device',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'multiview'});await e.execute(e.keys()[28].command);assert.equal(e.s.picker.kind,'multiviewRoute');
 await e.execute({type:'multiviewRouteGroup',group:'IP'});assert.equal(e.keys()[12].title,'SELECT\nENCODER');await e.execute(e.keys()[12].command);const encoder=e.s.picker.items.find(i=>i.command.encoder===2);assert.equal(encoder.disabled,false);assert.equal(e.s.picker.items.find(i=>i.command.encoder===1).disabled,true);await e.execute({type:'choose',item:encoder});assert.equal(e.s.picker.encoder,2);
 const output=e.s.data.outputs.find(o=>o.type==='IP');await e.execute({type:'choose',item:{command:{type:'multiviewRouteSelect',key:output.key}}});await e.execute({type:'multiviewRouteConfirm'});await e.execute({type:'multiviewRouteApply',goLive:false});assert.equal(e.s.view,'multiview');assert.equal(output.encoder,2);assert.equal(output.source,null);assert.equal(output.enabled,false);assert.equal(e.s.encoders[1].input,33);assert.equal(e.s.encoders[1].enabled,false);assert.equal(e.s.multiview.enabled,false);
 await e.execute(e.keys()[28].command);await e.execute({type:'multiviewRouteGroup',group:'NDI'});const ndi=e.s.data.outputs.find(o=>o.type==='NDI');await e.execute({type:'choose',item:{command:{type:'multiviewRouteSelect',key:ndi.key}}});await e.execute({type:'multiviewRouteApply',goLive:true});assert.equal(ndi.source,33);assert.equal(ndi.enabled,true);assert.equal(e.s.multiview.enabled,true);
});
test('native Multiview routing uses input 33 directly for physical outputs and an encoder for IP',async()=>{
 const p=new NativePreviews();p.verified=true;p.license={multiView:true};const roots={mosaic:config(),enc:{'1':{enable:false,inputIndex:0,encoderProfileId:0}},basebandPlayer:{'1':{name:'SDI',outputOrder:1,enable:false,channelIndex:-1,other:'KEEP'}},streamingOutput:{'5':{name:'IP',outputOrder:1,enable:false,channelIndex:0,encoderIndex:-1}}};const sent=[],confirmed=[];
 p.ws={readyState:1,send:packet=>{const event=JSON.parse(packet.slice(2));sent.push(event);assert.equal(event[0],'setProfileConfig');roots[event[1]]=JSON.parse(event[3])[event[1]];}};
 const extra={profiles:{'0':{encoderVideoType:'H264'}},slot:async()=>structuredClone(roots.enc['1']),config:async root=>structuredClone(roots[root])};const outputs=[{key:'SDI:1',root:'basebandPlayer',configIndex:1,name:'SDI'},{key:'IP:5',root:'streamingOutput',configIndex:5,name:'IP'}];
 await assert.rejects(p.routeMultiview(outputs,null,extra),/Choose an encoder/);assert.equal(sent.length,0);
 await p.routeMultiview(outputs,1,extra,keys=>confirmed.push(...keys));assert.equal(roots.basebandPlayer['1'].channelIndex,32);assert.equal(roots.streamingOutput['5'].channelIndex,-1);assert.equal(roots.streamingOutput['5'].encoderIndex,0);assert.equal(roots.enc['1'].inputIndex,32);assert.equal(roots.enc['1'].enable,false);assert.equal(roots.basebandPlayer['1'].enable,false);assert.equal(roots.streamingOutput['5'].enable,false);assert.equal(roots.basebandPlayer['1'].other,'KEEP');assert.deepEqual(confirmed,['SDI:1','IP:5']);
 extra.profiles['0'].encoderVideoType='Passthrough';const count=sent.length;await assert.rejects(p.routeMultiview(outputs,1,extra),/passthrough/);assert.equal(sent.length,count);
 extra.profiles['0'].encoderVideoType='HEVC';roots.enc['1'].enable=true;roots.enc['1'].inputIndex=0;await assert.rejects(p.routeMultiview(outputs,1,extra),/Stop this encoder/);assert.equal(sent.length,count);
});
test('multiple Multiview preview subscriptions are deduplicated and closed when deselected',()=>{
 const p=new NativePreviews();p.verified=true;p.channels=[{product:'SST',connectionStatus:1},{product:'MoJo',connectionStatus:1},{product:'SST',connectionStatus:1}];const sent=[];p.ws={readyState:1,send:raw=>sent.push(JSON.parse(raw.slice(2)))};
 p.selectInputs([1,1,3]);assert.deepEqual(sent.map(e=>e[0]),['channelInit','channelInit']);p.selectInputs([3]);assert.deepEqual(sent.at(-1),['channelClose',4010]);p.selectInput(2);assert.deepEqual(sent.slice(-2).map(e=>e[0]),['channelClose','channelInit']);assert.equal(p.subscribed,2);
});

test('an IP output using a stopped encoder with another source can be rerouted to Multiview',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});const ip=e.s.data.outputs.find(o=>o.type==='IP');ip.encoder=2;ip.source=null;
 await e.execute({type:'multiview'});await e.execute({type:'pick',kind:'multiviewRoute'});await e.execute({type:'multiviewRouteGroup',group:'IP'});await e.execute({type:'pick',kind:'multiviewEncoder'});await e.execute({type:'choose',item:e.s.picker.items.find(i=>i.command.encoder===2)});
 assert.equal(e.keys()[16].disabled,false);await e.execute(e.keys()[16].command);assert.deepEqual(e.s.picker.selectedKeys,[ip.key]);await e.execute({type:'multiviewRouteApply',goLive:false});assert.equal(e.s.encoders[1].input,33);assert.equal(e.s.encoders[1].enabled,false);assert.equal(ip.enabled,false);
});

test('encoder picker includes Multiview last in the matching readiness group and permits OFF assignment',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});e.s.multiview.enabled=false;await e.openPicker({kind:'encoderInput',encoder:1});const last=e.s.picker.items.at(-1);assert.equal(last.command.input,33);assert.equal(last.ready,false);await e.execute({type:'inputReadiness'});e.s.page=Math.floor((e.s.picker.items.filter(x=>!x.ready).length-1)/16);assert.ok(e.keys().some(k=>k.title.includes('MULTIVIEW')));await e.choose(last);assert.equal(e.s.encoders.find(x=>x.id===1).input,33);assert.equal(e.s.multiview.enabled,false);
});
test('Multiview codec selection accepts non-passthrough encoder profiles',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});e.s.demo=false;e.s.picker={kind:'multiviewRoute',group:'IP'};e.extra.profiles=Object.fromEntries(e.s.encoders.map(enc=>[enc.profile,{encoderVideoType:'MPEG2'}]));await e.openPicker({kind:'multiviewEncoder'});assert.ok(e.s.picker.items.length);assert.ok(e.s.picker.items.every(item=>!item.title.includes('UNSUPPORTED')));
});
test('input to encoder and encoder to output assignment preserve all power states',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});const input=e.s.data.inputs[0],enc=e.s.encoders[0],output=e.s.data.outputs[0];const powers=[input.enabled,enc.enabled,output.enabled];await e.openPicker({kind:'inputEncoder',input:input.id,uid:input.uid});await e.choose(e.s.picker.items.find(x=>x.command.encoder===enc.id));assert.equal(enc.input,input.id);await e.openPicker({kind:'encoderRoute',encoder:enc.id});await e.choose(e.s.picker.items.find(x=>x.command.key===output.key));assert.equal(output.encoder,enc.id);assert.deepEqual([input.enabled,enc.enabled,output.enabled],powers);
});
