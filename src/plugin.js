'use strict';
const {Engine}=require('./engine'),createClient=require('./client'),{Hold}=require('./hold'),{image}=require('./render'),{randomUUID}=require('node:crypto');
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1],registrationInfo=JSON.parse(option('-info')||'{}');
const port=option('-port'),uuid=option('-pluginUUID'),registration=option('-registerEvent');
if(!port||!uuid||!registration)throw Error('This plugin must be started by Stream Deck.');
const ws=new WebSocket('ws://127.0.0.1:'+port),contexts=new Map(),engines=new Map(),settings={address:'',key:'',demo:false,connections:{}};
const active=new Map(),anchors=new Map(),launches=new Map(),operations=new Map();let ready=false,inspector=null,polling=false,pollTimer=null,serial=0;
const send=(event,context,payload)=>{if(ws.readyState===1)ws.send(JSON.stringify({event,context,payload}));};
function saved(id='default'){if(!settings.connections[id])settings.connections[id]=id==='default'?{address:settings.address||'',key:settings.key||'',name:settings.name||'',previewOrigin:settings.previewOrigin,previewUsername:settings.previewUsername,previewToken:settings.previewToken,disconnected:settings.disconnected,demo:settings.demo}:{};return settings.connections[id];}
const accessFields=['address','key','previewOrigin','previewUsername','previewToken','previewPassword'];
function persist(){
 for(const field of [...accessFields,'name','demo','disconnected'])delete settings[field];
 const connections=Object.fromEntries(Object.entries(settings.connections).map(([id,c])=>[id,Object.fromEntries(['name','address','key','previewOrigin','previewUsername','previewToken','disconnected'].filter(field=>c[field]!==undefined).map(field=>[field,c[field]]))]));
 send('setGlobalSettings',uuid,{connections});
}
function hubIds(device){const current=active.get(device);return Object.keys(settings.connections).filter(id=>id===current||settings.connections[id].address&&settings.connections[id].key);}
function selectHub(device,id){const context=anchors.get(device),c=contexts.get(context);if(!c)return;launches.delete(device);bind(c,context,id);}
function addHub(device){const id=randomUUID();settings.connections[id]={name:'StreamHub '+(Object.keys(settings.connections).length+1)};persist();selectHub(device,id);report({newConnection:true,status:'Select ONLINE / OFFLINE in the Stream Deck app and enter the new StreamHub details.'});}

function rowConnection(c){return c?.launcher?(c.settings.connectionId||'default'):(active.get(c?.device)||'default');}
function sessionKey(device,id){return device+'\n'+id;}
function engine(device,id=active.get(device)||'default',autoConfigure=true){
 const key=sessionKey(device,id);if(!engines.has(key)){
  const e=new Engine(createClient,()=>{if(engines.get(key)!==e)return;render(device);report();},globalThis.fetch,{nativePreviews:true,onPreviewToken:token=>{if(engines.get(key)!==e||e.disposed)return;saved(id).previewToken=token;persist();}});
  e.connectionId=id;e.device=device;engines.set(key,e);const c=saved(id);e.s.connectionName=c.name||'';
  if(ready&&autoConfigure)void e.configure(c.disconnected?{name:c.name}:c).catch(error=>{if(engines.get(key)===e&&!e.disposed)failure(error,undefined,id);});
 }return engines.get(key);
}
function allowed(c){return !!c&&(c.launcher||c.slot===7);}
function render(device){
 for(const [context,c]of contexts)if(c.device===device){
  const id=rowConnection(c),e=engines.get(sessionKey(device,id)),cfg=saved(id);let k;
  if(c.launcher)k={title:(cfg.name||'STREAMHUB XL')+'\n'+(e?.s.online?'OPEN':'CONTROLLER'),color:'#ba9cff',kind:'asset'};
  else {if(!active.has(device)||!e)continue;k=e.keys()[c.slot];if(c.slot===4&&e.s.view==='list')k={title:'ADD\nSTREAMHUB',color:'#ba9cff'};if(c.slot===5){const ids=hubIds(device);k={title:'NEXT HUB\n'+(ids.indexOf(id)+1)+' / '+ids.length,color:'#ba9cff',disabled:ids.length<2};}}

  const sig=image(k);if(c.sig===sig)continue;c.sig=sig;if(!c.titleCleared){send('setTitle',context,{title:'',target:0});c.titleCleared=true;}send('setImage',context,{image:sig,target:0});
 }
}
function report(extra={}){
 if(!inspector)return;const c=contexts.get(inspector.context),id=rowConnection(c),e=engines.get(sessionKey(inspector.device,id)),cfg=saved(id),op=operations.get(id);
 send('sendToPropertyInspector',inspector.context,{phase:op?.busy?'connecting':'complete',requestId:op?.requestId,configurationAllowed:allowed(c),connectionId:id,connectionSettings:ready&&allowed(c)?{...cfg,previewPassword:undefined,previewToken:undefined}:undefined,connections:Object.entries(settings.connections).map(([id,c])=>({id,name:c.name||'StreamHub'})),launcher:!!c?.launcher,status:op?.busy?'Connecting to StreamHub…':e?.s.online?(e.s.demo?'DEMO — no commands are sent to StreamHub':'Connected'):e?.s.error||(cfg.disconnected?'Disconnected':'Enter IP and API key'),error:e?.s.error||'',encoderError:e?.s.encoderError||'',previewStatus:e?.s.previewStatus||'',...extra});
}
function failure(error,context,connectionId){if(context)send('showAlert',context,{});if(!connectionId||rowConnection(contexts.get(inspector?.context))===connectionId)report({status:error.message,error:error.message});send('logMessage',uuid,{message:'StreamHub: '+error.message.replace(/api_key=[^&\s]+/g,'api_key=[redacted]')});}
const hold=new Hold({onError:error=>failure(error)});
function bind(c,context,id){
 if(!allowed(c))throw Error('Select ONLINE / OFFLINE or a StreamHub XL access key');saved(id);
 c.settings={...c.settings,connectionId:id};if(c.launcher||!launches.get(c.device))send('setSettings',context,c.settings);else launches.get(c.device).id=id;
 if(!c.launcher){active.set(c.device,id);hold.stopAll();}engine(c.device,id);render(c.device);report();
}
async function configure(next,requestId,connectionId){
 const c=contexts.get(inspector?.context);let id=connectionId||rowConnection(c);if(id==='new')id=randomUUID();
 // Bind only the selected page or launcher; other connections keep their sessions.
 if(c) {c.settings={...c.settings,connectionId:id};if(c.launcher||!launches.get(c.device))send('setSettings',inspector.context,c.settings);else launches.get(c.device).id=id;if(!c.launcher)active.set(c.device,id);}
 const cfg=saved(id),op={serial:++serial,busy:true,requestId};operations.set(id,op);hold.stopAll();
 const devices=new Set([...engines.values()].filter(e=>e.connectionId===id).map(e=>e.device));if(c)devices.add(c.device);
 for(const [key,e]of engines)if(e.connectionId===id){e.dispose();engines.delete(key);}
 const address=String(next.address||'').trim(),key=String(next.key||'').trim(),username=String(next.previewUsername||'').trim();
 if(address!==cfg.address||key!==cfg.key||username!==cfg.previewUsername){delete cfg.previewToken;delete cfg.previewOrigin;}
 Object.assign(cfg,{name:String(next.name||'').trim().slice(0,48),address,key,demo:!!next.demo,disconnected:false,previewOrigin:String(next.previewOrigin||'').trim(),previewUsername:username,previewPassword:String(next.previewPassword||'')});ready=true;persist();
 const current=[...devices].map(device=>engine(device,id,false));report();
 try{await Promise.all(current.map(e=>e.configure({...cfg})));}
 catch(error){if(operations.get(id)===op)failure(error,undefined,id);}
 finally{if(operations.get(id)===op){delete cfg.previewPassword;op.busy=false;report();op.requestId=null;}}
}
async function disconnect(requestId){
 const c=contexts.get(inspector?.context),id=rowConnection(c),cfg=saved(id),op={serial:++serial,busy:false,requestId};operations.set(id,op);hold.stopAll();
 const devices=new Set([...engines.values()].filter(e=>e.connectionId===id).map(e=>e.device));if(c)devices.add(c.device);
 for(const [key,e]of engines)if(e.connectionId===id){e.dispose();engines.delete(key);}
 for(const field of accessFields)delete cfg[field];cfg.disconnected=true;cfg.demo=false;persist();
 for(const device of devices){const e=engine(device,id,false);await e.configure({name:cfg.name});}
 report({phase:'complete',requestId,status:'Disconnected',credentialsCleared:true,error:'',previewStatus:''});op.requestId=null;
}
function isXL(device){const d=registrationInfo.devices?.find(d=>d.id===device);return !d||d.type===2;}
async function onMessage(message){
 const m=JSON.parse(String(message.data));
 if(m.event==='didReceiveGlobalSettings'){if(!ready){Object.assign(settings,m.payload.settings||{},{demo:false});settings.connections||={};saved();for(const cfg of Object.values(settings.connections)){delete cfg.previewPassword;cfg.demo=false;if(cfg.disconnected)for(const field of accessFields)delete cfg[field];}ready=true;persist();
  // Existing installations retain the current layout. New installs receive the bundled XL profile.
  for(const e of engines.values()){const cfg=saved(e.connectionId);void e.configure(cfg.disconnected?{name:cfg.name}:cfg).catch(error=>{if(!e.disposed)failure(error);});}for(const c of contexts.values())render(c.device);report();}return;}
 if(m.event==='willAppear'){
  const launcher=m.action==='org.streamhub.controller.open',coordinate=m.payload.coordinates,slot=coordinate?coordinate.row*8+coordinate.column:Number(m.payload.settings.slot);
  if(!launcher&&(!Number.isInteger(slot)||slot<0||slot>31))return;
  const c={device:m.device,slot,launcher,settings:{...(m.payload.settings||{})},sig:null};contexts.set(m.context,c);
  if(!launcher&&slot===7){anchors.set(m.device,m.context);if(c.settings.surfacePages>1)launches.delete(m.device);const pending=launches.get(m.device);const id=pending?.pending?pending.id:c.settings.connectionId||'default';active.set(m.device,id);if(pending?.pending){pending.pending=false;c.settings.connectionId=id;send('setSettings',m.context,c.settings);}if(c.settings.pageName&&!saved(id).name)saved(id).name=c.settings.pageName;engine(m.device,id);}
  else if(launcher)engine(m.device,rowConnection(c));
  render(m.device);return;
 }
 if(m.event==='didReceiveSettings'){const c=contexts.get(m.context);if(c){c.settings={...(m.payload.settings||{})};if(!c.launcher&&c.slot===7){const launch=launches.get(c.device);if(launch)c.settings.connectionId=launch.id;active.set(c.device,c.settings.connectionId||'default');}engine(c.device,rowConnection(c));render(c.device);report();}return;}
 if(m.event==='willDisappear'){hold.stop(m.context);const c=contexts.get(m.context);contexts.delete(m.context);if(c&&!c.launcher&&c.slot===7&&anchors.get(c.device)===m.context){anchors.delete(c.device);active.delete(c.device);for(const e of engines.values())if(e.device===c.device)e.revision++;}return;}
 if(m.event==='deviceDidDisconnect'){for(const [id,c]of contexts)if(c.device===m.device){hold.stop(id);contexts.delete(id);}for(const [key,e]of engines)if(e.device===m.device){e.dispose();engines.delete(key);}active.delete(m.device);launches.delete(m.device);return;}
 if(m.event==='propertyInspectorDidAppear'){inspector={context:m.context,device:m.device};report();return;}
 if(m.event==='propertyInspectorDidDisappear'){inspector=null;return;}
 if(m.event==='sendToPlugin'){
  const target=m.payload.actionContext||m.context,c=contexts.get(target);inspector={context:target,device:c?.device||m.device||inspector?.device};
  if(['configure','disconnect','bindConnection'].includes(m.payload.type)&&!allowed(c)){report({phase:'complete',requestId:m.payload.requestId,status:'Select the ONLINE / OFFLINE key in the top-right corner to manage the connection.',error:''});return;}
  if(m.payload.type==='configure')await configure(m.payload.settings,m.payload.requestId,m.payload.connectionId);
  else if(m.payload.type==='disconnect')await disconnect(m.payload.requestId);
  else if(m.payload.type==='bindConnection'){if(!settings.connections[m.payload.connectionId])throw Error('Saved StreamHub not found');bind(c,target,m.payload.connectionId);}
  else if(m.payload.type==='status')report();return;
 }
 if(m.event==='keyUp'){hold.stop(m.context);return;}
 if(m.event==='keyDown'){
  const c=contexts.get(m.context);if(!c)return;
  if(!isXL(c.device)){failure(Error('This controller requires a Stream Deck XL with 32 keys'),m.context);return;}
  if(c.launcher){hold.stopAll();const id=rowConnection(c);launches.set(c.device,{id,pending:true});ws.send(JSON.stringify({event:'switchToProfile',context:uuid,device:c.device,payload:{profile:'profiles/StreamHub XL',page:0}}));return;}
  if(!active.has(c.device))return;
  if(c.slot===5){const ids=hubIds(c.device),index=ids.indexOf(active.get(c.device));if(ids.length>1)selectHub(c.device,ids[(index+1)%ids.length]);return;}
  if(c.slot===4&&engine(c.device).s.view==='list'){addHub(c.device);return;}
  const id=rowConnection(c);if(operations.get(id)?.busy)return;const e=engine(c.device,id),k=e.keys()[c.slot];if(k.disabled||!k.command)return;
  if(['adjust','mode'].includes(k.command.type))e.lastMojoActivity=Date.now();
  const revision=e.revision,selection=e.previewSelection(),view=e.s.view,section=e.s.section,page=e.s.page;
  const valid=()=>active.get(c.device)===id&&contexts.get(m.context)===c&&e.revision===revision&&e.s.view===view&&e.s.section===section&&e.s.page===page&&e.previewSelection()===selection;
  const wait=async()=>{while(e.s.busy||e.refreshing){await new Promise(resolve=>setTimeout(resolve,25));if(!valid())return false;}return valid();};
  if(k.repeat){hold.stopAll();let first=true;hold.start(m.context,async()=>{const initial=first;first=false;const expectedHold=hold.active.get(m.context);if(!valid()||e.s.view!=='mojo')return hold.stop(m.context);const task=async()=>{if(!await wait())return hold.stop(m.context);if(!initial&&hold.active.get(m.context)!==expectedHold)return;await e.execute(k.command);};const pending=(e.commandQueue||Promise.resolve()).catch(()=>{}).then(task);e.commandQueue=pending;await pending;});}
  else{hold.stopAll();const pending=(e.commandQueue||Promise.resolve()).catch(()=>{}).then(async()=>{if(await wait())await e.execute(k.command);});e.commandQueue=pending;await pending;}
 }
}
ws.addEventListener('open',()=>{ws.send(JSON.stringify({event:registration,uuid}));send('getGlobalSettings',uuid,{});});
ws.addEventListener('message',m=>{void onMessage(m).catch(error=>failure(error));});
ws.addEventListener('error',()=>hold.stopAll());
ws.addEventListener('close',()=>{hold.stopAll();clearTimeout(pollTimer);for(const e of engines.values())e.dispose();process.exit(0);});
async function poll(){
 if(!polling&&!hold.active.size){polling=true;try{for(const [device,id]of active){const e=engines.get(sessionKey(device,id));if(e&&!operations.get(id)?.busy){if(e.s.view!=='mojo'||Date.now()-(e.lastMojoActivity||0)>1000)await e.refresh();await e.readPreview();}}}finally{polling=false;}}
 pollTimer=setTimeout(poll,1800);
}
pollTimer=setTimeout(poll,1800);