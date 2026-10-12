'use strict';
const {layout,step}=require('./layout');
const RCP=require('./rcp');
const {demo}=require('./demo');
const {Extra}=require('./rest-extra');
const {NativePreviews}=require('./native-previews');
const {copyText}=require('./clipboard');
const {GROUPS,outputGroup,channel,canEjectOutput,nextOutputProfile,ipProfiles}=require('./outputs');
class Engine {
 constructor(createClient,notify=()=>{},fetchFn=globalThis.fetch,options={}){
  this.openUrl=options.openUrl||(()=>{throw Error('Browser access is available from the Stream Deck app');});this.reconnect=options.reconnect||(()=>{throw Error('Reconnect from ONLINE / OFFLINE settings in the app');});this.copyText=options.copyText||copyText;this.networkSignature=null;
  this.abortController=new AbortController();this.disposed=false;
  const originalFetch=fetchFn;fetchFn=(url,options={})=>{
   const signals=[this.abortController.signal];if(options.signal)signals.push(options.signal);
   if(this.refreshing&&this.refreshAbortController&&(!options.method||options.method==='GET'))signals.push(this.refreshAbortController.signal);
   return originalFetch(url,{...options,signal:AbortSignal.any(signals)});
  };
  this.createClient=createClient;this.notify=notify;this.fetch=fetchFn;this.values={};
  this.storage={get:async keys=>{if(typeof keys==='string')return {[keys]:this.values[keys]};if(Array.isArray(keys))return Object.fromEntries(keys.map(k=>[k,this.values[k]]));return {...this.values};},set:async values=>{if(!this.disposed)Object.assign(this.values,values);},remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete this.values[k];}};
  this.client=createClient(this.storage,fetchFn);this.extra=new Extra(()=>this.values.connection,fetchFn);this.cameraSentAt=new Map();this.cameraPending=new Map();
  this.s={section:'INPUT',outputGroup:'SDI',view:'list',page:0,online:false,demo:false,busy:false,error:'',data:{inputs:[],outputs:[],outputProfiles:[]},encoders:[],encoderCapacity:null,encoderError:'',camera:null,selected:null,picker:null};
  this.stack=[];this.revision=0;this.refreshing=false;this.previewLoading=false;
  this.native=options.nativePreviews?new NativePreviews({
   fetchFn,onToken:options.onPreviewToken,onVerified:options.onPreviewIdentity,onAuthFailure:options.onPreviewAuthFailure,
   onStatus:status=>{this.s.previewStatus=status;this.applyDeviceRecording();this.emit();},onDevices:()=>{this.applyDeviceRecording();this.syncMultiview();this.emit();},
   onFrame:frame=>{this.applyDeviceRecording();if(frame.kind==='input')frame.uid=this.s.data.inputs.find(i=>i.id===frame.id)?.uid;this.useNativePreview();this.syncMultiviewPreviews();this.updateProgram();this.emit();}
  }):null;this.extra.native=this.native;
 }
 dispose(){clearTimeout(this.copiedTimer);this.disposed=true;this.revision++;this.abortController.abort();this.native?.stop();this.values={};this.cameraPending.clear();this.cameraSentAt.clear();this.s.online=false;this.s.busy=false;this.refreshing=false;this.commandQueue=Promise.resolve();}
 emit(){if(!this.disposed)this.notify(this.s);}
 keys(){this.applyChannelDetails();return layout(this.s);}
 async configure(settings){
  this.s.connectionName=String(settings.name||'').trim();this.s.hub={};this.s.hubAddress='';this.s.webUrl=null;this.s.canReconnect=!!(settings.address&&settings.key&&!settings.disconnected);this.s.hubTab='INFO';if(settings.address){const connection={base:this.client.normalizeAddress(settings.address)};this.s.hubAddress=connection.base;this.s.webUrl=require('./remote-access').webGuiAddress(connection,settings);}
  if(this.s.busy||this.refreshing)throw Error('Wait for the current command before changing connection');
  this.native?.stop();this.revision++;this.stack=[];this.s.selected=null;this.s.camera=null;this.s.preview=null;this.s.program=null;this.s.programIndex=0;this.s.view='list';this.s.page=0;this.s.error='';this.s.encoders=[];this.s.encoderCapacity=null;this.s.online=false;this.s.capabilities=null;this.s.multiview=null;this.s.multiviewAvailable=false;this.s.multiviewError='';this.s.bulk=null;this.s.outputBulk=null;this.s.inputBulk=null;this.s.encoderBulk=null;this.s.demo=!!settings.demo;
  this.values={};this.client=this.createClient(this.storage,this.fetch);
  if(this.s.demo){const d=demo();this.demoCamera=d.camera;this.s.data=d.data;this.s.encoders=d.encoders;this.s.encoderCapacity=4;this.s.online=true;this.s.multiview={rows:1,columns:1,cells:[0],enabled:false,overlay:true};this.s.multiviewAvailable=true;this.emit();return;}
  if(!settings.address||!settings.key){this.emit();return;}
  this.s.busy=true;this.emit();
  try{const result=await this.client.handle({type:'connect',address:settings.address,key:settings.key});this.s.data=result.snapshot;this.s.online=true;await this.readEncoders();await this.readMultiview(true);if(this.native)await this.native.start(this.values.connection,this.s.data.serverIdentity,settings);}
  catch(e){this.s.online=false;this.s.error=e.message;throw e;}
  finally{this.s.busy=false;this.emit();}
 }
 applyChannelDetails(){
  const model=require('./channel-details');this.s.hub={metadata:{...(this.s.capabilities||{}),...(this.native?.verified?this.native.metadata:{})},license:this.native?.verified?this.native.license:null,network:this.native?.verified?this.native.network:null,system:this.native?.verified?this.native.system:null};
  for(const input of this.s.data.inputs){const entry=this.native?.verified?this.native.details?.get('input:'+input.id,input.uid):null;input.liveStats=entry?model.statistics(entry.row):[];input.statsTime=entry?.time;if(!this.s.demo){const live=this.native?.liveProfiles?.(input.id,input.uid);input.liveProfiles=live?.profiles||[];input.liveProfileId=live?.current??null;input.liveProfileInstance=live?.instance??null;input.remoteAccessAvailable=!!this.native?.remotePlan?.(input.id,input.uid);}const info=this.native?.verified?this.native.details?.get('inputInfo:'+input.id,input.uid):null;if(info)input.streamDetails=model.configuration(info.row,...(this.native?.channels?.[input.id-1]?.hardwareIdentifier===input.uid?[this.native.channels[input.id-1]]:[]));}
  for(const output of this.s.data.outputs){const entry=this.native?.verified?this.native.details?.get(output.type+':'+(output.configIndex??output.id)):null;output.liveStats=entry?model.statistics(entry.row):[];output.statsTime=entry?.time;const info=this.native?.verified?this.native.details?.get('outputInfo:'+output.type+':'+(output.configIndex??output.id)):null;if(info)output.streamDetails=model.configuration(info.row);}
  for(const encoder of this.s.encoders){const entry=this.native?.verified?this.native.details?.get('encoder:'+encoder.id):null,status=this.native?.verified?this.native.details?.get('encoderStatus:'+encoder.id):null;encoder.liveStats=entry?model.statistics(entry.row):[];encoder.statsTime=entry?.time;if(status)encoder.streamDetails=model.configuration(status.row);if(status){encoder.status=Number(status.row.status);encoder.message=status.row.message||'';}}

 }
 applyDeviceRecording(){
  this.applyChannelDetails();
  for(const input of this.s.data.inputs){
   const features=this.native?.features?.(input.id,input.uid);
   if(!this.s.demo)Object.assign(input,features||{nativeDiagnostic:undefined,intercomAvailable:false,intercom:null,returnCapability:0,returnEncoder:null,returnSource:null});
   const device=this.native?.device(input.id,input.uid);
   if(device&&Number.isInteger(device.recordStatus)){
    input.deviceRecording=device.recordStatus===5;input.nativeRecording=true;input.unitRecordError=device.recordStatus<0?device.recordStatus:null;
   }else if(input.nativeRecording){input.deviceRecording=null;input.nativeRecording=false;}
  }
 }
 previewSelection(){return this.s.view+':'+(this.s.selected?.uid||this.s.selected?.key||this.s.selected?.id);}
 useNativePreview(){
  let frame=null;
  if(['input','mojo'].includes(this.s.view)){
   const i=this.s.data.inputs.find(i=>i.id===this.s.selected?.id&&i.uid===this.s.selected?.uid);
   frame=i?this.native?.get('input',i.id):null;if(frame?.uid!==i?.uid)frame=null;
  }else if(this.s.view==='output'){
   const o=this.s.data.outputs.find(o=>o.key===this.s.selected?.key);
   if(o&&['SDI','NDI'].includes(o.type))frame=this.native?.get(o.type,o.id);
   else if(o?.type==='IP'){
    if(o.encoder)frame=this.native?.get('encoder',o.encoder);
    else if(o.source){frame=this.native?.get('input',o.source);if(frame?.uid!==this.s.data.inputs.find(i=>i.id===o.source)?.uid)frame=null;}
   }
  }else if(this.s.view==='encoder')frame=this.native?.get('encoder',this.s.selected?.id);
  if(frame){this.s.preview={...frame,selection:this.previewSelection()};return true;}return false;
 }
 async readPreview(){
  if(this.previewLoading||this.s.busy||this.refreshing||!this.s.online||this.s.demo||!['input','mojo','output','encoder'].includes(this.s.view))return;
  if(this.useNativePreview()){this.emit();return;}
  const selection=this.previewSelection(),selected=this.s.selected;
  let source=null;
  if(['input','mojo'].includes(this.s.view))source=this.s.data.inputs.find(i=>i.id===selected?.id&&i.uid===selected?.uid);
  else if(this.s.view==='output'){const o=this.s.data.outputs.find(o=>o.key===selected?.key);if(o?.type==='IP'&&!o.encoder)source=this.s.data.inputs.find(i=>i.id===o.source);}
  if(!source?.connected){this.s.preview=null;this.emit();return;}
  const revision=this.revision,client=this.client;this.previewLoading=true;
  try{
   const result=await client.handle({type:'previews',inputs:[source.id]});
   if(revision!==this.revision||!this.s.online||selection!==this.previewSelection()||!this.s.data.inputs.some(i=>i.id===source.id&&i.uid===source.uid&&i.connected))return;
   if(this.useNativePreview())return;
   const frame=result.previews.find(p=>p.id===source.id);
   this.s.preview=frame?.thumbnail?{id:source.id,uid:source.uid,thumbnail:frame.thumbnail,time:Date.now(),selection}:null;
   this.emit();
  }catch{if(revision===this.revision&&selection===this.previewSelection()){this.s.preview=null;this.emit();}}
  finally{this.previewLoading=false;}
 } async discover(){try{const d=await this.client.handle({type:'mojoDiscover'});for(const i of d.inputs){const row=this.s.data.inputs.find(x=>x.id===i.id&&x.uid===i.uid);if(row)row.isMojo=true;}}catch{/* Discovery is optional; core snapshot remains valid. */}}
 syncMultiviewPreviews(){
  const active=this.s.view==='multiview',ids=active&&this.s.multiview?[...new Set(this.s.multiview.cells)].filter(id=>this.s.data.inputs.some(i=>i.id===id&&i.connected&&i.status===2)):[];
  if(active)this.native?.selectInputs?.(ids);
  this.s.multiviewFrames={};for(const id of ids){const input=this.s.data.inputs.find(i=>i.id===id),frame=this.native?.get?.('input',id);if(frame&&(!frame.uid||frame.uid===input.uid))this.s.multiviewFrames[id]=frame;}
 }
 syncMultiview(){
  if(!this.native?.verified)return;
  const license=this.native.license?.license||this.native.license;
  if([false,0,'0'].includes(license?.multiView)){this.s.multiviewAvailable=false;this.s.multiview=null;return;}
  if(this.native.config?.mosaic)try{this.s.multiview=require('./multiview').decode(this.native.config.mosaic);this.s.multiviewAvailable=true;this.s.multiviewError='';this.syncMultiviewPreviews();}catch{}
 }
 async readMultiview(quiet=false){
  if(this.s.demo)return this.s.multiview;
  const license=this.native?.license?.license||this.native?.license;
  if([false,0,'0'].includes(license?.multiView)){this.s.multiviewAvailable=false;this.s.multiview=null;if(!quiet)throw Error('Multiview is not licensed on this StreamHub');return;}
  try{this.s.multiview=require('./multiview').decode(await this.extra.config('mosaic'));this.s.multiviewAvailable=true;this.s.multiviewError='';this.syncMultiviewPreviews();return this.s.multiview;}
  catch(error){this.syncMultiview();if(this.s.multiviewAvailable&&this.s.multiview)return this.s.multiview;this.s.multiviewAvailable=false;this.s.multiviewError=error.message;if(!quiet)throw error;}
 }
 async changeMultiview(operation){
  if(!this.s.multiviewAvailable)throw Error('Multiview is unavailable on this StreamHub');
  if(operation.kind==='cell'&&operation.input)this.checkInput(operation.input,operation.uid);
  try{await this.mutate(async()=>{
   if(this.s.demo){const model=require('./multiview'),old=this.s.multiview,config={nbRow:old.rows,nbCol:old.columns,videoChannelIndexes:JSON.stringify(old.cells),enable:old.enabled,showOverlayInfo:old.overlay};this.s.multiview=model.decode({...config,...model.patch(config,operation)});}
   else this.s.multiview=await this.native.setMultiview(operation,this.extra);
  });this.s.multiviewError='';}catch(error){this.s.multiviewError=error.message;this.emit();throw error;}this.emit();
 }
 async readEncoders(){try{this.s.encoders=await this.extra.snapshot();this.s.encoderCapacity=this.extra.capacity;this.s.capabilities=this.extra.metadata;this.s.encoderError='';}catch(e){this.s.encoders=[];this.s.encoderCapacity=null;this.s.encoderError=e.message;}}
 async syncNetwork(){
  if(!this.native?.verified||!this.native.network||!this.values.connection)return;
  const signature=JSON.stringify(this.native.network);if(signature===this.networkSignature)return;
  await this.client.handle({type:'nativeNetwork',base:this.values.connection.base,network:this.native.network});this.networkSignature=signature;
 }
 interruptRefresh(){if(this.refreshing){this.refreshCancelled=true;this.refreshAbortController?.abort();}}
 async refresh(){
  if(this.refreshing||this.s.busy||this.s.demo||!this.values.connection)return;
  this.refreshing=true;this.refreshCancelled=false;this.refreshAbortController=new AbortController();
  try{
   await this.syncNetwork();const d=await this.client.handle({type:'snapshot',fresh:true});if(this.refreshCancelled)return;this.s.data=d;this.applyDeviceRecording();this.updateProgram();this.s.online=true;this.s.error='';
   if(this.s.view==='input'&&this.native?.verified&&this.native.readReturnConfig)await this.native.readReturnConfig(this.extra);
   if(this.s.section==='ENCODERS')await this.readEncoders();this.applyDeviceRecording();
   if(this.s.view==='multiview'||this.s.picker?.kind==='multiviewInput'){try{await this.readMultiview();}catch(e){this.s.multiviewError=e.message;}}
   if(this.s.view==='mojo'){
    const i=d.inputs.find(i=>i.id===this.s.selected.id&&i.uid===this.s.selected.uid);
    if(!i){this.s.error='Selected camera source is temporarily unavailable';}else{
     try{
      const camera=await this.client.handle({type:'mojoGet',input:i.id});
      if(this.refreshCancelled)return;
      if(camera.deviceUID!==this.s.selected.uid)throw Error('Camera identity changed');
      const old=this.s.camera;
      if(old&&old.settings.camera===camera.settings.camera){
       for(const param of Object.keys(old.settings).filter(k=>k!=='camera')){
        const pending=this.cameraPending.get(param),recent=Date.now()-(this.cameraSentAt.get(param)||0)<2200;
        if(pending&&recent){
         const row=camera.settings[param]||{},confirmed=Object.entries(pending).every(([field,value])=>row[field]===value);
         if(confirmed)this.cameraPending.delete(param);
         else {camera.settings[param]={...row,...pending};camera.known[param]=Number.isFinite(camera.settings[param][param]);}
        }else{
         this.cameraPending.delete(param);
         if(camera.readError){camera.settings[param]=old.settings[param];camera.reported[param]=old.reported[param];camera.known[param]=old.known[param];}
         else if(param==='WB'&&!camera.reported[param]){camera.known[param]=false;delete camera.settings[param][param];}
        }
       }
      }
      this.s.camera=camera;
     }catch(e){if(!this.refreshCancelled)this.s.error=e.message;}
    }
   }
  }catch(e){if(!this.refreshCancelled){this.s.online=false;this.s.error=e.message;}}
  finally{this.refreshing=false;this.refreshAbortController=null;this.emit();}
 }
 push(view,selected=this.s.selected){this.stack.push({view:this.s.view,selected:this.s.selected,page:this.s.page,picker:this.s.picker});this.s.view=view;this.s.selected=selected;this.s.page=0;}
 back(){const old=this.stack.pop();if(old)Object.assign(this.s,old);else{this.s.view='list';this.s.selected=null;this.s.page=0;}this.native?.selectInput(['input','mojo'].includes(this.s.view)?this.s.selected?.id:null);this.syncMultiviewPreviews();this.emit();}
 checkInput(id,uid){const row=this.s.data.inputs.find(i=>i.id===id&&i.uid===uid);if(!row)throw Error('Source identity changed');return row;}
 async mutate(task){
  if(this.s.busy||this.refreshing)throw Error('Wait for the current read or command to finish');
  if(!this.s.online)throw Error('StreamHub is disconnected');
  this.s.busy=true;this.emit();
  try{const r=await task();if(r?.results){const failures=r.results.filter(x=>!x.ok);if(failures.length)throw Error(failures.map(x=>x.message).join('; '));}if(r?.snapshot)this.s.data=r.snapshot;this.s.error='';this.s.commandError=null;return r;}
  catch(e){this.s.error=e.message;this.s.commandError={view:this.s.view,selected:{...this.s.selected},message:e.message};throw e;}
  finally{this.s.busy=false;this.emit();}
 }
 async execute(c){
  if(!c)return;
  if(c.type==='back'){this.back();return;}
  if(c.type==='section'){this.s.outputBulk=null;this.s.inputBulk=null;this.s.encoderBulk=null;
   this.stack=[];this.native?.selectInput(null);this.s.section=c.section;this.s.view='list';this.s.page=0;this.s.selected=null;this.s.camera=null;this.emit();
   if(!this.s.demo&&this.s.online&&c.section==='ENCODERS')await this.mutate(()=>this.readEncoders());
   if(!this.s.demo&&this.s.online&&c.section==='MOJO PRO')await this.mutate(()=>this.discover());return;
  }
  if(c.type==='page'){this.s.page=(this.s.page+(c.delta??1))%(c.pages||2);this.emit();return;}
  if(c.type==='hub'){if(this.s.view!=='hub'){this.push('hub');this.s.hubTab='INFO';}this.emit();return;}
  if(c.type==='hubTab'){if(this.s.view==='hub'&&['INFO','SYSTEM','LICENSES'].includes(c.tab)){this.s.hubTab=c.tab;this.s.page=0;this.emit();}return;}
  if(c.type==='hubWeb'){if(!this.s.webUrl)throw Error('Configure the StreamHub web address first');await this.openUrl(this.s.webUrl);return;}
  if(c.type==='hubReconnect'){if(!this.s.canReconnect)throw Error('Enter connection details in the Stream Deck app first');await this.reconnect();return;}
  if(c.type==='refresh'){await this.refresh();return;}
  if(!this.s.online)throw Error('StreamHub is disconnected');
  if(this.s.busy||this.refreshing)throw Error('Wait for the current command to finish');
  if(c.type==='remoteAccess'){
   const input=this.checkInput(c.id,c.uid);if(this.s.view!=='input'||this.s.selected?.id!==c.id||this.s.selected?.uid!==c.uid||!input.connected||!input.remoteAccessAvailable)throw Error('Remote access is unavailable for this input');
   const revision=this.revision;const url=await this.mutate(()=>this.native.remoteAccess(c.id,c.uid));
   if(this.disposed||this.revision!==revision||this.s.view!=='input'||this.s.selected?.id!==c.id||this.s.selected?.uid!==c.uid)throw Error('Input changed before opening remote access');
   await this.openUrl(url);return;
  }
  if(c.type==='multiview'){
   if(!this.s.demo)await this.mutate(()=>this.readMultiview());
   if(!this.s.multiviewAvailable)throw Error('Multiview is unavailable');
   this.s.bulk=null;this.s.inputBulk=null;this.s.encoderBulk=null;this.push('multiview',null);this.native?.selectInput(null);this.syncMultiviewPreviews();this.emit();return;
  }
  if(c.type==='multiviewRefresh'){await this.mutate(()=>this.readMultiview());this.emit();return;}
  if(c.type==='multiviewChange'){await this.changeMultiview(c.operation);this.syncMultiviewPreviews();return;}
  if(c.type==='multiviewRouteGroup'){const p=this.s.picker;if(p?.kind!=='multiviewRoute'||!require('./outputs').supportedGroups(this.s).includes(c.group))return;p.group=c.group;this.s.page=0;this.emit();return;}
  if(c.type==='multiviewRouteConfirm'){if(this.s.picker?.kind==='multiviewRoute'&&this.s.picker.selectedKeys.length)this.s.picker.decision=true;this.emit();return;}
  if(c.type==='multiviewRouteReview'){if(this.s.picker?.kind==='multiviewRoute')this.s.picker.decision=false;this.emit();return;}
  if(c.type==='multiviewRouteApply'){await this.applyMultiviewRoutes(!!c.goLive);return;}
  if(c.type==='outputGroup'){
   if(!require('./outputs').supportedGroups(this.s).includes(c.group))throw Error('This output type is unavailable on this StreamHub');
   this.stack=[];this.s.section='OUTPUT';this.s.outputGroup=c.group;this.s.view='list';this.s.selected=null;this.s.page=0;this.emit();return;
  }
  if(c.type==='outputBulkStart'){if(this.s.section!=='OUTPUT'||!['unassign','toggle'].includes(c.mode))return;this.s.bulk=null;this.s.bulkConfirm=null;this.s.outputBulk={mode:c.mode,keys:[]};this.emit();return;}
  if(c.type==='outputBulkCancel'){this.s.outputBulk=null;this.s.inputBulk=null;this.s.encoderBulk=null;this.emit();return;}
  if(c.type==='outputBulkSelect'){const bulk=this.s.outputBulk,o=this.s.data.outputs.find(o=>o.key===c.key);if(!bulk||!o||o.locked||!o.powerAvailable||bulk.mode==='unassign'&&!o.source&&!o.encoder)return;bulk.keys=bulk.keys.includes(c.key)?bulk.keys.filter(key=>key!==c.key):[...bulk.keys,c.key];this.emit();return;}
  if(c.type==='outputBulkRun'){await this.applyOutputBulk();return;}
  if(c.type==='encoderBulkStart'){if(this.s.section!=='ENCODERS'||this.s.view!=='list')return;this.s.bulk=null;this.s.bulkConfirm=null;this.s.encoderBulk={items:[]};this.emit();return;}
  if(c.type==='encoderBulkCancel'){this.s.encoderBulk=null;this.emit();return;}
  if(c.type==='encoderBulkSelect'){const bulk=this.s.encoderBulk,e=this.s.encoders.find(e=>e.id===c.id&&e.profile!=='-1');if(!bulk||!e)return;bulk.items=bulk.items.some(x=>x.id===e.id)?bulk.items.filter(x=>x.id!==e.id):[...bulk.items,{id:e.id,profile:e.profile}];this.emit();return;}
  if(c.type==='encoderBulkRun'){await this.applyEncoderBulk();return;}
  if(c.type==='inputBulkStart'){if(this.s.section!=='INPUT')return;this.s.bulk=null;this.s.bulkConfirm=null;this.s.inputBulk={items:[]};this.emit();return;}
  if(c.type==='inputBulkCancel'){this.s.inputBulk=null;this.s.encoderBulk=null;this.emit();return;}
  if(c.type==='inputBulkSelect'){const bulk=this.s.inputBulk,i=this.checkInput(c.id,c.uid);if(!bulk||!this.inputPowerAvailable(i))return;bulk.items=bulk.items.some(x=>x.id===i.id)?bulk.items.filter(x=>x.id!==i.id):[...bulk.items,{id:i.id,uid:i.uid}];this.emit();return;}
  if(c.type==='inputBulkRun'){await this.applyInputBulk();return;}
  if(c.type==='bulkStart'){this.s.outputBulk=null;this.s.inputBulk=null;this.s.encoderBulk=null;this.s.bulkConfirm=null;this.s.bulk=[];this.emit();return;}
  if(c.type==='bulkCancel'){this.s.bulkConfirm=null;this.s.bulk=null;this.emit();return;}
  if(c.type==='bulkSelect'){this.s.bulkConfirm=null;const k=JSON.stringify(c.command),b=this.s.bulk||[];this.s.bulk=b.some(x=>JSON.stringify(x)===k)?b.filter(x=>JSON.stringify(x)!==k):[...b,c.command];this.emit();return;}
  if(c.type==='bulkRun'){await this.bulkEject(c.confirmed);return;}
  if(c.type==='asset'){await this.cycleAsset(c.delta);return;}
  if(c.type==='detailsTab'){if(this.s.view!=='diagnostic'||!['CONFIG','STATS','ALERTS'].includes(c.tab))return;this.s.detailsTab=c.tab;this.s.page=0;this.emit();return;}
  if(c.type==='diagnostic'){const selected=this.s.selected;const item=c.asset==='output'?this.s.data.outputs.find(o=>o.key===selected.key):c.asset==='encoder'?this.s.encoders.find(e=>e.id===selected.id):this.s.data.inputs.find(i=>i.id===selected.id&&i.uid===selected.uid);this.push('diagnostic',{...selected,asset:c.asset});this.s.detailsTab=require('./diagnostics').diagnostic(item,c.asset)||this.s.commandError?'ALERTS':'CONFIG';this.applyDeviceRecording();this.emit();return;}
  if(c.type==='program'){this.s.programIndex=(this.s.programIndex||0)+1;this.updateProgram();this.emit();return;}
  if(c.type==='addOutput'){await this.addOutput(c.group);return;}
  if(c.type==='ejectOutput'&&this.s.demo){const output=this.s.data.outputs.find(o=>o.key===c.key);if(!output||!canEjectOutput(this.s.data,output))throw Error('Eject the highest-numbered physical or NDI output first');}
  if(c.type==='input'||c.type==='mojo'){
   this.checkInput(c.id,c.uid);this.push(c.type,{id:c.id,uid:c.uid});this.cameraSentAt.clear();this.cameraPending.clear();this.s.preview=null;this.s.program=null;this.s.programIndex=0;this.s.camera=null;this.native?.selectInput(c.id);this.applyDeviceRecording();this.emit();
   if(c.type==='mojo'){
    if(this.s.demo){this.s.camera=structuredClone(this.demoCamera);this.updateProgram();this.emit();}
    else await this.mutate(async()=>{this.s.camera=await this.client.handle({type:'mojoGet',input:c.id});this.updateProgram();});
   }return;
  }
  if(c.type==='output'){this.push('output',{key:c.key});this.emit();return;}
  if(c.type==='encoder'){this.push('encoder',{id:c.id});this.emit();return;}
  if(c.type==='routeGroup'){const picker=this.s.picker;if(this.s.view!=='pick'||picker?.kind!=='route')return;if(picker.encoder&&c.group==='NDI'||!require('./outputs').supportedGroups(this.s).includes(c.group))throw Error('Output type unavailable');picker.group=c.group;this.s.page=0;this.emit();return;}
  if(c.type==='routeConfirm'){if(this.s.picker?.kind==='route'&&(this.s.picker.selectedKeys.length||this.s.picker.activationKeys?.length)){this.s.picker.decision=true;this.emit();}return;}
  if(c.type==='routeReview'){if(this.s.picker?.kind==='route'){this.s.picker.decision=false;this.emit();}return;}
  if(c.type==='routeApply'){await this.confirmRoutes(!!c.goLive);return;}
  if(c.type==='inputReadiness'){const picker=this.s.picker;if(this.s.view!=='pick'||!['outputInput','encoderInput'].includes(picker?.kind))return;picker.readiness=picker.readiness==='READY'?'NOT READY':'READY';this.s.page=0;this.emit();return;}
  if(c.type==='intercom'){const i=this.checkInput(c.id,c.uid);if(this.s.demo){i.intercom=!i.intercom;this.emit();return;}await this.mutate(()=>this.native.intercom(i.id,i.uid,c.enabled));this.applyDeviceRecording();this.emit();return;}
  if(c.type==='pick'){await this.openPicker(c);return;}
  if(c.type==='choose'){await this.choose(c.item);return;}
  if(c.type==='adjust'||c.type==='mode'){await this.cameraCommand(c);return;}
  if(this.s.demo){await this.demoCommand(c);if(c.type.startsWith('eject')){this.finishEject();this.emit();}return;}
  await this.mutate(async()=>{
   let result;
   if(['power','record','ejectInput'].includes(c.type)){
    this.checkInput(c.id,c.uid);
    if(c.type==='ejectInput'&&this.native?.verified){
     const row=this.checkInput(c.id,c.uid);
     await this.native.ejectInput(row,this.extra);
     this.s.data=await this.client.handle({type:'snapshot',fresh:true});this.finishEject();return;
    }
    if(c.type==='ejectInput'&&!this.checkInput(c.id,c.uid).connected&&this.checkInput(c.id,c.uid).protocolId<0){this.finishEject();return;}
    // Recheck device identity immediately before commands without their own UID check.
    if(c.type==='record'&&c.endpoint==='record'&&!this.checkInput(c.id,c.uid).connected)throw Error('Recording device disconnected');if(c.type==='record'&&c.endpoint==='record'&&this.native?.verified){await this.native.record(c.id,c.uid,c.enabled,()=>this.client.handle({type:'inputControl',input:c.id,endpoint:'record',action:c.enabled?'start':'stop',expectedUID:c.uid}));this.applyDeviceRecording();return;}
    if(c.type==='record'){const fresh=await this.client.handle({type:'snapshot'});if(!fresh.inputs.some(i=>i.id===c.id&&i.uid===c.uid))throw Error('Source identity changed');}
    result=await this.client.handle(c.type==='power'?{type:'inputPower',input:c.id,expectedUID:c.uid,action:c.enabled?'enable':'disable'}:c.type==='record'?{type:'inputControl',input:c.id,endpoint:c.endpoint,action:c.enabled?'start':'stop'}:{type:'inputEject',input:c.id,expectedUID:c.uid});
   }else if(c.type==='outputPower'||c.type==='ejectOutput'){
    if(c.type==='ejectOutput'){
     const data=await this.client.handle({type:'snapshot'}),output=data.outputs.find(o=>o.key===c.key);
     if(!output||!canEjectOutput(data,output))throw Error('Eject the highest-numbered physical or NDI output first');
     if(outputGroup(output)==='IP'&&this.native?.verified&&this.native.ejectIP){
      await this.native.ejectIP(output.configIndex,this.extra);
      this.s.data=await this.client.handle({type:'snapshot',fresh:true});
      this.finishEject();return;
     }
    }
    result=await this.client.handle({type:'outputControl',keys:[c.key],action:c.type==='ejectOutput'?'clear':c.enabled?'enable':'disable'});
   }else if(c.type==='encoderPower'){await this.extra.power(c.id,c.enabled);await this.readEncoders();}
   else if(c.type==='ejectEncoder'){await this.extra.eject(c.id);await this.readEncoders();}
   else throw Error('Command unavailable');
   if(c.type.startsWith('eject'))this.finishEject();return result;
  });
 }
 finishEject(){this.stack=[];this.s.view='list';this.s.selected=null;this.s.camera=null;this.native?.selectInput(null);}
 async demoCommand(c){
  const i=this.s.data.inputs.find(i=>i.id===c.id),o=this.s.data.outputs.find(o=>o.key===c.key),e=this.s.encoders.find(e=>e.id===c.id);
  if(c.type==='power'){i.enabled=c.enabled;i.status=c.enabled?2:0;}
  else if(c.type==='record'){if(c.endpoint==='record')i.deviceRecording=c.enabled;else i.recorderStatus=c.enabled?2:1;}
  else if(c.type==='ejectInput'){i.connected=false;i.enabled=false;i.status=0;}
  else if(c.type==='outputPower')o.enabled=c.enabled;
  else if(c.type==='ejectOutput'){this.s.data.outputs=this.s.data.outputs.filter(x=>x!==o);const p=this.s.data.outputProfiles.find(p=>p.key===c.key);if(p)p.present=false;this.syncDemoOutputs();}
  else if(c.type==='encoderPower'){e.enabled=c.enabled;e.status=c.enabled?2:0;}
  else if(c.type==='ejectEncoder'){e.enabled=false;e.status=0;e.profile='-1';e.name='No profile';}
  this.emit();
 }
 syncDemoOutputs(){
  for(const profile of this.s.data.outputProfiles){
   const group=outputGroup(profile),id=channel(profile);
   profile.present=this.s.data.outputs.some(o=>outputGroup(o)===group&&channel(o)===id);
   if(group!=='IP')profile.canAdd=!profile.present&&id===1+Math.max(0,...this.s.data.outputs.filter(o=>outputGroup(o)===group).map(channel));
  }
 }
 async addOutput(group){
  if(!GROUPS.includes(group))throw Error('Invalid output group');
  if(group==='IP'){await this.openPicker({kind:'outputAdd',group});return;}
  if(this.s.demo){
   const profile=nextOutputProfile(this.s.data,group);if(!profile)throw Error('No next '+group+' output available');
   await this.choose({command:{type:'outputAdd',key:profile.key}});return;
  }
  await this.mutate(async()=>{
   const data=await this.client.handle({type:'snapshot'}),profile=nextOutputProfile(data,group);
   if(!profile)throw Error('No next '+group+' output available');
   return this.client.handle({type:'outputAdd',key:profile.key});
  });
 }
 async openPicker(c){
  const items=[];
  if(c.kind==='routeEncoder'){
   if(this.s.picker?.kind!=='route')throw Error('Open ROUTE TO OUTPUT first');
   if(!this.s.demo)await this.mutate(()=>this.readEncoders());
   items.push({title:'DIRECT\nNO ENCODER',command:{type:'routeEncoder',encoder:null}});
   for(const enc of this.s.encoders)if(enc.profile!=='-1')items.push({title:'ENC '+enc.id+'\n'+enc.name,active:enc.id===this.s.picker.encoder,command:{type:'routeEncoder',encoder:enc.id}});
  }
  if(['inputEncoder','encoderRoute'].includes(c.kind)&&!this.s.demo)await this.mutate(()=>this.readEncoders());
  if(c.kind==='inputEncoder'){if(c.multiview){if(!this.s.multiviewAvailable)throw Error('Multiview unavailable');}else this.checkInput(c.input,c.uid);for(const e of this.s.encoders)if(e.profile!=='-1')items.push({title:'ENC '+e.id+'\n'+e.name,active:e.input===c.input,command:{type:'encoderInput',encoder:e.id,input:c.input,uid:c.uid,multiview:!!c.multiview}});}
  if(c.kind==='encoderRoute'){const enc=this.s.encoders.find(e=>e.id===c.encoder&&e.profile!=='-1');if(!enc)throw Error('Encoder unavailable');for(const o of this.s.data.outputs.filter(o=>o.type!=='NDI'))items.push({title:o.type+' '+o.id+'\n'+o.name,group:outputGroup(o),disabled:o.locked||!o.powerAvailable,active:o.encoder===c.encoder,command:{type:'encoderOutput',encoder:c.encoder,key:o.key}});}
  if(c.kind==='liveProfile'){
   const input=this.checkInput(c.input,c.uid);this.applyChannelDetails();
   if(input.isMojo||!input.connected||!input.liveProfiles?.length||input.liveProfileInstance===null)throw Error('Transmitter live profiles are unavailable');
   for(const profile of input.liveProfiles)items.push({title:profile.name+'\n'+(profile.id===input.liveProfileId?'CURRENT':''),active:profile.id===input.liveProfileId,command:{type:'liveProfile',input:input.id,uid:input.uid,profile:profile.id,instance:input.liveProfileInstance}});
  }
  if(c.kind==='multiviewRoute'){
   if(!this.s.multiviewAvailable)throw Error('Multiview unavailable');
   if(!this.s.demo)await this.mutate(async()=>{await this.readMultiview();await this.readEncoders();this.s.data=await this.client.handle({type:'snapshot',fresh:true});});
  }
  if(c.kind==='multiviewEncoder'){
   if(this.s.picker?.kind!=='multiviewRoute'||this.s.picker.group!=='IP')throw Error('Open Multiview IP routing first');
   for(const e of this.s.encoders)if(e.profile!=='-1'){
    const codec=String(this.extra.profiles?.[e.profile]?.encoderVideoType||'').replace(/[^a-z0-9]/gi,'');
    const allowed=!/passthrough/i.test(codec)&&!/passthrough/i.test(String(this.extra.profiles?.[e.profile]?.encoderAudioType||''));
    items.push({title:'ENC '+e.id+'\n'+e.name+'\n'+(e.enabled&&e.input!==33?'STOP FIRST':allowed?'SELECT':'PASSTHROUGH'),disabled:!allowed||e.enabled&&e.input!==33,command:{type:'multiviewEncoder',encoder:e.id}});
   }
  }
  if(c.kind==='multiviewInput'){
   if(!this.s.multiview||!Number.isInteger(c.cell)||c.cell<0||c.cell>=this.s.multiview.cells.length)throw Error('Multiview cell unavailable');
   const expected=require('./multiview').fingerprint(this.s.multiview);
   items.push({title:'CLEAR\nCELL',command:{type:'multiviewInput',cell:c.cell,input:0,expected}});
   for(const i of this.s.data.inputs)if(i.id>=1&&i.id<=32)items.push({title:''+i.id+'\n'+i.name+'\n'+(i.status===2?'LIVE':i.connected?'READY':'NOT READY'),command:{type:'multiviewInput',cell:c.cell,input:i.id,uid:i.uid,expected}});
  }
  if(c.kind==='copyLink'){
   if(!this.s.demo)await this.mutate(async()=>{await this.syncNetwork();this.s.data=await this.client.handle({type:'snapshot',fresh:true});});
   const row=c.asset==='input'?this.checkInput(c.input,c.uid):this.s.data.outputs.find(o=>o.key===c.key&&o.type==='IP');
   if(!row?.canCopyLink)throw Error('Stream links unavailable for this asset');
   const links=row.links||[];
   for(const [label,pattern]of [['LOCAL IP',/^Local URL/],['PUBLIC IP',/^Public URL \(IP Address\)/],['HOSTNAME',/^Public URL \(Hostname\)/],['STREAM URL',/^Stream URL/]]){
    const group=links.filter(link=>pattern.test(link.label));
    if(!group.length&&label==='STREAM URL')continue;
    if(!group.length)items.push({title:label+'\nUNAVAILABLE',disabled:true});
    for(const [index,link]of group.entries())items.push({title:label+(group.length>1?' '+(index+1):''),command:{type:'copyLink',url:link.url,asset:c.asset,input:c.input,uid:c.uid,key:c.key}});
   }
  }
  if(c.kind==='videoReturn'){
   const i=this.checkInput(c.input,c.uid);
   if(!i.connected||!i.returnCapability)throw Error('Video return unavailable on this terminal');
   if(!this.s.demo){await this.mutate(async()=>{await this.readEncoders();await this.native.readReturnConfig(this.extra);});this.applyDeviceRecording();}
   items.push({title:'DISCONNECT\nRETURN',disabled:!i.returnEncoder&&!i.returnSource,command:{type:'videoReturn',input:i.id,uid:i.uid,kind:'none'}});
   for(const e of this.s.encoders)if(e.profile!=='-1'&&(i.returnCapability&1)&&(this.s.demo?e.videoReturn:[true,1,'1'].includes(this.extra.profiles?.[e.profile]?.videoReturnMode)))items.push({title:'ENC '+e.id+'\n'+e.name,active:i.returnEncoder===e.id,command:{type:'videoReturn',input:i.id,uid:i.uid,kind:'encoder',target:e.id}});
   for(const src of this.s.data.inputs)if(src.id!==i.id&&src.connected&&(i.returnCapability&src.returnSourceProfile))items.push({title:''+src.id+'\n'+src.name,active:i.returnSource===src.id,command:{type:'videoReturn',input:i.id,uid:i.uid,kind:'input',target:src.id,sourceUID:src.uid}});
  }
  if(c.kind==='route')for(const o of this.s.data.outputs)items.push({title:o.type+' '+o.id+'\n'+o.name,command:{type:'route',input:c.input,uid:c.uid,key:o.key},group:outputGroup(o),disabled:o.locked||!o.powerAvailable,active:false});
  if(c.kind==='outputInput'||c.kind==='encoderInput')for(const i of this.s.data.inputs)items.push({ready:!!i.connected,title:''+i.id+'\n'+i.name+'\n'+(i.status===2?'LIVE':i.connected?'READY':'NOT READY'),command:{type:c.kind,input:i.id,uid:i.uid,key:c.key,encoder:c.encoder}});
  if(c.kind==='encoderInput'&&this.s.multiviewAvailable&&this.s.multiview)items.push({ready:!!this.s.multiview.enabled,title:'MULTIVIEW\n'+(this.s.multiview.enabled?'ON':'OFF'),command:{type:'encoderInput',input:33,encoder:c.encoder,multiview:true}});
  if(c.kind==='inputProfile'){
   const p=this.s.demo?{inputs:[{id:'0',name:'Demo SRT',assigned:false}]}:await this.mutate(()=>this.client.handle({type:'presets'}));
   for(const r of p.inputs)items.push({title:r.name,disabled:r.assigned,command:{type:'inputProfile',input:c.input,uid:c.uid,preset:r.id}});
  }
  if(c.kind==='encoderProfile'||c.kind==='encoderAdd'){
   let encoder=c.encoder;
   if(c.kind==='encoderAdd'){
    if(!this.s.demo)await this.mutate(()=>this.readEncoders());
    const free=this.s.encoders.filter(e=>e.profile==='-1'&&!e.enabled).sort((a,b)=>a.id-b.id)[0];
    if(!free)throw Error(this.s.encoderError||'All licensed encoder slots are already assigned');
    encoder=free.id;
   }
   const p=this.s.demo?{'0':{name:'Demo H.264'},'1':{name:'Demo HEVC'}}:await this.mutate(()=>this.extra.config('encoderProfile'));
   for(const [id,r]of Object.entries(p))if(/^\d+$/.test(id)&&r&&typeof r==='object')items.push({title:'ENC '+encoder+'\n'+(r.name||'Profile '+id),command:{type:c.kind,encoder,profile:id}});
  }
  if(c.kind==='outputAdd'){
   if(!this.s.demo)await this.mutate(async()=>{this.s.data=await this.client.handle({type:'snapshot'});});
   for(const p of ipProfiles(this.s.data))items.push({title:p.type+'\n'+p.name,command:{type:'outputAdd',key:p.key}});
  }
  if(c.kind==='shutterUnits')for(const [unit,title]of [['denominator','1 / denominator'],['seconds','Seconds'],['microseconds','Microseconds']])items.push({title,active:unit===this.s.camera.profile.shutterUnit,command:{type:'shutterUnits',unit}});
  if(c.kind==='camera')for(const name of this.s.camera?.cameras.names||[])items.push({title:name,active:name===this.s.camera.settings.camera,command:{type:'camera',camera:name}});
  this.push('pick');this.s.picker={kind:c.kind,items,readiness:'READY',...(c.kind==='multiviewRoute'?{group:require('./outputs').supportedGroups(this.s)[0],selectedKeys:[],encoder:null}:{}),...(c.kind==='route'?{input:c.input,uid:c.uid,selectedKeys:[],group:require('./outputs').supportedGroups(this.s)[0]}:{})};this.emit();
 }
 async choose(item){
  const c=item.command;if(item.disabled)return;
  if(c.type==='encoderOutput'){await this.mutate(async()=>{if(this.s.demo){const o=this.s.data.outputs.find(o=>o.key===c.key);o.source=null;o.encoder=c.encoder;return;}this.s.data=await this.client.handle({type:'snapshot',fresh:true});const o=this.s.data.outputs.find(o=>o.key===c.key);if(!o||o.locked||!o.powerAvailable)throw Error('Output unavailable');const config=await this.extra.config(o.root),row=config[o.configIndex];if(!row||!('encoderIndex'in row))throw Error('This output does not expose an encoder source');if(this.native?.verified)await this.native.setConfigRows(o.root,[o.configIndex],{channelIndex:-1,encoderIndex:c.encoder-1},this.extra);else await this.extra.outputEncoder(o,c.encoder);this.s.data=await this.client.handle({type:'snapshot',fresh:true});});this.back();return;}
  if(c.type==='routeEncoder'){
   this.back();const p=this.s.picker;if(p?.kind!=='route')throw Error('Routing closed');p.encoder=c.encoder;p.selectedKeys=[];delete p.activationKeys;delete p.liveKeys;p.decision=false;
   if(p.encoder&&p.group==='NDI')p.group=require('./outputs').supportedGroups(this.s).find(group=>group!=='NDI');this.s.page=0;this.emit();return;
  }
  if(c.type==='multiviewRouteSelect'){
   const p=this.s.picker,o=this.s.data.outputs.find(o=>o.key===c.key);
   if(p?.kind!=='multiviewRoute'||!o||o.locked||!o.powerAvailable||outputGroup(o)==='IP'&&!p.encoder)throw Error('Output unavailable');
   if(outputGroup(o)==='IP'?o.encoder===p.encoder&&this.s.encoders.some(e=>e.id===p.encoder&&e.input===33):o.source===33)return;
   p.selectedKeys=p.selectedKeys.includes(c.key)?p.selectedKeys.filter(key=>key!==c.key):[...p.selectedKeys,c.key];this.emit();return;
  }
  if(c.type==='multiviewEncoder'){
   this.back();if(this.s.picker?.kind!=='multiviewRoute')throw Error('Multiview routing closed');this.s.picker.encoder=c.encoder;this.s.picker.selectedKeys=this.s.picker.selectedKeys.filter(key=>outputGroup(this.s.data.outputs.find(o=>o.key===key))!=='IP');this.emit();return;
  }
  if(c.type==='multiviewInput'){await this.changeMultiview({kind:'cell',cell:c.cell,input:c.input,uid:c.uid,expected:c.expected});this.back();return;}
  if(c.type==='route'){
   const picker=this.s.picker;if(this.s.view!=='pick'||picker?.kind!=='route')throw Error('Open ROUTE TO OUTPUT first');
   const output=this.s.data.outputs.find(o=>o.key===c.key);if(picker.encoder&&outputGroup(output)==='NDI')return;if(picker.encoder?output?.encoder===picker.encoder&&this.s.encoders.some(e=>e.id===picker.encoder&&e.input===picker.input):output?.source===picker.input&&!output.encoder)return;
   if(!picker.items.some(entry=>entry.command?.key===c.key&&!entry.disabled))throw Error('Output unavailable');
   picker.selectedKeys=picker.selectedKeys.includes(c.key)?picker.selectedKeys.filter(key=>key!==c.key):[...picker.selectedKeys,c.key];this.emit();return;
  }
  if(c.type==='liveProfile'){
   const input=this.checkInput(c.input,c.uid);
   if(this.s.view!=='pick'||this.s.picker?.kind!=='liveProfile'||!this.s.picker.items.some(p=>p.command.profile===c.profile&&p.command.uid===c.uid&&p.command.instance===c.instance))throw Error('Reopen LIVE PROFILE before selecting a preset');
   if(this.s.demo){if(!input.liveProfiles?.some(p=>p.id===c.profile))throw Error('Profile unavailable');input.liveProfileId=c.profile;}
   else await this.mutate(async()=>{await this.native.setLiveProfile(c.input,c.uid,c.profile,c.instance);this.applyChannelDetails();});
   this.back();return;
  }
  if(c.type==='copyLink'){
   const revision=this.revision;
   await this.mutate(async()=>{
    if(!this.s.demo){await this.syncNetwork();this.s.data=await this.client.handle({type:'snapshot',fresh:true});}
    const row=c.asset==='input'?this.checkInput(c.input,c.uid):this.s.data.outputs.find(o=>o.key===c.key&&o.type==='IP');
    if(!row?.canCopyLink||!row.links?.some(link=>link.url===c.url))throw Error('Stream link changed; reopen COPY LINK');
    await this.copyText(c.url,{signal:this.abortController.signal});
    if(this.disposed||this.revision!==revision)return;const picker=this.s.picker;picker.copied=c.url;clearTimeout(this.copiedTimer);this.copiedTimer=setTimeout(()=>{if(this.disposed||this.revision!==revision||picker.copied!==c.url)return;delete picker.copied;if(this.s.picker===picker&&this.s.view==='pick')this.emit();},2000);this.copiedTimer.unref?.();
   });this.emit();return;
  }
  if(this.s.demo){
   if(c.type==='videoReturn'){const i=this.checkInput(c.input,c.uid);i.returnEncoder=c.kind==='encoder'?c.target:null;i.returnSource=c.kind==='input'?c.target:null;}
   else if(c.type==='shutterUnits'){this.s.camera.profile.shutterUnit=c.unit;this.demoCamera.profile.shutterUnit=c.unit;}
   else if(c.type==='camera'){this.s.camera.settings.camera=c.camera;this.demoCamera.settings.camera=c.camera;}
   else if(c.type==='route'||c.type==='outputInput'){const o=this.s.data.outputs.find(o=>o.key===c.key);o.source=c.input;}
   else if(c.type==='encoderInput')this.s.encoders.find(e=>e.id===c.encoder).input=c.input;
   else if(c.type==='encoderProfile'||c.type==='encoderAdd'){const e=this.s.encoders.find(e=>e.id===c.encoder);e.profile=c.profile;e.name='Demo profile '+c.profile;}
  else if(c.type==='outputAdd'){
    const p=this.s.data.outputProfiles.find(p=>p.key===c.key);if(!p||p.present)throw Error('Output profile unavailable');
    p.present=true;this.s.data.outputs.push({key:p.key,type:p.type,id:Number(p.index),name:p.name,source:null,enabled:false,powerAvailable:true,locked:false,ejectAvailable:true});
   }
  }else await this.mutate(async()=>{
   if(c.uid)this.checkInput(c.input,c.uid);
   if(c.type==='videoReturn'){await this.native.videoReturn(c.input,c.uid,c.kind,c.target,this.extra,c.sourceUID);this.applyDeviceRecording();return;}
   if(c.type==='shutterUnits'){this.s.camera=await this.client.handle({type:'cameraProfile',input:this.s.selected.id,unit:c.unit});return;}
   if(c.type==='camera'){this.s.camera=await this.client.handle({type:'mojoSet',input:this.s.selected.id,camera:c.camera});return;}
   if(c.type==='route'||c.type==='outputInput')return this.client.handle({type:'route',input:c.input,keys:[c.key],assignOnly:true,expectedUID:c.uid});
   if(c.type==='inputProfile')return this.client.handle({type:'assignPreset',input:c.input,preset:c.preset});
   if(c.type==='encoderInput'){const source=c.multiview?(this.s.multiviewAvailable?{type:'MULTIVIEW'}:null):this.checkInput(c.input,c.uid);await this.extra.input(c.encoder,c.input,source);await this.readEncoders();return;}
   if(c.type==='encoderProfile'||c.type==='encoderAdd'){await this.extra.profile(c.encoder,c.profile,{add:c.type==='encoderAdd'});await this.readEncoders();return;}
   if(c.type==='outputAdd')return this.client.handle({type:'outputAdd',key:c.key});
  });
  if(this.s.demo)this.syncDemoOutputs();this.back();
 }
 async applyMultiviewRoutes(goLive){
  const p=this.s.picker;if(p?.kind!=='multiviewRoute')return;
  const keys=[...p.selectedKeys],all=p.activationKeys||keys;if(!all.length)return;
  if(goLive)p.activationKeys=[...all];
  await this.mutate(async()=>{
   const targets=keys.map(key=>this.s.data.outputs.find(o=>o.key===key));if(targets.some(o=>!o||o.locked||!o.powerAvailable))throw Error('Output changed; review the selection');
   if(targets.some(o=>outputGroup(o)==='IP')&&!p.encoder)throw Error('Select an encoder for IP routing');
   if(this.s.demo){
    if(targets.some(o=>outputGroup(o)==='IP')){const enc=this.s.encoders.find(e=>e.id===p.encoder);if(!enc||enc.enabled&&enc.input!==33)throw Error('Stop the encoder first');enc.input=33;}
    for(const o of targets){if(outputGroup(o)==='IP'){o.source=null;o.encoder=p.encoder;}else{o.source=33;o.encoder=null;}}p.selectedKeys=[];
   }else if(targets.length)await this.native.routeMultiview(targets,p.encoder,this.extra,confirmed=>{p.selectedKeys=p.selectedKeys.filter(key=>!confirmed.includes(key));});
   if(goLive){
    if(this.s.demo){this.s.multiview.enabled=true;if(all.some(key=>outputGroup(this.s.data.outputs.find(o=>o.key===key))==='IP'))this.s.encoders.find(e=>e.id===p.encoder).enabled=true;for(const key of all)this.s.data.outputs.find(o=>o.key===key).enabled=true;p.activationKeys=[];}
    else{
     this.s.data=await this.client.handle({type:'snapshot',fresh:true});
     for(const key of all){const o=this.s.data.outputs.find(o=>o.key===key);if(!o||o.locked||(outputGroup(o)==='IP'?o.encoder!==p.encoder:o.source!==33))throw Error('Multiview routing changed; GO LIVE stopped');}
     this.s.multiview=await this.native.setMultiview({kind:'power',enabled:true},this.extra);
     if(all.some(key=>outputGroup(this.s.data.outputs.find(o=>o.key===key))==='IP')){const slot=await this.extra.slot(p.encoder);if(Number(slot.inputIndex)!==32)throw Error('Encoder source changed');const codec=String(this.extra.profiles[slot.encoderProfileId]?.encoderVideoType||'').replace(/[^a-z0-9]/gi,'');if(/passthrough/i.test(codec))throw Error('Multiview cannot use a passthrough profile');await this.extra.power(p.encoder,true);await this.readEncoders();}
     for(const key of [...p.activationKeys]){const o=this.s.data.outputs.find(o=>o.key===key);await this.native.setConfigRows(o.root,[o.configIndex],{enable:true},this.extra);p.activationKeys=p.activationKeys.filter(k=>k!==key);}
    }
   }
   if(!this.s.demo)this.s.data=await this.client.handle({type:'snapshot',fresh:true});
  });this.back();
 }
 async confirmRoutes(goLive=false){
  const picker=this.s.picker;if(this.s.view!=='pick'||picker?.kind!=='route'||!picker.selectedKeys.length&&!picker.activationKeys?.length)return;
  if(picker.encoder)return this.confirmEncodedRoutes(picker,goLive);
  let keys=[...picker.selectedKeys],allKeys=[...(picker.activationKeys||picker.liveKeys||keys)];const input=this.checkInput(picker.input,picker.uid);if(goLive&&!this.inputPowerAvailable(input))throw Error('Input cannot go live; connect a source or assign an IP profile first');if(goLive)picker.liveKeys=[...allKeys];
  if(this.s.demo){
   const rows=keys.map(key=>this.s.data.outputs.find(o=>o.key===key));if(rows.some(o=>!o||o.locked||!o.powerAvailable))throw Error('Output unavailable or locked');
   for(const o of rows){o.source=picker.input;if(goLive)o.enabled=true;}if(goLive){const i=this.checkInput(picker.input,picker.uid);i.enabled=true;i.status=2;}this.syncDemoOutputs();this.back();return;
  }
  await this.mutate(async()=>{
   this.s.data=await this.client.handle({type:'snapshot',fresh:true});this.checkInput(picker.input,picker.uid);
   keys=keys.filter(key=>this.s.data.outputs.find(o=>o.key===key)?.source!==picker.input);picker.selectedKeys=[...keys];if(!keys.length){if(goLive)await this.activateRoutes(picker,allKeys);return;}
   if(keys.some(key=>!this.s.data.outputs.some(o=>o.key===key&&!o.locked&&o.powerAvailable)))throw Error('An output changed; review the selection before confirming');
   const result=await this.client.handle({type:'route',input:picker.input,keys,assignOnly:true,expectedUID:picker.uid});
   if(result.snapshot)this.s.data=result.snapshot;
   const successes=new Set((result.results||[]).filter(r=>r.ok).map(r=>r.key));
   picker.selectedKeys=keys.filter(key=>!successes.has(key));
   const failures=(result.results||[]).filter(r=>!r.ok);
   if(failures.length||picker.selectedKeys.length)throw Error(successes.size+' of '+keys.length+' assigned. '+(failures.map(r=>r.message).join('; ')||'StreamHub did not confirm all assignments'));
   if(goLive)await this.activateRoutes(picker,allKeys);
  });
  this.back();
 }
 async confirmEncodedRoutes(picker,goLive){
  const keys=[...(picker.activationKeys||picker.selectedKeys)],input=this.checkInput(picker.input,picker.uid);
  if(goLive&&!this.inputPowerAvailable(input))throw Error('Input unavailable for GO LIVE');
  await this.mutate(async()=>{
   if(!this.s.demo){this.s.data=await this.client.handle({type:'snapshot',fresh:true});this.checkInput(picker.input,picker.uid);await this.readEncoders();}
   const enc=this.s.encoders.find(e=>e.id===picker.encoder&&e.profile!=='-1'),outputs=keys.map(key=>this.s.data.outputs.find(o=>o.key===key));
   if(!enc||outputs.some(o=>!o||o.type==='NDI'||o.locked||!o.powerAvailable))throw Error('Encoder or output changed; review routing');
   if(!this.s.demo)for(const o of outputs){const config=await this.extra.config(o.root);if(!config[o.configIndex]||!('encoderIndex'in config[o.configIndex]))throw Error('This output does not expose an encoder source');}
   if(this.s.demo){enc.input=picker.input;for(const o of outputs){o.source=null;o.encoder=enc.id;}if(goLive){input.enabled=true;input.status=2;enc.enabled=true;for(const o of outputs)o.enabled=true;}}
   else{
    await this.extra.input(enc.id,picker.input,this.checkInput(picker.input,picker.uid));
    for(const o of outputs){if(this.native?.verified)await this.native.setConfigRows(o.root,[o.configIndex],{channelIndex:-1,encoderIndex:enc.id-1},this.extra);else await this.extra.outputEncoder(o,enc.id);}
    if(goLive){picker.activationKeys=[...keys];this.s.data=await this.client.handle({type:'snapshot',fresh:true});const current=this.checkInput(picker.input,picker.uid);const slot=await this.extra.slot(enc.id);if(Number(slot.inputIndex)!==picker.input-1||keys.some(key=>!this.s.data.outputs.some(o=>o.key===key&&o.encoder===enc.id&&!o.locked)))throw Error('Routing changed; GO LIVE stopped');
     if(!current.enabled)await this.client.handle({type:'inputPower',input:current.id,expectedUID:current.uid,action:'enable'});
     await this.extra.power(enc.id,true);
     for(const o of outputs){await this.extra.set(o.root,o.configIndex,'enable',true);picker.activationKeys=picker.activationKeys.filter(key=>key!==o.key);}
    }
    this.s.data=await this.client.handle({type:'snapshot',fresh:true});await this.readEncoders();
   }
  });this.back();
 }
 inputPowerAvailable(i){return !!i&&(!!i.canLive||Number.isInteger(i.protocolId)&&i.protocolId>=0||this.s.demo&&i.connected);}
 async activateRoutes(picker,keys){
  picker.activationKeys=[...keys];
  this.s.data=await this.client.handle({type:'snapshot',fresh:true});
  const input=this.checkInput(picker.input,picker.uid);
  if(!this.inputPowerAvailable(input))throw Error('Input is no longer available for GO LIVE');
  if(keys.some(key=>!this.s.data.outputs.some(o=>o.key===key&&o.source===picker.input&&!o.locked&&o.powerAvailable)))throw Error('An output assignment changed; GO LIVE stopped');
  if(!input.enabled){const result=await this.client.handle({type:'inputPower',input:input.id,expectedUID:input.uid,action:'enable'});if(result.snapshot)this.s.data=result.snapshot;}
  for(const key of keys){
   const o=this.s.data.outputs.find(o=>o.key===key);
   if(!o.enabled){const result=await this.client.handle({type:'outputControl',keys:[key],action:'enable'});if(result.snapshot)this.s.data=result.snapshot;const status=result.results?.find(r=>r.key===key);if(!status?.ok)throw Error(status?.message||'Output GO LIVE was not confirmed');}
   picker.activationKeys=picker.activationKeys.filter(k=>k!==key);
  }
 }
 async applyEncoderBulk(){
  const bulk=this.s.encoderBulk;if(!bulk?.items.length)return;const initial=[...bulk.items];let completed=0;
  await this.mutate(async()=>{
   if(!this.s.demo){await this.readEncoders();if(this.s.encoderError)throw Error(this.s.encoderError);}
   const plans=initial.map(item=>{const e=this.s.encoders.find(e=>e.id===item.id&&e.profile===item.profile&&e.profile!=='-1');if(!e)throw Error('An encoder profile changed; review the selection');return {...item,enabled:!e.enabled};});
   try{for(const plan of plans){if(this.s.demo){const e=this.s.encoders.find(e=>e.id===plan.id);e.enabled=plan.enabled;e.status=plan.enabled?2:0;}else{const slot=await this.extra.slot(plan.id);if(String(slot.encoderProfileId)!==plan.profile)throw Error('Encoder profile changed');await this.extra.power(plan.id,plan.enabled);}completed++;bulk.items=initial.slice(completed);}
   }catch(error){throw Error(completed+' of '+initial.length+' encoders updated. '+error.message);}finally{if(!this.s.demo)await this.readEncoders();}
  });this.s.encoderBulk=null;this.emit();
 }
 async applyInputBulk(){
  const bulk=this.s.inputBulk;if(!bulk?.items.length)return;let completed=0;const initial=[...bulk.items];
  await this.mutate(async()=>{
   if(!this.s.demo)this.s.data=await this.client.handle({type:'snapshot',fresh:true});
   const plans=initial.map(item=>{const i=this.checkInput(item.id,item.uid);if(!this.inputPowerAvailable(i))throw Error('An input changed; review the selection');return {...item,enabled:!i.enabled};});
   try{for(const plan of plans){
    if(this.s.demo){const i=this.checkInput(plan.id,plan.uid);i.enabled=plan.enabled;i.status=plan.enabled?2:0;}
    else {const result=await this.client.handle({type:'inputPower',input:plan.id,expectedUID:plan.uid,action:plan.enabled?'enable':'disable'});if(result.snapshot)this.s.data=result.snapshot;}
    completed++;bulk.items=initial.slice(completed);
   }}catch(error){throw Error(completed+' of '+initial.length+' inputs updated. '+error.message);}
  });this.s.inputBulk=null;this.s.encoderBulk=null;this.emit();
 }
 async applyOutputBulk(){
  const bulk=this.s.outputBulk;if(!bulk?.keys.length)return;
  const initial=[...bulk.keys];let completed=0;
  await this.mutate(async()=>{
   if(!this.s.demo)this.s.data=await this.client.handle({type:'snapshot',fresh:true});
   const plans=initial.map(key=>{const o=this.s.data.outputs.find(o=>o.key===key);if(!o||o.locked||!o.powerAvailable)throw Error('An output changed; review the selection before applying');return {key,wasEnabled:o.enabled,enabled:!o.enabled};});
   try{
    if(!this.s.demo&&bulk.mode==='unassign'&&this.native?.verified){
     const confirmed=new Set();
     await this.native.unassignOutputs(plans.map(plan=>this.s.data.outputs.find(o=>o.key===plan.key)),this.extra,keys=>{for(const key of keys)confirmed.add(key);completed=confirmed.size;bulk.keys=initial.filter(key=>!confirmed.has(key));});
     this.s.data=await this.client.handle({type:'snapshot',fresh:true});return;
    }
    for(const plan of plans){
     if(this.s.demo){const o=this.s.data.outputs.find(o=>o.key===plan.key);if(bulk.mode==='unassign'){o.source=null;o.encoder=null;}else o.enabled=plan.enabled;this.syncDemoOutputs();}
     else{
      const result=await this.client.handle({type:'outputControl',keys:[plan.key],action:bulk.mode==='unassign'?'unassign':plan.enabled?'enable':'disable',expectedEnabled:bulk.mode==='toggle'?plan.wasEnabled:undefined});
      if(result.snapshot)this.s.data=result.snapshot;
      const status=result.results?.find(r=>r.key===plan.key);
      if(!status?.ok)throw Error(status?.message||'StreamHub did not confirm the output command');
     }
     completed++;bulk.keys=initial.slice(completed);
    }
   }catch(error){throw Error(completed+' of '+initial.length+' outputs updated. '+error.message);}
  });
  this.s.outputBulk=null;this.s.inputBulk=null;this.s.encoderBulk=null;this.emit();
 }
 async bulkEject(confirmed=false){
 const commands=[...(this.s.bulk||[])];if(!commands.length)return;
 if(!this.s.demo){await this.refresh();if(!this.s.online)throw Error('Refresh failed; no items ejected');if(commands.some(c=>c.type==='ejectEncoder'))await this.readEncoders();}
 for(const group of ['SDI','NDI']){
  const all=this.s.data.outputs.filter(o=>outputGroup(o)===group).sort((a,b)=>channel(b)-channel(a));
  const chosen=commands.filter(c=>c.type==='ejectOutput'&&all.some(o=>o.key===c.key)),selected=new Set(chosen.map(c=>c.key));
  if(chosen.length&&all.slice(0,chosen.length).some(o=>!selected.has(o.key)))throw Error('Select the last '+chosen.length+' '+group+' channels, including the highest channel');
 }
 const live=commands.filter(c=>require('./bulk').isActive(this.s,c));
 const signature=JSON.stringify({commands,live});
 if(live.length&&(!confirmed||this.s.bulkConfirm!==signature)){this.s.bulkConfirm=signature;this.emit();return;}
 commands.sort((a,b)=>{
  if(a.type!=='ejectOutput'||b.type!=='ejectOutput')return (a.type==='ejectOutput'?0:1)-(b.type==='ejectOutput'?0:1);
  const x=this.s.data.outputs.find(o=>o.key===a.key),y=this.s.data.outputs.find(o=>o.key===b.key);
  return (channel(y)||0)-(channel(x)||0);
 });
 let completed=0;this.s.bulkConfirm=null;
 try{for(const command of commands){await this.execute(command);completed++;this.s.bulk=commands.slice(completed);}}
 catch(error){this.s.bulk=commands.slice(completed);this.emit();throw Error(completed+' of '+commands.length+' ejected: '+error.message);}
 this.s.bulk=null;this.emit();
}
 async cycleAsset(delta){
 const {assets,sameAsset}=require('./assets'),items=assets(this.s);if(items.length<2)return;
 const index=items.findIndex(item=>sameAsset(item,this.s.selected));
 if(index<0)throw Error('Selected asset is unavailable');
 const next=items[(index+delta+items.length)%items.length],view=this.s.view;
 this.s.selected=next;this.s.preview=null;this.s.program=null;this.s.programIndex=0;this.cameraSentAt.clear();this.cameraPending.clear();
 this.native?.selectInput(['input','mojo'].includes(view)?next.id:null);
 if(view==='mojo'){
  this.s.camera=null;this.emit();
  if(this.s.demo)this.s.camera=structuredClone(this.demoCamera);
  else await this.mutate(async()=>{const camera=await this.client.handle({type:'mojoGet',input:next.id});if(camera.deviceUID!==next.uid)throw Error('Camera identity changed');this.s.camera=camera;});
 }
 this.applyDeviceRecording();this.useNativePreview();this.updateProgram();this.emit();
}
 updateProgram(){
 if(this.s.view!=='mojo'){this.s.program=null;return;}
 const source=this.s.data.inputs.find(i=>i.id===this.s.selected?.id&&i.uid===this.s.selected?.uid);
 if(!source){this.s.program=null;return;}
 const routes=this.s.data.outputs.filter(o=>o.source===source.id||o.encoder&&this.s.encoders.some(e=>e.id===o.encoder&&e.input===source.id));
 this.s.program=routes.length?{live:source.connected&&source.status===2&&routes.some(o=>o.enabled&&(o.source===source.id||this.s.encoders.some(e=>e.id===o.encoder&&e.input===source.id&&e.enabled))),selection:this.previewSelection()}:null;
}
 async cameraCommand(c){
 const input=this.s.selected;this.checkInput(input.id,input.uid);
 if(!this.s.camera)throw Error('Camera values unavailable');
 const camera=this.s.camera,p=c.param,row=camera.settings[p]||{},previous=structuredClone(row);
 let patch;
 if(c.type==='adjust'){
  const auto=String(row[p+'Mode']||'').toLowerCase()==='auto',manual=(row[p+'Modes']||[]).find(m=>/^(manual|off|locked)$/i.test(String(m)));
  if(auto&&!manual)throw Error('This camera does not report a manual mode for '+p);
  const needsManual=manual!==undefined&&row[p+'Mode']!==manual;
  const candidate=needsManual?{...camera,settings:{...camera.settings,[p]:{...row,[p+'Mode']:manual}}}:camera;
  const value=step(candidate,p,c.delta);if(value===row[p]&&!needsManual)return;
  patch={[p]:{[p]:value,...(needsManual?{[p+'Mode']:manual}:{})}};
 }else if(['Zoom','AudioGain'].includes(p)){
  const bounds=RCP.bounds(p,row,camera.profile),value=p==='Zoom'?bounds?.[0]:0;
  if(!bounds||!Number.isFinite(row[p])||!Number.isFinite(value)||value<bounds[0]||value>bounds[1])throw Error('Reset value unavailable for '+p);
  const manual=(row[p+'Modes']||[]).find(m=>/^(manual|off|locked)$/i.test(String(m)));
  if(String(row[p+'Mode']||'').toLowerCase()==='auto'&&manual===undefined)throw Error('Manual mode unavailable for '+p);
  patch={[p]:{[p]:RCP.toApi(p,value,camera.profile),...(manual!==undefined?{[p+'Mode']:manual}:{})}};
 }else{
  const modes=RCP.modes(p,row);if(!Array.isArray(modes)||modes.length<2)throw Error('Modes unavailable');
  patch={[p]:{[p+'Mode']:modes[(modes.indexOf(row[p+'Mode'])+1)%modes.length]}};
 }
 Object.assign(row,patch[p]);this.cameraPending.set(p,{...patch[p]});this.cameraSentAt.set(p,Date.now());this.emit();
 if(this.s.demo){this.demoCamera=structuredClone(camera);return;}
 try{
  await this.mutate(async()=>{
   await this.client.handle({type:'mojoSet',input:input.id,expectedUID:input.uid,patch});
   this.cameraSentAt.set(p,Date.now());
  });
 }catch(error){Object.assign(row,previous);this.cameraSentAt.delete(p);this.cameraPending.delete(p);this.emit();throw error;}
}
}
module.exports={Engine};
