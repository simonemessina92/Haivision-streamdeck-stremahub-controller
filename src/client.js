'use strict';
module.exports = function createClient(storage, fetch = globalThis.fetch) {
const {CameraControl}=require('./camera-control');const cameraControl=new CameraControl();
const {outputGroup,canEjectOutput,nextOutputProfile,assertConfigEject,assertConfigAdd}=require('./outputs');
const truth=x=>x===true||x===1||x==='1';
let generation=0,mutating=false,cache=null,pending=null;const deviceIdentities=new Map(),sdiConnectors=new Map();
function normalizeAddress(value){
 const text=String(value||'').trim();if(!text)throw Error('Enter a StreamHub IP address or hostname.');
 const explicit=/^https?:\/\//i.test(text);
 const u=new URL(explicit?text:'http://'+text);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||!u.hostname)throw Error('Enter an IP address or hostname without credentials or query parameters.');
 if(u.pathname!=='/'&&u.pathname!=='')throw Error('Enter only the IP address or hostname, without /rest-api/doc/.');
 if(!u.port)u.port=u.protocol==='https:'?'8896':'8893';return u.origin;
}
async function request(c,path,body,method,timeout=8000){
 if(path.startsWith('/config')){const read=/^\/config\?path=(inputProtocol|channelProfile|basebandPlayer|streamingOutput|NDIOutput)$/.test(path)&&!body&&(!method||method==='GET');const assignment=path==='/config/item'&&method==='POST'&&body&&/^(inputProtocol\.\d+\.(channelProfileId|enable)|(basebandPlayer|streamingOutput|NDIOutput)\.\d+\.(channelIndex|enable|outputOrder)|streamingOutput\.\d+\.encoderIndex)$/.test(body.item);if(!read&&!assignment)throw Error('Profile creation, editing and deletion are disabled.');} 
 const u=new URL(c.base+path);u.searchParams.set('api_key',c.key);
 let r;try{r=await fetch(u.href,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeout)});}catch{throw Error(`API connection failed: ${method||(body?'POST':'GET')} ${path.split('?')[0]}. Check the StreamHub and device connection.`);}
 if(!r.ok)throw Error(`API HTTP ${r.status}${r.status===401?' — incorrect API key':''}`);
 let d;try{d=await r.json();}catch{throw Error('The endpoint returned a non-JSON response.');}
 if(d.success===false||d.error||typeof d.res==='number'&&d.res<0)throw Error('API request rejected: '+(body?.item||path.split('?')[0]));return d;
}
async function credentials(){const {connection:c}=await storage.get('connection');if(!c?.base||!c?.key)throw Error('Not connected.');return c;}
function unwrapConfig(d,root){const value=d?.[root]??d?.config?.[root]??d?.data?.[root]??d;return value&&typeof value==='object'?value:{};}
const configurationCache=new Map(),nativeNetwork=new Map();
async function config(c,root,fresh=false){const key=c.base+':'+root,hit=configurationCache.get(key);if(!fresh&&hit&&Date.now()-hit.time<5000)return hit.value;const value=unwrapConfig(await request(c,`/config?path=${root}`),root);configurationCache.set(key,{time:Date.now(),value});return value;}
async function updateItem(c,item,value){configurationCache.clear();await request(c,'/config/item',{item,value},'POST');}
async function verifyConfig(c,root,index,expected){for(let attempt=0;attempt<4;attempt++){const d=await config(c,root,true),row=d[index];if(row&&Object.entries(expected).every(([k,v])=>typeof v==='boolean'?truth(row[k])===v:Number(row[k])===v))return;await new Promise(r=>setTimeout(r,200));}throw Error('StreamHub did not confirm the configuration change.');}
// Stream addresses only: never copy REST self links or guess public NAT mappings.
function servesStreamLinks(profile={},output=false){const mode=String(profile.type||profile.mode||'').toUpperCase();return ['SRT','RTMP'].includes(mode)?truth(profile.serverMode):mode==='RTSP'&&output?profile.serverMode!==false:mode==='HLS'&&output;}
function streamLinks(c,raw={},profile={},output=false){
 const links=[],network=nativeNetwork.get(c.base)||{};
 const valid=value=>typeof value==='string'&&/^(srt|rtmp|rtmps|rtsp|rtsps|udp|rtp|http|https):\/\//i.test(value.trim())&&!/[<>]/.test(value)&&!/[?&]api_key=/i.test(value)?value.trim():null;
 const add=(label,value)=>{const url=valid(value);if(url&&!links.some(x=>x.label===label&&x.url===url))links.push({label,url});};
 const mode=String(profile.type||profile.mode||raw.mode||'').toUpperCase(),server=mode==='RTSP'&&output?profile.serverMode!==false:truth(profile.serverMode??raw.serverMode);
 let localIps=network.localIps||[];
 const host=new URL(c.base).hostname;
 if(!localIps.length&&/^(10\.|192\.168\.|127\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host))localIps=[host];
 const hostUrl=address=>{
  const h=address.includes(':')&&!address.startsWith('[')?`[${address}]`:address;
  if(mode==='SRT'&&server&&Number(profile.port)>0)return `srt://${h}:${profile.port}`;
  if(mode==='RTMP'&&server)return `${truth(profile.rtmpsMode)?'rtmps':'rtmp'}://${h}:${truth(profile.rtmpsMode)?19350:1935}/${output?'live':'input'}/${profile.streamName||''}`;
  if(mode==='RTSP'&&server&&Number(profile.port)>0&&profile.label)return `rtsp://${h}:${profile.port}/${profile.label}`;
  if(mode==='HLS'&&output&&profile.dir){const secure=new URL(c.base).protocol==='https:';return `${secure?'https':'http'}://${h}${secure?'':':8888'}/hls/${profile.dir}/playlist.m3u8`;}
  return null;
 };
 localIps.forEach((ip,index)=>add(localIps.length>1?`Local URL ${index+1}`:'Local URL',hostUrl(ip)));
 if(network.publicIp)add('Public URL (IP Address)',hostUrl(network.publicIp));
 if(network.hostname)add('Public URL (Hostname)',hostUrl(network.hostname));
 if(!output&&mode==='RTSP'&&profile.host&&Number(profile.port)>0)add('Stream URL',`rtsp://${profile.host}:${profile.port}/${profile.label||''}`);
 if(!server){let uri=profile.uri;if(['RTMP','RTSP'].includes(mode)&&profile.streamKey)uri=uri+'/'+profile.streamKey;add('Stream URL',uri);}
 if(mode==='TS'&&!output&&truth(profile.enableMulticast)&&profile.uri&&Number(profile.port)>0)add('Stream URL',`udp://${profile.uri}:${profile.port}${truth(profile.enableSSM)&&profile.uriSSM?'?sources='+profile.uriSSM:''}`);
 if(mode==='TS'&&output&&['UDP','RTP'].includes(String(profile.protocol).toUpperCase())){const dest=profile.destinations;for(const d of Array.isArray(dest)?dest:typeof dest==='string'?dest.split(','):[]){const target=typeof d==='string'?d:d?.host&&d?.port?d.host+':'+d.port:null;if(target)add('Stream URL',`${profile.protocol.toLowerCase()}://${target}`);}}
 const destinations=raw.destinations||profile.destinations;
 if(!links.length&&typeof destinations==='string')for(const url of destinations.split(/[\s,;]+/))add('Stream URL',url);
 return links;
}
const serverIdentityCache=new Map();
async function serverIdentity(c){const hit=serverIdentityCache.get(c.base);if(hit?.pending)return hit.pending;if(hit&&(hit.value||Date.now()-hit.time<15000))return hit.value;const entry={time:Date.now(),value:null};serverIdentityCache.set(c.base,entry);entry.pending=(async()=>{try{const metadata=await request(c,'/'),hw=metadata.hardwareIdentifier;if(typeof hw==='string'&&hw.trim())entry.value={hardwareIdentifier:hw.trim(),dockerId:typeof metadata.dockerId==='string'?metadata.dockerId:null,nbOutput:Number.isInteger(metadata.nbOutput)&&metadata.nbOutput>=0?metadata.nbOutput:null,NDIOutput:metadata.NDIOutput,allowedIpOutputs:metadata.allowedIpOutputs,allowedEncoders:metadata.allowedEncoders,smpte2110:metadata.smpte2110};}catch{}finally{entry.pending=null;}return entry.value;})();return entry.pending;}
function terminalDiagnosticFields(r){const code=['liveStatus','IAPStatus','recordStatus','forwardStatus'].map(k=>Number(r[k])).find(v=>v<0)||0;let args=[];for(const k of ['liveStatusErrorParam','recordStatusErrorParam'])if(typeof r[k]==='string'&&r[k])args=r[k].split(';');return {message:typeof r.message==='string'?r.message:'',errorCode:code,errorParams:{'param.arg1':args[0]||'720p50','param.arg2':args[1]||'20'}};}

async function snapshot(c){
 const [i,o,protocols]=await Promise.all([request(c,'/inputs'),request(c,'/outputs'),config(c,'inputProtocol').catch(()=>null)]);
 const identity=await serverIdentity(c);
 const inputRows=i.inputs??i.channels;const roots=['basebandPlayer','streamingOutput','NDIOutput'];const configs=await Promise.all(roots.map(root=>config(c,root).catch(()=>null)));
 const ipOutputs=o.IPOutput??o.IPoutput??[];
 if(!Array.isArray(inputRows)||!Array.isArray(o.output)||!Array.isArray(ipOutputs)||configs.some(c=>c===null))throw Error('Unexpected API response: input/output lists missing.');
 const {pausedInputs={}}=await storage.get('pausedInputs');const inputs=inputRows.map((r,n)=>({id:n+1,configuration:require('./channel-details').configuration(protocols?.[r.inputProtocolId]),streamDetails:require('./channel-details').configuration(r),streamStats:require('./channel-details').statistics(r),profileName:r.name||r.routeName||'',name:r.identifier||r.displayName||r.name||r.routeName||`Input ${n+1}`,status:Number(r.channelStatus),...terminalDiagnosticFields(r),type:r.channelType||r.product||'',product:r.product||'',family:r.familyName||'',firmware:r.firmwareName||'',uid:r.hardwareIdentifier||r.uid||String(n+1),remote:Number(r.remoteControl)||0,inputInfo:r.inputInfo||'',deviceRecording:r.deviceRecordStatus==='ON'?true:r.deviceRecordStatus==='OFF'?false:null,recorderStatus:Number(r.recorderStatus),protocolId:Number.isInteger(Number(r.inputProtocolId))?Number(r.inputProtocolId):-1,canLive:!/^IP[-_ ]?INPUT$/i.test(r.product||'')&&(Number(r.remoteControl)>0||(Number(r.connectionStatus)===1||Number(r.channelStatus)===2)&&/SST|SAFESTREAMS/i.test(r.channelType||r.product||'')),ipPower:!!protocols?.[r.inputProtocolId],enabled:protocols?.[r.inputProtocolId]?truth(protocols[r.inputProtocolId].enable):Number(r.channelStatus)===2,canEject:Number.isInteger(r.inputProtocolId)&&r.inputProtocolId>=0||Number(r.remoteControl)>0||(Number(r.connectionStatus)===1||Number(r.channelStatus)===2)&&/SST|SAFESTREAMS/i.test(r.channelType||r.product||''),connected:Number(r.connectionStatus)===1||Number(r.channelStatus)===2,links:streamLinks(c,r,protocols?.[r.inputProtocolId]||{}),isMojo:/mojo/i.test([r.product,r.familyName,r.firmwareName].join(' '))||mojoDevices.has(n+1)}));
 const map=(r,n,type)=>{const suffix=String(r.uid||'').match(/(?:sdi|ndi)_(\d+)$/i),id=type==='IP'?r.name:suffix?Number(suffix[1]):n+1;return {streamDetails:require('./channel-details').configuration(r),streamStats:require('./channel-details').statistics(r),key:type+':'+(type==='IP'?r.name:id),id,name:r.name||`${type} ${id}`,type,mode:r.mode||type,locked:truth(r.lockstate),enabled:truth(r.enable),configKey:r.configKey,sourceName:r.inputIdentifier||r.input||'',source:Number.isInteger(r.channelSourceIndex)&&r.channelSourceIndex>=0?r.channelSourceIndex+1:null,status:r.status,message:typeof r.message==='string'?r.message:'',encoder:Number(r.encoderIndex)>=0?Number(r.encoderIndex)+1:null};};
 const groups=[o.output,ipOutputs,o.NDIOutput||[]],types=['SDI','IP','NDI'],outputs=[],outputProfiles=[];
 for(let g=0;g<3;g++){
  const type=types[g],root=roots[g],collection=configs[g],live=groups[g].map((raw,n)=>{
   const row=map(raw,n,type);row.links=streamLinks(c,raw,{},true);const matches=Object.keys(collection).filter(k=>collection[k]?.name===row.name&&(type==='IP'||Number(k)===Number(row.id)));
   const index=raw.configKey!==undefined&&collection[raw.configKey]?String(raw.configKey):matches.length===1?matches[0]:undefined;
   if(index!==undefined){row.configIndex=index;if(type!=='IP'){const assigned=collection[index].channelIndex;row.source=Number.isInteger(assigned)&&assigned>=0?assigned+1:null;row.enabled=truth(collection[index].enable);}}row.configuration=require('./channel-details').configuration(index!==undefined?collection[index]:null);row.root=root;row.powerAvailable=index!==undefined;if(type==='IP')row.key=index!==undefined?'IP:config:'+index:'IP:runtime:'+n;return row;
  });
  if(type!=='IP')outputs.push(...live.filter(row=>{const order=collection[row.configIndex]?.outputOrder;return order===undefined||Number(order)>=0;}));
  if(type==='SDI'){if(!sdiConnectors.has(c.base))sdiConnectors.set(c.base,new Set());if(Number.isInteger(identity?.nbOutput)){sdiConnectors.get(c.base).clear();for(let id=1;id<=identity.nbOutput;id++)sdiConnectors.get(c.base).add(String(id));}else for(const row of live)if(row.configIndex!==undefined)sdiConnectors.get(c.base).add(String(row.configIndex));if(!sdiConnectors.get(c.base).size)continue;}
  for(const [index,v] of Object.entries(collection||{})){
   if(!v||typeof v!=='object'||!v.name||!('channelIndex' in v))continue;
   const runtime=live.find(row=>String(row.configIndex)===index),hasOrder=v.outputOrder!==undefined&&Number.isFinite(Number(v.outputOrder));
   const present=hasOrder?Number(v.outputOrder)>=0:!!runtime;
   if(type==='SDI'&&!sdiConnectors.get(c.base).has(index))continue;
   outputProfiles.push({key:type+':profile:'+index,type,root,index,name:v.name,mode:v.mode||type,locked:truth(v.lockstate),present,outputOrder:Number(v.outputOrder)});
   if(type==='SDI'&&present&&!runtime)outputs.push({configuration:require('./channel-details').configuration(v),key:'SDI:'+index,id:Number(index),name:v.name,type,mode:type,root,configIndex:index,powerAvailable:true,locked:truth(v.lockstate),enabled:truth(v.enable),source:Number.isInteger(v.channelIndex)&&v.channelIndex>=0?v.channelIndex+1:null,status:null,outputOrder:Number(v.outputOrder),runtimeAvailable:false});
   if(type==='IP'&&present)outputs.push({...(runtime||{}),configuration:require('./channel-details').configuration(v),key:'IP:config:'+index,id:v.name,name:v.name,type,mode:v.mode||'IP',root,configIndex:index,powerAvailable:true,locked:truth(v.lockstate),enabled:truth(v.enable),source:Number.isInteger(v.channelIndex)&&v.channelIndex>=0?v.channelIndex+1:null,encoder:Number.isInteger(v.encoderIndex)&&v.encoderIndex>=0?v.encoderIndex+1:null,status:runtime?.status??null,outputOrder:Number(v.outputOrder),runtimeAvailable:!!runtime,canCopyLink:['SRT','RTSP','RTMP','HLS','TS'].includes(String(v.mode).toUpperCase()),servesStreamLinks:servesStreamLinks(v,true),links:streamLinks(c,groups[g].find(r=>String(r.configKey)===index)||{},v,true)});
  }
  if(type==='IP')for(const row of live)if(row.configIndex===undefined)outputs.push({...row,powerAvailable:false});
 }
 outputs.sort((a,b)=>['SDI','NDI','IP'].indexOf(a.type)-['SDI','NDI','IP'].indexOf(b.type)||(a.outputOrder??(Number(a.id)||0))-(b.outputOrder??(Number(b.id)||0)));
 for(const p of outputProfiles)if(p.type==='SDI'){p.canAdd=!p.present;p.addHint='Add an existing physical connector.';}
 const ndiPresent=outputProfiles.filter(p=>p.type==='NDI'&&p.present),ndiLast=Math.max(0,...ndiPresent.map(p=>Number(p.index))),ndiValid=ndiPresent.every(p=>Number(p.index)===p.outputOrder)&&Array.from({length:ndiLast},(_,i)=>i+1).every(i=>ndiPresent.some(p=>Number(p.index)===i));
 for(const p of outputProfiles)if(p.type==='NDI'){p.canAdd=ndiValid&&Number(p.index)===ndiLast+1;p.addHint=ndiValid?'Add NDI outputs in numeric order.':'NDI dashboard order is inconsistent. Eject existing NDI outputs before adding them again.';}
 for(const o of outputs)if(o.type==='NDI'){o.ejectAvailable=!ndiValid||Number(o.configIndex)===ndiLast;o.ejectHint=ndiValid?'Eject the highest-numbered NDI output first.':'Eject to restore the native NDI sequence; saved profiles are retained.';}
 for(const row of inputs){if(deviceIdentities.get(row.id)!==row.uid){mojoDevices.delete(row.id);cameraSessions.delete(row.id);row.isMojo=/mojo/i.test([row.product,row.family,row.firmware].join(' '));}deviceIdentities.set(row.id,row.uid);row.servesStreamLinks=servesStreamLinks(protocols?.[row.protocolId]||{});row.paused=false;row.canPower=row.canLive||row.ipPower;row.canEject=row.canEject||row.protocolId>=0;row.canCopyLink=row.protocolId>=0&&['SRT','RTSP','RTMP','HLS','TS'].includes(String(protocols?.[row.protocolId]?.type||row.type).toUpperCase())&&!row.canLive&&!row.isMojo;}
 return {serverIdentity:identity,inputs,outputs,outputProfiles,ndiCount:outputs.filter(o=>o.type==='NDI').length};
}
const mojoDevices=new Set(),cameraSessions=new Map();
const cameraDefaults={WB:{},ISO:{},ShutterSpeed:{},Focus:{},Zoom:{},AudioGain:{}};
function decodeApiValue(value){for(let n=0;n<4&&typeof value==='string';n++){try{value=JSON.parse(value);}catch{throw Error('StreamHub returned a non-JSON camera settings string.');}}return value;}
function normalizeCamera(raw){raw=decodeApiValue(raw);for(const key of ['cameraSettings','settings','data'])if(raw&&typeof raw==='object'&&raw[key]!==undefined){raw=decodeApiValue(raw[key]);break;}if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Unexpected camera settings format.');const d=raw?.cameraSettings??raw?.settings??raw?.data??raw??{},out={...d};for(const k of Object.keys(cameraDefaults)){const v=d[k];if(typeof v==='number')out[k]={[k]:v};else if(v&&typeof v==='object')out[k]={...v};for(const field of [k+'Range',k+'Modes',k+'Mode'])if(d[field]!==undefined){out[k]||={};out[k][field]=d[field];}for(const field of [k+'Range',k+'Modes'])if(typeof out[k]?.[field]==='string'){try{out[k][field]=JSON.parse(out[k][field]);}catch{}}}for(const k of Object.keys(cameraDefaults)){let row=out[k];if(typeof row==='string'){try{row=JSON.parse(row);out[k]=typeof row==='object'&&row!==null?row:{[k]:row};}catch{}}row=out[k];if(row&&typeof row==='object'){for(const field of [k]){const value=row[field];if(typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value)))row[field]=Number(value);}if(Array.isArray(row[k+'Range']))row[k+'Range']=row[k+'Range'].map(v=>typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):v);}}return out;}
async function cameraData(c,id){
 const session=cameraSessions.get(id),cameras=session?.base===c.base&&session.data.deviceUID===(deviceIdentities.get(id)||String(id))&&Date.now()-session.time<10000?session.data.cameras:await request(c,`/inputs/${id}/mojoPro/cameraList`),names=Object.entries(cameras||{}).filter(([k,v])=>/^\d+$/.test(k)&&typeof v==='string'&&v).map(([,v])=>v);if(cameras.current_input_name&&!names.includes(cameras.current_input_name))names.push(cameras.current_input_name);if(!names.length)throw Error('No camera reported by this input.');
 let raw={},readError='';try{raw=await request(c,`/inputs/${id}/mojoPro/cameraSettings`);}catch(e){readError=e.message;}const current=normalizeCamera(raw),camera=current.camera||cameras.current_input_name||names[0],{mojoState={},cameraProfiles={}}=await storage.get(['mojoState','cameraProfiles']),deviceUID=deviceIdentities.get(id)||String(id),entry=mojoState[id],remembered=entry?.base===c.base&&entry.camera===camera&&entry.deviceUID===deviceUID?entry.values:{},profile={...(cameraProfiles[c.base+':'+deviceUID+':'+camera]||{})};const shutter=current.ShutterSpeed;const shutterRange=shutter?.ShutterSpeedRange;if(Array.isArray(shutterRange)&&shutterRange.length===2&&shutterRange.every(Number.isFinite)&&shutterRange[0]>0&&shutterRange[1]>shutterRange[0]&&shutterRange[0]<1)profile.shutterUnit='seconds';
 const focusRange=current.Focus?.FocusRange,focusAvailable=Array.isArray(focusRange)&&focusRange.length===2&&focusRange.every(Number.isFinite)&&focusRange[1]>focusRange[0];const settings={camera},reported={},known={},origin={};for(const [k,defaults] of Object.entries(cameraDefaults)){settings[k]=k==='Focus'?(focusAvailable?{...current.Focus}:{}):{...(current[k]&&Number.isFinite(remembered?.[k]?.[k])?{[k]:remembered[k][k]}:{}),...(current?.[k]||{})};reported[k]=Number.isFinite(current?.[k]?.[k]);known[k]=Number.isFinite(settings[k][k]);origin[k]=reported[k]?'device':known[k]?'command':'unknown';}
 mojoDevices.add(id);const result={deviceUID,focusAvailable,cameras:{...cameras,names},settings,reported,known,origin,profile,partial:!!readError||!Object.values(reported).some(Boolean),readError,diagnostic:{camera,deviceUID,input:(()=>{const i=cache?.data?.inputs.find(i=>i.id===id);return i?{id:i.id,product:i.product,family:i.family,firmware:i.firmware,remote:i.remote}:undefined;})(),remoteFlag:typeof current.remote==='boolean'?current.remote:undefined,readError,receivedKeys:Object.keys(current).filter(k=>k!=='_links'),reported,settings:Object.fromEntries(Object.keys(cameraDefaults).filter(k=>current[k]).map(k=>[k,Object.fromEntries([k,k+'Mode',k+'Modes',k+'Range'].filter(f=>current[k][f]!==undefined).map(f=>[f,current[k][f]]))]))}};cameraSessions.set(id,{base:c.base,time:Date.now(),data:result});return result;
}
async function rememberCamera(c,id,body){const {mojoState={}}=await storage.get('mojoState');const deviceUID=deviceIdentities.get(id)||String(id);const old=mojoState[id]?.base===c.base&&mojoState[id]?.camera===body.camera&&mojoState[id]?.deviceUID===deviceUID?mojoState[id].values:{};const values={...old,...body};for(const k of Object.keys(cameraDefaults))if(body[k])values[k]={...(old?.[k]||{}),...body[k]};mojoState[id]={base:c.base,camera:body.camera,deviceUID,values,time:Date.now()};await storage.set({mojoState});}
async function outputConfig(c,o){
 const root=o.type==='SDI'?'basebandPlayer':o.type==='NDI'?'NDIOutput':'streamingOutput';
 const collection=await config(c,root,true);
 const matches=Object.entries(collection||{}).filter(([k,v])=>v&&typeof v==='object'&&v.name===o.name&&'channelIndex' in v&&(o.configIndex===undefined||String(k)===String(o.configIndex)));
 if(matches.length!==1)throw Error('Output configuration could not be matched uniquely.');
 const [index,current]=matches[0];if(truth(current.lockstate))throw Error('Output configuration is locked.');return {object:`${root}.${index}`,root,index,current};
}
async function getSnapshot(){
 if(mutating)throw Error('Command in progress.');
 if(cache&&Date.now()-cache.time<650)return cache.data;
 if(pending)return pending;
 const g=generation;pending=(async()=>{const d=await snapshot(await credentials());if(g!==generation)throw Error('Connection changed.');cache={time:Date.now(),data:d};return d;})();try{return await pending;}finally{pending=null;}
}

const supported=new Set(['nativeNetwork','state','connect','forget','snapshot','mojoDiscover','mojoGet','mojoSet','cameraProfile','previews','inputPower','inputControl','inputEject','assignPreset','outputAdd','outputControl','route','presets']);
async function handle(m){
 if(!supported.has(m.type))throw Error('Operation unavailable. Profile creation, editing and deletion are disabled.');if(m.type==='inputPower'&&!['enable','disable'].includes(m.action)||m.type==='outputControl'&&!['enable','disable','clear','unassign'].includes(m.action))throw Error('Invalid action.');
 if(m.type==='nativeNetwork'){const c=await credentials();if(m.base!==c.base)throw Error('Server mismatch.');const address=x=>typeof x==='string'&&x.length<254&&/^[A-Za-z0-9.:[\]-]+$/.test(x)?x:null;nativeNetwork.set(c.base,{localIps:(Array.isArray(m.network?.localIps)?m.network.localIps:[]).map(address).filter(Boolean).slice(0,16),publicIp:address(m.network?.publicIp),hostname:address(m.network?.hostname)});cache=null;return {};}
 if(m.type==='state'){const {connection:c}=await storage.get('connection');return {connected:!!c?.key,base:c?.base};}
 if(m.type==='connect'){cameraControl.clear();const c={base:normalizeAddress(m.address),key:String(m.key||'').trim()};if(!c.key)throw Error('Enter an API key.');mojoDevices.clear();cameraSessions.clear();sdiConnectors.clear();configurationCache.clear();serverIdentityCache.clear();deviceIdentities.clear();generation++;cache=null;const d=await snapshot(c);await storage.set({connection:c});return {base:c.base,snapshot:d};}
 if(m.type==='forget'){if(mutating)throw Error('Wait for the command to finish.');generation++;cache=null;mojoDevices.clear();cameraSessions.clear();sdiConnectors.clear();configurationCache.clear();serverIdentityCache.clear();deviceIdentities.clear();await storage.remove(['connection','mojoState']);return {};}
 if(m.type==='snapshot'){if(m.fresh){cache=null;configurationCache.clear();}return getSnapshot();}
 if(m.type==='presets'){const c=await credentials(),rows=await config(c,'inputProtocol');return {inputs:Object.entries(rows).filter(([,v])=>v&&typeof v==='object'&&'channelProfileId' in v).map(([id,v])=>({id,name:v.name,type:v.type||'IP',assigned:Number(v.channelProfileId)>=0}))};}
 if(m.type==='previews'){const c=await credentials(),ids=[...new Set(m.inputs||[])];if(ids.length>16||ids.some(id=>!Number.isInteger(id)||id<1||id>32))throw Error('Invalid preview inputs.');const result=[];for(let n=0;n<ids.length;n+=4)await Promise.all(ids.slice(n,n+4).map(async id=>{try{const raw=await request(c,`/inputs/${id}/preview`,undefined,'GET',2500),d=raw.preview??raw;let thumbnail=typeof d.thumbnail==='string'?d.thumbnail:'';if(thumbnail.length>1500000)throw Error('Preview too large.');if(thumbnail&&!/^(?:data:image\/(?:jpeg|png|webp);base64,)?[A-Za-z0-9+/=\r\n]+$/.test(thumbnail))throw Error('Invalid preview image.');const mime=thumbnail.startsWith('iVBOR')?'png':thumbnail.startsWith('UklGR')?'webp':'jpeg';if(thumbnail&&!thumbnail.startsWith('data:'))thumbnail=`data:image/${mime};base64,`+thumbnail;result.push({id,thumbnail,audioLevels:Array.isArray(d.audioLevels)?d.audioLevels.slice(0,32).map(a=>({peak:Number.isFinite(a.peak)?Math.max(-50,Math.min(0,a.peak)):null,decay:Number.isFinite(a.decay)?Math.max(-50,Math.min(0,a.decay)):null})):[],time:Date.now()});}catch(e){result.push({id,error:e.message});}}));return {previews:result};}
 if(m.type==='mojoDiscover'){
 const c=await credentials(),d=await snapshot(c),candidates=d.inputs.filter(i=>i.connected&&(i.isMojo||/DMNG[-_ ]?APP/i.test(i.product)||i.remote>0));
 for(let n=0;n<candidates.length;n+=4)await Promise.all(candidates.slice(n,n+4).map(async i=>{try{const list=await request(c,`/inputs/${i.id}/mojoPro/cameraList`,undefined,'GET',2500);if(list?.current_input_name||Object.entries(list||{}).some(([k,v])=>/^\d+$/.test(k)&&typeof v==='string'&&v)){mojoDevices.add(i.id);i.isMojo=true;}}catch{}}));
 return {inputs:candidates.filter(i=>i.isMojo)};
 }
 if(m.type==='mojoGet'){const c=await credentials();const id=Number(m.input);if(!Number.isInteger(id)||id<1||id>32)throw Error('Invalid input.');return cameraData(c,id);}

 if(mutating)throw Error('Another command is in progress.');mutating=true;generation++;cache=null;
 try{const c=await credentials();
 if(m.type==='mojoSet'){
 const id=Number(m.input);if(!Number.isInteger(id)||id<1||id>32)throw Error('Invalid input.');let verifiedCamera;if(m.expectedUID!==undefined){const [source,camera]=await Promise.all([request(c,'/inputs/'+id),m.camera?Promise.resolve(null):cameraData(c,id)]);if((source.hardwareIdentifier||source.uid||String(id))!==m.expectedUID)throw Error('Camera identity changed');verifiedCamera=camera;}
 if(m.camera){const list=await request(c,`/inputs/${id}/mojoPro/cameraList`);if(!Object.entries(list).some(([k,v])=>/^\d+$/.test(k)&&v===m.camera)&&list.current_input_name!==m.camera)throw Error('Camera unavailable.');await request(c,`/inputs/${id}/mojoPro/camera/${encodeURIComponent(m.camera)}`,undefined,'POST');const {mojoState={}}=await storage.get('mojoState');delete mojoState[id];cameraSessions.delete(id);await storage.set({mojoState});for(let n=0;n<12;n++){await new Promise(resolve=>setTimeout(resolve,250));const data=await cameraData(c,id);if(data.settings.camera===m.camera&&data.cameras.current_input_name===m.camera)return data;}throw Error('Camera switch was sent but the selected camera was not confirmed. Read the camera state again.');}
 return cameraControl.set({connection:c,id,message:m,read:()=>verifiedCamera||cameraData(c,id),write:body=>request(c,'/inputs/'+id+'/mojoPro/cameraSettings',body,'POST'),remember:body=>rememberCamera(c,id,body)});
 }
 if(m.type==='assignPreset'){
 const input=Number(m.input),before=await snapshot(c),row=before.inputs.find(i=>i.id===input);if(!row)throw Error('Input unavailable.');if(row.connected&&row.protocolId<0)throw Error('Eject the field unit before selecting an IP preset.');
 const [collection,profiles]=await Promise.all([config(c,'inputProtocol'),config(c,'channelProfile')]);const key=String(m.preset);if(!/^\d+$/.test(key)||!collection?.[key])throw Error('Preset unavailable.');const preset=collection[key];if(Number(preset.channelProfileId)>=0)throw Error('Preset is already assigned. Eject it from its current input first.');
 const matches=Object.entries(profiles||{}).filter(([,v])=>v?.name===row.profileName);if(matches.length!==1)throw Error('Input profile could not be matched uniquely.');const profileIndex=Number(matches[0][0]);if(!Number.isInteger(profileIndex))throw Error('Invalid input profile index.');
 let previous=null;if(row.protocolId>=0&&row.protocolId!==Number(key)){previous={index:row.protocolId,value:collection[row.protocolId]};if(previous.value?.channelProfileId!==profileIndex)throw Error('Current source assignment changed.');await updateItem(c,`inputProtocol.${previous.index}.channelProfileId`,-1);await verifyConfig(c,'inputProtocol',previous.index,{channelProfileId:-1});}try{await updateItem(c,`inputProtocol.${key}.channelProfileId`,profileIndex);await verifyConfig(c,'inputProtocol',key,{channelProfileId:profileIndex});}catch(e){if(previous)try{await updateItem(c,`inputProtocol.${previous.index}.channelProfileId`,profileIndex);}catch{}throw e;}const {pausedInputs={}}=await storage.get('pausedInputs');delete pausedInputs[c.base+':'+input];await storage.set({pausedInputs});return {snapshot:await snapshot(c)};
 }
 if(m.type==='cameraProfile'){const id=Number(m.input);if(!Number.isInteger(id)||id<1||id>32||!['denominator','microseconds','seconds'].includes(m.unit))throw Error('Invalid camera profile.');const {cameraProfiles={}}=await storage.get('cameraProfiles');const info=await cameraData(c,id);cameraProfiles[c.base+':'+info.deviceUID+':'+info.settings.camera]={shutterUnit:m.unit};await storage.set({cameraProfiles});cameraSessions.delete(id);return cameraData(c,id);}

 configurationCache.clear();const before=await snapshot(c),input=Number(m.input);
 if(m.type==='outputAdd'){
  const profile=before.outputProfiles.find(p=>p.key===m.key);if(!profile||profile.locked)throw Error('Output profile unavailable or locked.');if(profile.present)throw Error('Output is already present on StreamHub.');
  const collection=await config(c,profile.root,true),current=collection[profile.index];if(!current||current.name!==profile.name)throw Error('Output profile changed. Refresh and retry.');
  if(outputGroup(profile)!=='IP'){if(nextOutputProfile(before,outputGroup(profile))?.key!==profile.key)throw Error('Add the next physical or NDI output in numeric order');assertConfigAdd(collection,profile.index,outputGroup(profile)==='SDI'?(before.serverIdentity?.nbOutput??Infinity):Infinity);}
  const order=['NDI','SDI'].includes(profile.type)?Number(profile.index):1+Math.max(0,...Object.values(collection).map(v=>Number(v?.outputOrder)||0));
  if(['NDI','SDI'].includes(profile.type)){await updateItem(c,`${profile.root}.${profile.index}.enable`,false);await updateItem(c,`${profile.root}.${profile.index}.channelIndex`,-1);}
  await updateItem(c,`${profile.root}.${profile.index}.outputOrder`,order);await verifyConfig(c,profile.root,profile.index,{outputOrder:order});
  for(let n=0;n<5;n++){const after=await snapshot(c);if(after.outputs.some(o=>o.type===profile.type&&String(o.configIndex)===String(profile.index))){cache={time:Date.now(),data:after};return {snapshot:after};}await new Promise(r=>setTimeout(r,200));}
  throw Error('Profile order was saved, but StreamHub has not reported the added output. Refresh to check its current state.');
 }

 if(m.type==='inputPower'||m.type==='inputEject'){
 const row=before.inputs.find(i=>i.id===input);if(!row)throw Error('Input unavailable.');if(m.expectedUID!==undefined&&row.uid!==m.expectedUID)throw Error('Input identity changed. Select the source again.');const {pausedInputs={}}=await storage.get('pausedInputs'),slot=c.base+':'+input;
 if(row.canLive){await request(c,`/inputs/${input}/live/${m.type==='inputEject'?'eject':m.action==='enable'?'start':'stop'}`);}
 else {const saved=pausedInputs[slot],id=Number.isInteger(row.protocolId)&&row.protocolId>=0?row.protocolId:undefined;
 if(!Number.isInteger(id)||id<0)throw Error('Select an IP preset before turning on this input.');const collection=await config(c,'inputProtocol'),current=collection[id];if(!current)throw Error('Input preset unavailable.');
 if(m.type==='inputEject'){await updateItem(c,`inputProtocol.${id}.channelProfileId`,-1);await verifyConfig(c,'inputProtocol',id,{channelProfileId:-1});delete pausedInputs[slot];}
 else if(m.type==='inputPower'){await updateItem(c,`inputProtocol.${id}.enable`,m.action==='enable');await verifyConfig(c,'inputProtocol',id,{enable:m.action==='enable'});}
 else throw Error('StreamHub does not expose an ON/OFF parameter for this IP profile. Assignment was left unchanged.');
 await storage.set({pausedInputs});}
 if(m.type==='inputEject'){mojoDevices.delete(input);cameraSessions.delete(input);const {mojoState={}}=await storage.get('mojoState');delete mojoState[input];await storage.set({mojoState});}
 return {snapshot:await snapshot(c)};
 }
 if(m.type==='inputControl'){if(!before.inputs.some(i=>i.id===input&&(m.expectedUID===undefined||i.uid===m.expectedUID)))throw Error('Input identity changed');if(!['record','streamhubRecord'].includes(m.endpoint)||!['start','stop'].includes(m.action))throw Error('Invalid command.');await request(c,`/inputs/${input}/${m.endpoint}/${m.action}`);return {snapshot:await snapshot(c)};}
 const results=[];
 for(const key of [...new Set(m.keys||[])]){const o=before.outputs.find(o=>o.key===key);if(!o||o.locked){results.push({key,ok:false,message:'Output unavailable or locked'});continue;}
 try{
 if(m.type==='route'&&m.assignOnly){if(!before.inputs.some(i=>i.id===input&&(m.expectedUID===undefined||i.uid===m.expectedUID)))throw Error('Select a valid input first.');const target=await outputConfig(c,o);const expected={channelIndex:input-1};if(target.root==='streamingOutput'&&'encoderIndex' in target.current){await updateItem(c,target.root+'.'+target.index+'.encoderIndex',-1);expected.encoderIndex=-1;}await updateItem(c,target.root+'.'+target.index+'.channelIndex',input-1);await verifyConfig(c,target.root,target.index,expected);results.push({key,ok:true,message:'Source assignment confirmed'});continue;}
 if(m.type==='outputControl'&&m.action==='unassign'){const target=await outputConfig(c,o),expected={channelIndex:-1};await updateItem(c,target.root+'.'+target.index+'.channelIndex',-1);if('encoderIndex' in target.current){await updateItem(c,target.root+'.'+target.index+'.encoderIndex',-1);expected.encoderIndex=-1;}await verifyConfig(c,target.root,target.index,expected);results.push({key,ok:true,message:'Source unassigned'});continue;}
 const action=m.type==='route'||m.action==='enable'?'enable':'disable';
 const source=m.type==='route'?input:o.source;
 if(m.type==='outputControl'){if(typeof m.expectedEnabled==='boolean'){const target=await outputConfig(c,o),fresh=(await config(c,target.root,true))[target.index];if(!fresh||truth(fresh.enable)!==m.expectedEnabled)throw Error('Output ON/OFF changed; review before retrying');}
 if(m.action==='clear'&&!canEjectOutput(before,o))throw Error('Eject the highest-numbered physical or NDI output first');
 const target=await outputConfig(c,o),{root,index,current}=target,enable=m.action==='enable';if(m.action==='clear'&&outputGroup(o)!=='IP'){const collection=await config(c,root,true);assertConfigEject(collection,index,outputGroup(o)==='SDI'?(before.serverIdentity?.nbOutput??Infinity):Infinity);}
 if(!enable&&o.enabled&&o.source&&o.source<=32&&o.type==='SDI')try{await request(c,`/inputs/${o.source}/${o.type==='SDI'?'playStream':'playIPStream'}/${encodeURIComponent(o.id)}/disable`);}catch(e){if(!/HTTP (400|404)/.test(e.message))throw e;}
 if(enable&&o.source&&o.source<=32&&o.type==='SDI')try{await request(c,`/inputs/${o.source}/${o.type==='SDI'?'playStream':'playIPStream'}/${encodeURIComponent(o.id)}/enable`);}catch(e){if(!/HTTP (400|404)/.test(e.message))throw e;}
 await updateItem(c,`${root}.${index}.enable`,enable);
 const expected={enable};if(m.action==='clear'){await updateItem(c,`${root}.${index}.channelIndex`,-1);expected.channelIndex=-1;if(root==='streamingOutput'&&'encoderIndex' in current){await updateItem(c,`${root}.${index}.encoderIndex`,-1);expected.encoderIndex=-1;}await updateItem(c,`${root}.${index}.outputOrder`,-1);expected.outputOrder=-1;}
 await verifyConfig(c,root,index,expected);results.push({key,ok:true,message:m.action==='clear'?'Output ejected':enable?'Output ON':'Output OFF'});continue;
 }
 if(action==='enable'&&!before.inputs.some(i=>i.id===source))throw Error('Select a valid input first.');
 if(o.type==='SDI'&&before.inputs.find(i=>i.id===source)?.connected){if(!source||source>32)throw Error('No controllable input assigned.');await request(c,`/inputs/${source}/playStream/${encodeURIComponent(o.id)}/${action}`,undefined,'GET');}
 else if(o.type==='IP'&&before.inputs.find(i=>i.id===source)?.connected){await request(c,`/inputs/${source}/playIPStream/${encodeURIComponent(o.name)}/${action}`,undefined,'GET');}
 const target=await outputConfig(c,o);if(target.root==='streamingOutput')await updateItem(c,`${target.root}.${target.index}.encoderIndex`,-1);await updateItem(c,`${target.root}.${target.index}.channelIndex`,source-1);await updateItem(c,`${target.root}.${target.index}.enable`,true);await verifyConfig(c,target.root,target.index,{channelIndex:source-1,enable:true});results.push({key,ok:true,message:'Route configuration confirmed'});
 }catch(e){results.push({key,ok:false,message:e.message});}}
 let after;try{after=await snapshot(c);cache={time:Date.now(),data:after};}catch{}
 return {results,snapshot:after};
 }finally{mutating=false;}
}

return {handle:async message=>structuredClone(await handle(message)), normalizeAddress};
};
