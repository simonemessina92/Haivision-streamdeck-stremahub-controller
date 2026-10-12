'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.join(__dirname,'../org.streamhub.controller.sdPlugin'),uuid='inspector-session',actionContext='action-instance';
function page(allowed=true){
 const nodes=Object.fromEntries(['connection','name','address','key','connect','disconnect','deleteConnection','confirmation','confirmationText','confirmAction','cancelAction','connectionPanel','keyNotice','status','previewOrigin','previewUsername','previewPassword','previewStatus','webGuiProtocol','webGuiUrl','webGuiCustom'].map(id=>[id,{value:'',checked:false,disabled:true,textContent:'',style:{}}]));
 const timers=new Map();let serial=0;
 const code=fs.readFileSync(root+'/inspector.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
 const outbound=[];
 class Socket{constructor(){this.readyState=1;this.sent=[];Socket.last=this;}send(raw){this.sent.push(JSON.parse(raw));outbound.push(JSON.parse(raw));}}
 const box={window:{},document:{getElementById:id=>nodes[id]},WebSocket:Socket,setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(code,box);
 box.window.connectElgatoStreamDeckSocket('1',uuid,'registerPropertyInspector','{}',JSON.stringify({context:actionContext}));
 Socket.last.onopen();
 Socket.last.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{configurationAllowed:allowed,phase:'complete',status:'Enter IP and API key'}})});
 return {nodes,timers,outbound,socket:Socket.last};
}
test('property inspector sends using its registration UUID, not the action context',()=>{
 const p=page();for(const m of p.outbound.filter(m=>m.event==='sendToPlugin')){assert.equal(m.context,uuid);assert.equal(m.payload.actionContext,actionContext);}
 p.nodes.address.value='192.0.2.1';p.nodes.key.value='test';p.nodes.connect.onclick();
 const m=p.outbound.at(-1);assert.equal(m.context,uuid);assert.equal(m.payload.type,'configure');assert.ok(m.payload.requestId);assert.equal(p.nodes.connect.disabled,false);
});
test('connection confirmation clears Connecting and timeout reports a failure',()=>{
 const p=page();p.nodes.address.value='192.0.2.1';p.nodes.key.value='test';p.nodes.connect.onclick();
 const requestId=p.outbound.at(-1).payload.requestId;
 p.socket.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{requestId,phase:'complete',status:'Connected'}})});
 assert.equal(p.nodes.status.textContent,'Connected');assert.equal(p.nodes.connect.disabled,false);
 p.nodes.connect.onclick();const timeout=[...p.timers.values()].find(x=>x.ms===45000);timeout.fn();
 assert.match(p.nodes.status.textContent,/did not confirm/);assert.equal(p.nodes.connect.disabled,false);
});
test('settings has a single connection button and no Open XL layout button',()=>{
 const html=fs.readFileSync(root+'/inspector.html','utf8');assert.equal((html.match(/<button\b/g)||[]).length,5);assert.doesNotMatch(html,/Open XL layout|id="demo"|<summary>Demo/);
});
test('real plugin and settings exchange a complete demo connection through the broker',async()=>{
 const p=page();let socket;
 class Socket{
  constructor(){this.readyState=1;this.handlers={};socket=this;}
  addEventListener(type,fn){this.handlers[type]=fn;}
  send(raw){const m=JSON.parse(raw);if(m.event==='sendToPropertyInspector')p.socket.onmessage({data:raw});}
 }
 const localTimers=new Map();let serial=0;
 const box={require:createRequire(root+'/bin/plugin.js'),process:{argv:['node','plugin.js','-port','1','-pluginUUID','plugin-session','-registerEvent','registerPlugin','-info',JSON.stringify({devices:[]})],exit:()=>{}},Buffer,WebSocket:Socket,setTimeout:(fn,ms)=>{const id=++serial;localTimers.set(id,{fn,ms});return id;},clearTimeout:id=>localTimers.delete(id)};
 vm.runInNewContext(fs.readFileSync(root+'/bin/plugin.js','utf8'),box);
 socket.handlers.open();
 const deliver=m=>socket.handlers.message({data:JSON.stringify(m)});
 deliver({event:'didReceiveGlobalSettings',payload:{settings:{}}});
 deliver({event:'willAppear',context:actionContext,device:'xl',payload:{coordinates:{row:0,column:7},settings:{slot:7}}});
 p.nodes.address.value='192.0.2.1';p.nodes.key.value='test';p.nodes.connect.onclick();const outgoing=p.outbound.at(-1);
 // Stream Deck uses the inspector UUID for validation and forwards to the action.
 assert.equal(outgoing.context,uuid);
 deliver({...outgoing,context:actionContext,payload:{...outgoing.payload,settings:{...outgoing.payload.settings,demo:true}}});
 await new Promise(r=>setImmediate(r));
 assert.match(p.nodes.status.textContent,/DEMO/);assert.equal(p.nodes.connect.disabled,true);
});

test('a new connection replaces an in-progress server session and discards its late token and status',async()=>{
 let socket;const sessions=[];
 class Session{
  constructor(client,notify,fetch,options){this.notify=notify;this.options=options;this.s={online:false,error:'',data:{inputs:[]}};this.revision=0;sessions.push(this);}
  keys(){return Array.from({length:32},()=>({blank:true,title:''}));}
  configure(settings){this.settings=settings;this.s.busy=true;return new Promise((resolve,reject)=>{this.resolve=()=>{this.s.online=true;this.s.busy=false;this.notify();resolve();};this.reject=reject;});}
  dispose(){this.disposed=true;this.revision++;}
 }
 class Socket{constructor(){this.readyState=1;this.handlers={};this.sent=[];socket=this;}addEventListener(type,fn){this.handlers[type]=fn;}send(raw){this.sent.push(JSON.parse(raw));}}
 const requireLocal=createRequire(root+'/bin/plugin.js'),timers=new Map();let timer=0;
 const box={require:name=>name==='./engine'?{Engine:Session}:requireLocal(name),process:{argv:['node','plugin.js','-port','1','-pluginUUID','plugin','-registerEvent','registerPlugin','-info','{}'],exit:()=>{}},Buffer,WebSocket:Socket,setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(root+'/bin/plugin.js','utf8'),box);
 const deliver=m=>socket.handlers.message({data:JSON.stringify(m)});
 deliver({event:'willAppear',context:'key',device:'xl',payload:{coordinates:{row:0,column:7},settings:{}}});
 const configure=(address,requestId)=>deliver({event:'sendToPlugin',context:'key',payload:{type:'configure',requestId,settings:{address,key:'test',previewUsername:'user',previewPassword:'password'}}});
 configure('192.0.2.1','first');const first=sessions.at(-1);
 configure('192.0.2.2','second');const second=sessions.at(-1);assert.equal(first.disposed,true);
 first.options.onPreviewToken('old-secret-token');
 second.resolve();await new Promise(resolve=>setImmediate(resolve));
 first.reject(Error('Old server timed out'));await new Promise(resolve=>setImmediate(resolve));
 const replies=socket.sent.filter(m=>m.event==='sendToPropertyInspector');
 assert.equal(replies.at(-1).payload.phase,'complete');assert.equal(replies.at(-1).payload.requestId,'second');assert.equal(replies.at(-1).payload.status,'Connected');
 assert.ok(!JSON.stringify(socket.sent).includes('old-secret-token'));
 assert.ok(!JSON.stringify(socket.sent).includes('Old server timed out'));
 assert.equal(second.settings.address,'192.0.2.2');
 const before=sessions.length;
 deliver({event:'willAppear',context:'asset',device:'xl',payload:{coordinates:{row:2,column:0},settings:{slot:16}}});
 deliver({event:'sendToPlugin',context:'asset',payload:{type:'configure',requestId:'wrong-key',settings:{address:'192.0.2.3',key:'test'}}});
 assert.equal(sessions.length,before);
 deliver({event:'sendToPlugin',context:'key',payload:{type:'disconnect',requestId:'disconnect'}});
 const disconnected=sessions.at(-1);assert.equal(second.disposed,true);assert.equal(disconnected.settings.address,undefined);
 disconnected.resolve();await new Promise(resolve=>setImmediate(resolve));
 const persisted=socket.sent.filter(m=>m.event==='setGlobalSettings').at(-1).payload;
 assert.equal(persisted.connections.default.disconnected,true);assert.equal(persisted.address,undefined);assert.equal(persisted.key,undefined);assert.equal(persisted.connections.default.address,undefined);assert.equal(persisted.connections.default.key,undefined);assert.equal(persisted.connections.default.previewUsername,undefined);
 assert.equal(persisted.previewToken,undefined);assert.equal(persisted.previewPassword,undefined);
 assert.equal(socket.sent.filter(m=>m.event==='sendToPropertyInspector').at(-1).payload.status,'Disconnected');

});

test('configuration UI is restricted to the connection key and Disconnect clears access fields',()=>{
 const hidden=page(false);assert.equal(hidden.nodes.connectionPanel.style.display,'none');
 hidden.nodes.address.value='192.0.2.1';hidden.nodes.key.value='test';
 const count=hidden.outbound.length;hidden.nodes.connect.onclick();hidden.nodes.disconnect.onclick();assert.equal(hidden.outbound.length,count);
 const p=page();p.nodes.address.value='192.0.2.2';p.nodes.key.value='test';
 p.nodes.disconnect.onclick();p.nodes.confirmAction.onclick();assert.equal(p.outbound.at(-1).payload.type,'disconnect');
 assert.equal(p.nodes.address.value,'192.0.2.2');assert.equal(p.nodes.key.value,'test');
});


test('settings shows the selected named StreamHub and switching connections does not reuse another servers fields',()=>{
 const p=page();p.socket.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{configurationAllowed:true,connectionId:'regia',connections:[{id:'default',name:'Studio'},{id:'regia',name:'Regia'}],connectionSettings:{name:'Regia',address:'192.0.2.2',key:'second'},phase:'complete',status:'Connected'}})});
 assert.equal(p.nodes.name.value,'Regia');assert.equal(p.nodes.address.value,'192.0.2.2');p.nodes.name.value='My edited name';
 p.socket.onmessage({data:JSON.stringify({event:'didReceiveGlobalSettings',payload:{settings:{address:'192.0.2.1',key:'first',name:'Studio'}}})});assert.equal(p.nodes.name.value,'My edited name');assert.equal(p.nodes.address.value,'192.0.2.2');
 p.nodes.connection.value='default';p.nodes.connection.onchange();assert.equal(p.outbound.at(-1).payload.type,'bindConnection');assert.equal(p.outbound.at(-1).payload.connectionId,'default');
});
test('Add StreamHub creates a separate connection and cannot disconnect the previous unit while its form is open',()=>{
 const p=page();p.nodes.connection.value='new';p.nodes.connection.onchange();assert.equal(p.nodes.address.value,'');assert.equal(p.nodes.disconnect.disabled,true);
 const count=p.outbound.length;p.nodes.disconnect.onclick();assert.equal(p.outbound.length,count);
 p.nodes.name.value='Van';p.nodes.address.value='192.0.2.3';p.nodes.key.value='third';p.nodes.connect.onclick();assert.equal(p.outbound.at(-1).payload.connectionId,'new');assert.equal(p.outbound.at(-1).payload.settings.name,'Van');
});

test('Disconnect clears all access fields and late global settings cannot refill them',()=>{
 const p=page();for(const field of ['address','key','previewOrigin','previewUsername','previewPassword'])p.nodes[field].value='secret';p.nodes.disconnect.onclick();p.nodes.confirmAction.onclick();p.socket.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{phase:'complete',connectionId:'default',connectionSettings:{},credentialsCleared:true,configurationLocked:false}})});
 p.socket.onmessage({data:JSON.stringify({event:'didReceiveGlobalSettings',payload:{settings:{address:'old-server',key:'old-key',previewUsername:'old-user'}}})});
 for(const field of ['address','key','previewOrigin','previewUsername','previewPassword'])assert.equal(p.nodes[field].value,'');
 assert.ok(!p.outbound.some(m=>m.event==='getGlobalSettings'));
});

test('saved connection changes synchronize the effective web address only after the matching save completes',()=>{
 const p=page();const receive=payload=>p.socket.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload})});
 receive({phase:'complete',connectionId:'hub',connectionSettings:{name:'Hub',address:'hub.example.test',key:'key',previewOrigin:'https://hub.example.test'},configurationAllowed:true});p.nodes.address.value='192.0.2.15';
 receive({phase:'complete',connectionId:'hub',connectionSettings:{address:'hub.example.test',previewOrigin:'https://hub.example.test'}});assert.equal(p.nodes.address.value,'192.0.2.15');
 p.nodes.connect.onclick();const requestId=p.outbound.at(-1).payload.requestId;receive({phase:'complete',requestId,configurationSaved:true,connectionId:'hub',connectionSettings:{name:'Hub',address:'192.0.2.15',key:'key',previewOrigin:'https://192.0.2.15'}});assert.equal(p.nodes.previewOrigin.value,'https://192.0.2.15');assert.equal(p.nodes.address.value,'192.0.2.15');assert.equal(p.nodes.previewPassword.value,'');
});

test('browser shortcut protocol and custom URL are submitted independently of preview override',()=>{
 const p=page();p.nodes.address.value='192.0.2.1';p.nodes.key.value='key';p.nodes.previewOrigin.value='http://192.0.2.1:8888';p.nodes.webGuiProtocol.value='custom';p.nodes.webGuiUrl.value='https://web.example.test';p.nodes.webGuiProtocol.onchange();assert.equal(p.nodes.webGuiCustom.style.display,'block');p.nodes.connect.onclick();const cfg=p.outbound.at(-1).payload.settings;assert.equal(cfg.webGuiProtocol,'custom');assert.equal(cfg.webGuiUrl,'https://web.example.test');assert.equal(cfg.previewOrigin,'http://192.0.2.1:8888');
});

test('preview diagnostics show the active endpoint independently from the saved browser shortcut',()=>{
 const p=page();p.socket.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{phase:'complete',previewStatus:'Previews connected',effectivePreviewOrigin:'http://192.0.2.1:8888'}})});assert.match(p.nodes.previewStatus.textContent,/Previews connected/);assert.match(p.nodes.previewStatus.textContent,/Preview endpoint: http:\/\/192.0.2.1:8888/);
});

test('locked configuration is greyed and cannot submit edits while hub selector remains available',()=>{
 const p=page();p.socket.onmessage({data:JSON.stringify({event:'sendToPropertyInspector',payload:{configurationAllowed:true,configurationLocked:true,phase:'complete',status:'Connected'}})});assert.equal(p.nodes.address.disabled,true);assert.equal(p.nodes.previewPassword.disabled,true);assert.equal(p.nodes.connect.disabled,true);const count=p.outbound.length;p.nodes.connect.onclick();assert.equal(p.outbound.length,count);assert.equal(p.nodes.disconnect.disabled,false);
 p.nodes.connection.value='new';p.nodes.connection.onchange();assert.equal(p.nodes.address.disabled,false);
});
test('disconnect and delete require confirmation and cancel sends no command',()=>{
 const p=page();const count=p.outbound.length;p.nodes.disconnect.onclick();assert.equal(p.outbound.length,count);p.nodes.cancelAction.onclick();assert.equal(p.outbound.length,count);p.nodes.deleteConnection.onclick();assert.equal(p.outbound.length,count);p.nodes.confirmAction.onclick();assert.equal(p.outbound.at(-1).payload.type,'deleteConnection');
});
