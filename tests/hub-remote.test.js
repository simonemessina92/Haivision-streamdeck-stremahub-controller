'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const root='../org.streamhub.controller.sdPlugin/bin/';
const {Engine}=require(root+'engine'),createClient=require(root+'client'),{plan,validateResponse,webOrigin}=require(root+'remote-access'),{entries}=require(root+'hub-details');
test('hostnames balance across seven keys with exact punctuation and one font size for all fragments',()=>{
 const {rowTiles}=require(root+'hub-details'),{svg}=require(root+'render');
 for(const host of ['a.io','lab.simonemessina.net','streamhub.production.example.test','studio-01.eu.broadcast.example.org','x'.repeat(63)+'.'+'y'.repeat(63)+'.'+'z'.repeat(63)+'.example.net','hub.local.','a'.repeat(400)+'.test']){
  const tiles=rowTiles([{label:'PUBLIC HOST',value:host}]);assert.equal(tiles.filter((_,n)=>n%8!==0).filter(k=>!k.blank).map(k=>k.displayLines.join('')).join(''),host);
  for(let offset=0;offset<tiles.length;offset+=8){assert.equal(tiles[offset].title,'PUBLIC HOST');const fragments=tiles.slice(offset+1,offset+8).filter(k=>!k.blank),lengths=fragments.map(k=>k.title.length),fonts=fragments.flatMap(k=>[...svg(k).matchAll(/font-size="([^"]+)"/g)].map(m=>Number(m[1])));assert.ok(fragments.length<=7);assert.ok(Math.max(...lengths)-Math.min(...lengths)<=4);assert.equal(new Set(fonts).size,1);assert.ok(fragments.every(k=>k.displayLines.length<=4));}
 }
 const sample=rowTiles([{label:'PUBLIC HOST',value:'lab.simonemessina.net'}]).slice(1).filter(k=>!k.blank);assert.ok(sample.length>3);assert.ok(sample.some(k=>k.title.includes('.')));
});
test('INFO URL and domain keys follow protocol, octets, complete domain labels and explicit ports',()=>{
 const {valueParts,rowTiles}=require(root+'hub-details'),{svg}=require(root+'render');
 assert.deepEqual(valueParts('http://192.168.1.100:8893'),['http://','192','168','1','100','8893']);assert.deepEqual(valueParts('https://192.168.1.100:443/'),['https://','192','168','1','100','443']);assert.deepEqual(valueParts('http://192.168.1.100:80'),['http://','192','168','1','100','80']);
 assert.deepEqual(valueParts('lab.simonemessina.net'),['lab','simonemessina','net']);assert.deepEqual(valueParts('https://lab.simonemessina.net:8896'),['https://','lab','simonemessina','net','8896']);assert.deepEqual(valueParts('lab.simonemessina.net:8896'),['lab','simonemessina','net','8896']);assert.deepEqual(valueParts('4.4.8'),['4.4.8']);
 const domain=rowTiles([{label:'PUBLIC HOST',value:'lab.simonemessina.net'}]);assert.equal(domain[0].title,'PUBLIC HOST');assert.equal(domain.slice(1).filter(k=>!k.blank).map(k=>k.title).join(''),'lab.simonemessina.net');const rendered=svg(domain[2]);assert.equal((rendered.match(/<text /g)||[]).length,1);
 const address=rowTiles([{label:'ADDRESS',value:'http://user:private@192.168.1.100:8893?token=private'}]);assert.equal(address.length,8);assert.deepEqual(address.slice(0,7).map(k=>k.title),['ADDRESS','http://','192','168','1','100','8893']);assert.ok(address[7].blank);assert.ok(!JSON.stringify(address).includes('private'));
 const longLabel='abcdefghijklmnopqrstuvwxyz'.repeat(2),parts=valueParts(longLabel+'.example.net');assert.equal(parts.slice(0,-2).join(''),longLabel);assert.ok(parts.slice(0,-2).every(p=>p.length<=12));
 const deep='one.two.three.four.five.six.seven.eight.example.net',rows=rowTiles([{label:'PUBLIC HOST',value:deep}]);assert.equal(rows.length,8);assert.equal(rows.slice(1).filter(k=>!k.blank).map(k=>k.title).join(''),deep);
});
test('SYSTEM packs six metrics into twelve keys with multiline labels, live percent units and capacities',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'hub'});e.native={verified:true,device:()=>null,system:{cpuPercent:0,memPercent:25,memTotal:8192,storageLevel:50,storageCapacity:102400,time:Date.now(),storageTime:Date.now()}};await e.execute(e.keys()[10].command);
 let keys=e.keys();assert.equal(e.s.hubTab,'SYSTEM');assert.equal(keys[6].blank,true);assert.equal(keys.slice(16).filter(k=>!k.blank).length,12);assert.equal(keys[16].title,'CPU\nUSAGE');assert.equal(keys[17].title,'0%');assert.equal(keys[18].title,'RAM\nUSAGE');assert.equal(keys[19].title,'25%');assert.equal(keys[20].title,'RAM\nTOTAL');assert.equal(keys[21].title,'8.00\nGiB');assert.equal(keys[23].title,'50%');assert.equal(keys[25].title,'100.00\nGiB');assert.equal(keys[27].title,'50.00\nGiB');
 const {svg}=require(root+'render');assert.equal((svg(keys[16]).match(/<text /g)||[]).length,2);assert.ok(Number(svg(keys[17]).match(/font-size="([^"]+)"/)[1])>=40);
 e.native.system.cpuPercent=23;assert.equal(e.keys()[17].title,'23%');e.native.system.time-=16000;e.native.system.storageTime-=16000;keys=e.keys();assert.equal(keys[16].title,'SYSTEM');assert.ok(!keys.some(k=>k.title==='23%'));
});
test('hub parameters occupy distinct horizontal rows with large value-only address segments',()=>{
 const {rowTiles,valueParts}=require(root+'hub-details'),{svg}=require(root+'render');
 assert.deepEqual(valueParts('AA:BB:CC:DD:EE:FF'),['AA','BB','CC','DD','EE','FF']);assert.deepEqual(valueParts('192.168.100.200'),['192','168','100','200']);
 const values=[{label:'HARDWARE ID',value:'AA:BB:CC:DD:EE:FF'},{label:'LOCAL IP 1',value:'192.168.100.200'},{label:'PUBLIC HOST',value:'streamhub.production.example.test'}],tiles=rowTiles(values);assert.equal(tiles.length,24);
 for(let n=0;n<3;n++)assert.equal(tiles[n*8].title,values[n].label);assert.equal(tiles.slice(1,7).map(k=>k.title).join(':'),values[0].value);assert.deepEqual(tiles[1].displayLines,['AA']);assert.ok(tiles[7].blank);assert.equal(tiles.slice(9,13).map(k=>k.title).join('.'),values[1].value);assert.ok(tiles[13].blank);assert.equal(tiles.slice(17,24).filter(k=>!k.blank).map(k=>k.title).join(''),values[2].value);assert.ok(!JSON.stringify(tiles).includes('PART '));
 const image=svg(tiles[1]);assert.equal((image.match(/<text /g)||[]).length,1);assert.ok(Number(image.match(/font-size="([^"]+)"/)[1])>30);
 const long='abc/'.repeat(80),continuations=rowTiles([{label:'ADDRESS',value:long}]);assert.equal(continuations.filter((_,n)=>n%8!==0).filter(k=>!k.blank).map(k=>k.title).join(''),long);assert.equal(continuations.length%8,0);
});
test('hub horizontal rows paginate without mixing fields or losing values and wrap to first page',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'hub'});e.native={verified:true,metadata:{hardwareIdentifier:'AA:BB:CC:DD:EE:FF'},network:{localIps:['192.168.100.200'],hostname:'streamhub.production.example.test'},device:()=>null};e.keys();
 const expected=entries(e.s,'INFO'),pages=e.keys()[6].command.pages,labels=[];assert.equal(pages,Math.ceil(expected.length/2));assert.ok(pages>2);
 for(let n=0;n<pages;n++){const keys=e.keys();labels.push(keys[16].title);if(!keys[24].blank)labels.push(keys[24].title);for(const k of keys.slice(16))assert.ok(!k.title.includes('PART '));await e.execute(keys[6].command);}
 assert.deepEqual(labels,expected.map(row=>row.label));assert.equal(e.s.page,0);await e.execute(e.keys()[10].command);assert.equal(e.s.hubTab,'SYSTEM');assert.equal(e.keys()[16].title,'SYSTEM');
});
test('one hub selector cycles pages, resets pagination and highlights only the current page',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});await e.execute({type:'hub'});const {svg}=require(root+'render');
 for(const tab of ['INFO','SYSTEM','LICENSES','INFO']){const keys=e.keys();assert.equal(e.s.hubTab,tab);assert.equal(keys[10].command.type,'hubTabCycle');assert.equal(keys[11].blank,true);assert.equal(keys[12].blank,true);const image=svg(keys[10]);assert.equal((image.match(/font-weight="700" fill="#ffffff"/g)||[]).length,1);assert.match(image,new RegExp('font-weight="700" fill="#ffffff">'+tab+'</text>'));e.s.page=2;await e.execute(keys[10].command);assert.equal(e.s.page,0);}
 await e.execute({type:'section',section:'INPUT'});const tab=e.s.hubTab;await e.execute({type:'hubTabCycle'});assert.equal(e.s.hubTab,tab);
});
test('hub details opens from ONLINE, paginates real data, opens only the web origin and restores the selected asset',async()=>{
 const opened=[];let reconnects=0;const e=new Engine(createClient,()=>{},()=>{throw Error('No demo network');},{openUrl:url=>opened.push(url),reconnect:()=>{reconnects++;}});
 await e.configure({demo:true,name:'Studio',address:'192.0.2.1',key:'private-key'});e.s.capabilities={version:'4.4.8',allowedEncoders:4,nbOutput:0};await e.execute({type:'input',id:2,uid:'demo-1'});
 await e.execute(e.keys()[7].command);assert.equal(e.s.view,'hub');assert.match(e.keys()[8].title,/DETAILS/);const titles=[];const pages=e.keys()[6].command?.pages||1;for(let n=0;n<pages;n++){titles.push(...e.keys().map(k=>k.title));assert.ok(!JSON.stringify(e.keys()).includes('private-key'));if(pages>1)await e.execute(e.keys()[6].command);}assert.ok(titles.some(title=>title.includes('4.4.8')));
 await e.execute(e.keys()[13].command);assert.deepEqual(opened,['https://192.0.2.1/']);await e.execute(e.keys()[14].command);assert.equal(reconnects,1);
 await e.execute({type:'hubTab',tab:'LICENSES'});assert.ok(e.keys().some(k=>k.title.includes('UNAVAILABLE')));await e.execute(e.keys()[4].command);assert.equal(e.s.view,'input');assert.equal(e.s.selected.id,2);
 e.s.online=false;await e.execute(e.keys()[7].command);assert.equal(e.s.view,'hub');assert.equal(e.keys()[13].disabled,false);assert.equal(e.keys()[7].kind,'status');
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
 const e=new Engine(createClient);await e.configure({demo:true,address:'192.0.2.1',key:'key',previewOrigin:'http://192.0.2.1:8888',webGuiProtocol:'https'});assert.equal(e.s.webUrl,'https://192.0.2.1/');assert.equal(e.keys()[12].icon,'Multiview');
 await e.configure({demo:true,address:'192.0.2.1',key:'key',previewOrigin:'https://preview.example.test',webGuiProtocol:'http'});assert.equal(e.s.webUrl,'http://192.0.2.1:8888/');
 await e.configure({demo:true,address:'192.0.2.1',key:'key',webGuiProtocol:'custom',webGuiUrl:'https://web.example.test/streamhub'});assert.equal(e.s.webUrl,'https://web.example.test/streamhub');
});

test('Multiview title aligns with adjacent bulk labels and monitor icon sits underneath',async()=>{
 const e=new Engine(createClient);await e.configure({demo:true});const keys=e.keys(),{svg}=require(root+'render'),monitor=svg(keys[12]),bulk=svg(keys[13]);assert.equal(keys[12].iconPosition,'bottom');assert.match(monitor,/translate\(72 107\)/);assert.equal(monitor.match(/<text x="72" y="([^"]+)"/)[1],bulk.match(/<text x="72" y="([^"]+)"/)[1]);
});

test('system distinguishes MiB-based RAM capacity and disk used/total',()=>{const s={online:true,hub:{system:{memTotal:8192,memPercent:12,time:Date.now(),storageCapacity:102400,storageLevel:25,storageTime:Date.now()}}};const rows=entries(s,'SYSTEM');assert.ok(rows.some(r=>r.label==='RAM TOTAL'&&r.value==='8.00 GiB'));assert.ok(rows.some(r=>r.label==='DISK TOTAL'&&r.value==='100.00 GiB'));assert.ok(rows.some(r=>r.label==='DISK USED'&&r.value==='25.00 GiB'));assert.ok(!rows.some(r=>/BYTES/.test(r.label)));});

test('page 2 trial appears only in HUB DETAILS and delegates without changing hub settings',async()=>{const pages=[],e=new Engine(createClient,()=>{},globalThis.fetch,{switchControllerPage:page=>pages.push(page)});await e.configure({demo:true});await e.execute({type:'controllerPage',page:1});assert.deepEqual(pages,[]);await e.execute({type:'hub'});assert.equal(e.keys()[15].title,'NEXT\nSTREAMDECK\nPAGE');await e.execute(e.keys()[15].command);assert.deepEqual(pages,[1]);await e.execute({type:'section',section:'INPUT'});assert.ok(!e.keys().some(k=>k.command?.type==='controllerPage'));});
