'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{createRequire}=require('node:module'),path=require('node:path');
const root=path.join(__dirname,'../org.streamhub.controller.sdPlugin');
function broker(){let socket;const sessions=[],timers=[];
 class Session{
  constructor(client,notify,fetch,options){Object.assign(this,{notify,options,s:{view:'list',online:false,error:'',data:{inputs:[]}},revision:0,commands:[]});sessions.push(this);}
  async configure(cfg){this.settings={...cfg};this.s.connectionName=cfg.name||'';this.s.online=!!cfg.address;this.notify();}
  keys(){return Array.from({length:32},(_,slot)=>({title:slot===7?this.s.connectionName+'\nONLINE':'KEY '+slot,color:'#64df96',command:{type:'test',slot}}));}
  previewSelection(){return 'source';}async execute(command){this.commands.push(command);}async refresh(){}async readPreview(){}
  dispose(){this.disposed=true;this.revision++;}
 }
 class Socket{constructor(){this.readyState=1;this.handlers={};this.sent=[];socket=this;}addEventListener(k,fn){this.handlers[k]=fn;}send(raw){this.sent.push(JSON.parse(raw));}}
 const local=createRequire(root+'/bin/plugin.js');vm.runInNewContext(fs.readFileSync(root+'/bin/plugin.js','utf8'),{require:n=>n==='./engine'?{Engine:Session}:local(n),process:{argv:['node','plugin','-port','1','-pluginUUID','plugin','-registerEvent','registerPlugin','-info',JSON.stringify({devices:[{id:'xl',type:2},{id:'small',type:0}]})],exit(){}},Buffer,WebSocket:Socket,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
 const send=m=>socket.handlers.message({data:JSON.stringify(m)}),settle=()=>new Promise(r=>setImmediate(r));
 const appear=(context,id='default',slot=7,device='xl',launcher=false)=>send({event:'willAppear',action:launcher?'org.streamhub.controller.open':'org.streamhub.controller.surface',context,device,payload:{coordinates:{row:Math.floor(slot/8),column:slot%8},settings:{slot,connectionId:id}}});
 const request=(context,type,extra={})=>send({event:'sendToPlugin',context,payload:{type,...extra}});
 return {socket,sessions,send,settle,appear,request};
}
test('saved StreamHubs exceed three and each full page controls only its own unit',async()=>{
 const b=broker(),connections=Object.fromEntries(Array.from({length:7},(_,n)=>['hub'+n,{name:'Hub '+n,address:'192.0.2.'+(n+1),key:'test'}]));
 b.send({event:'didReceiveGlobalSettings',payload:{settings:{connections}}});b.appear('online0','hub0');b.appear('asset0','hub0',16);await b.settle();
 const a=b.sessions.find(e=>e.connectionId==='hub0');b.send({event:'keyDown',context:'asset0'});await b.settle();assert.equal(a.commands.length,1);
 // New page arrives before the old page disappears: late disappearance must not clear the new page.
 b.appear('online6','hub6');b.appear('asset6','hub6',16);b.send({event:'willDisappear',context:'online0'});b.send({event:'willDisappear',context:'asset0'});await b.settle();
 const c=b.sessions.find(e=>e.connectionId==='hub6');b.send({event:'keyDown',context:'asset6'});await b.settle();assert.equal(c.commands.length,1);assert.equal(a.commands.length,1);assert.equal(a.disposed,undefined);
 b.request('online6','status');const report=b.socket.sent.filter(m=>m.event==='sendToPropertyInspector').at(-1).payload;assert.equal(report.connectionId,'hub6');assert.equal(report.connectionSettings.name,'Hub 6');assert.ok(report.connections.length>=7);
});
test('creating and disconnecting a new StreamHub preserves the original connection and excludes passwords from storage',async()=>{
 const b=broker();b.send({event:'didReceiveGlobalSettings',payload:{settings:{address:'192.0.2.1',key:'test',name:'Studio'}}});b.appear('online');await b.settle();const first=b.sessions.at(-1);
 b.request('online','configure',{connectionId:'new',requestId:'new',settings:{name:'Regia',address:'192.0.2.2',key:'second',previewPassword:'temporary-password'}});await b.settle();
 const next=b.sessions.at(-1);assert.notEqual(next.connectionId,'default');assert.equal(next.settings.name,'Regia');assert.equal(first.disposed,undefined);
 const persisted=b.socket.sent.filter(m=>m.event==='setGlobalSettings').at(-1).payload;assert.equal(persisted.connections.default.address,'192.0.2.1');assert.equal(persisted.connections[next.connectionId].address,'192.0.2.2');assert.ok(!JSON.stringify(persisted).includes('temporary-password'));
 b.request('online','disconnect',{requestId:'disconnect'});await b.settle();assert.equal(next.disposed,true);assert.equal(first.disposed,undefined);assert.equal(first.s.online,true);
});
test('launcher opens the single complete XL panel with its selected unit',async()=>{
 const b=broker();b.send({event:'didReceiveGlobalSettings',payload:{settings:{connections:{default:{name:'Studio'},regia:{name:'Regia',address:'192.0.2.2',key:'test'}}}}});b.appear('launch','regia',12,'xl',true);await b.settle();b.send({event:'keyDown',context:'launch'});await b.settle();
 const command=b.socket.sent.find(m=>m.event==='switchToProfile');assert.equal(command.payload.profile,'profiles/StreamHub XL');
 b.appear('online','default');await b.settle();b.request('online','status');assert.equal(b.socket.sent.filter(m=>m.event==='sendToPropertyInspector').at(-1).payload.connectionId,'regia');
 assert.equal(b.socket.sent.filter(m=>m.event==='setSettings'&&m.context==='online').at(-1).payload.connectionId,'regia');
});
test('changing a saved connection association is allowed only on its ONLINE key or launcher',async()=>{
 const b=broker();b.send({event:'didReceiveGlobalSettings',payload:{settings:{connections:{default:{},other:{name:'Other'}}}}});b.appear('online');b.appear('asset','default',16);await b.settle();
 b.request('asset','bindConnection',{connectionId:'other'});await b.settle();assert.ok(!b.socket.sent.some(m=>m.event==='setSettings'&&m.context==='asset'));
 b.request('online','bindConnection',{connectionId:'other'});await b.settle();assert.equal(b.socket.sent.filter(m=>m.event==='setSettings').at(-1).payload.connectionId,'other');
});
test('XL launcher refuses smaller Stream Deck devices',async()=>{
 const b=broker();b.appear('small-launch','default',0,'small',true);b.send({event:'keyDown',context:'small-launch'});await b.settle();assert.ok(b.socket.sent.some(m=>m.event==='showAlert'));assert.ok(!b.socket.sent.some(m=>m.event==='switchToProfile'));
});
test('connection name appears in the ONLINE key on all controller screens',async()=>{
 const {Engine}=require(root+'/bin/engine'),client=require(root+'/bin/client'),e=new Engine(client);await e.configure({demo:true,name:'Studio North'});assert.match(e.keys()[7].title,/Studio North/);await e.execute({type:'input',id:1,uid:'demo-0'});assert.match(e.keys()[7].title,/Studio North/);
});

test('NEXT HUB cycles saved units on the same panel and wraps without native page switches',async()=>{
 const b=broker();b.send({event:'didReceiveGlobalSettings',payload:{settings:{connections:{default:{name:'Studio',address:'192.0.2.1',key:'first'},other:{name:'Regia',address:'192.0.2.2',key:'second'}}}}});b.appear('online');b.appear('next','default',5);await b.settle();
 b.send({event:'keyDown',context:'next'});await b.settle();b.request('online','status');assert.equal(b.socket.sent.filter(m=>m.event==='sendToPropertyInspector').at(-1).payload.connectionId,'other');
 b.send({event:'keyDown',context:'next'});await b.settle();b.request('online','status');assert.equal(b.socket.sent.filter(m=>m.event==='sendToPropertyInspector').at(-1).payload.connectionId,'default');assert.ok(!b.socket.sent.some(m=>m.event==='switchToProfile'));
});
test('ADD STREAMHUB creates an empty independent entry and disconnect forgets only selected credentials',async()=>{
 const b=broker();b.send({event:'didReceiveGlobalSettings',payload:{settings:{address:'192.0.2.1',key:'legacy-key',previewUsername:'legacy-user',previewToken:'legacy-token'}}});b.appear('online');b.appear('add','default',4);await b.settle();b.send({event:'keyDown',context:'add'});await b.settle();b.request('online','status');
 let report=b.socket.sent.filter(m=>m.event==='sendToPropertyInspector').at(-1).payload;assert.notEqual(report.connectionId,'default');assert.equal(report.connectionSettings.address,undefined);
 b.request('online','bindConnection',{connectionId:'default'});await b.settle();const old=b.sessions.find(e=>e.connectionId==='default');b.request('online','disconnect');await b.settle();old.options.onPreviewToken('late-token');
 const cfg=b.socket.sent.filter(m=>m.event==='setGlobalSettings').at(-1).payload;assert.equal(cfg.connections.default.disconnected,true);for(const field of ['address','key','previewOrigin','previewUsername','previewToken','previewPassword']){assert.equal(cfg[field],undefined);assert.equal(cfg.connections.default[field],undefined);}assert.ok(!JSON.stringify(cfg).includes('late-token'));
});

test('migration forgets access details of previously disconnected units and strips old password storage',async()=>{
 const b=broker();b.send({event:'didReceiveGlobalSettings',payload:{settings:{address:'legacy-address',key:'legacy-key',previewPassword:'old-password',connections:{default:{name:'Forgotten',disconnected:true,address:'old-address',key:'old-key',previewUsername:'old-user',previewToken:'old-token',previewPassword:'old-password'},other:{name:'Keep',address:'192.0.2.2',key:'keep-key',previewPassword:'old-password'}}}}});
 const cfg=b.socket.sent.filter(m=>m.event==='setGlobalSettings').at(-1).payload;assert.deepEqual(Object.keys(cfg),['connections']);assert.ok(!JSON.stringify(cfg).includes('old-'));assert.equal(cfg.connections.other.key,'keep-key');assert.equal(cfg.connections.default.name,'Forgotten');
});
