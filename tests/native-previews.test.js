'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {NativePreviews}=require('../org.streamhub.controller.sdPlugin/bin/native-previews');
class Socket{
 static instances=[];
 constructor(url){this.readyState=1;this.url=new URL(url);this.sent=[];Socket.instances.push(this);}
 send(p){this.sent.push(p);}
 close(){this.onclose?.();}
 event(data){this.onmessage({data:'42'+JSON.stringify(data)});}
 packet(data){this.onmessage({data});}
}
const connection={base:'http://192.0.2.1:8893',key:'rest-key'},identity={hardwareIdentifier:'server-1'};
test('standalone web login returns a token and opens only the read-only preview channel',async t=>{
 let body;const frames=[],saved=[];
 const p=new NativePreviews({WebSocketClass:Socket,fetchFn:async(url,options)=>{assert.equal(new URL(url).pathname,'/login');body=JSON.parse(options.body);return {ok:true,json:async()=>({token:'web-token'})};},onToken:token=>saved.push(token),onFrame:f=>frames.push(f)});
 t.after(()=>p.stop());await p.start(connection,identity,{previewUsername:'viewer',previewPassword:'password'});
 const ws=Socket.instances.at(-1);assert.equal(body.username,'viewer');assert.deepEqual(saved,['web-token']);assert.equal(ws.url.searchParams.get('token'),'web-token');
 ws.packet('0{}');assert.deepEqual(ws.sent,['40']);ws.packet('2');assert.deepEqual(ws.sent,['40','3']);
 ws.event(['getDeviceInfo',{result:identity}]);
 for(const [event,field,kind]of [['inputPreviewChange','inputId','input'],['physicalPreviewChange','outputId','SDI'],['NDIPreviewChange','outputId','NDI'],['encoderPreviewChange','encoderId','encoder']]){
  ws.event([event,{result:{[field]:4,thumbnail:'/9j/AA=='}}]);assert.ok(p.get(kind,4));
 }assert.equal(frames.length,4);
});
test('wrong server identity rejects frames and does not reconnect to it',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['inputPreviewChange',{result:{inputId:4,thumbnail:'/9j/AA=='}}]);assert.equal(p.get('input',4),null);
 ws.event(['getDeviceInfo',{result:{hardwareIdentifier:'other-server'}}]);assert.match(p.status,/mismatch/);assert.equal(p.timer,null);assert.equal(p.get('input',4),null);
});
test('API key rejection requests web login without endless WAITING or retries',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 Socket.instances.at(-1).packet('44{"message":"invalid token"}');assert.equal(p.status,'Preview login required');assert.equal(p.timer,null);
});
test('MoJo and transmitter unit record commands are confirmed by device events, not hub recorder status',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:identity}]);
 ws.event(['getChannelStatus',{result:{channel:[{hardwareIdentifier:'mojo',product:'MoJoPro',connectionStatus:1},{hardwareIdentifier:'air',product:'AIR',connectionStatus:1}]}}]);
 for(const [id,uid]of [[1,'mojo'],[2,'air']]){
  ws.event(['getStatusDevicesChange',{result:{device:[{channel:id,recordStatus:0}]}}]);assert.equal(p.device(id,uid).recordStatus,0);
  let sent=false;const before=ws.sent.length;const start=p.record(id,uid,true,async()=>{sent=true;});await Promise.resolve();await Promise.resolve();assert.equal(sent,true);assert.equal(ws.sent.length,before);
  assert.ok(p.pendingRecord);ws.event(['getStatusDevicesChange',{result:{device:[{channel:id,recordStatus:5}]}}]);await start;
  const stop=p.record(id,uid,false,async()=>{});assert.equal(ws.sent.length,before);
  ws.event(['getStatusDevicesChange',{result:{device:[{channel:id,recordStatus:0}]}}]);await stop;
 }
});
test('device replacement rejects a pending recording confirmation',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:identity}]);ws.event(['getChannelStatus',{result:{channel:[{hardwareIdentifier:'old',connectionStatus:1}]}}]);
 const pending=p.record(1,'old',true,async()=>{});const check=assert.rejects(pending,/identity changed/);
 ws.event(['getChannelStatus',{result:{channel:[{hardwareIdentifier:'new',connectionStatus:1}]}}]);await check;
 await assert.rejects(p.record(1,'old',true),/identity changed/);assert.equal(p.device(1,'old'),null);
});
test('native IP eject preserves other presets and confirms configuration readback',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:identity}]);
 const config={'0':{name:'First',outputOrder:1,channelIndex:0,encoderIndex:2,enable:true},'9':{name:'Last',outputOrder:16,channelIndex:4,encoderIndex:-1,enable:false}};
 let sentConfig=null;
 const originalSend=ws.send.bind(ws);
 ws.send=packet=>{originalSend(packet);const event=JSON.parse(packet.slice(2));assert.deepEqual(event.slice(0,3),['setProfileConfig','streamingOutput',false]);sentConfig=JSON.parse(event[3]).streamingOutput;};
 const extra={config:async root=>{assert.equal(root,'streamingOutput');return structuredClone(sentConfig||config);}};
 await p.ejectIP('0',extra);
 assert.deepEqual(sentConfig['9'],config['9']);assert.equal(sentConfig['0'].outputOrder,-1);
 assert.equal(sentConfig['0'].channelIndex,-1);assert.equal(sentConfig['0'].encoderIndex,-1);assert.equal(sentConfig['0'].name,'First');
 config['9'].lockstate=true;sentConfig=null;const sent=ws.sent.length;
 await assert.rejects(p.ejectIP('9',extra),/locked/);assert.equal(ws.sent.length,sent);
});

test('encoder native field updates preserve other slots and permit arbitrary encoder order',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:identity}]);
 const configs={enc:{'1':{enable:false,encoderProfileId:0,inputIndex:0},'2':{enable:false,encoderProfileId:0,inputIndex:1},'3':{enable:false,encoderProfileId:0,inputIndex:2}},inputProtocol:{'8':{channelProfileId:4,name:'SRT'}}};
 ws.send=packet=>{ws.sent.push(packet);const [event,root,create,body]=JSON.parse(packet.slice(2));assert.equal(event,'setProfileConfig');assert.equal(create,false);configs[root]=JSON.parse(body)[root];};
 const extra={config:async root=>structuredClone(configs[root])};
 await p.setConfigRows('enc',[1],{encoderProfileId:-1,inputIndex:-1},extra);
 assert.equal(configs.enc['1'].encoderProfileId,-1);assert.equal(configs.enc['3'].encoderProfileId,0);
 await p.setConfigRows('enc',[3],{encoderProfileId:-1},extra);assert.equal(configs.enc['2'].encoderProfileId,0);
 await p.ejectInput({id:4,uid:'ip',protocolId:8},extra);assert.equal(configs.inputProtocol['8'].channelProfileId,-1);
 await assert.rejects(p.setConfigRows('enc',[2],{name:'Unexpected edit'},extra),/not allowed/);
});
test('terminal input disconnect is independent of other channels and uses channelDisconnect',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:identity}]);
 ws.event(['getChannelStatus',{result:{channel:[{hardwareIdentifier:'unit-1',connectionStatus:1,product:'MoJoPro'},{hardwareIdentifier:'unit-2',connectionStatus:1,product:'AIR'}]}}]);
 const inputs=[{hardwareIdentifier:'unit-1',connectionStatus:1,channelStatus:0},{hardwareIdentifier:'unit-2',connectionStatus:1,channelStatus:0}];
 const extra={request:async path=>{assert.equal(path,'/inputs');return {inputs};}};
 const send=ws.send.bind(ws);ws.send=packet=>{send(packet);assert.deepEqual(JSON.parse(packet.slice(2)),['channelDisconnect',1]);inputs[0].connectionStatus=0;};
 await p.ejectInput({id:1,uid:'unit-1',protocolId:-1,connected:true},extra);
 assert.equal(inputs[1].connectionStatus,1);assert.equal(inputs[0].connectionStatus,0);
});

test('intercom native commands wait for terminal state and validate supported device identity',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:{...identity,allowedIntercom:1}}]);
 const row={hardwareIdentifier:'terminal',product:'AIR',connectionStatus:1,intercomStatus:1,videoIFBDecoderCapability:1};
 ws.event(['getChannelStatus',{result:{channel:[row]}}]);
 const on=p.intercom(1,'terminal',true);
 assert.equal(p.features(1,'terminal').intercom,false);
 assert.deepEqual(JSON.parse(ws.sent.at(-1).slice(2)),['unitCommand','startIntercom',1]);
 ws.event(['getChannelStatus',{result:{channel:[{...row,intercomStatus:3}]}}]);await on;
 const off=p.intercom(1,'terminal',false);
 assert.deepEqual(JSON.parse(ws.sent.at(-1).slice(2)),['unitCommand','stopIntercom',1]);
 ws.event(['getChannelStatus',{result:{channel:[row]}}]);await off;
 await assert.rejects(p.intercom(1,'other-device',true),/identity/);
 p.metadata.allowedIntercom=0;await assert.rejects(p.intercom(1,'terminal',true),/unavailable/);
});
test('video return accepts compatible native encoders and inputs and confirms disconnect without enabling encoders',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:identity}]);
 ws.event(['getChannelStatus',{result:{channel:[
  {hardwareIdentifier:'target',product:'AIR',connectionStatus:1,videoIFBDecoderCapability:1},
  {hardwareIdentifier:'source',product:'AIR',connectionStatus:1,videoIFBDecoderCapability:1}
 ]}}]);
 ws.event(['getStatusDevicesChange',{result:{device:[{channel:2,videoReturnProfile:1}]}}]);
 let config={'1':{videoIFBEncoderIdx:-1,videoIFBSourceIdx:-1,name:'Keep'},'2':{videoIFBEncoderIdx:-1,videoIFBSourceIdx:-1}};
 const extra={config:async root=>{assert.equal(root,'channelProfile');return structuredClone(config);},
  snapshot:async()=>[{id:1,profile:'0',enabled:false}],profiles:{'0':{videoReturnMode:true}}};
 const send=ws.send.bind(ws);ws.send=packet=>{
  send(packet);const event=JSON.parse(packet.slice(2));
  if(event[0]==='setProfileConfig')config=JSON.parse(event[3]).channelProfile;
  if(event[0]==='ejectVideoIFB'){config[event[1].inputId].videoIFBEncoderIdx=-1;config[event[1].inputId].videoIFBSourceIdx=-1;}
 };
 await p.videoReturn(1,'target','encoder',1,extra);
 assert.equal(config['1'].videoIFBEncoderIdx,0);assert.equal(config['1'].videoIFBSourceIdx,-1);assert.equal(config['1'].name,'Keep');
 await p.videoReturn(1,'target','input',2,extra,'source');
 assert.equal(config['1'].videoIFBSourceIdx,1);assert.equal(config['1'].videoIFBEncoderIdx,-1);
 assert.equal(config['2'].videoIFBSourceIdx,-1);
 await p.videoReturn(1,'target','none',null,extra);assert.equal(p.features(1,'target').returnSource,null);
 assert.ok(!ws.sent.some(packet=>packet.includes('startRecorder')||packet.includes('startIntercom')));
 await assert.rejects(p.videoReturn(1,'target','input',2,extra,'changed'),/identity/);
 extra.profiles['0'].videoReturnMode=false;await assert.rejects(p.videoReturn(1,'target','encoder',1,extra),/compatible/);
});

test('native stream address metadata is isolated between connections',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:identity}]);
 ws.event(['ip_local',['10.0.0.1']]);ws.event(['ip_public','203.0.113.1']);
 ws.event(['getConfig',{result:{config:JSON.stringify({hostname:'stream.example.test'})}}]);
 assert.deepEqual(p.network,{localIps:['10.0.0.1'],publicIp:'203.0.113.1',hostname:'stream.example.test'});
 p.stop();assert.deepEqual(p.network,{localIps:[],publicIp:null,hostname:null});
});

test('native bulk unassign changes both SDI channels in one request and preserves power, order and other channels',async t=>{
 const p=new NativePreviews({WebSocketClass:Socket});t.after(()=>p.stop());await p.start(connection,identity);
 const ws=Socket.instances.at(-1);ws.event(['getDeviceInfo',{result:identity}]);
 let config={'1':{name:'SDI 1',enable:true,channelIndex:3,outputOrder:1},'2':{name:'SDI 2',enable:false,channelIndex:3,outputOrder:2},'3':{name:'SDI 3',enable:true,channelIndex:4,outputOrder:3}};
 const original=structuredClone(config),confirmed=[],writes=[];
 const extra={config:async root=>{assert.equal(root,'basebandPlayer');return structuredClone(config);}};
 const send=ws.send.bind(ws);ws.send=packet=>{send(packet);const data=JSON.parse(packet.slice(2));if(data[0]==='setProfileConfig'){writes.push(data);config=JSON.parse(data[3]).basebandPlayer;}};
 await p.unassignOutputs([1,2].map(id=>({key:'SDI:'+id,name:'SDI '+id,root:'basebandPlayer',configIndex:String(id)})),extra,keys=>confirmed.push(...keys));
 assert.equal(writes.length,1);assert.deepEqual(confirmed,['SDI:1','SDI:2']);
 for(const id of ['1','2']){assert.equal(config[id].channelIndex,-1);assert.equal(config[id].enable,original[id].enable);assert.equal(config[id].outputOrder,original[id].outputOrder);}
 assert.deepEqual(config['3'],original['3']);
});
