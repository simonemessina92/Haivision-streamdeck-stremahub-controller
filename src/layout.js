'use strict';
const RCP=require('./rcp');
const {diagnostic,chunks}=require('./diagnostics');
const {GROUPS,rows,canEjectOutput,nextOutputProfile,ipProfiles,supportedGroups}=require('./outputs');
const COLORS={tab:'#4c9dff',nav:'#ba9cff',action:'#39d4db',add:'#78df75',on:'#64df96',record:'#ff687f',danger:'#ff6969',info:'#d5dce5',muted:'#9aa6b4',warning:'#ffc266'};
const SECTIONS=['INPUT','OUTPUT','ENCODERS','MOJO PRO'];
const CAMERA_PAGES=[['WB','ISO','ShutterSpeed'],['Zoom','Focus','AudioGain']];
const PARAMS=CAMERA_PAGES.flat();
const LABELS={WB:'WB',ISO:'ISO',ShutterSpeed:'SHUTTER',Focus:'FOCUS',Zoom:'ZOOM',AudioGain:'AUDIO'};
const key=(title,command=null,color=COLORS.info,extra={})=>({title,command,color,...extra});
const status=i=>diagnostic(i)?.label||(i.status===2?'LIVE':i.connected?'READY':'OFFLINE');
function layout(s){
 const a=Array.from({length:32},()=>key('',null,'#000000',{blank:true}));
 const activeSection={input:'INPUT',output:'OUTPUT',encoder:'ENCODERS',mojo:'MOJO PRO',diagnostic:s.selected?.asset==='output'?'OUTPUT':'INPUT'}[s.view]||s.section;
 SECTIONS.forEach((title,i)=>a[i]=key(title==='INPUT'?'INPUTS':title==='OUTPUT'?'OUTPUTS':title,{type:'section',section:title},COLORS.tab,{active:activeSection===title,kind:'tab'}));
 // BACK and connection status stay in the top row; asset arrows sit beside detail controls.
 if(s.view!=='list')a[4]=key('BACK',{type:'back'},COLORS.nav,{glyph:'back'});
 a[7]=key((s.connectionName?String(s.connectionName).slice(0,36)+'\n':'')+(s.demo?'DEMO':s.online?'ONLINE':'OFFLINE'),{type:'refresh'},s.demo?COLORS.warning:s.online?COLORS.on:COLORS.danger,{kind:'status'});
 const header=(title,subtitle='')=>{a[8]=key(title,null,COLORS.info,{kind:'heading'});if(subtitle)a[9]=key(subtitle,null,COLORS.muted,{kind:'heading'});};
 const list=(items,make,empty='NO ITEMS',add=null)=>{
  const entries=add?[...items,{addTile:true}]:items;
  const pages=Math.max(1,Math.ceil(entries.length/16));s.page=Math.max(0,Math.min(s.page,pages-1));
  if(pages>1)a[6]=key('PAGE\n'+(s.page+1)+' / '+pages,{type:'page',pages},COLORS.nav);
  entries.slice(s.page*16,s.page*16+16).forEach((item,n)=>a[16+n]=item.addTile?add:make(item));
  if(!entries.length)a[16]=key(empty,null,COLORS.muted,{kind:'heading'});
 };
 if(!s.online&&s.view!=='mojo'){header('SETUP\nCONNECTION');if(s.error)a[16]=key('CONNECTION\nFAILED',null,COLORS.danger);return a;}
 if(s.view==='list'){
  if(s.section==='INPUT'||s.section==='MOJO PRO'){
   const rows=s.data.inputs.filter(i=>s.section==='INPUT'||i.isMojo&&i.connected);
   a[8]=key(rows.length+' SOURCES',null,COLORS.muted,{kind:'heading'});
   list(rows,i=>key(''+i.id+'\n'+i.name+'\n'+status(i),{type:s.section==='MOJO PRO'?'mojo':'input',id:i.id,uid:i.uid},i.errorCode<0?COLORS.danger:i.status===2?COLORS.danger:i.connected?COLORS.on:COLORS.muted,{kind:'asset',stateLabel:status(i),stateColor:i.status===2?COLORS.danger:i.connected?COLORS.on:COLORS.muted}),'NO SOURCES');
  }else if(s.section==='OUTPUT'){
   const groups=supportedGroups(s),group=groups.includes(s.outputGroup)?s.outputGroup:groups[0];s.outputGroup=group;const items=rows(s.data,group);
   a[8]=key(items.length+' ASSIGNED',null,COLORS.muted,{kind:'heading'});
   groups.forEach((title,n)=>a[9+n]=key(title,{type:'outputGroup',group:title},COLORS.nav,{kind:'tab',active:group===title}));
   const available=group==='IP'?ipProfiles(s.data).length:!!nextOutputProfile(s.data,group);
   const add=available?key('+',{type:'addOutput',group},'#ffffff',{kind:'add',glyph:'plus'}):null;
   list(items,o=>key(o.type+' '+o.id+'\n'+o.name+'\n'+(o.locked?'LOCKED':o.enabled?'ON':'OFF'),{type:'output',key:o.key},o.locked?COLORS.warning:o.enabled?COLORS.on:COLORS.info,{kind:'asset'}),'NO '+group+' OUTPUTS',add);
  }else{
   const rows=s.encoders.filter(e=>e.profile!=='-1');
   a[8]=key(rows.length+' / '+(s.encoderCapacity??'?')+' ASSIGNED',null,COLORS.muted,{kind:'heading'});
   const free=s.encoders.filter(e=>e.profile==='-1'&&!e.enabled);
   const add=!s.encoderError&&free.length?key('+',{type:'pick',kind:'encoderAdd'},'#ffffff',{kind:'add',glyph:'plus'}):null;
   list(rows,e=>key('ENC '+e.id+'\n'+e.name+'\n'+(e.status===2?'LIVE':e.enabled?'ON':'OFF'),{type:'encoder',id:e.id},e.enabled?COLORS.on:COLORS.info,{kind:'asset'}),s.encoderError?'ENCODER API\nUNAVAILABLE':'NO ENCODERS',add);
  }
 }else if(s.view==='input'){
  const i=s.data.inputs.find(i=>i.id===s.selected.id&&i.uid===s.selected.uid);
  if(!i){header('SOURCE','CHANGED');return a;}
  header(''+i.id+'\n'+i.name,status(i));a[9].color=i.status===2?COLORS.danger:i.connected?COLORS.on:COLORS.muted;
  a[16]=key(i.enabled?'STOP':'GO LIVE',{type:'power',id:i.id,uid:i.uid,enabled:!i.enabled},i.enabled?COLORS.danger:COLORS.on,{disabled:!i.canPower,glyph:i.enabled?'stop':'play'});
  a[18]=key('UNIT REC\n'+(!i.connected?'OFFLINE':typeof i.deviceRecording!=='boolean'?/login/i.test(s.previewStatus||'')?'LOGIN':'READING':i.deviceRecording?'ON':'OFF'),{type:'record',id:i.id,uid:i.uid,endpoint:'record',enabled:!i.deviceRecording},i.deviceRecording===true?COLORS.record:COLORS.action,{disabled:!i.connected||typeof i.deviceRecording!=='boolean',active:i.deviceRecording===true,icon:'Record'});
  a[19]=key('HUB REC\n'+([2,4].includes(i.recorderStatus)?'ON':'OFF'),{type:'record',id:i.id,uid:i.uid,endpoint:'streamhubRecord',enabled:![2,4].includes(i.recorderStatus)},[2,4].includes(i.recorderStatus)?COLORS.record:COLORS.action,{disabled:!Number.isFinite(i.recorderStatus)||i.recorderStatus===0||(!i.connected&&i.protocolId<0),active:[2,4].includes(i.recorderStatus),icon:'Record'});
  a[21]=key('ROUTE TO\nOUTPUT',{type:'pick',kind:'route',input:i.id,uid:i.uid},COLORS.nav,{glyph:'route'});
  a[22]=key('IP PROFILE',{type:'pick',kind:'inputProfile',input:i.id,uid:i.uid},COLORS.action,{disabled:i.canLive&&i.connected});
  if(i.canCopyLink)a[28]=key('COPY LINK',{type:'pick',kind:'copyLink',asset:'input',input:i.id,uid:i.uid},COLORS.nav,{icon:'Link'});
  if(i.intercomAvailable)a[26]=key('INTERCOM\n'+(i.intercom?'ON':'OFF'),{type:'intercom',id:i.id,uid:i.uid,enabled:!i.intercom},COLORS.tab,{icon:'Intercom',active:i.intercom===true,disabled:!i.connected||typeof i.intercom!=='boolean'});
  if(i.returnCapability)a[27]=key('VIDEO RETURN\n'+(i.returnEncoder?'ENC '+i.returnEncoder:i.returnSource?'SOURCE '+i.returnSource:'OFF'),{type:'pick',kind:'videoReturn',input:i.id,uid:i.uid},'#ffa64d',{icon:'VideoReturn',active:!!(i.returnEncoder||i.returnSource),disabled:!i.connected});
  if(i.isMojo)a[24]=key('CAMERA\nCONTROLS',{type:'mojo',id:i.id,uid:i.uid},COLORS.action);
  a[31]=key('EJECT',{type:'ejectInput',id:i.id,uid:i.uid},COLORS.danger,{disabled:!i.canEject,glyph:'eject'});
 }else if(s.view==='output'){
  const o=s.data.outputs.find(o=>o.key===s.selected.key);
  if(!o){header('OUTPUT','UNAVAILABLE');return a;}
  header(o.type+' '+o.id+'\n'+o.name,o.locked?'LOCKED':o.enabled?'ON':'OFF');
  a[16]=key(o.enabled?'TURN OFF':'TURN ON',{type:'outputPower',key:o.key,enabled:!o.enabled},o.enabled?COLORS.danger:COLORS.on,{disabled:o.locked||!o.powerAvailable,glyph:o.enabled?'stop':'play'});
  a[19]=key('SELECT\nINPUT',{type:'pick',kind:'outputInput',key:o.key},COLORS.nav,{disabled:o.locked||!o.powerAvailable,glyph:'route'});
  if(o.type==='IP'&&o.canCopyLink)a[26]=key('COPY LINK',{type:'pick',kind:'copyLink',asset:'output',key:o.key},COLORS.nav,{icon:'Link'});
  a[20]=key('SOURCE\n'+(o.source?'IN '+o.source:o.encoder?'ENC '+o.encoder:'NONE'),null,COLORS.info,{kind:'heading'});
  a[31]=key('EJECT',{type:'ejectOutput',key:o.key},COLORS.danger,{disabled:o.locked||!o.powerAvailable||!canEjectOutput(s.data,o),glyph:'eject'});
 }else if(s.view==='encoder'){
  const e=s.encoders.find(e=>e.id===s.selected.id&&e.profile!=='-1');
  if(!e){header('ENCODER','UNAVAILABLE');return a;}
  header('ENC '+e.id+'\n'+e.name,e.status===2?'LIVE':e.enabled?'ON':'OFF');
  a[16]=key(e.enabled?'TURN OFF':'TURN ON',{type:'encoderPower',id:e.id,enabled:!e.enabled},e.enabled?COLORS.danger:COLORS.on,{glyph:e.enabled?'stop':'play'});
  a[19]=key('SELECT\nINPUT',{type:'pick',kind:'encoderInput',encoder:e.id},COLORS.nav,{glyph:'route'});
  a[20]=key('SOURCE\n'+(e.input?'IN '+e.input:'NONE'),null,COLORS.info,{kind:'heading'});
  a[24]=key('CHANGE\nPROFILE',{type:'pick',kind:'encoderProfile',encoder:e.id},COLORS.action,{disabled:e.enabled});
  a[31]=key('EJECT',{type:'ejectEncoder',id:e.id},COLORS.danger,{glyph:'eject'});
 }else if(s.view==='mojo'){
  s.page=Math.max(0,Math.min(1,s.page));
  a[14]=key('PAGE\n'+(s.page+1)+' / 2',{type:'page',pages:2},COLORS.nav);
  const c=s.camera;
  a[13]=key(s.page===0?'EXPOSURE':'LENS\n& AUDIO',null,COLORS.info,{kind:'heading'});
  a[15]=key('CAMERA\n'+(c?.settings.camera||'SELECT'),{type:'pick',kind:'camera'},COLORS.action,{disabled:!c});
  a[22]=key('INPUT\nCONTROLS',{type:'input',id:s.selected.id,uid:s.selected.uid},COLORS.action);
  const source=s.data.inputs.find(i=>i.id===s.selected.id&&i.uid===s.selected.uid);
  a[8]=key(s.selected.id+'\n'+(source?.name||'SOURCE')+'\n'+(source?status(source):'UNAVAILABLE'),null,source?.status===2?COLORS.danger:source?.connected?COLORS.on:COLORS.muted,{kind:'asset',stateLabel:source?status(source):'UNAVAILABLE',stateColor:source?.status===2?COLORS.danger:source?.connected?COLORS.on:COLORS.muted});
  if(!c)a[11]=key('READING\nCAMERA...',null,COLORS.muted);
  if(c)CAMERA_PAGES[s.page].forEach((p,n)=>{
   const base=10+n*8,r=c.settings[p]||{},v=r[p],modes=r[p+'Modes'],mode=r[p+'Mode'];
   const bounds=RCP.bounds(p,r,c.profile),ready=Number.isFinite(v)&&(p!=='Focus'||c.focusAvailable);
   const numeric=ready&&bounds&&Number.isFinite(bounds[1]),canAdjust=s.online&&s.data.inputs.some(i=>i.id===s.selected.id&&i.uid===s.selected.uid&&i.connected)&&numeric&&(String(mode||'').toLowerCase()!=='auto'||(modes||[]).some(m=>/^(manual|off|locked)$/i.test(String(m))));
   a[base]=key(LABELS[p]+'\n−',{type:'adjust',param:p,delta:-1},COLORS.action,{repeat:true,disabled:!canAdjust,glyph:'minus'});
   a[base+1]=key(LABELS[p]+'\n'+(ready?RCP.format(p,RCP.fromApi(p,v,c.profile)):'N/A')+'\n'+(/^(off|manual)$/i.test(String(mode))?'MANUAL':String(mode??'').toUpperCase()),Array.isArray(modes)&&modes.length>1?{type:'mode',param:p}:null,COLORS.info,{kind:'value',icon:p,disabled:!s.online||!s.data.inputs.some(i=>i.id===s.selected.id&&i.uid===s.selected.uid&&i.connected)});
   a[base+2]=key(LABELS[p]+'\n+',{type:'adjust',param:p,delta:1},COLORS.action,{repeat:true,disabled:!canAdjust,glyph:'plus'});
   if(p==='ShutterSpeed')a[base+3]=key('UNITS',{type:'pick',kind:'shutterUnits'},COLORS.nav);
  });
 }else if(s.view==='diagnostic'){
  const kind=s.selected.asset,item=kind==='output'?s.data.outputs.find(o=>o.key===s.selected.key):s.data.inputs.find(i=>i.id===s.selected.id&&i.uid===s.selected.uid);
  const d=diagnostic(item,kind),color=d?.severity==='error'?COLORS.danger:d?COLORS.warning:COLORS.info;
  const command=s.commandError,matching=command&&JSON.stringify(command.selected)===JSON.stringify(Object.fromEntries(Object.entries(s.selected).filter(([key])=>key!=='asset')));
  header('STATUS\nDETAILS',d?.label||'NO ALERTS');a[9].color=color;
  const text=!item?'Asset no longer available.':d?d.message:'No current stream errors or warnings reported.';
  const details=[{title:kind==='output'?item?.type+' '+item?.id:''+s.selected.id},...(d?.code?[{title:'CODE\n'+d.code}]:[]),...chunks(text).map(title=>({title})),...(matching?[{title:'LAST COMMAND'},...chunks(command.message).map(title=>({title}))]:[])];
  list(details,item=>key(item.title,null,color,{kind:'heading'}));
 }else if(s.view==='pick'){
  const label={copyLink:'COPY LINK',videoReturn:'VIDEO RETURN',route:'ROUTE OUTPUT',outputInput:'SELECT INPUT',encoderInput:'SELECT INPUT',encoderProfile:'CHANGE PROFILE',encoderAdd:'ADD ENCODER',outputAdd:'ADD OUTPUT',inputProfile:'IP PROFILE',camera:'SELECT CAMERA',shutterUnits:'SHUTTER UNITS'}[s.picker.kind]||'SELECT';
  const inputPicker=['outputInput','encoderInput'].includes(s.picker.kind),ready=s.picker.readiness!=='NOT READY';
  const routePicker=s.picker.kind==='route';
  const items=inputPicker?s.picker.items.filter(item=>item.ready===ready):routePicker?s.picker.items.filter(item=>item.group===s.picker.group).map(item=>{const o=s.data.outputs.find(o=>o.key===item.command.key),assigned=o?.source===s.picker.input;return {...item,title:assigned?o.type+' '+o.id+'\n'+String(o.name).slice(0,12)+'\nALREADY\nASSIGNED':item.title,disabled:assigned||!o||o.locked||!o.powerAvailable};}):s.picker.items;
  header(label,items.length+' OPTIONS');
  if(routePicker&&!s.picker.decision){
   const groups=supportedGroups(s);groups.forEach((group,n)=>a[9+n]=key(group,{type:'routeGroup',group},COLORS.nav,{kind:'tab',active:s.picker.group===group}));
   a[12]=key(s.picker.selectedKeys.length+' SELECTED',null,COLORS.info,{kind:'heading'});
   a[14]=key('CANCEL',{type:'back'},COLORS.nav);
   a[15]=key('CONFIRM\n'+(s.picker.activationKeys?.length||s.picker.selectedKeys.length)+' OUTPUTS',{type:'routeConfirm'},COLORS.nav,{disabled:!s.picker.selectedKeys.length&&!s.picker.activationKeys?.length});
  }
  if(inputPicker)a[10]=key(ready?'INPUTS\nREADY':'INPUTS\nNOT READY',{type:'inputReadiness'},COLORS.nav);
  if(routePicker&&s.picker.decision){
   a[4]=key('BACK',{type:'routeReview'},COLORS.nav,{glyph:'back'});
   a[8]=key('ROUTING',null,COLORS.info,{kind:'heading'});a[9]=key((s.picker.activationKeys?.length||s.picker.selectedKeys.length)+' OUTPUTS',null,COLORS.info,{kind:'heading'});
   a[16]=key('ASSIGN\nONLY',{type:'routeApply',goLive:false},COLORS.nav);
   const input=s.data.inputs.find(i=>i.id===s.picker.input&&i.uid===s.picker.uid),available=input&&(input.canLive||input.protocolId>=0||s.demo&&input.connected);
   a[18]=key('ASSIGN &\nGO LIVE',{type:'routeApply',goLive:true},COLORS.on,{disabled:!available});
   a[20]=key('INPUT +\nOUTPUTS ON',null,COLORS.info,{kind:'heading'});a[14]=key('CANCEL',{type:'back'},COLORS.nav);
  }else list(items,item=>{const selected=routePicker?s.picker.selectedKeys.includes(item.command?.key):!!item.active;const copied=s.picker.kind==='copyLink'&&!!s.picker.copied&&s.picker.copied===item.command?.url;return key(copied?'COPIED\n'+item.title:item.title,{type:'choose',item},selected||copied?COLORS.on:s.picker.kind==='copyLink'?COLORS.nav:COLORS.action,{disabled:item.disabled,active:selected||copied,kind:'asset'});},s.picker.kind==='copyLink'?'NO STREAM\nLINKS':routePicker?'NO '+s.picker.group+'\nOUTPUTS':inputPicker?(ready?'NO READY\nINPUTS':'NO NOT READY\nINPUTS'):'NO AVAILABLE\nPROFILES');
 
 }
 if(['input','mojo','output','encoder'].includes(s.view)){
  const selection=s.view+':'+(s.selected?.uid||s.selected?.key||s.selected?.id);
  const frame=s.preview,valid=frame?.selection===selection&&Date.now()-frame.time<7000;
  const message=/login/i.test(s.previewStatus||'')?'PREVIEW\nLOGIN':/mismatch/i.test(s.previewStatus||'')?'WRONG\nSERVER':/failed|unreachable/i.test(s.previewStatus||'')?'PREVIEW\nERROR':'PREVIEW\nWAITING';
  const mojo=s.view==='mojo';
  a[mojo?16:15]=key(valid&&frame.thumbnail?'':message,null,COLORS.info,{kind:'preview',thumbnail:valid?frame.thumbnail:null,overlay:false});
  if(mojo){
   const program=s.program,pgm=program?.selection===selection&&program.frame&&Date.now()-program.frame.time<7000;
   a[24]=key(pgm?'PGM '+program.label:program?'PROGRAM\n'+program.label+'\nWAITING':'PROGRAM\nNOT ROUTED',program&&program.count>1?{type:'program'}:null,COLORS.danger,{kind:'preview',thumbnail:pgm?program.frame.thumbnail:null,overlay:true});
  }
 } if(s.view==='list'&&s.section!=='MOJO PRO'&&!s.outputBulk&&!s.inputBulk){
  a[15]=key(s.bulk?'EJECT\n'+s.bulk.length+' SELECTED':s.section==='INPUT'?'BULK\nUNASSIGN\n/ EJECT':'BULK\nEJECT',{type:s.bulk?'bulkRun':'bulkStart'},COLORS.nav,{disabled:!!s.bulk&&!s.bulk.length});
  if(s.section==='INPUT'&&!s.bulk)a[14]=key('BULK\nON / OFF',{type:'inputBulkStart'},COLORS.nav);
  if(s.section==='OUTPUT'&&!s.bulk){a[13]=key('BULK\nON / OFF',{type:'outputBulkStart',mode:'toggle'},COLORS.nav);a[14]=key('BULK\nUNASSIGN',{type:'outputBulkStart',mode:'unassign'},COLORS.nav);}
  if(s.bulk){
   a[12]=key(s.bulk.length+' SELECTED',null,COLORS.info,{kind:'heading'});
   a[13]=key('CANCEL',{type:'bulkCancel'},COLORS.nav);
   if(s.bulkConfirm&&s.bulk.some(c=>require('./bulk').isActive(s,c)))a[14]=key('CONFIRM\nLIVE EJECT',{type:'bulkRun',confirmed:true},COLORS.nav);
   for(let n=16;n<32;n++){
    const k=a[n],c=k.command;if(!c)continue;
    let command,disabled=false;
    if(c.type==='output'){const o=s.data.outputs.find(o=>o.key===c.key);command={type:'ejectOutput',key:c.key};disabled=o.locked||!o.powerAvailable;}
    else if(c.type==='encoder')command={type:'ejectEncoder',id:c.id};
    else if(['input','mojo'].includes(c.type)){command={type:'ejectInput',id:c.id,uid:c.uid};disabled=false;}
    else {a[n]=key('',null,'#000000',{blank:true});continue;}
    k.command={type:'bulkSelect',command};k.disabled=disabled;k.active=s.bulk.some(x=>JSON.stringify(x)===JSON.stringify(command));if(k.active)k.color=COLORS.danger;
   }
  }
 }

 if(s.view==='list'&&s.section==='INPUT'&&s.inputBulk){
  const bulk=s.inputBulk;a[12]=key(bulk.items.length+' SELECTED',null,COLORS.info,{kind:'heading'});
  a[13]=key('CANCEL',{type:'inputBulkCancel'},COLORS.nav);a[14]=key('CONFIRM\n'+bulk.items.length+' INPUTS',{type:'inputBulkRun'},COLORS.nav,{disabled:!bulk.items.length});a[15]=key('TOGGLE\nON / OFF',null,COLORS.info,{kind:'heading'});
  for(let n=16;n<32;n++){const k=a[n],c=k.command;if(c?.type!=='input')continue;const i=s.data.inputs.find(i=>i.id===c.id&&i.uid===c.uid),selected=bulk.items.some(x=>x.id===c.id);
   k.command={type:'inputBulkSelect',id:c.id,uid:c.uid};k.disabled=!(i&&(i.canLive||i.protocolId>=0||s.demo&&i.connected));k.active=selected;if(selected)k.color=COLORS.nav;k.title=i.id+'\n'+i.name+'\n'+(i.enabled?'ON → OFF':'OFF → ON');delete k.stateLabel;
  }
 }
 if(s.view==='list'&&s.section==='OUTPUT'&&s.outputBulk){
  const bulk=s.outputBulk;
  a[12]=key(bulk.keys.length+' SELECTED',null,COLORS.info,{kind:'heading'});
  a[13]=key('CANCEL',{type:'outputBulkCancel'},COLORS.nav);
  a[14]=key('CONFIRM\n'+bulk.keys.length+' OUTPUTS',{type:'outputBulkRun'},COLORS.nav,{disabled:!bulk.keys.length});
  a[15]=key(bulk.mode==='unassign'?'UNASSIGN\nINPUTS':'TOGGLE\nON / OFF',null,COLORS.info,{kind:'heading'});
  for(let n=16;n<32;n++){const k=a[n],c=k.command;if(c?.type!=='output'){if(c)a[n]=key('',null,'#000000',{blank:true});continue;}
   const o=s.data.outputs.find(o=>o.key===c.key),selected=bulk.keys.includes(c.key);
   k.command={type:'outputBulkSelect',key:c.key};k.disabled=o.locked||!o.powerAvailable||bulk.mode==='unassign'&&!o.source&&!o.encoder;k.active=selected;
   if(selected)k.color=COLORS.nav;
   if(bulk.mode==='toggle')k.title=o.type+' '+o.id+'\n'+o.name+'\n'+(o.enabled?'ON → OFF':'OFF → ON');
   else k.title=o.type+' '+o.id+'\n'+o.name+'\n'+(o.source?'SOURCE '+o.source:o.encoder?'ENC '+o.encoder:'UNASSIGNED');
  }
 }
 if(['input','output','encoder','mojo'].includes(s.view)){
  const identity=a[8],preview=a[s.view==='mojo'?16:15];
  if(s.view==='mojo'){
   const program=a[24],page=a[14];
   for(const slot of [8,16,24,14])a[slot]=key('',null,'#000000',{blank:true});
   a[16]=identity;a[9]=program;a[25]=preview;a[6]=page;
  }else{
   const power=a[16];
   for(const slot of [8,16,15])a[slot]=key('',null,'#000000',{blank:true});
   a[16]=identity;a[17]=power;a[25]=preview;
  }
  const count=require('./assets').assets(s).length;
  a[8]=key('◀\nPREV',{type:'asset',delta:-1},COLORS.nav,{kind:'navigation',disabled:count<2});
  a[24]=key('NEXT\n▶',{type:'asset',delta:1},COLORS.nav,{kind:'navigation',disabled:count<2});
 }
 // Add diagnostics after arranging the shared detail columns.
 if(s.view==='list'){
  for(const k of a){
   const c=k.command;if(!c)continue;
   const kind=c.type==='output'?'output':['input','mojo'].includes(c.type)?'input':null;if(!kind)continue;
   const item=kind==='output'?s.data.outputs.find(o=>o.key===c.key):s.data.inputs.find(i=>i.id===c.id&&i.uid===c.uid),d=diagnostic(item,kind);
   if(d){k.color=d.severity==='error'?COLORS.danger:COLORS.warning;k.stateColor=k.color;k.stateLabel=d.label;
    const prefix=kind==='input'?''+item.id:item.type+' '+item.id;
    k.title=prefix+'\n'+String(item.name).slice(0,12)+'\n'+d.message.slice(0,18)+'\n'+d.label;
   }
  }
 }
 if(['input','output','mojo'].includes(s.view)){
  const kind=s.view==='output'?'output':'input',item=kind==='output'?s.data.outputs.find(o=>o.key===s.selected.key):s.data.inputs.find(i=>i.id===s.selected.id&&i.uid===s.selected.uid),d=diagnostic(item,kind);
  const color=d?.severity==='error'?COLORS.danger:d?COLORS.warning:COLORS.nav;
  a[30]=key('STATUS\nDETAILS',{type:'diagnostic',asset:kind},color,{icon:d?'Alert':null});
  if(d){
   const identity=a[16];identity.color=color;identity.stateColor=color;
   if(s.view==='mojo'){identity.stateLabel=d.label;identity.title=''+item.id+'\n'+item.name+'\n'+d.label;}
   else{a[9].title=d.label+'\n'+d.message.slice(0,24);a[9].color=color;}
   const preview=a[25];preview.notice=d.label;preview.color=color;
   if(!preview.thumbnail)preview.title=d.label+'\n'+d.message.slice(0,36);
  }
 }
 return a;
}
function step(camera,param,delta){
 const row=camera.settings[param]||{},raw=row[param],bounds=RCP.bounds(param,row,camera.profile);
 if(!Number.isFinite(raw)||!bounds||!Number.isFinite(bounds[1]))throw Error('Camera value or range unavailable');
 if(param==='Focus'&&!camera.focusAvailable)throw Error('Focus unavailable');
 if(String(row[param+'Mode']||'').toLowerCase()==='auto')throw Error('Select manual mode');
 const value=RCP.fromApi(param,raw,camera.profile);
 if(value===null)throw Error('Parameter units have not been established');
 let next;
 if(param==='ShutterSpeed'){
  const values=RCP.shutterSteps(row,camera.profile);if(!values.length)throw Error('Shutter range unavailable');
  const index=RCP.shutterIndex(value,row,camera.profile);next=values[Math.max(0,Math.min(values.length-1,index+delta))];
 }else if(param==='ISO'){
  const values=[25,32,40,50,64,80,100,125,160,200,250,320,400,500,640,800,1000,1250,1600,2000,2500,3200,4000,5000,6400,8000,10000,12800,16000,20000,25600,32000,40000,51200,64000,80000,102400].filter(v=>v>=bounds[0]&&v<=bounds[1]);
  next=delta>0?(values.find(v=>v>value)??bounds[1]):(values.findLast(v=>v<value)??bounds[0]);
 }else{
  const inc=param==='WB'?100:param==='Zoom'?.1:param==='Focus'?(bounds[1]-bounds[0])/100:1;
  next=Number((value+inc*delta).toFixed(6));next=Math.max(bounds[0],Math.min(bounds[1],next));
 }
 return RCP.toApi(param,next,camera.profile);
}
module.exports={layout,step,PARAMS,COLORS};
