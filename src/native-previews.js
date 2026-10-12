'use strict';
const {terminalFields}=require('./diagnostics');
function thumbnail(raw){
 if(typeof raw!=='string'||!raw.length||raw.length>1500000)return null;
 const value=raw.startsWith('data:')?raw:'data:image/jpeg;base64,'+raw;
 return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)?value:null;
}
class NativePreviews{
 constructor({onFrame=()=>{},onStatus=()=>{},onToken=()=>{},onVerified=()=>{},onAuthFailure=()=>{},onDevices=()=>{},fetchFn=globalThis.fetch,WebSocketClass=globalThis.WebSocket}={}){
  Object.assign(this,{onFrame,onStatus,onToken,onVerified,onAuthFailure,onDevices,fetch:fetchFn,WS:WebSocketClass});this.pendingRemote=null;this.role=null;this.system={};this.liveProfileRows=new Map();this.pendingLiveProfile=null;this.details=new (require('./channel-details').LiveDetails)();this.frames=new Map();this.channels=[];this.network={localIps:[],publicIp:null,hostname:null};this.metadata={};this.config=null;this.license=null;this.devices=new Map();this.pendingRecord=null;this.selectedInput=null;this.subscribed=null;this.selectedInputs=null;this.subscribedInputs=new Set();this.generation=0;this.ws=null;this.timer=null;this.status='Preview login required';this.origin=null;
 }
 stop(){this.previewSettings=null;this.previewConnection=null;this.reusedPreviewSession=false;this.wasPreviewVerified=false;this.finishRemote(Error('StreamHub connection closed before remote access confirmation'));this.role=null;this.system={};this.liveProfileRows.clear();this.details.clear();this.finishRecord(Error('Device connection closed before confirmation'));this.channels=[];this.network={localIps:[],publicIp:null,hostname:null};this.metadata={};this.config=null;this.license=null;this.devices.clear();this.subscribed=null;this.selectedInput=null;this.selectedInputs=null;this.subscribedInputs.clear();this.generation++;this.token=null;this.origin=null;this.expected=null;clearTimeout(this.timer);this.timer=null;this.verified=false;this.frames.clear();if(this.ws){const ws=this.ws;this.ws=null;ws.close();}}
 setStatus(status){this.status=status;this.onStatus(status);}
 async start(connection,identity,settings={}){
  this.stop();if(!connection||!identity?.hardwareIdentifier)return;
  const generation=this.generation;
  const rest=new URL(connection.base),origin=settings.previewOrigin||rest.protocol+'//'+rest.hostname+(rest.protocol==='http:'?':8888':'');
  const web=new URL(origin);if(!['http:','https:'].includes(web.protocol)||web.username||web.password)throw Error('Invalid preview web address');
  this.origin=web.origin;this.expected=identity;const candidate=settings.previewSessionCandidate,reuse=candidate&&require('./connection-session').sameServer(candidate.identity,identity);this.reusedPreviewSession=!!reuse;this.previewConnection=connection;this.previewSettings={...settings};this.token=settings.previewToken||(reuse?candidate.token:null)||connection.key;
  if(settings.previewUsername&&settings.previewPassword&&!reuse){
   this.setStatus('Signing in for previews');
   try{
    const response=await this.fetch(new URL('/login',web),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:settings.previewUsername,password:settings.previewPassword}),signal:AbortSignal.timeout(6000)});
    if(generation!==this.generation)return;
    if(!response.ok){if([401,403].includes(response.status))this.onAuthFailure();throw Error('Preview login failed (HTTP '+response.status+'). Check web credentials and Web interface URL.');}
    const data=await response.json();if(typeof data.token!=='string'||!data.token)throw Error('Preview login returned no token');
    if(generation!==this.generation)return;this.token=data.token;this.onToken(data.token);
    }catch(error){if(generation!==this.generation)return;if(await this.tryPreviewFallback())return;const code=error.cause?.code||error.code;this.setStatus(error.name==='TimeoutError'?'Preview login timed out':error.message.startsWith('Preview')?error.message:code&&/CERT|SELF_SIGNED|TLS/.test(code)?'Preview HTTPS certificate is not trusted. Use the local HTTP preview URL or a trusted certificate.':'Preview web interface is unreachable'+(code?' ('+code+')':''));return;}

  }
  if(generation===this.generation)this.connect(generation);
 }
 tryPreviewFallback(){
  const settings=this.previewSettings,connection=this.previewConnection;if(!settings||!connection||settings.previewEndpointFallbackDone||!this.origin)return false;
  const fallback=require('./remote-access').previewFallback(connection,this.origin,settings.previewEndpointAutoFollow);if(!fallback)return false;
  const identity=this.expected,next={...settings,previewOrigin:fallback,previewToken:this.token,previewEndpointFallbackDone:true};
  void this.start(connection,identity,next);return true;
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
   if(packet.startsWith('44')){denied=true;clearTimeout(deadline);this.onAuthFailure();const credentials=this.previewSettings;if(this.reusedPreviewSession&&credentials?.previewUsername&&credentials?.previewPassword&&!credentials.previewPasswordRetry){void this.start(this.previewConnection,this.expected,{...credentials,previewSessionCandidate:null,previewToken:undefined,previewPasswordRetry:true});return;}this.setStatus('Preview login required. Enter the web password and Save and connect.');ws.close();return;}
   if(!packet.startsWith('42['))return;let data;try{data=JSON.parse(packet.slice(2));}catch{return;}
   const name=data[0],value=data[1]?.result??data[1];
   if(name==='newToken'&&typeof data[1]==='string'){this.token=data[1];this.onToken(this.token);if(this.verified)this.onVerified(this.expected);return;}
   if(name==='getDeviceInfo'||name==='abusProxyIsReady'){
    if(typeof value?.hardwareIdentifier!=='string')return;
    if(value.hardwareIdentifier.trim()!==this.expected.hardwareIdentifier||this.expected.dockerId&&value.dockerId&&value.dockerId!==this.expected.dockerId){denied=true;this.setStatus('Preview server mismatch');ws.close();return;}
    this.metadata={...this.metadata,...value};this.verified=true;clearTimeout(deadline);if(this.reusedPreviewSession)this.onToken(this.token);this.onVerified(this.expected);if(this.previewSettings)delete this.previewSettings.previewPassword;this.setStatus('Previews connected');
    for(const frame of pending.values())this.store(frame);pending.clear();this.onDevices();this.subscribe();return;
   }
   if(name==='user_role'){this.role=['admin','user','viewer'].includes(String(value?.role).toLowerCase())?String(value.role).toUpperCase():null;if(this.verified)this.onDevices();return;}
   if(name==='getMonitorInfo'&&this.verified){const fields={};for(const field of ['cpuPercent','memPercent','memTotal'])if(Number.isFinite(value?.[field]))fields[field]=value[field];this.system={...this.system,...fields,time:Date.now()};this.onDevices();return;}
   if(name==='remoteControlOpen'){if(this.verified&&this.pendingRemote){const p=this.pendingRemote;try{const channel=this.terminal(p.id,p.uid);if(channel.instanceId!==p.instance)throw Error('Transmitter identity changed before remote access confirmation');this.finishRemote(null,require('./remote-access').validateResponse(value,p.plan));}catch(error){this.finishRemote(error);}}return;}
   if(name==='ip_local'&&Array.isArray(value)){this.network.localIps=value.filter(x=>typeof x==='string').slice(0,16);return;}
   if(name==='ip_public'&&typeof value==='string'){this.network.publicIp=value;return;}
   if(name==='getConfig'){try{const config=typeof value?.config==='string'?JSON.parse(value.config):value?.config;if(config&&typeof config==='object'){this.config=config;if(typeof config.hostname==='string')this.network.hostname=config.hostname;}}catch{}if(this.verified)this.onDevices();return;}
   if(name==='getLicense'){this.license=require('./licenses').normalize(value);if(this.verified)this.onDevices();return;}
   if(name==='getChannelStatus'&&Array.isArray(value?.channel)){
    const next=value.channel.slice(0,32);
    for(let n=0;n<next.length;n++)if(this.channels[n]&&(this.channels[n].hardwareIdentifier!==next[n].hardwareIdentifier||this.channels[n].instanceId!==next[n].instanceId)){
     if(this.pendingRemote?.id===n+1)this.finishRemote(Error('Transmitter identity changed before remote access confirmation'));this.liveProfileRows.delete(n+1);this.subscribedInputs.delete(n+1);this.devices.delete(n+1);if(this.pendingRecord?.id===n+1)this.finishRecord(Error('Device identity changed before recording confirmation'));
    }
    this.channels=next;if(this.verified){const storage={};for(const field of ['storageCapacity','storageLevel'])if(Number.isFinite(value[field]))storage[field]=value[field];if(Object.keys(storage).length)this.system={...this.system,...storage,storageTime:Date.now()};this.onDevices();this.subscribe();}return;
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
   if(this.verified&&['liveProfile','getLiveInfo'].includes(name)){
    const id=Number(data[1]?.channelId),channel=this.channels[id-1];
    if(Number.isInteger(id)&&id>=1&&id<=32&&channel){
     const uid=channel.hardwareIdentifier||channel.uid||String(id),old=this.liveProfileRows.get(id),row=old&&old.uid===uid&&old.instance===channel.instanceId?old:{uid,instance:channel.instanceId,profiles:[],current:null,infoVersion:0};
     if(name==='liveProfile'){
      try{const list=typeof value?.list==='string'?JSON.parse(value.list):value?.list,profiles=list?.liveProfile;if(!profiles||typeof profiles!=='object'||Array.isArray(profiles))throw Error('Invalid profiles');row.profiles=Object.entries(profiles).filter(([key,p])=>key.length<=128&&p&&typeof p==='object'&&!Array.isArray(p)).map(([key,p])=>({id:key,name:require('./channel-details').safe(p.name)||'Profile '+key,parameters:require('./channel-details').configuration(p)}));}catch{row.profiles=[];}
     }else if(value?.liveProfileID!==undefined&&value.liveProfileID!==null){row.current=String(value.liveProfileID);row.infoVersion++;}
     this.liveProfileRows.set(id,row);this.onDevices();
    }
   }
   if(this.verified){const consumed=this.details.receive(name,value,data[1],this.channels);if(consumed){this.onDevices();return;}}
   if(name==='serverError'&&this.pendingRemote){this.finishRemote(Error('StreamHub rejected remote access'));return;}
   if(name==='serverError'&&this.pendingLiveProfile){this.pendingLiveProfile.error='StreamHub rejected the transmitter live profile';return;}
   if(name==='serverError'&&this.pendingRecord){this.finishRecord(Error('StreamHub rejected the device recording command'));return;}
   const kind={previewChange:'input',inputPreviewChange:'input',physicalPreviewChange:'SDI',NDIPreviewChange:'NDI',encoderPreviewChange:'encoder'}[name];if(!kind)return;
   const rawId=kind==='input'?value?.inputId??value?.channelId:kind==='encoder'?value?.encoderId:value?.outputId;
   const id=Number(typeof rawId==='string'&&/^(sdi|ndi)_\d+$/i.test(rawId)?rawId.split('_')[1]:rawId),image=thumbnail(value?.thumbnail);
   if(!Number.isInteger(id)||id<1||id>32||!image)return;
   const frame={kind,id,thumbnail:image,time:Date.now()};
   if(this.verified)this.store(frame);else pending.set(kind+':'+id,frame);
  };
  ws.onerror=()=>{if(this.ws===ws)this.setStatus('Preview connection failed');};
  ws.onclose=()=>{clearTimeout(deadline);if(this.ws!==ws)return;this.ws=null;this.wasPreviewVerified=this.verified;this.verified=false;this.frames.clear();this.finishRemote(Error('StreamHub connection closed before remote access confirmation'));this.role=null;this.system={};this.liveProfileRows.clear();this.details.clear();this.devices.clear();this.channels=[];this.subscribed=null;this.finishRecord(Error('Device connection closed before confirmation'));if(!denied&&generation===this.generation){if(!this.wasPreviewVerified&&this.tryPreviewFallback())return;this.setStatus('Reconnecting previews');this.timer=setTimeout(()=>this.connect(generation),5000);}};
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
 remotePlan(id,uid){
  if(!this.verified)return null;const channel=this.channels[id-1];if(!channel||(channel.hardwareIdentifier||channel.uid||String(id))!==uid)return null;
  return require('./remote-access').plan({origin:this.origin,token:this.token,role:this.role,channel:{...channel,id},device:this.devices.get(id),config:this.config});
 }
 finishRemote(error,url){const p=this.pendingRemote;if(!p)return;this.pendingRemote=null;clearTimeout(p.timer);error?p.reject(error):p.resolve(url);}
 async remoteAccess(id,uid){
  const channel=this.terminal(id,uid),plan=this.remotePlan(id,uid);if(!plan)throw Error('Remote access is unavailable for this transmitter or user');
  if(this.pendingRemote)throw Error('Remote access is already pending');if(!plan.replace)return plan.url;
  return new Promise((resolve,reject)=>{const pending={id,uid,instance:channel.instanceId,plan,resolve,reject};this.pendingRemote=pending;pending.timer=setTimeout(()=>{if(this.pendingRemote===pending)this.finishRemote(Error('StreamHub did not return a remote access link'));},8000);
   try{this.ws.send('42'+JSON.stringify(['remoteControlTokenReplace',{url:plan.url,hardwareIdentifier:plan.hardwareIdentifier}]));}catch{this.finishRemote(Error('Could not request transmitter remote access'));}
  });
 }
 liveProfiles(id,uid){
  if(!this.verified)return null;const channel=this.channels[id-1],row=this.liveProfileRows.get(id);
  if(!channel||!row||row.uid!==uid||row.instance!==channel.instanceId||(channel.hardwareIdentifier||channel.uid||String(id))!==uid||!(Number(channel.connectionStatus)===1||Number(channel.channelStatus)>0)||/^(IP[-_ ]?INPUT)$/i.test(channel.product||'')||/mojo/i.test([channel.product,channel.familyName].join(' ')))return null;
  return row;
 }
 async setLiveProfile(id,uid,profile,instance){
  const channel=this.terminal(id,uid),row=this.liveProfiles(id,uid),profileId=String(profile);
  if(channel.instanceId===undefined||channel.instanceId===null||channel.instanceId!==instance||!row?.profiles.some(p=>p.id===profileId))throw Error('Transmitter or live profile changed; reopen LIVE PROFILE');
  if(row.current===profileId)return;
  if(this.pendingLiveProfile)throw Error('A transmitter live profile change is already pending');
  const generation=this.generation,version=row.infoVersion,pending={id,uid,error:null};this.pendingLiveProfile=pending;
  try{
   this.ws.send('42'+JSON.stringify(['setLiveProfile',profileId,4000+10*id,instance]));
   for(let n=0;n<80;n++){
    if(this.generation!==generation)throw Error('StreamHub connection changed before live profile confirmation');
    const fresh=this.terminal(id,uid);if(fresh.instanceId!==instance)throw Error('Transmitter identity changed before live profile confirmation');
    if(pending.error)throw Error(pending.error);
    const confirmed=this.liveProfiles(id,uid);if(!confirmed?.profiles.some(p=>p.id===profileId))throw Error('Transmitter live profiles changed before confirmation');
    if(confirmed.infoVersion>version&&confirmed.current===profileId)return;
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   throw Error('Transmitter did not confirm the live profile change');
  }finally{if(this.pendingLiveProfile===pending)this.pendingLiveProfile=null;}
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
 selectInput(id){this.selectedInputs=null;this.selectedInput=id;this.subscribe();}
 selectInputs(ids){this.selectedInput=null;this.selectedInputs=[...new Set(ids.filter(id=>Number.isInteger(id)&&id>=1&&id<=32))];this.subscribe();}
 subscribe(){
  if(!this.verified||this.ws?.readyState!==1)return;
  const desired=new Set((this.selectedInputs||[this.selectedInput]).filter(id=>id&&this.channels[id-1]));
  for(const id of this.subscribedInputs)if(!desired.has(id)){this.ws.send('42'+JSON.stringify(['channelClose',4000+10*id]));this.subscribedInputs.delete(id);}
  for(const id of desired)if(!this.subscribedInputs.has(id)){this.ws.send('42'+JSON.stringify(['channelInit',id,4000+10*id,this.channels[id-1].product]));this.subscribedInputs.add(id);}
  this.subscribed=this.selectedInputs?null:this.selectedInput&&desired.has(this.selectedInput)?this.selectedInput:null;
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
 async routeMultiview(outputs,encoder,extra,onConfirmed=()=>{}){
  if(!this.verified||this.ws?.readyState!==1)throw Error('Sign in with the StreamHub username and password to route Multiview');
  const generation=this.generation,license=this.license?.license||this.license;
  if([false,0,'0'].includes(license?.multiView))throw Error('Multiview is not licensed');
  require('./multiview').decode(await extra.config('mosaic'));
  const groups=new Map();for(const output of outputs){if(!['basebandPlayer','NDIOutput','streamingOutput'].includes(output.root)||!/^\d+$/.test(String(output.configIndex)))throw Error('Output configuration unavailable');const list=groups.get(output.root)||[];list.push(output);groups.set(output.root,list);}
  if(groups.has('streamingOutput')){
   if(!Number.isInteger(encoder)||encoder<1)throw Error('Choose an encoder before routing Multiview to IP');
   const slot=await extra.slot(encoder),profile=extra.profiles[slot.encoderProfileId],codec=String(profile?.encoderVideoType||'').replace(/[^a-z0-9]/gi,'');
   if(!/^(H264|H265|HEVC)$/i.test(codec))throw Error('Multiview requires an H.264 or HEVC encoder profile');
   if([true,1,'1'].includes(slot.enable)&&Number(slot.inputIndex)!==32)throw Error('Stop this encoder before assigning Multiview');
  }
  const plans=[];
  for(const [root,rows]of groups){const config=await extra.config(root);for(const o of rows){const row=config[o.configIndex];if(!row||Number(row.outputOrder)<0||[true,1,'1'].includes(row.lockstate)||row.name!==o.name)throw Error('Output changed; review the routing selection');if(root==='streamingOutput'&&!('encoderIndex' in row))throw Error('This IP output does not expose encoder routing');}plans.push({root,rows,patch:root==='streamingOutput'?{channelIndex:-1,encoderIndex:encoder-1}:{channelIndex:32}});}
  if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed');
  if(groups.has('streamingOutput'))await this.setConfigRows('enc',[encoder],{inputIndex:32},extra);
  for(const plan of plans){if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed');await this.setConfigRows(plan.root,plan.rows.map(o=>o.configIndex),plan.patch,extra);onConfirmed(plan.rows.map(o=>o.key));}
 }
 async setMultiview(operation,extra){
  if(!this.verified||this.ws?.readyState!==1)throw Error('Sign in with the StreamHub username and password to edit Multiview');
  const license=this.license?.license||this.license;
  if([false,0,'0'].includes(license?.multiView))throw Error('Multiview is not licensed on this StreamHub');
  const generation=this.generation,model=require('./multiview'),config=await extra.config('mosaic'),patch=model.patch(config,operation),next={...config,...patch};
  if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed');
  this.ws.send('42'+JSON.stringify(['setObjectConfig','mosaic',JSON.stringify(next)]));
  for(let n=0;n<24;n++){
   if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed before Multiview confirmation');
   const current=await extra.config('mosaic');
   if(generation!==this.generation||!this.verified)throw Error('StreamHub connection changed before Multiview confirmation');
   const matches=Object.entries(patch).every(([key,value])=>typeof value==='boolean'?[true,1,'1'].includes(current[key])===value:key==='videoChannelIndexes'?JSON.stringify(model.decode(current).cells)===JSON.stringify(JSON.parse(value)):Number(current[key])===value);
   if(matches){this.config={...this.config,mosaic:current};this.onDevices();return model.decode(current);}
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw Error('StreamHub did not confirm the Multiview change');
 }
 async setConfigRows(root,indices,patch,extra){
 const fields={enc:['enable','inputIndex','encoderProfileId'],inputProtocol:['channelProfileId'],channelProfile:['videoIFBEncoderIdx','videoIFBSourceIdx'],basebandPlayer:['channelIndex','enable'],NDIOutput:['channelIndex','enable'],streamingOutput:['channelIndex','encoderIndex','enable']};
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