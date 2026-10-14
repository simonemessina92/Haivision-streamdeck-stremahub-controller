'use strict';
const truth=x=>x===true||x===1||x==='1';
class Extra {
 constructor(connection,fetchFn=globalThis.fetch){this.connection=connection;this.fetch=fetchFn;this.capacity=null;}
 async request(path,body){
  const c=this.connection(),u=new URL(c.base+path);u.searchParams.set('api_key',c.key);
  let r;try{r=await this.fetch(u,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw Error('Encoder API connection failed');}
  if(!r.ok)throw Error('API encoder HTTP '+r.status);
  const d=await r.json();if(d.success===false||d.error||typeof d.res==='number'&&d.res<0)throw Error('Encoder command rejected');return d;
 }
 async config(root){const d=await this.request('/config?path='+root);const v=d[root]??d.config?.[root]??d.data?.[root]??d;if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Unexpected encoder configuration');return v;}
 limit(metadata){
  const value=metadata.allowedEncoders;
  if(value===undefined||value===null||value==='')throw Error('StreamHub did not report its encoder capacity');
  const limit=Number(value);if(!Number.isInteger(limit)||limit<0)throw Error('Invalid StreamHub encoder capacity');
  return limit;
 }
 async snapshot(){
  const [enc,profiles,metadata]=await Promise.all([this.config('enc'),this.config('encoderProfile'),this.request('/')]);
  if(Object.keys(enc).some(k=>!/^\d+$/.test(k)))throw Error('Encoder configuration is unavailable through REST');
  this.metadata=metadata;this.capacity=this.limit(metadata);this.enc=enc;this.profiles=profiles;
  return Object.entries(enc).filter(([id,r])=>/^\d+$/.test(id)&&Number(id)>=1&&Number(id)<=this.capacity&&r&&'encoderProfileId'in r&&'enable'in r).map(([id,r])=>({id:Number(id),configuration:require('./channel-details').configuration(profiles[r.encoderProfileId]),streamDetails:require('./channel-details').configuration(r),streamStats:require('./channel-details').statistics(r),profile:String(r.encoderProfileId),name:profiles[r.encoderProfileId]?.name||'No profile',enabled:truth(r.enable),input:Number(r.inputIndex)>=0?Number(r.inputIndex)+1:null,status:null}));
 }
 async slot(id){
  const rows=await this.snapshot();if(!rows.some(e=>e.id===Number(id)))throw Error('Encoder is outside the StreamHub licensed capacity');return this.enc[id];
 }
 async set(root,id,field,value){
  const allowed=root==='enc'&&['enable','inputIndex','encoderProfileId'].includes(field)||root==='channelProfile'&&field==='videoIFBEncoderIdx'||['streamingOutput','basebandPlayer','NDIOutput'].includes(root)&&['encoderIndex','channelIndex','enable'].includes(field);
  if(!allowed||!/^\d+$/.test(String(id)))throw Error('Encoder field is not allowed');
  if(root==='enc'&&(Number(id)<1||Number(id)>this.limit(await this.request('/'))))throw Error('Encoder is outside the StreamHub licensed capacity');
  const c=await this.config(root);if(!c[id]||!(field in c[id]))throw Error('Field is not exposed by this server');
  if(this.native?.verified)await this.native.setConfigRows(root,[id],{[field]:value},this);else await this.request('/config/item',{item:root+'.'+id+'.'+field,value});
  for(let n=0;n<4;n++){const next=await this.config(root);if(typeof value==='boolean'?truth(next[id]?.[field])===value:Number(next[id]?.[field])===value)return;await new Promise(r=>setTimeout(r,200));}
  throw Error('StreamHub did not confirm the encoder command');
 }
 async outputEncoder(output,id){await this.slot(id);const row=(await this.config(output.root))[output.configIndex];if(!row||!('encoderIndex'in row))throw Error('Output encoder assignment unavailable');await this.set(output.root,output.configIndex,'channelIndex',-1);await this.set(output.root,output.configIndex,'encoderIndex',id-1);}
 async power(id,enabled){const r=await this.slot(id);if(enabled&&!this.profiles[r.encoderProfileId])throw Error('Encoder profile is not assigned');await this.set('enc',id,'enable',enabled);}
 async input(id,input,source){
  const r=await this.slot(id),profile=this.profiles[r.encoderProfileId];
  if(!profile||!source)throw Error('Encoder or source unavailable');
  if(source.type==='WEBRTC')throw Error('LiveGuest requires server license verification');
  if(['NDI','MULTIVIEW'].includes(source.type)&&(profile.encoderVideoType==='Passthrough'||profile.encoderAudioType==='Passthrough'))throw Error('NDI requires an encoding profile');
  await this.set('enc',id,'inputIndex',input-1);
 }
 async profile(id,profile,{add=false}={}){
  const r=await this.slot(id);
  if(truth(r.enable)||!this.profiles[profile])throw Error('Stop the encoder and select an existing profile');
  if(add&&Number(r.encoderProfileId)!==-1)throw Error('Encoder slot is already assigned. Refresh and try again.');
  await this.set('enc',id,'inputIndex',-1);await this.set('enc',id,'encoderProfileId',Number(profile));
 }
 async eject(id){
  const r=await this.slot(id);if(Number(r.encoderProfileId)<0)throw Error('Encoder is not assigned');
  const [inputs,outputs]=await Promise.all([this.config('channelProfile'),this.config('streamingOutput')]);
  if(truth(r.enable))await this.set('enc',id,'enable',false);
  for(const [key,row]of Object.entries(inputs))if(Number(row.videoIFBEncoderIdx)===id-1)await this.set('channelProfile',key,'videoIFBEncoderIdx',-1);
  for(const [key,row]of Object.entries(outputs))if(Number(row.encoderIndex)===id-1){await this.set('streamingOutput',key,'enable',false);await this.set('streamingOutput',key,'encoderIndex',-1);}
  await this.set('enc',id,'inputIndex',-1);await this.set('enc',id,'encoderProfileId',-1);
 }
}
module.exports={Extra};
