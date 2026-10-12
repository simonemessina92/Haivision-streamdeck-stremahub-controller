'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../org.streamhub.controller.sdPlugin/bin');
const {Engine}=require(root+'/engine'),{Hold}=require(root+'/hold'),{step}=require(root+'/layout'),createClient=require(root+'/client');
function fixture(){
 const requests=[],roots={inputProtocol:{},channelProfile:{'1':{name:'Input 1'}},basebandPlayer:{'1':{name:'SDI 1',enable:false,channelIndex:-1,outputOrder:1},'2':{name:'SDI 2',enable:false,channelIndex:-1,outputOrder:-1}},streamingOutput:{},NDIOutput:{},enc:{'1':{enable:false,encoderProfileId:0,inputIndex:-1},'2':{enable:false,encoderProfileId:-1,inputIndex:-1}},encoderProfile:{'0':{name:'H.264',encoderVideoType:'H264',encoderAudioType:'AAC'}}};
 const inputs=Array.from({length:32},(_,n)=>({name:'Input '+(n+1),identifier:n===0?'MoJo Test':'Source '+(n+1),product:n===0?'MoJoPro':'SST',familyName:n===0?'MoJo':'',hardwareIdentifier:'unit-'+n,channelType:'SST',channelStatus:0,connectionStatus:1,remoteControl:1,inputProtocolId:-1,deviceRecordStatus:'OFF',recorderStatus:1}));
 const camera={camera:'Back',WB:{WB:5600,WBRange:[1500,10000],WBMode:'OFF',WBModes:['OFF','AUTO']},Zoom:{Zoom:1,ZoomRange:[1,10]},Focus:{Focus:.5,FocusRange:[0,1]},ShutterSpeed:{ShutterSpeed:.02,ShutterSpeedRange:[.001,.04]}};
 const fetch=async(url,options={})=>{
  const u=new URL(url);assert.equal(u.searchParams.get('api_key'),'test-key');requests.push({path:u.pathname,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
  let d;
  if(u.pathname==='/')d={hardwareIdentifier:'server-1',nbOutput:2,allowedEncoders:4};
  else if(u.pathname==='/inputs')d={inputs};
  else if(/^\/inputs\/\d+$/.test(u.pathname))d=inputs[Number(u.pathname.split('/')[2])-1];
  else if(u.pathname==='/outputs')d={output:[{uid:'sdi_1',name:'SDI 1',enable:roots.basebandPlayer['1'].enable,channelSourceIndex:roots.basebandPlayer['1'].channelIndex}],IPOutput:[],NDIOutput:[]};
  else if(u.pathname==='/config')d=roots[u.searchParams.get('path')]||{};
  else if(u.pathname==='/config/item'){const {item,value}=JSON.parse(options.body);const [root,id,field]=item.split('.');roots[root][id][field]=value;d={success:true};}
  else if(/\/mojoPro\/cameraList$/.test(u.pathname))d=u.pathname.startsWith('/inputs/1/')?{'0':'Back',current_input_name:'Back'}:{};
  else if(u.pathname==='/inputs/1/mojoPro/cameraSettings'){if(options.body){const b=JSON.parse(options.body);for(const [k,v]of Object.entries(b))if(camera[k]&&typeof v==='object')Object.assign(camera[k],v);}d=camera;}
  else if(/\/live\/eject$/.test(u.pathname)){const i=inputs[Number(u.pathname.split('/')[2])-1];i.connectionStatus=0;i.channelStatus=0;d={success:true};}
  else if(/\/live\/start$/.test(u.pathname)){inputs[Number(u.pathname.split('/')[2])-1].channelStatus=2;d={success:true};}
  else if(/\/live\/stop$/.test(u.pathname)){inputs[Number(u.pathname.split('/')[2])-1].channelStatus=0;d={success:true};}
  else if(/\/record\/start$/.test(u.pathname)){inputs[Number(u.pathname.split('/')[2])-1].deviceRecordStatus='ON';d={success:true};}
  else if(/\/record\/stop$/.test(u.pathname)){inputs[Number(u.pathname.split('/')[2])-1].deviceRecordStatus='OFF';d={success:true};}
  else if(/\/streamhubRecord\/start$/.test(u.pathname)){inputs[Number(u.pathname.split('/')[2])-1].recorderStatus=2;d={success:true};}
  else if(/\/streamhubRecord\/stop$/.test(u.pathname)){inputs[Number(u.pathname.split('/')[2])-1].recorderStatus=1;d={success:true};}
  else if(/\/playStream\//.test(u.pathname))d={success:true};
  else throw Error('Unexpected endpoint '+u.pathname);
  return {ok:true,status:200,json:async()=>structuredClone(d)};
 };
 return {fetch,requests,inputs,roots,camera};
}
test('built plugin contains no Chrome runtime dependency',()=>{
 const text=fs.readFileSync(root+'/client.js','utf8');assert.doesNotMatch(text,/chrome\.|importScripts|sessionStorage/);
 const manifest=JSON.parse(fs.readFileSync(root+'/../manifest.json'));assert.equal(manifest.Profiles[0].DeviceType,2);
});
test('standalone REST discovery, 32-key navigation, LIVE, recording and routing',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);
 await e.configure({address:'192.0.2.5',key:'test-key'});
 assert.equal(e.s.online,true);assert.equal(e.s.data.inputs.length,32);assert.equal(e.keys().length,32);
 assert.deepEqual(e.keys().slice(0,4).map(k=>k.title),['INPUTS','OUTPUTS','ENCODERS','MOJO PRO']);
 await e.execute({type:'page',delta:1});assert.match(e.keys()[16].title,/^17\n/);
 await e.execute({type:'input',id:2,uid:'unit-1'});
 await e.execute({type:'power',id:2,uid:'unit-1',enabled:true});assert.equal(e.s.data.inputs[1].status,2);
 await e.execute({type:'record',id:2,uid:'unit-1',endpoint:'streamhubRecord',enabled:true});
 assert.equal(e.s.data.inputs[1].recorderStatus,2);assert.match(e.keys()[19].title,/ON/);
 await e.execute({type:'pick',kind:'route',input:2,uid:'unit-1'});
 await e.execute({type:'choose',item:e.s.picker.items[0]});assert.equal(f.roots.basebandPlayer['1'].channelIndex,-1);await e.execute({type:'routeApply',goLive:false});assert.equal(f.roots.basebandPlayer['1'].channelIndex,1);assert.equal(f.roots.basebandPlayer['1'].enable,false);
 await e.execute({type:'section',section:'ENCODERS'});assert.equal(e.s.encoders[0].name,'H.264');
 await e.execute({type:'encoderPower',id:1,enabled:true});assert.equal(f.roots.enc['1'].enable,true);
});
test('camera readback, modes and bounds use native units',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'mojo',id:1,uid:'unit-0'});
 await e.execute({type:'adjust',param:'WB',delta:1});assert.equal(f.camera.WB.WB,5700);assert.equal(e.s.camera.settings.WB.WB,5700);
 await e.execute({type:'adjust',param:'ShutterSpeed',delta:1});assert.ok(Math.abs(f.camera.ShutterSpeed.ShutterSpeed-1/60)<.000001);
 await e.execute({type:'mode',param:'WB'});assert.equal(f.camera.WB.WBMode,'AUTO');
 await e.execute({type:'adjust',param:'WB',delta:1});assert.equal(f.camera.WB.WBMode,'OFF');assert.equal(f.camera.WB.WB,5800);
 e.s.camera.settings.Zoom.Zoom=10;assert.equal(step(e.s.camera,'Zoom',1),10);
});
test('unknown shutter units are disabled, not guessed',async()=>{
 const {demo}=require(root+'/demo'),camera=demo().camera;camera.profile={};
 assert.throws(()=>step(camera,'ShutterSpeed',1),/range/);
});
test('demo does not access the network and supports all pages',async()=>{
 const e=new Engine(createClient,()=>{},()=>{throw Error('Network used by demo');});
 await e.configure({demo:true});await e.execute({type:'mojo',id:1,uid:'demo-0'});
 const keys=e.keys();assert.equal(keys.length,32);assert.equal(keys[10].repeat,true);
 await e.execute(keys[12].command);assert.equal(e.s.camera.settings.WB.WB,5700);
 await e.execute({type:'section',section:'OUTPUT'});assert.match(e.keys()[16].title,/SDI/);
});
test('camera identity change prevents writes',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});
 f.inputs[0].hardwareIdentifier='replacement';const before=f.requests.filter(r=>r.method==='POST').length;
 await new Promise(r=>setTimeout(r,700));
 await assert.rejects(e.execute({type:'adjust',param:'WB',delta:1}),/identity/);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,before);
});
test('hold repeats serially and stops after release even with an in-flight command',async()=>{
 let count=0,inflight=0,max=0;
 const hold=new Hold({delay:5,interval:5});
 hold.start('key',async()=>{count++;inflight++;max=Math.max(max,inflight);await new Promise(r=>setTimeout(r,12));inflight--;});
 await new Promise(r=>setTimeout(r,65));hold.stop('key');const atRelease=count;await new Promise(r=>setTimeout(r,35));
 assert.ok(count>=2);assert.equal(count,atRelease);assert.equal(max,1);
});
test('hold release while first command is pending queues no repeat',async()=>{
 let finish,count=0;const hold=new Hold({delay:1,interval:1});
 hold.start('key',()=>{count++;return new Promise(r=>finish=r);});hold.stop('key');finish();
 await new Promise(r=>setTimeout(r,10));assert.equal(count,1);
});

test('24 configured slots are limited to the four encoders allowed by StreamHub',async()=>{
 const f=fixture();for(let id=3;id<=24;id++)f.roots.enc[id]={enable:false,encoderProfileId:-1,inputIndex:-1};
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'section',section:'ENCODERS'});
 assert.equal(e.s.encoderCapacity,4);assert.equal(e.s.encoders.length,4);
 assert.equal(e.keys().filter(k=>k.command?.type==='encoder').length,1);
 const writes=f.requests.filter(r=>r.method==='POST').length;
 await assert.rejects(e.extra.profile(5,'0',{add:true}),/capacity/);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,writes);
});
test('plus encoder assigns an existing profile to a free licensed slot',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'section',section:'ENCODERS'});const add=e.keys().find(k=>k.command?.kind==='encoderAdd');assert.ok(add&&!add.disabled);
 await e.execute(add.command);assert.equal(e.s.picker.items[0].command.encoder,2);
 await e.execute({type:'choose',item:e.s.picker.items[0]});assert.equal(f.roots.enc['2'].encoderProfileId,0);
 assert.equal(e.keys().filter(k=>k.command?.type==='encoder').length,2);
});
test('physical plus adds the next connector directly without a preset picker',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'section',section:'OUTPUT'});await e.execute(e.keys().find(k=>k.command?.type==='addOutput').command);
 assert.equal(f.roots.basebandPlayer['2'].outputOrder,2);assert.equal(e.s.view,'list');
 assert.ok(e.s.data.outputs.some(o=>o.type==='SDI'&&String(o.configIndex)==='2'));
});
test('a stale encoder add cannot replace an assigned profile',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 const writes=f.requests.filter(r=>r.method==='POST').length;await assert.rejects(e.extra.profile(1,'0',{add:true}),/already assigned/);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,writes);
});
test('black backgrounds, navigation gutters and separate camera pages',async()=>{
 const {svg}=require(root+'/render'),e=new Engine(createClient,()=>{},()=>{throw Error('Network in demo');});await e.configure({demo:true});
 let keys=e.keys();assert.equal(keys[7].kind,'status');assert.match(svg(keys[0]),/fill="#000000"/);assert.match(svg(keys[14]),/fill="#000000"/);assert.equal(keys[14].command.type,'inputBulkStart');
 await e.execute({type:'mojo',id:1,uid:'demo-0'});keys=e.keys();assert.equal(keys[14].blank,true);assert.equal(keys[10].command.param,'WB');assert.equal(keys[26].command.param,'ShutterSpeed');assert.equal(keys[25].kind,'preview');assert.equal(keys[9].kind,'status');
 await e.execute(keys[6].command);assert.equal(e.keys()[10].command.param,'Zoom');assert.equal(e.keys()[26].command.param,'AudioGain');
});

test('connection status stays in the top right across every screen',async()=>{
 const e=new Engine(createClient,()=>{},()=>{throw Error('Network in demo');});await e.configure({demo:true});
 for(const section of ['INPUT','OUTPUT','ENCODERS','MOJO PRO']){
  await e.execute({type:'section',section});assert.equal(e.keys()[7].kind,'status');
 }
 await e.execute({type:'mojo',id:1,uid:'demo-0'});
 assert.equal(e.keys()[4].command.type,'back');assert.equal(e.keys()[24].command.type,'asset');assert.equal(e.keys()[6].command.type,'page');assert.equal(e.keys()[7].title,'DEMO');
 const {svg}=require(root+'/render');assert.match(svg(e.keys()[7]),/fill="#ffc266"/);assert.match(svg(e.keys()[0]),/font-weight="700"/);
});
test('selected source preview uses a standalone REST image, not a browser bridge',async()=>{
 const f=fixture(),fetch=async(url,options)=>{
  if(new URL(url).pathname==='/inputs/1/preview')return {ok:true,status:200,json:async()=>({thumbnail:'/9j/AA=='})};
  return f.fetch(url,options);
 };
 const e=new Engine(createClient,()=>{},fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'input',id:1,uid:'unit-0'});await e.readPreview();
 assert.equal(e.s.preview.uid,'unit-0');
 const {image}=require(root+'/render');assert.equal(image(e.keys()[25]),'data:image/jpeg;base64,/9j/AA==');
 e.s.preview.time=Date.now()-8000;assert.equal(e.keys()[25].thumbnail,null);
});
test('late preview cannot appear on a different source or block commands',async()=>{
 const f=fixture();let resolve;
 const fetch=async(url,options)=>new URL(url).pathname==='/inputs/1/preview'?new Promise(r=>resolve=()=>r({ok:true,status:200,json:async()=>({thumbnail:'/9j/AA=='})})):f.fetch(url,options);
 const e=new Engine(createClient,()=>{},fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'input',id:1,uid:'unit-0'});const pending=e.readPreview();await new Promise(r=>setImmediate(r));
 assert.equal(e.s.busy,false);await e.execute({type:'input',id:2,uid:'unit-1'});resolve();await pending;
 assert.equal(e.keys()[25].thumbnail,null);assert.equal(e.previewLoading,false);
});
test('LIVE input border and state text are red, READY are green, OFFLINE stays muted',async()=>{
 const {svg}=require(root+'/render'),e=new Engine(createClient);await e.configure({demo:true});
 const live=e.keys()[16],ready=e.keys()[19],offline=e.keys()[24];
 assert.equal(live.color,'#ff6969');assert.equal(live.stateColor,'#ff6969');
 assert.match(svg(live),/fill="#ff6969">LIVE<\/text>/);
 assert.equal(ready.color,'#64df96');assert.match(svg(ready),/fill="#64df96">READY<\/text>/);
 assert.equal(offline.stateLabel,'OFFLINE');
});
test('native previews show READY inputs and actual SDI/NDI output frames without LIVE gating',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});e.s.demo=false;
 const frames=new Map(),now=Date.now(),img='data:image/jpeg;base64,/9j/AA==';
 e.native={selectInput:()=>{},device:()=>null,get:(kind,id)=>frames.get(kind+':'+id)};
 const input=e.s.data.inputs[3];assert.notEqual(input.status,2);
 frames.set('input:'+input.id,{id:input.id,uid:input.uid,kind:'input',thumbnail:img,time:now});
 await e.execute({type:'input',id:input.id,uid:input.uid});assert.equal(e.useNativePreview(),true);assert.equal(e.keys()[25].thumbnail,img);
 const output=e.s.data.outputs.find(o=>o.type==='SDI');frames.set('SDI:'+output.id,{id:output.id,kind:'SDI',thumbnail:img,time:now});
 await e.execute({type:'output',key:output.key});assert.equal(e.useNativePreview(),true);assert.equal(e.keys()[25].thumbnail,img);
});
test('plus follows the last item, moves on add, disappears when full and returns on eject',async()=>{
 const {svg}=require(root+'/render'),e=new Engine(createClient);await e.configure({demo:true});
 await e.execute({type:'section',section:'ENCODERS'});
 assert.equal(e.keys()[18].title,'+');assert.match(svg(e.keys()[18]),/fill="#ffffff"/);
 for(let n=0;n<2;n++){await e.execute(e.keys().find(k=>k.kind==='add').command);await e.execute({type:'choose',item:e.s.picker.items[0]});}
 assert.equal(e.keys().some(k=>k.kind==='add'),false);
 await e.execute({type:'encoder',id:4});assert.equal(e.keys()[31].command.type,'ejectEncoder');await e.execute(e.keys()[31].command);assert.equal(e.s.view,'list');
 assert.equal(e.keys()[19].title,'+');
 await e.execute({type:'outputGroup',group:'IP'});assert.equal(e.keys()[19].title,'+');
 await e.execute(e.keys()[19].command);await e.execute({type:'choose',item:e.s.picker.items[0]});assert.equal(e.keys()[20].blank,true);
 const output=e.s.data.outputs.at(-1);await e.execute({type:'ejectOutput',key:output.key});assert.equal(e.keys()[19].title,'+');
});
test('plus has its own next page when sixteen outputs fill the visible grid',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'section',section:'OUTPUT'});
 e.s.data.outputs=Array.from({length:16},(_,n)=>({...e.s.data.outputs[0],id:n+1,key:'SDI:'+(n+1)}));e.s.data.outputProfiles.push({type:'SDI',index:'17',key:'SDI:profile:17',present:false,locked:false,canAdd:true});
 assert.equal(e.keys().some(k=>k.kind==='add'),false);assert.equal(e.keys()[6].command.type,'page');
 await e.execute(e.keys()[6].command);assert.equal(e.keys()[16].kind,'add');assert.equal(e.keys()[17].blank,true);
});
test('UNIT REC native readback survives REST refresh and never invokes hub recording',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 let recordStatus=0,sent=0;
 e.native={verified:true,device:(id,uid)=>id===1&&uid==='unit-0'?{recordStatus}:null,selectInput:()=>{},record:async(id,uid,enabled,sendCommand)=>{assert.equal(id,1);assert.equal(uid,'unit-0');await sendCommand();recordStatus=enabled?5:0;sent++;}};
 await e.execute({type:'input',id:1,uid:'unit-0'});assert.equal(e.keys()[18].disabled,false);
 await e.execute(e.keys()[18].command);assert.equal(sent,1);assert.equal(e.s.data.inputs[0].deviceRecording,true);
 await e.refresh();assert.equal(e.s.data.inputs[0].deviceRecording,true);assert.match(e.keys()[18].title,/ON/);
 assert.equal(f.requests.some(r=>r.path.includes('/streamhubRecord/')),false);assert.ok(f.requests.some(r=>r.path==='/inputs/1/record/start'));
 await e.execute(e.keys()[18].command);assert.equal(e.s.data.inputs[0].deviceRecording,false);
 e.s.data.inputs[0].connected=false;assert.equal(e.keys()[18].blank,true);
 await assert.rejects(e.execute({type:'record',id:1,uid:'unit-0',endpoint:'record',enabled:true}),/disconnected/);assert.equal(sent,2);
});
test('output filters show only their group and preserve selection after opening details',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'section',section:'OUTPUT'});
 assert.deepEqual(e.keys().slice(9,12).map(k=>k.title),['SDI','NDI','IP']);
 for(const [group,count]of [['SDI',4],['NDI',3],['IP',3]]){
  await e.execute({type:'outputGroup',group});assert.equal(e.keys()[8].title,count+' ASSIGNED');
  const cards=e.keys().filter(k=>k.command?.type==='output');assert.equal(cards.length,count);
  assert.ok(cards.every(k=>k.title.startsWith(group)));
  await e.execute(cards[0].command);await e.execute({type:'back'});assert.equal(e.s.outputGroup,group);
 }
});
test('NDI plus adds directly and SDI/NDI eject only from the highest assigned channel',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});
 for(const group of ['SDI','NDI']){
  await e.execute({type:'outputGroup',group});
  const last=Math.max(...e.s.data.outputs.filter(o=>o.type===group).map(o=>o.id));
  await e.execute(e.keys().find(k=>k.kind==='add').command);assert.equal(e.s.view,'list');
  assert.ok(e.s.data.outputs.some(o=>o.type===group&&o.id===last+1));
  const first=e.s.data.outputs.find(o=>o.type===group&&o.id===1),latest=e.s.data.outputs.find(o=>o.type===group&&o.id===last+1);
  await e.execute({type:'output',key:first.key});assert.equal(e.keys()[31].disabled,true);
  await assert.rejects(e.execute({type:'ejectOutput',key:first.key}),/highest-numbered/);
  await e.execute({type:'output',key:latest.key});assert.equal(e.keys()[31].disabled,false);
  await e.execute(e.keys()[31].command);assert.equal(e.s.view,'list');assert.ok(e.keys().some(k=>k.kind==='add'));
 }
 await e.execute({type:'outputGroup',group:'IP'});await e.execute(e.keys().find(k=>k.kind==='add').command);
 assert.equal(e.s.view,'pick');assert.ok(e.s.picker.items.every(i=>i.title.startsWith('IP')));
 await e.execute({type:'back'});const first=e.s.data.outputs.find(o=>o.type==='IP');
 await e.execute({type:'output',key:first.key});assert.equal(e.keys()[31].disabled,false);await e.execute(e.keys()[31].command);
 assert.equal(e.s.data.outputs.some(o=>o.key===first.key),false);
});
test('REST client rejects earlier SDI ejects and skipped additions before any POST',async()=>{
 const f=fixture();f.roots.basebandPlayer['2'].outputOrder=2;f.roots.basebandPlayer['3']={name:'SDI 3',enable:false,channelIndex:-1,outputOrder:-1};
 const fetch=async(url,options)=>new URL(url).pathname==='/'?{ok:true,status:200,json:async()=>({hardwareIdentifier:'server-1',nbOutput:4,allowedEncoders:4})}:f.fetch(url,options);
 const e=new Engine(createClient,()=>{},fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 let result=await e.client.handle({type:'outputControl',keys:['SDI:1'],action:'clear'});
 assert.equal(result.results[0].ok,false);assert.match(result.results[0].message,/highest-numbered/);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,0);
 f.roots.basebandPlayer['4']={name:'SDI 4',enable:false,channelIndex:-1,outputOrder:-1};
 await assert.rejects(e.client.handle({type:'outputAdd',key:'SDI:profile:4'}),/numeric order/);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,0);
 result=await e.client.handle({type:'outputControl',keys:['SDI:profile:2'],action:'clear'});
 const second=e.s.data.outputs.find(o=>o.type==='SDI'&&String(o.configIndex)==='2');
 result=await e.client.handle({type:'outputControl',keys:[second.key],action:'clear'});assert.equal(result.results[0].ok,true);
 assert.equal(f.roots.basebandPlayer['2'].outputOrder,-1);
});
test('ST2110 belongs to physical outputs and uses the same reverse eject rule',()=>{
 const {outputGroup,canEjectOutput}=require(root+'/outputs');
 const data={outputs:[{type:'ST2110',id:1},{type:'ST2110',id:2},{type:'NDI',id:8}]};
 assert.equal(outputGroup(data.outputs[0]),'SDI');assert.equal(canEjectOutput(data,data.outputs[0]),false);assert.equal(canEjectOutput(data,data.outputs[1]),true);
});
test('NDI REST additions and ejects follow numeric order and update runtime output lists',async()=>{
 const f=fixture();for(let id=1;id<=3;id++)f.roots.NDIOutput[id]={name:'NDI '+id,enable:false,channelIndex:-1,outputOrder:id<3?id:-1};
 const fetch=async(url,options)=>{
  if(new URL(url).pathname==='/outputs'){
   const base=await f.fetch(url,options),data=await base.json();
   data.NDIOutput=Object.entries(f.roots.NDIOutput).map(([id,row])=>({uid:'ndi_'+id,name:row.name,enable:row.enable,channelSourceIndex:row.channelIndex}));
   return {ok:true,status:200,json:async()=>data};
  }return f.fetch(url,options);
 };
 const e=new Engine(createClient,()=>{},fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'outputGroup',group:'NDI'});await e.execute(e.keys().find(k=>k.kind==='add').command);
 assert.equal(e.s.view,'list');assert.equal(f.roots.NDIOutput['3'].outputOrder,3);assert.equal(e.keys()[8].title,'3 ASSIGNED');
 const result=await e.client.handle({type:'outputControl',keys:['NDI:2'],action:'clear'});assert.equal(result.results[0].ok,false);
 assert.equal(f.roots.NDIOutput['2'].outputOrder,2);
 await e.execute({type:'output',key:'NDI:3'});assert.equal(e.keys()[31].disabled,false);await e.execute(e.keys()[31].command);
 assert.equal(f.roots.NDIOutput['3'].outputOrder,-1);assert.equal(e.keys()[8].title,'2 ASSIGNED');assert.ok(e.keys().some(k=>k.kind==='add'));
});
test('PAGE wraps and category switches reset page; unavailable physical tabs stay hidden',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});
 await e.execute(e.keys()[6].command);assert.equal(e.s.page,1);await e.execute(e.keys()[6].command);assert.equal(e.s.page,0);
 await e.execute(e.keys()[6].command);await e.execute({type:'section',section:'OUTPUT'});assert.equal(e.s.page,0);
 e.s.capabilities={nbOutput:0,NDIOutput:0,allowedIpOutputs:16};
 assert.deepEqual(e.keys().filter(k=>k.command?.type==='outputGroup').map(k=>k.title),['IP']);
 assert.match(e.keys()[8].title,/ASSIGNED/);
 await assert.rejects(e.execute({type:'outputGroup',group:'SDI'}),/unavailable/);
});
test('bulk selection survives output filters and rejects skipping higher physical channels',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'section',section:'OUTPUT'});
 await e.execute({type:'bulkStart'});
 const first=e.s.data.outputs.find(o=>o.type==='SDI'&&o.id===1);
 await e.execute({type:'bulkSelect',command:{type:'ejectOutput',key:first.key}});
 await e.execute({type:'outputGroup',group:'NDI'});assert.equal(e.s.bulk.length,1);
 await assert.rejects(e.execute({type:'bulkRun'}),/highest channel/);assert.ok(e.s.data.outputs.some(o=>o.key===first.key));
 await e.execute({type:'bulkCancel'});await e.execute({type:'bulkStart'});
 const ip=e.s.data.outputs.filter(o=>o.type==='IP');
 for(const o of [ip[0],ip[2]])await e.execute({type:'bulkSelect',command:{type:'ejectOutput',key:o.key}});
 await e.execute({type:'bulkRun'});if(e.s.bulkConfirm)await e.execute({type:'bulkRun',confirmed:true});
 assert.equal(e.s.data.outputs.filter(o=>o.type==='IP').length,1);assert.ok(e.s.data.outputs.some(o=>o.key===ip[1].key));
});
test('IP eject works in arbitrary order with sixteen presets and no encoderIndex field',async()=>{
 const f=fixture();
 for(let n=0;n<16;n++)f.roots.streamingOutput[n]={name:'IP '+n,enable:false,channelIndex:-1,outputOrder:n+1,mode:'SRT'};
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'outputGroup',group:'IP'});
 for(const index of [3,0,15]){
  const o=e.s.data.outputs.find(o=>String(o.configIndex)===String(index));
  await e.execute({type:'ejectOutput',key:o.key});assert.equal(f.roots.streamingOutput[index].outputOrder,-1);
 }
 assert.equal(e.s.data.outputs.filter(o=>o.type==='IP').length,13);
 assert.ok(!f.requests.some(r=>r.body?.item?.endsWith('encoderIndex')));
});
test('Mojo busy repaint preserves unrelated key images; feature tile controls native mode',async()=>{
 const {image}=require(root+'/render'),e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'mojo',id:1,uid:'demo-0'});
 const before=e.keys().map(image);e.s.busy=true;assert.deepEqual(e.keys().map(image),before);e.s.busy=false;
 assert.equal(e.keys()[11].command.type,'mode');assert.equal(e.keys()[14].blank,true);assert.match(image(e.keys()[11]),/^data:image/);
 await e.execute(e.keys()[11].command);assert.equal(e.s.camera.settings.WB.WBMode,'Auto');
 await e.execute(e.keys()[12].command);assert.equal(e.s.camera.settings.WB.WBMode,'Manual');
 await e.execute(e.keys()[6].command);assert.equal(e.keys()[14].blank,true);assert.equal(e.keys()[29].blank,true);
});

test('real bulk eject accepts arbitrary input and encoder IDs without output-index access',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);
 f.roots.enc['3']={enable:false,encoderProfileId:0,inputIndex:2};f.roots.enc['4']={enable:false,encoderProfileId:0,inputIndex:3};
 await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'bulkStart'});
 for(const id of [4,2])await e.execute({type:'bulkSelect',command:{type:'ejectInput',id,uid:'unit-'+(id-1)}});
 await e.execute({type:'bulkRun'});
 assert.equal(f.inputs[3].connectionStatus,0);assert.equal(f.inputs[1].connectionStatus,0);assert.equal(f.inputs[2].connectionStatus,1);
 await e.execute({type:'section',section:'ENCODERS'});await e.execute({type:'bulkStart'});
 for(const id of [3,1])await e.execute({type:'bulkSelect',command:{type:'ejectEncoder',id}});
 await e.execute({type:'bulkRun'});
 assert.equal(f.roots.enc['3'].encoderProfileId,-1);assert.equal(f.roots.enc['1'].encoderProfileId,-1);assert.equal(f.roots.enc['4'].encoderProfileId,0);
 assert.equal(f.roots.enc['3'].inputIndex,-1);
});
test('bulk confirmation is adjacent to ONLINE only for selected LIVE items and resets on selection change',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});
 assert.equal(e.keys()[15].command.type,'bulkStart');assert.equal(e.keys()[12].blank,true);
 await e.execute({type:'section',section:'MOJO PRO'});assert.equal(e.keys()[15].blank,true);
 await e.execute({type:'section',section:'INPUT'});await e.execute({type:'bulkStart'});
 const i=e.s.data.inputs[1];i.enabled=true;i.status=2;
 await e.execute({type:'bulkSelect',command:{type:'ejectInput',id:i.id,uid:i.uid}});
 await e.execute({type:'bulkRun'});assert.equal(i.connected,true);assert.equal(e.keys()[14].command.confirmed,true);
 await e.execute({type:'bulkRun',confirmed:true});assert.equal(i.connected,false);assert.equal(e.keys()[14].command.type,'inputBulkStart');
 await e.execute({type:'bulkStart'});const idle=e.s.data.inputs[3];idle.enabled=false;idle.status=0;
 await e.execute({type:'bulkSelect',command:{type:'ejectInput',id:idle.id,uid:idle.uid}});
 await e.execute({type:'bulkRun'});assert.equal(idle.connected,false);assert.equal(e.s.bulk,null);
});
test('recording keys use standard colors OFF and solid red only when their own recorder is ON',async()=>{
 const {svg}=require(root+'/render'),e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'input',id:1,uid:'demo-0'});
 const i=e.s.data.inputs[0];i.deviceRecording=false;i.recorderStatus=1;
 for(const slot of [18,19]){assert.match(svg(e.keys()[slot]),/fill="#13333b"/);assert.doesNotMatch(svg(e.keys()[slot]),/fill="#ff687f"/);}
 await e.execute(e.keys()[18].command);
 assert.equal(i.deviceRecording,true);assert.equal(i.recorderStatus,1);assert.match(svg(e.keys()[18]),/fill="#ff687f"/);assert.match(svg(e.keys()[19]),/fill="#13333b"/);
 await e.execute(e.keys()[19].command);assert.match(svg(e.keys()[19]),/fill="#ff687f"/);
});
test('camera writes repaint only their value, avoid full snapshots, and preserve the screen on temporary read failures',async()=>{
 const {image}=require(root+'/render'),f=fixture(),e=new Engine(createClient,()=>{},f.fetch);
 await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});
 const before=e.keys().map(image),start=f.requests.length;
 await e.execute({type:'adjust',param:'WB',delta:1});
 const changed=e.keys().map(image).map((value,index)=>value!==before[index]?index:null).filter(index=>index!==null);
 assert.deepEqual(changed,[11]);
 const requests=f.requests.slice(start);assert.equal(requests.filter(r=>r.method==='POST').length,1);
 assert.ok(!requests.some(r=>['/inputs','/outputs','/config'].includes(r.path)));
 const post=requests.find(r=>r.method==='POST');assert.deepEqual(Object.keys(post.body).sort(),['Focus','ShutterSpeed','WB','Zoom','camera','remote']);assert.equal(post.body.Zoom.Zoom,1);
 f.inputs[0].hardwareIdentifier='';await e.refresh();assert.equal(e.s.view,'mojo');assert.ok(e.s.camera);assert.equal(e.keys()[10].disabled,true);
 f.inputs[0].hardwareIdentifier='unit-0';await e.refresh();assert.equal(e.s.view,'mojo');assert.equal(e.keys()[10].disabled,false);
});
test('camera increments follow ISO thirds of a stop and exact WB, zoom, focus and audio units',()=>{
 const {demo}=require(root+'/demo'),c=demo().camera;
 c.settings.ISO.ISO=100;c.settings.ISO.ISOMode='Manual';assert.equal(step(c,'ISO',1),125);c.settings.ISO.ISO=125;assert.equal(step(c,'ISO',-1),100);
 assert.equal(step(c,'WB',1),5700);assert.equal(step(c,'Zoom',1),1.1);
 c.settings.Focus.Focus=.5;c.settings.Focus.FocusMode='Manual';assert.equal(step(c,'Focus',1),.51);
 c.settings.AudioGain.AudioGain=0;assert.equal(step(c,'AudioGain',-1),-2);
});

test('WB, ISO and shutter stay independent when a camera replaces omitted parameters',async()=>{
 const f=fixture();
 f.camera.ISO={ISO:200,ISORange:[100,6400],ISOMode:'AUTO',ISOModes:['OFF','AUTO']};
 f.camera.WB.WBMode='AUTO';f.camera.ShutterSpeed.ShutterSpeedMode='AUTO';f.camera.ShutterSpeed.ShutterSpeedModes=['OFF','AUTO'];
 const baseline=structuredClone(f.camera);
 const fetch=async(url,options={})=>{
  if(new URL(url).pathname==='/inputs/1/mojoPro/cameraSettings'&&options.body){
   const body=JSON.parse(options.body);
   for(const p of ['WB','ISO','ShutterSpeed'])if(!body[p])f.camera[p]=structuredClone(baseline[p]);
  }
  return f.fetch(url,options);
 };
 const e=new Engine(createClient,()=>{},fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});
 await e.execute(e.keys()[28].command);
 assert.equal(f.camera.ShutterSpeed.ShutterSpeedMode,'OFF');assert.equal(f.camera.ISO.ISOMode,'AUTO');assert.equal(f.camera.WB.WBMode,'AUTO');
 await e.execute(e.keys()[19].command);
 assert.equal(f.camera.ISO.ISOMode,'OFF');assert.equal(f.camera.ShutterSpeed.ShutterSpeedMode,'OFF');assert.equal(f.camera.WB.WBMode,'AUTO');
 await e.execute(e.keys()[11].command);
 assert.equal(f.camera.WB.WBMode,'OFF');assert.equal(f.camera.ISO.ISOMode,'OFF');assert.equal(f.camera.ShutterSpeed.ShutterSpeedMode,'OFF');
 await e.execute(e.keys()[19].command);
 assert.equal(f.camera.ISO.ISOMode,'AUTO');assert.equal(f.camera.WB.WBMode,'OFF');assert.equal(f.camera.ShutterSpeed.ShutterSpeedMode,'OFF');
});
test('delayed camera readback cannot restore another parameters previous automatic mode',async()=>{
 const f=fixture();
 f.camera.ISO={ISO:200,ISORange:[100,6400],ISOMode:'AUTO',ISOModes:['OFF','AUTO']};
 f.camera.WB.WBMode='AUTO';f.camera.ShutterSpeed.ShutterSpeedMode='AUTO';f.camera.ShutterSpeed.ShutterSpeedModes=['OFF','AUTO'];
 const stale=structuredClone(f.camera);
 const fetch=async(url,options={})=>{
  const response=await f.fetch(url,options);
  if(new URL(url).pathname==='/inputs/1/mojoPro/cameraSettings'&&!options.body)return {ok:true,json:async()=>structuredClone(stale)};
  return response;
 };
 const e=new Engine(createClient,()=>{},fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});
 for(const p of ['WB','ISO','ShutterSpeed'])await e.execute({type:'mode',param:p});
 assert.equal(f.camera.WB.WBMode,'OFF');assert.equal(f.camera.ISO.ISOMode,'OFF');assert.equal(f.camera.ShutterSpeed.ShutterSpeedMode,'OFF');
 const writes=f.requests.filter(r=>r.path.includes('cameraSettings')&&r.method==='POST');
 assert.equal(writes.length,3);assert.equal(writes[2].body.WB.WBMode,'OFF');assert.equal(writes[2].body.ISO.ISOMode,'OFF');
});
test('WB icon cycles manual and auto only and plus switches that parameter to manual',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'mojo',id:1,uid:'demo-0'});
 e.s.camera.settings.WB.WBModes=['Manual','Auto','Locked'];
 const iso=structuredClone(e.s.camera.settings.ISO),shutter=structuredClone(e.s.camera.settings.ShutterSpeed);
 for(const mode of ['Auto','Manual','Auto','Manual']){await e.execute(e.keys()[11].command);assert.equal(e.s.camera.settings.WB.WBMode,mode);}
 await e.execute(e.keys()[11].command);await e.execute(e.keys()[12].command);assert.equal(e.s.camera.settings.WB.WBMode,'Manual');
 assert.deepEqual(e.s.camera.settings.ISO,iso);assert.deepEqual(e.s.camera.settings.ShutterSpeed,shutter);
});
test('detail arrows cycle input, output group and assigned encoder assets without building a back stack',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});
 await e.execute({type:'input',id:1,uid:'demo-0'});const depth=e.stack.length;
 await e.execute(e.keys()[24].command);assert.equal(e.s.selected.id,2);assert.equal(e.s.view,'input');assert.equal(e.stack.length,depth);
 await e.execute(e.keys()[8].command);assert.equal(e.s.selected.id,1);
 await e.execute({type:'section',section:'OUTPUT'});await e.execute({type:'outputGroup',group:'NDI'});
 const keys=e.keys().filter(k=>k.command?.type==='output');await e.execute(keys[0].command);
 await e.execute(e.keys()[8].command);assert.equal(e.s.selected.key,keys.at(-1).command.key);
 assert.equal(e.s.data.outputs.find(o=>o.key===e.s.selected.key).type,'NDI');
 await e.execute({type:'section',section:'ENCODERS'});await e.execute({type:'encoder',id:1});await e.execute(e.keys()[24].command);
 assert.equal(e.s.selected.id,2);await e.execute(e.keys()[24].command);assert.equal(e.s.selected.id,1);
});
test('Mojo asset arrows retain the controls page and replace preview and source identity',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});e.s.data.inputs[1].isMojo=true;
 await e.execute({type:'mojo',id:1,uid:'demo-0'});await e.execute(e.keys()[6].command);
 const depth=e.stack.length;e.s.preview={selection:e.previewSelection(),thumbnail:'data:image/jpeg;base64,/9j/AA==',time:Date.now()};
 await e.execute(e.keys()[24].command);
 assert.equal(e.s.selected.id,2);assert.equal(e.s.page,1);assert.equal(e.stack.length,depth);assert.equal(e.s.preview,null);
 assert.match(e.keys()[16].title,/^2/);assert.equal(e.keys()[10].command.param,'Zoom');assert.equal(e.keys()[6].command.type,'page');
 await e.execute(e.keys()[8].command);assert.equal(e.s.selected.id,1);
});
test('Mojo output indicator covers all direct and encoder routes without a second thumbnail',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'mojo',id:1,uid:'demo-0'});
 const input={id:1,uid:'demo-0',thumbnail:'data:image/jpeg;base64,/9j/AA==',time:Date.now()};e.native={get:(kind,id)=>kind==='input'&&id===1?input:null};e.useNativePreview();
 e.s.data.outputs=[];e.updateProgram();assert.equal(e.keys()[25].thumbnail,input.thumbnail);assert.equal(e.keys()[9].title,'OUTPUT\nNOT ROUTED');assert.equal(e.keys()[9].color,'#9aa6b4');assert.equal(e.keys()[9].command,null);assert.equal(e.keys()[9].thumbnail,undefined);
 e.s.data.outputs=[{key:'first',source:1,enabled:false},{key:'second',source:1,enabled:false}];e.updateProgram();assert.equal(e.keys()[9].title,'OUTPUT\nREADY');
 e.s.data.outputs[1].enabled=true;e.s.data.inputs[0].status=0;e.updateProgram();assert.equal(e.keys()[9].title,'OUTPUT\nREADY');assert.equal(e.keys()[9].color,'#9aa6b4');e.s.data.inputs[0].status=2;e.updateProgram();assert.equal(e.keys()[9].title,'OUTPUT\nLIVE');assert.equal(e.keys()[9].color,'#ff6969');assert.equal(e.keys()[9].thumbnail,undefined);
 e.s.data.outputs=[{key:'via-encoder',encoder:1,enabled:true}];e.s.encoders=[{id:1,input:1,enabled:false}];e.updateProgram();assert.equal(e.keys()[9].title,'OUTPUT\nREADY');e.s.encoders[0].enabled=true;e.updateProgram();assert.equal(e.keys()[9].title,'OUTPUT\nLIVE');
 e.s.data.inputs[0].status=0;e.updateProgram();assert.equal(e.keys()[9].title,'OUTPUT\nREADY');e.s.data.inputs[0].status=2;e.s.data.inputs[0].connected=false;e.updateProgram();assert.equal(e.keys()[9].title,'OUTPUT\nREADY');e.s.data.inputs[0].connected=true;
 e.s.encoders[0].input=2;e.updateProgram();assert.equal(e.keys()[9].title,'OUTPUT\nNOT ROUTED');
});

test('four detail sections share asset navigation and identity positions with purple single-source Mojo arrows',async()=>{
 const {svg}=require(root+'/render'),e=new Engine(createClient);await e.configure({demo:true});
 for(const command of [{type:'input',id:1,uid:'demo-0'},{type:'output',key:e.s.data.outputs[0].key},{type:'encoder',id:1},{type:'mojo',id:1,uid:'demo-0'}]){
  await e.execute(command);
  const k=e.keys();assert.equal(k[8].command.type,'asset');assert.equal(k[8].command.delta,-1);
  assert.equal(k[24].command.type,'asset');assert.equal(k[24].command.delta,1);
  assert.ok(k[16].title);assert.equal(k[25].kind,'preview');
  assert.match(svg(k[8]),/fill="#33264d"/);assert.match(svg(k[24]),/stroke="#ba9cff"/);
  if(command.type==='mojo'){assert.equal(k[9].kind,'status');assert.equal(k[6].command.type,'page');}
  else{assert.equal(k[9].kind,'heading');assert.ok(['power','outputPower','encoderPower'].includes(k[17].command.type));}
 }
});

test('source picker defaults to READY and toggles offline routing for outputs and encoders',async()=>{
 const f=fixture();f.inputs[1].connectionStatus=0;f.inputs[1].hardwareIdentifier='';
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 for(const command of [{type:'pick',kind:'outputInput',key:e.s.data.outputs[0].key},{type:'pick',kind:'encoderInput',encoder:1}]){
  await e.execute(command);
  assert.equal(e.s.picker.readiness,'READY');
  assert.equal(e.keys()[10].color,'#ba9cff');
  assert.ok(!e.keys().some(k=>k.command?.type==='choose'&&k.command.item.command.input===2));
  e.s.page=1;await e.execute(e.keys()[10].command);assert.equal(e.s.page,0);
  assert.equal(e.s.picker.readiness,'NOT READY');
  const source=e.keys().find(k=>k.command?.type==='choose'&&k.command.item.command.input===2);
  assert.ok(source);assert.ok(!source.disabled);
  const start=f.requests.length;await e.execute(source.command);
  if(command.kind==='outputInput'){assert.equal(f.roots.basebandPlayer['1'].channelIndex,1);assert.ok(!f.requests.slice(start).some(r=>r.path.includes('/playStream/')));}
  else assert.equal(f.roots.enc['1'].inputIndex,1);
 }
 await e.execute({type:'pick',kind:'encoderInput',encoder:1});
 assert.equal(e.s.picker.readiness,'READY');
 await e.execute(e.keys()[10].command);await e.execute(e.keys()[10].command);assert.equal(e.s.picker.readiness,'READY');
});

test('SELECT INPUT preserves OFF and ON without playback or power writes for outputs and encoders',async()=>{
 for(const enabled of [false,true]){
  const f=fixture();f.roots.basebandPlayer['1'].enable=enabled;f.roots.enc['1'].enable=enabled;
  const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
  for(const command of [{type:'pick',kind:'outputInput',key:e.s.data.outputs[0].key},{type:'pick',kind:'encoderInput',encoder:1}]){
   await e.execute(command);const start=f.requests.length;
   await e.execute(e.keys().find(k=>k.command?.type==='choose'&&k.command.item.command.input===2).command);
   const writes=f.requests.slice(start);
   assert.ok(!writes.some(r=>r.path.includes('/playStream/')||r.path.includes('/playIPStream/')));
   assert.ok(!writes.some(r=>r.body?.item?.endsWith('.enable')));
   assert.equal(f.roots.basebandPlayer['1'].enable,enabled);assert.equal(f.roots.enc['1'].enable,enabled);
   if(command.kind==='outputInput')assert.equal(f.roots.basebandPlayer['1'].channelIndex,1);
   else assert.equal(f.roots.enc['1'].inputIndex,1);
  }
 }
});

test('input terminal controls use icons and native colors with compatible video return selection',async()=>{
 const {svg}=require(root+'/render'),e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'input',id:1,uid:'demo-0'});
 assert.equal(e.keys()[18].icon,'Record');assert.equal(e.keys()[19].icon,'Record');
 assert.equal(e.keys()[26].icon,'Intercom');assert.equal(e.keys()[27].icon,'VideoReturn');
 assert.equal(e.keys()[27].color,'#ffa64d');
 await e.execute(e.keys()[26].command);assert.equal(e.s.data.inputs[0].intercom,true);assert.match(svg(e.keys()[26]),/fill="#4c9dff"/);
 await e.execute(e.keys()[26].command);assert.equal(e.s.data.inputs[0].intercom,false);
 await e.execute(e.keys()[27].command);
 assert.ok(!e.s.picker.items.some(item=>item.command.kind==='input'&&item.command.target===1));
 const encoder=e.s.picker.items.find(item=>item.command.kind==='encoder');await e.execute({type:'choose',item:encoder});
 assert.equal(e.s.data.inputs[0].returnEncoder,1);assert.match(e.keys()[27].title,/ENC 1/);
 await e.execute(e.keys()[27].command);await e.execute({type:'choose',item:e.s.picker.items.find(item=>item.command.kind==='none')});
 assert.equal(e.s.data.inputs[0].returnEncoder,null);assert.match(e.keys()[27].title,/OFF/);
 e.s.data.inputs[0].returnCapability=0;e.s.data.inputs[0].intercomAvailable=false;
 assert.equal(e.keys()[26].blank,true);assert.equal(e.keys()[27].blank,true);
});

test('disposing a server session aborts outstanding REST reads and suppresses stale UI notifications',async()=>{
 const f=fixture();let block=false,pendingSignal,notified=0;
 const fetch=async(url,options)=>{
  if(block&&new URL(url).pathname==='/inputs')return new Promise((resolve,reject)=>{pendingSignal=options.signal;options.signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});});
  return f.fetch(url,options);
 };
 const e=new Engine(createClient,()=>notified++,fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 block=true;const refreshing=e.refresh();await new Promise(resolve=>setImmediate(resolve));assert.ok(pendingSignal);
 const before=notified;e.dispose();await refreshing;
 assert.equal(pendingSignal.aborted,true);assert.equal(notified,before);assert.equal(e.disposed,true);
});

test('COPY LINK uses actual native addresses for IP inputs and outputs and copies without changing power',async()=>{
 const f=fixture(),copied=[];
 f.inputs[1]={...f.inputs[1],product:'IP-INPUT',channelType:'SRT',remoteControl:0,inputProtocolId:0,connectionStatus:0};
 f.roots.inputProtocol['0']={type:'SRT',name:'Listener',serverMode:true,port:9000,enable:false,channelProfileId:1};
 f.roots.streamingOutput['0']={name:'SRT out',mode:'SRT',serverMode:true,port:9100,enable:false,channelIndex:1,outputOrder:0};
 const e=new Engine(createClient,()=>{},f.fetch,{copyText:async text=>copied.push(text)});
 await e.configure({address:'192.0.2.5',key:'test-key'});
 e.native={selectInput:()=>{},verified:true,network:{localIps:['10.0.0.5','192.168.1.5'],publicIp:'203.0.113.5',hostname:'stream.example.test'}};
 for(const asset of ['input','output']){
  const command=asset==='input'?{type:'pick',kind:'copyLink',asset,input:2,uid:'unit-1'}:{type:'pick',kind:'copyLink',asset,key:e.s.data.outputs.find(o=>o.type==='IP').key};
  await e.execute(command);
  assert.deepEqual(e.s.picker.items.map(i=>i.title),['LOCAL IP 1','LOCAL IP 2','PUBLIC IP','HOSTNAME']);
  const choice=e.s.picker.items.find(i=>i.title==='HOSTNAME'),start=f.requests.length;
  await e.execute({type:'choose',item:choice});
  assert.equal(copied.at(-1),'srt://stream.example.test:'+(asset==='input'?9000:9100));
  assert.equal(e.s.view,'pick');assert.ok(e.keys().some(k=>k.title==='COPIED\nHOSTNAME'));
  assert.ok(!f.requests.slice(start).some(r=>r.method==='POST'));
  e.back();
 }
 e.native.network={localIps:['10.0.0.5'],publicIp:null,hostname:null};
 await e.execute({type:'pick',kind:'copyLink',asset:'input',input:2,uid:'unit-1'});
 assert.equal(e.s.picker.items.find(i=>i.title.startsWith('PUBLIC IP')).disabled,true);
 assert.ok(!e.keys().some(k=>k.title.startsWith('COPIED')));
 const old=e.s.picker.items.find(i=>i.command);f.roots.inputProtocol['0'].port=9001;
 await assert.rejects(e.execute({type:'choose',item:old}),/changed/);assert.equal(copied.length,2);
});

test('input navigation visits empty unassigned slots and wraps while keeping IP PROFILE available',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});
 for(const input of e.s.data.inputs){input.connected=false;input.protocolId=-1;input.canEject=false;input.canLive=false;input.isMojo=false;}
 await e.execute({type:'input',id:1,uid:'demo-0'});
 for(let id=2;id<=32;id++){
  await e.execute(e.keys()[24].command);assert.equal(e.s.selected.id,id);
  assert.equal(e.keys()[22].command.kind,'inputProfile');assert.equal(e.keys()[22].disabled,false);
 }
 await e.execute(e.keys()[24].command);assert.equal(e.s.selected.id,1);
 await e.execute(e.keys()[8].command);assert.equal(e.s.selected.id,32);
});
test('input and output diagnostics show native messages, preserve preview and clear recovered warnings',async()=>{
 const {diagnostic,terminalFields}=require(root+'/diagnostics'),{image}=require(root+'/render');
 const error=diagnostic({...terminalFields({channelStatus:3,liveStatus:-28,liveStatusErrorParam:'1080p50;1000'}),enabled:true});
 assert.equal(error.severity,'error');assert.match(error.message,/1000.*1080p50/);assert.equal(error.code,-28);
 assert.equal(diagnostic({enabled:false,status:3,message:'DNS_ISSUE'},'output'),null);
 const e=new Engine(createClient);await e.configure({demo:true});
 const i=e.s.data.inputs[0];i.status=4;i.message='Unknown warning <native>';i.errorCode=0;
 let key=e.keys().find(k=>k.command?.type==='input'&&k.command.id===1);assert.equal(key.stateLabel,'WARNING');assert.equal(key.color,'#ffc266');
 await e.execute(key.command);
 const frame='data:image/jpeg;base64,/9j/AA==';e.s.preview={selection:e.previewSelection(),time:Date.now(),thumbnail:frame};
 key=e.keys()[25];assert.equal(key.thumbnail,frame);assert.equal(key.notice,'WARNING');
 const rendered=Buffer.from(image(key).split(',')[1],'base64').toString();
 assert.match(rendered,/<image/);assert.match(rendered,/WARNING/);assert.match(rendered,/stroke="#ffc266"/);
 await e.execute(e.keys()[30].command);
 assert.equal(e.s.view,'diagnostic');assert.ok(e.keys().some(k=>k.title.replace(/\s+/g,' ').includes('Unknown warning')));
 assert.equal(e.keys()[0].active,true);await e.execute(e.keys()[4].command);assert.equal(e.s.view,'input');
 i.status=0;i.connected=true;i.message='';assert.equal(e.keys()[25].notice,undefined);assert.equal(e.keys()[9].title,'READY');
 await e.execute({type:'section',section:'OUTPUT'});
 const o=e.s.data.outputs[0];o.status=3;o.message='DNS_ISSUE';o.enabled=true;
 key=e.keys().find(k=>k.command?.type==='output'&&k.command.key===o.key);assert.equal(key.color,'#ff6969');
 await e.execute(key.command);assert.match(e.keys()[9].title,/DNS issue/);
 await e.execute(e.keys()[30].command);assert.equal(e.keys()[1].active,true);assert.ok(e.keys().some(k=>k.title==='DNS issue'));
 await e.execute(e.keys()[4].command);o.status=4;o.message='OUTPUT_DELAY_TOO_LOW';assert.match(e.keys()[9].title,/WARNING/);
 o.enabled=false;assert.equal(e.keys()[9].title,'OFF');assert.equal(e.keys()[25].notice,undefined);
});
test('STATUS DETAILS paginates full long messages and native readback replaces stale terminal errors',async()=>{
 const {diagnostic}=require(root+'/diagnostics'),e=new Engine(createClient);await e.configure({demo:true});
 const i=e.s.data.inputs[0];i.status=3;i.message=Array.from({length:180},(_,n)=>'word'+n).join(' ');
 await e.execute({type:'input',id:1,uid:'demo-0'});await e.execute(e.keys()[30].command);
 assert.equal(e.keys()[6].command.type,'page');await e.execute(e.keys()[6].command);assert.equal(e.s.page,1);
 i.nativeDiagnostic={status:0,errorCode:0,message:''};assert.equal(diagnostic(i),null);
 i.nativeDiagnostic={status:3,errorCode:-32,message:''};assert.match(diagnostic(i).message,/SD Card is full/);
});

test('multi-output route selection survives filters and pages, confirms once and preserves mixed power states',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});
 for(let n=0;n<18;n++)e.s.data.outputs.push({key:'IP:extra:'+n,type:'IP',id:20+n,name:'Extra '+n,enabled:n%2===0,powerAvailable:true,locked:false,source:null});
 const power=new Map(e.s.data.outputs.map(o=>[o.key,o.enabled]));
 await e.execute({type:'input',id:2,uid:'demo-1'});await e.execute(e.keys()[21].command);
 assert.deepEqual(e.keys().filter(k=>k.command?.type==='routeGroup').map(k=>k.title),['SDI','NDI','IP']);
 const select=()=>e.execute(e.keys().find(k=>k.command?.type==='choose'&&!k.disabled).command);
 await select();assert.equal(e.s.picker.selectedKeys.length,1);
 await e.execute({type:'routeGroup',group:'NDI'});await select();
 await e.execute({type:'routeGroup',group:'IP'});await select();
 await e.execute(e.keys()[6].command);await select();assert.equal(e.s.picker.selectedKeys.length,4);
 await e.execute({type:'routeGroup',group:'SDI'});assert.equal(e.s.page,0);
 const chosen=[...e.s.picker.selectedKeys];assert.ok(e.s.data.outputs.filter(o=>chosen.includes(o.key)).some(o=>o.source!==2));
 await e.execute(e.keys()[15].command);assert.equal(e.s.view,'pick');assert.equal(e.s.picker.decision,true);await e.execute(e.keys()[16].command);assert.equal(e.s.view,'input');
 for(const o of e.s.data.outputs){assert.equal(o.enabled,power.get(o.key));if(chosen.includes(o.key))assert.equal(o.source,2);}
 await e.execute(e.keys()[21].command);await select();await e.execute(e.keys()[14].command);assert.equal(e.s.view,'input');
});
test('real multi-route confirms assignments without playback and retains only failed outputs',async()=>{
 const f=fixture();f.roots.basebandPlayer['2'].outputOrder=2;f.roots.basebandPlayer['2'].enable=true;
 const original=f.fetch;f.fetch=async(url,options={})=>{
  const u=new URL(url);if(u.pathname==='/outputs')return {ok:true,json:async()=>({output:[1,2].map(id=>({uid:'sdi_'+id,name:'SDI '+id,enable:f.roots.basebandPlayer[id].enable,channelSourceIndex:f.roots.basebandPlayer[id].channelIndex})),IPOutput:[],NDIOutput:[]})};
  return original(url,options);
 };
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'input',id:2,uid:'unit-1'});await e.execute({type:'pick',kind:'route',input:2,uid:'unit-1'});
 for(const item of e.s.picker.items)await e.execute({type:'choose',item});
 const start=f.requests.length;await e.execute({type:'routeApply',goLive:false});
 assert.equal(f.roots.basebandPlayer['1'].channelIndex,1);assert.equal(f.roots.basebandPlayer['2'].channelIndex,1);
 assert.equal(f.roots.basebandPlayer['1'].enable,false);assert.equal(f.roots.basebandPlayer['2'].enable,true);
 assert.ok(!f.requests.slice(start).some(r=>r.path.includes('/playStream/')||r.body?.item?.endsWith('.enable')));
 f.roots.basebandPlayer['1'].channelIndex=-1;f.roots.basebandPlayer['2'].channelIndex=-1;await e.refresh();
 await e.execute({type:'pick',kind:'route',input:2,uid:'unit-1'});
 for(const item of e.s.picker.items)await e.execute({type:'choose',item});
 const handle=e.client.handle;e.client.handle=async message=>message.type==='route'?{results:[{key:e.s.picker.selectedKeys[0],ok:true},{key:e.s.picker.selectedKeys[1],ok:false,message:'Rejected'}]}:handle(message);
 await assert.rejects(e.execute({type:'routeApply',goLive:false}),/1 of 2 assigned/);assert.equal(e.s.view,'pick');assert.equal(e.s.picker.selectedKeys.length,1);
});

test('already assigned routing outputs are grey and cannot be selected even while OFF',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});
 await e.execute({type:'input',id:1,uid:'demo-0'});await e.execute(e.keys()[21].command);
 const key=e.keys().find(k=>k.command?.item?.command?.key===e.s.data.outputs[0].key);
 assert.equal(key.disabled,true);assert.match(key.title,/ALREADY\nASSIGNED/);
 const {svg}=require(root+'/render');assert.match(svg(key),/stroke="#69727e"/);
 await e.execute(key.command);assert.equal(e.s.picker.selectedKeys.length,0);
 await e.execute({type:'routeGroup',group:'IP'});
 assert.ok(e.keys().filter(k=>k.command?.type==='choose').every(k=>k.disabled));
});

test('output bulk unassign preserves outputs and power while selections span filters and pages',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'section',section:'OUTPUT'});
 assert.equal(e.keys()[13].command.mode,'toggle');assert.equal(e.keys()[14].command.mode,'unassign');assert.equal(e.keys()[15].command.type,'bulkStart');
 const original=e.s.data.outputs.map(o=>({key:o.key,enabled:o.enabled}));
 await e.execute(e.keys()[14].command);
 const select=()=>e.execute(e.keys().find(k=>k.command?.type==='outputBulkSelect'&&!k.disabled).command);
 await select();await e.execute({type:'outputGroup',group:'NDI'});await select();await e.execute({type:'outputGroup',group:'IP'});await select();
 const keys=[...e.s.outputBulk.keys];assert.equal(keys.length,3);
 await e.execute(e.keys()[14].command);assert.equal(e.s.outputBulk,null);assert.equal(e.s.data.outputs.length,original.length);
 for(const o of e.s.data.outputs){assert.equal(o.enabled,original.find(x=>x.key===o.key).enabled);if(keys.includes(o.key))assert.equal(o.source,null);}
 await e.execute({type:'outputGroup',group:'SDI'});await e.execute(e.keys()[13].command);
 for(const o of e.s.data.outputs.filter(o=>o.type==='SDI'))await e.execute({type:'outputBulkSelect',key:o.key});
 await e.execute(e.keys()[14].command);
 for(const o of e.s.data.outputs.filter(o=>o.type==='SDI'))assert.equal(o.enabled,!original.find(x=>x.key===o.key).enabled);
});
test('real output unassign keeps physical channel order and ON/OFF; bulk toggle changes only selected states',async()=>{
 const f=fixture();f.roots.basebandPlayer['1'].channelIndex=1;f.roots.basebandPlayer['1'].enable=true;
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'section',section:'OUTPUT'});
 const key=e.s.data.outputs[0].key;await e.execute({type:'outputBulkStart',mode:'unassign'});await e.execute({type:'outputBulkSelect',key});
 const start=f.requests.length;await e.execute({type:'outputBulkRun'});
 assert.equal(f.roots.basebandPlayer['1'].channelIndex,-1);assert.equal(f.roots.basebandPlayer['1'].enable,true);assert.equal(f.roots.basebandPlayer['1'].outputOrder,1);
 assert.ok(!f.requests.slice(start).some(r=>r.body?.item?.endsWith('.enable')||r.body?.item?.endsWith('.outputOrder')));
 await e.execute({type:'outputBulkStart',mode:'toggle'});await e.execute({type:'outputBulkSelect',key});await e.execute({type:'outputBulkRun'});
 assert.equal(f.roots.basebandPlayer['1'].enable,false);
 await e.execute({type:'outputBulkStart',mode:'toggle'});await e.execute({type:'outputBulkSelect',key});await e.execute({type:'outputBulkCancel'});
 assert.equal(f.roots.basebandPlayer['1'].enable,false);assert.equal(e.s.outputBulk,null);
});

test('bulk unassign clears IP encoder sources without deleting profiles or changing power',async()=>{
 const f=fixture();f.roots.streamingOutput['0']={name:'Encoded out',mode:'SRT',channelIndex:-1,encoderIndex:0,enable:true,outputOrder:0};
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'section',section:'OUTPUT'});
 const o=e.s.data.outputs.find(o=>o.type==='IP');
 await e.execute({type:'outputBulkStart',mode:'unassign'});await e.execute({type:'outputBulkSelect',key:o.key});await e.execute({type:'outputBulkRun'});
 assert.equal(f.roots.streamingOutput['0'].encoderIndex,-1);assert.equal(f.roots.streamingOutput['0'].enable,true);assert.equal(f.roots.streamingOutput['0'].outputOrder,0);
 assert.equal(f.roots.enc['1'].encoderProfileId,0);
});
test('partial bulk power failure retains only remaining outputs so retry cannot invert completed ones twice',async()=>{
 const f=fixture();f.roots.basebandPlayer['2'].outputOrder=2;
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'section',section:'OUTPUT'});
 await e.execute({type:'outputBulkStart',mode:'toggle'});
 const outputs=[...e.s.data.outputs];assert.equal(outputs.length,2);
 for(const o of outputs)await e.execute({type:'outputBulkSelect',key:o.key});
 const handle=e.client.handle;
 e.client.handle=async message=>message.type==='outputControl'&&message.keys[0]===outputs[1].key?{results:[{key:outputs[1].key,ok:false,message:'Rejected'}]}:handle(message);
 await assert.rejects(e.execute({type:'outputBulkRun'}),/1 of 2 outputs updated/);
 assert.deepEqual(e.s.outputBulk.keys,[outputs[1].key]);assert.equal(f.roots.basebandPlayer['1'].enable,true);
 e.client.handle=handle;await e.execute({type:'outputBulkRun'});
 assert.equal(f.roots.basebandPlayer['1'].enable,true);assert.equal(f.roots.basebandPlayer['2'].enable,true);assert.equal(e.s.outputBulk,null);
});

test('engine bulk unassign uses grouped native configuration when REST item writes are disabled',async()=>{
 const f=fixture();f.roots.basebandPlayer['1'].channelIndex=3;f.roots.basebandPlayer['2'].channelIndex=3;f.roots.basebandPlayer['2'].outputOrder=2;
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 let grouped;e.native={selectInput:()=>{},verified:true,unassignOutputs:async(outputs,extra,onConfirmed)=>{grouped=outputs.map(o=>o.key);for(const o of outputs)f.roots.basebandPlayer[o.configIndex].channelIndex=-1;onConfirmed(grouped);}};
 await e.execute({type:'section',section:'OUTPUT'});await e.execute({type:'outputBulkStart',mode:'unassign'});
 for(const o of e.s.data.outputs)await e.execute({type:'outputBulkSelect',key:o.key});
 assert.equal(e.s.outputBulk.keys.length,2);const start=f.requests.length;await e.execute({type:'outputBulkRun'});
 assert.equal(grouped.length,2);assert.equal(e.s.data.outputs.every(o=>o.source===null),true);
 assert.ok(!f.requests.slice(start).some(r=>r.path==='/config/item'));assert.equal(e.s.outputBulk,null);
});


test('WB numeric strings from the device are normalized and external values refresh the key',async()=>{
 const f=fixture();f.camera.WB.WB='4300';f.camera.WB.WBRange=['1500','10000'];
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});
 assert.equal(e.s.camera.settings.WB.WB,4300);assert.match(e.keys()[11].title,/4300/);
 f.camera.WB.WB='6100';await e.refresh();assert.equal(e.s.camera.settings.WB.WB,6100);assert.match(e.keys()[11].title,/6100/);
});
test('switching WB to AUTO accepts the measured value immediately instead of freezing the preset',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});
 await e.execute({type:'mode',param:'WB'});f.camera.WB.WB=4700;await e.refresh();
 assert.equal(e.s.camera.settings.WB.WBMode,'AUTO');assert.equal(e.s.camera.settings.WB.WB,4700);assert.match(e.keys()[11].title,/4700/);
 f.camera.WB.WB=4850;await e.refresh();assert.equal(e.s.camera.settings.WB.WB,4850);
});
test('WB never presents a remembered preset as a current value when the device omits its measurement',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});
 await e.execute({type:'adjust',param:'WB',delta:1});e.cameraSentAt.set('WB',Date.now()-3000);delete f.camera.WB.WB;await e.refresh();
 assert.equal(e.s.camera.known.WB,false);assert.ok(e.keys()[11].title.includes('N/A'));assert.doesNotMatch(e.keys()[11].title,/5700/);
});


test('input bulk toggles mixed states across pages, leaves assignments intact, and excludes unavailable slots',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});assert.match(e.keys()[15].title,/UNASSIGN/);await e.execute(e.keys()[14].command);
 const a=e.s.data.inputs[0],b=e.s.data.inputs[17];a.connected=true;a.enabled=true;b.connected=true;b.enabled=false;
 await e.execute({type:'inputBulkSelect',id:a.id,uid:a.uid});await e.execute({type:'page',pages:2});await e.execute({type:'inputBulkSelect',id:b.id,uid:b.uid});assert.equal(e.s.inputBulk.items.length,2);
 const keys=e.keys();assert.ok(keys.some(k=>k.title.includes('OFF → ON')));await e.execute({type:'inputBulkRun'});
 assert.equal(a.enabled,false);assert.equal(b.enabled,true);assert.equal(a.connected,true);assert.equal(b.connected,true);assert.equal(e.s.inputBulk,null);
 await e.execute({type:'inputBulkStart'});await e.execute({type:'section',section:'OUTPUT'});assert.equal(e.s.inputBulk,null);
});
test('real input bulk retry keeps only failed inputs and never toggles completed ones twice',async()=>{
 const f=fixture();f.inputs[0].channelStatus=2;const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});
 await e.execute({type:'inputBulkStart'});for(const id of [1,2])await e.execute({type:'inputBulkSelect',id,uid:'unit-'+(id-1)});
 const handle=e.client.handle;let fail=true;e.client.handle=async m=>{if(fail&&m.type==='inputPower'&&m.input===2)throw Error('Temporary rejection');return handle(m);};
 await assert.rejects(e.execute({type:'inputBulkRun'}),/1 of 2 inputs updated/);assert.equal(f.inputs[0].channelStatus,0);assert.deepEqual(e.s.inputBulk.items.map(i=>i.id),[2]);
 fail=false;await e.execute({type:'inputBulkRun'});assert.equal(f.inputs[0].channelStatus,0);assert.equal(f.inputs[1].channelStatus,2);assert.equal(e.s.inputBulk,null);
 assert.equal(f.requests.filter(r=>r.path==='/inputs/1/live/stop').length,1);
});
test('input bulk detects a replaced device before sending any power command',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'inputBulkStart'});await e.execute({type:'inputBulkSelect',id:1,uid:'unit-0'});
 f.inputs[0].hardwareIdentifier='replacement';const start=f.requests.length;await assert.rejects(e.execute({type:'inputBulkRun'}),/identity/);assert.ok(!f.requests.slice(start).some(r=>r.method==='POST'));
});
test('routing choice sends no command until chosen and GO LIVE enables only the input and selected outputs',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'input',id:2,uid:'unit-1'});await e.execute(e.keys()[21].command);await e.execute({type:'choose',item:e.s.picker.items[0]});
 const start=f.requests.length;await e.execute({type:'routeConfirm'});assert.equal(e.s.picker.decision,true);assert.ok(!f.requests.slice(start).some(r=>r.method==='POST'));assert.equal(e.keys()[16].command.goLive,false);assert.equal(e.keys()[18].command.goLive,true);
 await e.execute(e.keys()[18].command);assert.equal(e.s.view,'input');assert.equal(f.inputs[1].channelStatus,2);assert.equal(f.inputs[0].channelStatus,0);assert.equal(f.roots.basebandPlayer['1'].channelIndex,1);assert.equal(f.roots.basebandPlayer['1'].enable,true);assert.equal(f.roots.basebandPlayer['2'].enable,false);
 const operations=f.requests.slice(start);const assignment=operations.findIndex(r=>r.body?.item?.endsWith('.channelIndex')),live=operations.findIndex(r=>r.path==='/inputs/2/live/start');assert.ok(assignment>=0&&live>assignment);
});
test('GO LIVE retry preserves assignment and retries failed output activation without restarting its input',async()=>{
 const f=fixture(),e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'input',id:2,uid:'unit-1'});await e.execute(e.keys()[21].command);await e.execute({type:'choose',item:e.s.picker.items[0]});await e.execute({type:'routeConfirm'});
 const handle=e.client.handle;let fail=true;e.client.handle=async m=>fail&&m.type==='outputControl'?{results:[{key:m.keys[0],ok:false,message:'Output busy'}]}:handle(m);
 await assert.rejects(e.execute({type:'routeApply',goLive:true}),/Output busy/);assert.equal(e.s.view,'pick');assert.equal(f.inputs[1].channelStatus,2);assert.equal(f.roots.basebandPlayer['1'].channelIndex,1);assert.equal(e.s.picker.activationKeys.length,1);
 fail=false;await e.execute({type:'routeApply',goLive:true});assert.equal(e.s.view,'input');assert.equal(f.roots.basebandPlayer['1'].enable,true);assert.equal(f.requests.filter(r=>r.path==='/inputs/2/live/start').length,1);
});


test('input bulk toggles IP profiles while preserving their channel assignments',async()=>{
 const f=fixture();Object.assign(f.inputs[0],{product:'IPINPUT',channelType:'SRT',remoteControl:0,inputProtocolId:0});f.roots.inputProtocol['0']={name:'SRT',type:'SRT',enable:true,channelProfileId:1};
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'inputBulkStart'});await e.execute({type:'inputBulkSelect',id:1,uid:'unit-0'});await e.execute({type:'inputBulkRun'});
 assert.equal(f.roots.inputProtocol['0'].enable,false);assert.equal(f.roots.inputProtocol['0'].channelProfileId,1);
 await e.execute({type:'inputBulkStart'});await e.execute({type:'inputBulkSelect',id:1,uid:'unit-0'});await e.execute({type:'inputBulkRun'});assert.equal(f.roots.inputProtocol['0'].enable,true);assert.equal(f.roots.inputProtocol['0'].channelProfileId,1);
});
test('GO LIVE activates all selected SDI outputs, and partial activation retries only remaining ones',async()=>{
 const f=fixture();f.roots.basebandPlayer['2'].outputOrder=2;const original=f.fetch;f.fetch=async(url,options={})=>new URL(url).pathname==='/outputs'?{ok:true,json:async()=>({output:[1,2].map(id=>({uid:'sdi_'+id,name:'SDI '+id,enable:f.roots.basebandPlayer[id].enable,channelSourceIndex:f.roots.basebandPlayer[id].channelIndex})),IPOutput:[],NDIOutput:[]})}:original(url,options);
 const e=new Engine(createClient,()=>{},f.fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'input',id:2,uid:'unit-1'});await e.execute(e.keys()[21].command);for(const item of e.s.picker.items)await e.execute({type:'choose',item});await e.execute({type:'routeConfirm'});
 const handle=e.client.handle;let fail=true;e.client.handle=async m=>fail&&m.type==='outputControl'&&m.keys[0]==='SDI:2'?{results:[{key:'SDI:2',ok:false,message:'Output busy'}]}:handle(m);
 await assert.rejects(e.execute({type:'routeApply',goLive:true}),/Output busy/);assert.equal(f.roots.basebandPlayer['1'].enable,true);assert.equal(f.roots.basebandPlayer['2'].enable,false);assert.deepEqual(e.s.picker.activationKeys,['SDI:2']);
 fail=false;await e.execute({type:'routeApply',goLive:true});assert.equal(f.roots.basebandPlayer['2'].enable,true);assert.equal(f.requests.filter(r=>r.body?.item==='basebandPlayer.1.enable').length,1);assert.equal(e.s.view,'input');
});

test('input recording and terminal controls appear only for assigned appropriate source types',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'input',id:1,uid:'demo-0'});const i=e.s.data.inputs[0];
 i.connected=false;i.protocolId=-1;for(const slot of [18,19,26,27])assert.equal(e.keys()[slot].blank,true);
 i.protocolId=0;i.isMojo=false;i.canLive=false;assert.equal(e.keys()[19].icon,'Record');for(const slot of [18,26,27])assert.equal(e.keys()[slot].blank,true);
 i.connected=true;for(const slot of [18,26,27])assert.equal(e.keys()[slot].blank,true);
 i.protocolId=-1;i.canLive=true;assert.equal(e.keys()[18].icon,'Record');assert.equal(e.keys()[26].icon,'Intercom');assert.equal(e.keys()[27].icon,'VideoReturn');
});
test('shutter uses the requested discrete list and audio adjusts on an integer two dB grid',()=>{
 const RCP=require(root+'/rcp'),{demo}=require(root+'/demo'),camera=demo().camera;
 assert.deepEqual(RCP.shutterSteps({ShutterSpeedRange:[25,25600]},{shutterUnit:'denominator'}),[25,30,50,60,75,100,120,150,200,300,400,600,800,1200,1600,2400,3200,4800,6400,12800,19200,25600]);
 camera.settings.AudioGain.AudioGain=-14.2;assert.equal(step(camera,'AudioGain',1),-12);assert.equal(step(camera,'AudioGain',-1),-16);camera.settings.AudioGain.AudioGain=-12;assert.equal(step(camera,'AudioGain',1),-10);
});
test('WB icon skips presets and zoom and audio center keys reset only their own values',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'mojo',id:1,uid:'demo-0'});const c=e.s.camera;
 c.settings.WB.WBModes=['Manual','Auto','Daylight','Cloudy'];c.settings.WB.WBMode='Manual';await e.execute({type:'mode',param:'WB'});assert.equal(c.settings.WB.WBMode,'Auto');await e.execute({type:'mode',param:'WB'});assert.equal(c.settings.WB.WBMode,'Manual');
 c.settings.Zoom.Zoom=3;c.settings.AudioGain.AudioGain=-14.2;e.s.page=1;assert.equal(e.keys()[11].command.type,'mode');assert.equal(e.keys()[27].command.type,'mode');
 await e.execute(e.keys()[11].command);assert.equal(c.settings.Zoom.Zoom,1);assert.equal(c.settings.AudioGain.AudioGain,-14.2);await e.execute(e.keys()[27].command);assert.equal(c.settings.AudioGain.AudioGain,0);
});

test('a camera command can interrupt a slow background refresh without disconnecting StreamHub',async()=>{
 const f=fixture();let blocked=false,entered,aborted=false;const started=new Promise(r=>entered=r);
 const fetch=async(url,options)=>{if(blocked&&new URL(url).pathname==='/inputs'){entered();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(Error('Refresh interrupted'));},{once:true}));}return f.fetch(url,options);};
 const e=new Engine(createClient,()=>{},fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});blocked=true;const refresh=e.refresh();await started;e.interruptRefresh();await refresh;assert.equal(aborted,true);assert.equal(e.s.online,true);assert.equal(e.s.error,'');assert.equal(e.refreshing,false);blocked=false;await e.execute({type:'adjust',param:'WB',delta:1});assert.equal(f.camera.WB.WB,5700);
});
test('camera preflight reads identity and settings concurrently before issuing any write',async()=>{
 const f=fixture();let enabled=false,identityStarted=false,settingsStarted=false,releaseIdentity,releaseSettings;
 const fetch=async(url,options={})=>{const pathname=new URL(url).pathname;if(enabled&&!options.body){if(pathname==='/inputs/1'){identityStarted=true;return new Promise(r=>releaseIdentity=()=>r(f.fetch(url,options)));}if(pathname==='/inputs/1/mojoPro/cameraSettings'){settingsStarted=true;return new Promise(r=>releaseSettings=()=>r(f.fetch(url,options)));}}return f.fetch(url,options);};
 const e=new Engine(createClient,()=>{},fetch);await e.configure({address:'192.0.2.5',key:'test-key'});await e.execute({type:'mojo',id:1,uid:'unit-0'});enabled=true;const writes=f.requests.filter(r=>r.method==='POST').length;const command=e.execute({type:'adjust',param:'WB',delta:1});await new Promise(r=>setImmediate(r));assert.equal(identityStarted,true);assert.equal(settingsStarted,true);assert.equal(f.requests.filter(r=>r.method==='POST').length,writes);releaseIdentity();releaseSettings();await command;assert.equal(f.camera.WB.WB,5700);
});

test('LIVE PROFILE picker shows actual transmitter presets and preserves input power',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});const i=e.s.data.inputs[1];i.liveProfiles=[{id:'0',name:'HD'},{id:'7',name:'Low bitrate'}];i.liveProfileId='0';i.liveProfileInstance=42;
 await e.execute({type:'input',id:i.id,uid:i.uid});const before=i.enabled;assert.equal(e.keys()[20].color,'#ba9cff');await e.execute(e.keys()[20].command);
 assert.equal(e.s.picker.kind,'liveProfile');assert.equal(e.keys().filter(k=>k.command?.type==='choose').length,2);assert.ok(e.keys()[16].active);
 await e.execute(e.keys()[17].command);assert.equal(i.liveProfileId,'7');assert.equal(i.enabled,before);assert.equal(e.s.view,'input');assert.match(e.keys()[20].title,/Low bitrate/);
 i.connected=false;assert.equal(e.keys()[20].command,null);i.connected=true;i.isMojo=true;assert.equal(e.keys()[20].command,null);
});
