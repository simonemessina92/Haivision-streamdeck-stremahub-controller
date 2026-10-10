'use strict';
const {terminalFields}=require('./diagnostics');
function thumbnail(raw){
 if(typeof raw!=='string'||!raw.length||raw.length>1500000)return null;
 const value=raw.startsWith('data:')?raw:'data:image/jpeg;base64,'+raw;
 return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)?value:null;
}
class NativePreviews{
 constructor({onFrame=()=>{},onStatus=()=>{},onToken=()=>{},onDevices=()=>{},fetchFn=globalThis.fetch,WebSocketClass=globalThis.WebSocket}={}){
  Object.assign(this,{onFrame,onStatus,onToken,onDevices,fetch:fetchFn,WS:WebSocketClass});this.frames=new Map();this.channels=[];this.network={localIps:[],publicIp:null,hostname:null};this.metadata={};this.config=null;this.license=null;this.devices=new Map();this.pendingRecord=null;this.selectedInput=null;this.subscribed=null;this.generation=0;this.ws=null;this.timer=null;this.status='Preview login required';this.origin=null;
 }
 stop(){this.finishRecord(Error('Device connection closed before confirmation'));this.channels=[];this.network={localIps:[],publicIp:null,hostname:null};this.metadata={};this.config=null;this.license=null;this.devices.clear();this.subscribed=null;this.selectedInput=null;this.generation++;this.token=null;this.origin=null;this.expected=null;clearTimeout(this.timer);this.timer=null;this.verified=false;this.frames.clear();if(this.ws){const ws=this.ws;this.ws=null;ws.close();}}
 setStatus(status){this.status=status;this.onStatus(status);}
 async start(connection,identity,settings={}){
  this.stop();if(!connection||!identity?.hardwareIdentifier)return;
  const generation=this.generation;
  const rest=new URL(connection.base),origin=settings.previewOrigin||rest.protocol+'//'+rest.hostname+(rest.protocol==='http:'?':8888':'');
  const web=new URL(origin);if(!['http:','https:'].includes(web.protocol)||web.username||web.password)throw Error('Invalid preview web address');
  this.origin=web.origin;this.expected=identity;this.token=settings.previewToken||connection.key;
  if(settings.previewUsername&&settings.previewPassword){
   this.setStatus('Signing in for previews');
   try{
    const response=await this.fetch(new URL('/login',web),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:settings.previewUsername,password:settings.previewPassword}),signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error('Preview login failed (HTTP '+response.status+')');
    const data=await response.json();if(typeof data.token!=='string'||!data.token)throw Error('Preview login returned no token');
    if(generation!==this.generation)return;this.token=data.token;this.onToken(data.token);
   }catch(error){if(generation===this.generation)this.setStatus(error.name==='TimeoutError'?'Preview login timed out':error.message.startsWith('Preview')?error.message:'Preview web interface is unreachable');return;}
  }
  if(generation===this.generation)this.connect(generation);
 }
 connect(generation){
  if(generation!==this.generation)return;
  this.setStatus('Connecting previews');const url=new URL('/socket.io/',this.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  url.searchParams.set('token',this.token);url.searchParams.set('EIO','4');url.searchParams.set('transport','websocket');
  let ws;try{ws=new this.WS(url);}catch{this.setStatus('Preview connection failed');return;}
  this.ws=ws;this.verified=false;let denied=false;const pending=new Map();
  const deadline=setTimeout(()=>{if(this.ws===ws&&!this.verified){this.setStatus('Preview connection timed out');ws.close();}},8000);
  ws.onmessage=event=>{
   if(this.ws!==ws||generation!==this.generation)return;
   const packet=String(event.data);if(packet.length>2000000)return;
   if(packet.startsWith('0')){ws.send('40');return;}if(packet==='2'){ws.send('3');return;}
   if(packet.startsWith('44')){denied=true;clearTimeout(deadline);this.setStatus('Preview login required');ws.close();return;}
   if(!packet.startsWith('42['))return;let data;try{data=JSON.parse(packet.slice(2));}catch{return;}
   const name=data[0],value=data[1]?.result??data[1];
   if(name==='newToken'&&typeof data[1]==='string'){this.token=data[1];this.onToken(this.token);return;}
   if(name==='getDeviceInfo'||name==='abusProxyIsReady'){
    if(typeof value?.hardwareIdentifier!=='string')return;
    if(value.hardwareIdentifier.trim()!==this.expected.hardwareIdentifier||this.expected.dockerId&&value.dockerId&&value.dockerId!==this.expected.dockerId){denied=true;this.setStatus('Preview server mismatch');ws.close();return;}
    this.metadata={...this.metadata,...value};this.verified=true;clearTimeout(deadline);this.setStatus('Previews connected');
    for(const frame of pending.values())this.store(frame);pending.clear();this.onDevices();this.subscribe();return;
   }
   if(name==='ip_local'&&Array.isArray(value)){this.network.localIps=value.filter(x=>typeof x==='string').slice(0,16);return;}
   if(name==='ip_public'&&typeof value==='string'){this.network.publicIp=value;return;}
   if(name==='getConfig'){try{const config=typeof value?.config==='string'?JSON.parse(value.config):value?.config;if(config&&typeof config==='object'){this.config=config;if(typeof config.hostname==='string')this.network.hostname=config.hostname;}}catch{}if(this.verified)this.onDevices();return;}
   if(name==='getLicense'){this.license=value;if(this.verified)this.onDevices();return;}
   if(name==='getChannelStatus'&&Array.isArray(value?.channel)){
    const next=value.channel.slice(0,32);
    for(let n=0;n<next.length;n++)if(this.channels[n]&&(this.channels[n].hardwareIdentifier!==next[n].hardwareIdentifier||this.channels[n].instanceId!==next[n].instanceId)){
     this.devices.delete(n+1);if(this.pendingRecord?.id===n+1)this.finishRecord(Error('Device identity changed before recording confirmation'));
    }
    this.channels=next;if(this.verified){this.onDevices();this.subscribe();}return;
   }
   if(name==='getStatusDevicesChange'&&Array.isArray(value?.device)){
    for(const device of value.device){
     const id=Number(device.channel);if(!Number.isInteger(id)||id<1||id>32)continue;
     this.devices.set(id,{...this.devices.get(id),...device});
     if(this.verified&&this.pendingRecord?.id===id&&Number.isInteger(device.recordStatus)){
      const pending=this.pendingRecord,channel=this.channels[id-1],uid=channel?.hardwareIdentifier||channel?.uid||String(id);
      if(uid!==pending.uid)this.finishRecord(Error('Device identity changed before recording confirmation'));
      else if(device.recordStatus<0)this.finishRecord(Error('Device rejected recording (code '+device.recordStatus+')'));
      else if((device.recordStatus===5)===pending.enabled)this.finishRecord();
     }
    }if(this.verified)this.onDevices();return;
   }
   if(name==='serverError'&&this.pendingRecord){this.finishRecord(Error('StreamHub rejected the device recording command'));return;}
   const kind={previewChange:'input',inputPreviewChange:'input',physicalPreviewChange:'SDI',NDIPreviewChange:'NDI',encoderPreviewChange:'encoder'}[name];if(!kind)return;
   const rawId=kind==='input'?value?.inputId??value?.channelId:kind==='encoder'?value?.encoderId:value?.outputId;
   const id=Number(typeof rawId==='string'&&/^(sdi|ndi)_\d+$/i.test(rawId)?rawId.split('_')[1]:rawId),image=thumbnail(value?.thumbnail);
   if(!Number.isInteger(id)||id<1||id>32||!image)return;
   const frame={kind,id,thumbnail:image,time:Date.now()};
   if(this.verified)this.store(frame);else pending.set(kind+':'+id,frame);
  };
  ws.onerror=()=>{if(this.ws===ws)this.setStatus('Preview connection failed');};
  ws.onclose=()=>{clearTimeout(deadline);if(this.ws!==ws)return;this.ws=null;this.verified=false;this.frames.clear();this.devices.clear();this.channels=[];this.subscribed=null;this.finishRecord(Error('Device connection closed before confirmation'));if(!denied&&generation===this.generation){this.setStatus('Reconnecting previews');this.timer=setTimeout(()=>this.connect(generation),5000);}};
 }
 device(id,uid){
  if(!this.verified)return null;
  const channel=this.channels[id-1];if(!channel||(channel.hardwareIdentifier||channel.uid||String(id))!==uid)return null;
  return this.devices.get(id)||null;
 }

 terminal(id,uid){
  if(!this.verified||this.ws?.readyState!==1)throw Error('Sign in to the StreamHub web interface to control this terminal');
  const r=this.channels[id-1];
  if(!r||(r.hardwareIdentifier||r.uid||String(id))!==uid||!r.product||r.product==='IP-INPUT'||!(Number(r.connectionStatus)===1||Number(r.channelStatus)>0))throw Error('Terminal identity changed or terminal disconnected');
  return r;
 }
 features(id,uid){
  if(!this.verified)return null;
  const r=this.channels[id-1];if(!r||(r.hardwareIdentifier||r.uid||String(id))!==uid)return null;
  const d=this.devices.get(id)||{},p=this.config?.channelProfile?.[id],status=Number(r.intercomStatus);
  return {nativeDiagnostic:terminalFields({...r,...d,channelStatus:r.channelStatus}),intercomAvailable:Number(this.metadata.allowedIntercom)>0&&[1,2,3,4].includes(status),intercom:[1,2,3,4].includes(status)?[2,3,4].includes(status):typeof d.intercomStatus==='number'?d.intercomStatus===5:null,
   returnCapability:Number(r.videoIFBDecoderCapability)||0,returnSourceProfile:Number(d.videoReturnProfile)||0,returnStatus:d.videoIFBStatus??null,
   returnEncoder:p&&Number(p.videoIFBEncoderIdx)>=0?Number(p.videoIFBEncoderIdx)+1:null,returnSource:p&&Number(p.videoIFBSourceIdx)>=0?Number(p.videoIFBSourceIdx)+1:null};
 }
 async readReturnConfig(extra){
  const generation=this.generation,rows=await extra.config('channelProfile');
  if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed');
  this.config={...this.config,channelProfile:rows};this.onDevices();return rows;
 }
 async intercom(id,uid,enabled){
  this.terminal(id,uid);if(typeof enabled!=='boolean'||!this.features(id,uid)?.intercomAvailable)throw Error('Intercom unavailable on this terminal');
  const generation=this.generation;
  this.ws.send('42'+JSON.stringify(['unitCommand',enabled?'startIntercom':'stopIntercom',id]));
  for(let n=0;n<40;n++){
   if(generation!==this.generation)throw Error('StreamHub connection changed');this.terminal(id,uid);
   if(this.features(id,uid)?.intercom===enabled)return;
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw Error('Terminal did not confirm intercom state');
 }
 async videoReturn(id,uid,kind,target,extra,sourceUID){
  const r=this.terminal(id,uid),cap=this.features(id,uid)?.returnCapability;
  if(!cap)throw Error('Video return unavailable on this terminal');
  const generation=this.generation;
  if(kind==='none'){
   this.ws.send('42'+JSON.stringify(['ejectVideoIFB',{inputId:id}]));
   for(let n=0;n<24;n++){if(generation!==this.generation)throw Error('StreamHub connection changed');this.terminal(id,uid);
    const rows=await this.readReturnConfig(extra),row=rows[id];
    if(row&&Number(row.videoIFBSourceIdx)===-1&&Number(row.videoIFBEncoderIdx)===-1)return;
    await new Promise(resolve=>setTimeout(resolve,150));
   }throw Error('StreamHub did not confirm video return disconnect');
  }
  let patch;
  if(kind==='encoder'){
   const rows=await extra.snapshot(),e=rows.find(e=>e.id===target),profile=e&&extra.profiles[e.profile];
   if(!(cap&1)||!e||e.profile==='-1'||![true,1,'1'].includes(profile?.videoReturnMode))throw Error('Select a compatible video return encoder');
   if(r.channelType==='WEBRTC'&&Number(r.channelStatus)===2&&this.license?.orionConnectionStatus!==true)throw Error('Video return unavailable for this live guest');
   patch={videoIFBSourceIdx:-1,videoIFBEncoderIdx:target-1};
  }else if(kind==='input'){
   this.terminal(target,sourceUID);
   if(target===id||!(cap&this.features(target,sourceUID)?.returnSourceProfile))throw Error('Input video return profile is not compatible');
   patch={videoIFBSourceIdx:target-1,videoIFBEncoderIdx:-1};
  }else throw Error('Invalid video return source');
  if(generation!==this.generation)throw Error('StreamHub connection changed');this.terminal(id,uid);
  await this.setConfigRows('channelProfile',[id],patch,extra);
 }
 selectInput(id){this.selectedInput=id;this.subscribe();}
 subscribe(){
  if(!this.verified||this.ws?.readyState!==1)return;
  const id=this.selectedInput,channel=id?this.channels[id-1]:null;
  if(this.subscribed===id)return;
  if(this.subscribed)this.ws.send('42'+JSON.stringify(['channelClose',4000+10*this.subscribed]));
  this.subscribed=null;
  if(id&&channel){this.ws.send('42'+JSON.stringify(['channelInit',id,4000+10*id,channel.product]));this.subscribed=id;}
 }
 async ejectIP(index,extra){
  if(!this.verified||this.ws?.readyState!==1)throw Error('StreamHub web connection unavailable');
  if(!/^\d+$/.test(String(index)))throw Error('IP output configuration unavailable');
  const generation=this.generation,config=await extra.config('streamingOutput'),row=config[index];
  if(!row||Number(row.outputOrder)<0||[true,1,'1'].includes(row.lockstate))throw Error('IP output is unavailable or locked');
  if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed');
  const next={...config,[index]:{...row,outputOrder:-1,channelIndex:-1,...('encoderIndex' in row?{encoderIndex:-1}:{})}};
  this.ws.send('42'+JSON.stringify(['setProfileConfig','streamingOutput',false,JSON.stringify({streamingOutput:next})]));
  for(let n=0;n<24;n++){
   if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed before eject confirmation');
   const current=(await extra.config('streamingOutput'))[index];
   if(current&&Number(current.outputOrder)===-1&&Number(current.channelIndex)===-1&&(!('encoderIndex' in row)||Number(current.encoderIndex)===-1))return;
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw Error('StreamHub did not confirm IP output eject');
 }
 async unassignOutputs(outputs,extra,onConfirmed=()=>{}){
  if(!this.verified||this.ws?.readyState!==1)throw Error('Sign in with the StreamHub username and password to unassign outputs');
  const groups=new Map(),generation=this.generation;
  for(const o of outputs){if(!['basebandPlayer','NDIOutput','streamingOutput'].includes(o.root)||!/^\d+$/.test(String(o.configIndex)))throw Error('Output configuration unavailable');const group=groups.get(o.root)||[];group.push(o);groups.set(o.root,group);}
  const plans=[];
  for(const [root,rows]of groups){
   const config=await extra.config(root);
   for(const o of rows){const row=config[o.configIndex];if(!row||[true,1,'1'].includes(row.lockstate)||Number(row.outputOrder)<0||row.name!==o.name)throw Error('Output changed; review the selection');}
   // Optional encoderIndex is cleared only on presets which actually expose it.
   if(root==='streamingOutput'){
    for(const withEncoder of [false,true]){const members=rows.filter(o=>('encoderIndex' in config[o.configIndex])===withEncoder);if(members.length)plans.push({root,rows:members,patch:{channelIndex:-1,...(withEncoder?{encoderIndex:-1}:{})}});}
   }else plans.push({root,rows,patch:{channelIndex:-1}});
  }
  for(const plan of plans){
   if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed');
   await this.setConfigRows(plan.root,plan.rows.map(o=>o.configIndex),plan.patch,extra);
   onConfirmed(plan.rows.map(o=>o.key));
  }
 }
 async setConfigRows(root,indices,patch,extra){
 const fields={enc:['enable','inputIndex','encoderProfileId'],inputProtocol:['channelProfileId'],channelProfile:['videoIFBEncoderIdx','videoIFBSourceIdx'],basebandPlayer:['channelIndex'],NDIOutput:['channelIndex'],streamingOutput:['channelIndex','encoderIndex','enable']};
 if(!fields[root]||Object.keys(patch).some(k=>!fields[root].includes(k))||indices.some(id=>!/^\d+$/.test(String(id))))throw Error('Configuration command is not allowed');
 if(!this.verified||this.ws?.readyState!==1)throw Error('StreamHub web connection unavailable');
 const generation=this.generation,config=await extra.config(root),next=structuredClone(config);
 for(const id of indices){if(!next[id])throw Error('Configuration changed');Object.assign(next[id],patch);}
 if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed');
 this.ws.send('42'+JSON.stringify(['setProfileConfig',root,false,JSON.stringify({[root]:next})]));
 for(let n=0;n<24;n++){
  if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed before confirmation');
  const current=await extra.config(root);
  if(indices.every(id=>Object.entries(patch).every(([field,value])=>typeof value==='boolean'?[true,1,'1'].includes(current[id]?.[field])===value:Number(current[id]?.[field])===value))){this.config={...this.config,[root]:current};this.onDevices();return;}
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 throw Error('StreamHub did not confirm '+root+' update');
}
 async ejectInput(input,extra){
 if(input.protocolId>=0){await this.setConfigRows('inputProtocol',[input.protocolId],{channelProfileId:-1},extra);return;}
 if(!input.connected)return;
 if(!this.verified||this.ws?.readyState!==1)throw Error('StreamHub web connection unavailable');
 const channel=this.channels[input.id-1];
 if(!channel||(channel.hardwareIdentifier||channel.uid||String(input.id))!==input.uid)throw Error('Input identity changed');
 const generation=this.generation;
 this.ws.send('42'+JSON.stringify(['channelDisconnect',input.id]));
 for(let n=0;n<24;n++){
  if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed before eject confirmation');
  const snapshot=await extra.request('/inputs'),row=snapshot.inputs?.[input.id-1];
  if(row&&(Number(row.connectionStatus)!==1&&Number(row.channelStatus)!==2||(row.hardwareIdentifier||row.uid||String(input.id))!==input.uid))return;
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 throw Error('StreamHub did not confirm input eject');
}
 record(id,uid,enabled,sendCommand){
  if(!this.verified||this.ws?.readyState!==1)return Promise.reject(Error('Sign in with the StreamHub username and password to control device recording'));
  if(this.pendingRecord)return Promise.reject(Error('Wait for the recording command to finish'));
  const channel=this.channels[id-1];
  if(!channel||(channel.hardwareIdentifier||channel.uid||String(id))!==uid||!(Number(channel.connectionStatus)===1||Number(channel.channelStatus)===2))return Promise.reject(Error('Recording device identity changed or device disconnected'));
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.finishRecord(Error('Recording command sent, but the device did not confirm its state')),8000);
   this.pendingRecord={id,uid,enabled,resolve,reject,timer};
   if(typeof sendCommand!=='function'){this.finishRecord(Error('Device recording requires the terminal REST command'));return;}
   Promise.resolve().then(sendCommand).catch(error=>this.finishRecord(error));
  });
 }
 finishRecord(error){
  const pending=this.pendingRecord;if(!pending)return;this.pendingRecord=null;clearTimeout(pending.timer);if(error)pending.reject(error);else pending.resolve();
 }
 store(frame){this.frames.set(frame.kind+':'+frame.id,frame);this.onFrame(frame);}
 get(kind,id){const frame=this.frames.get(kind+':'+id);return this.verified&&frame&&Date.now()-frame.time<7000?frame:null;}
}
module.exports={NativePreviews,thumbnail};