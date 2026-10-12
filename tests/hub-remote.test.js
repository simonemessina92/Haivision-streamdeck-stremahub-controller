'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const root='../org.streamhub.controller.sdPlugin/bin/';
const {Engine}=require(root+'engine'),createClient=require(root+'client'),{plan,validateResponse,webOrigin}=require(root+'remote-access'),{entries}=require(root+'hub-details');
test('hub details opens from ONLINE, paginates real data, opens only the web origin and restores the selected asset',async()=>{
 const opened=[];let reconnects=0;const e=new Engine(createClient,()=>{},()=>{throw Error('No demo network');},{openUrl:url=>opened.push(url),reconnect:()=>{reconnects++;}});
 await e.configure({demo:true,name:'Studio',address:'192.0.2.1',key:'private-key'});e.s.capabilities={version:'4.4.8',allowedEncoders:4,nbOutput:0};await e.execute({type:'input',id:2,uid:'demo-1'});
 await e.execute(e.keys()[7].command);assert.equal(e.s.view,'hub');assert.match(e.keys()[8].title,/DETAILS/);assert.ok(e.keys().some(k=>k.title.includes('4.4.8')));assert.ok(!JSON.stringify(e.keys()).includes('private-key'));
 await e.execute(e.keys()[14].command);assert.deepEqual(opened,['https://192.0.2.1/']);await e.execute(e.keys()[15].command);assert.equal(reconnects,1);
 await e.execute({type:'hubTab',tab:'LICENSES'});assert.ok(e.keys().some(k=>k.title.includes('UNAVAILABLE')));await e.execute(e.keys()[4].command);assert.equal(e.s.view,'input');assert.equal(e.s.selected.id,2);
 e.s.online=false;await e.execute(e.keys()[7].command);assert.equal(e.s.view,'hub');assert.equal(e.keys()[14].disabled,false);assert.equal(e.keys()[7].kind,'status');
});
test('hub system values expire and unknown metrics are not fabricated',()=>{
 const s={online:true,hub:{system:{cpuPercent:0,memPercent:50,time:Date.now(),storageLevel:25,storageCapacity:1024,storageTime:Date.now()}}};let rows=entries(s,'SYSTEM');assert.ok(rows.some(r=>r.label==='CPU USED (%)'&&r.value==='0'));assert.ok(rows.some(r=>r.label==='DISK USED (%)'&&r.value==='25'));
 s.hub.system.time-=16000;s.hub.system.storageTime-=16000;assert.equal(entries(s,'SYSTEM')[0].value,'No current system metrics reported');
 assert.equal(webOrigin({base:'https://example.test:8896'}),'https://example.test');assert.throws(()=>webOrigin({base:'http://example.test:8893'},'http://user:password@example.test'),/Invalid/);
});
test('remote URL mirrors native proxy configuration and rejects another host or transmitter',()=>{
 const params={origin:'http://192.0.2.1:8888',token:'session',role:'ADMIN',channel:{id:2,product:'PRO360',hardwareIdentifier:'unit',connectionStatus:1,instanceId:12,remoteControl:1,version:'5.0',firmwareName:'pro3'},device:{tunIpAddress:'192.0.2.50'},config:{tunRemoteControl:{webProxyPort:8894,webProxyPortHttps:8895}}};
 const p=plan(params);assert.equal(p.origin,'https://192.0.2.1:8895');assert.equal(p.hardwareIdentifier,'unit');assert.equal(p.replace,true);assert.equal(new URL(p.url).pathname,'/sso/session/tunIp/192.0.2.50:8888/encoderId/11');
 assert.equal(validateResponse(p.url.replace('session','replacement'),p),p.url.replace('session','replacement'));assert.throws(()=>validateResponse(p.url.replace('192.0.2.1:8895','example.test:8895'),p),/match/);assert.throws(()=>validateResponse(p.url.replace('encoderId/11','encoderId/10'),p),/match/);
 assert.equal(plan({...params,role:'VIEWER'}),null);assert.equal(plan({...params,channel:{...params.channel,product:'MoJoPro'}}),null);assert.equal(plan({...params,config:{}}),null);
 const old=plan({...params,channel:{...params.channel,product:'DMNG-PRO'}});assert.equal(old.replace,false);assert.equal(old.url,'http://192.0.2.1:8888/webconf/192.0.2.50:8888/index-pc-desktop.html');
});
test('REMOTE ACCESS uses joystick key and never opens a late reply on another source',async()=>{
 const opened=[];let resolve;const e=new Engine(createClient,()=>{},globalThis.fetch,{openUrl:url=>opened.push(url)});await e.configure({demo:true});const input=e.s.data.inputs[1];input.remoteAccessAvailable=true;
 e.native={selectInput:()=>{},device:()=>null,remoteAccess:()=>new Promise(r=>resolve=r)};await e.execute({type:'input',id:input.id,uid:input.uid});assert.equal(e.keys()[29].icon,'Remote');const pending=e.execute(e.keys()[29].command);await e.execute({type:'section',section:'OUTPUT'});resolve('http://192.0.2.1:8888');await assert.rejects(pending,/Input changed/);assert.deepEqual(opened,[]);
 input.remoteAccessAvailable=false;await e.execute({type:'input',id:input.id,uid:input.uid});assert.equal(e.keys()[29].command,null);
});

test('web GUI protocol is independent from previews and Multiview has a monitor glyph',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true,address:'192.0.2.1',key:'key',previewOrigin:'http://192.0.2.1:8888',webGuiProtocol:'https'});assert.equal(e.s.webUrl,'https://192.0.2.1/');assert.equal(e.keys()[13].icon,'Multiview');
 await e.configure({demo:true,address:'192.0.2.1',key:'key',previewOrigin:'https://preview.example.test',webGuiProtocol:'http'});assert.equal(e.s.webUrl,'http://192.0.2.1:8888/');
 await e.configure({demo:true,address:'192.0.2.1',key:'key',webGuiProtocol:'custom',webGuiUrl:'https://web.example.test/streamhub'});assert.equal(e.s.webUrl,'https://web.example.test/streamhub');
});

test('Multiview title aligns with adjacent bulk labels and monitor icon sits underneath',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});const keys=e.keys(),{svg}=require(root+'render'),monitor=svg(keys[13]),bulk=svg(keys[14]);assert.equal(keys[13].iconPosition,'bottom');assert.match(monitor,/translate\(72 107\)/);assert.equal(monitor.match(/<text x="72" y="([^"]+)"/)[1],bulk.match(/<text x="72" y="([^"]+)"/)[1]);
});

test('system distinguishes MiB-based RAM capacity and disk used/total',()=>{const s={online:true,hub:{system:{memTotal:8192,memPercent:12,time:Date.now(),storageCapacity:102400,storageLevel:25,storageTime:Date.now()}}};const rows=entries(s,'SYSTEM');assert.ok(rows.some(r=>r.label==='RAM TOTAL'&&r.value==='8.00 GiB'));assert.ok(rows.some(r=>r.label==='DISK TOTAL'&&r.value==='100.00 GiB'));assert.ok(rows.some(r=>r.label==='DISK USED'&&r.value==='25.00 GiB'));assert.ok(!rows.some(r=>/BYTES/.test(r.label)));});
