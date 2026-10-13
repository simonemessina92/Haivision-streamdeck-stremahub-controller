'use strict';
const {safe}=require('./channel-details');
const size=mib=>mib>=1024?(mib/1024).toFixed(2)+' GiB':mib+' MiB';
function entries(s,tab){
 const n=s.hub||{},meta=n.metadata||{},out=[];const add=(label,value)=>{const v=safe(value);if(v!==null)out.push({label,value:v});};
 if(tab==='SYSTEM'){
  const system=n.system||{},fresh=Date.now()-(system.time||0)<15000;if(s.online&&fresh){for(const [field,label]of [['cpuPercent','CPU USED (%)'],['memPercent','RAM USED (%)']])if(Number.isFinite(system[field]))add(label,system[field]);}
  if(s.online&&fresh&&Number.isFinite(system.memTotal))add('RAM TOTAL',size(system.memTotal));
  const storageFresh=Date.now()-(system.storageTime||0)<15000;if(s.online&&storageFresh){if(Number.isFinite(system.storageLevel))add('DISK USED (%)',system.storageLevel);if(Number.isFinite(system.storageCapacity)){add('DISK TOTAL',size(system.storageCapacity));if(Number.isFinite(system.storageLevel))add('DISK USED',size(system.storageCapacity*system.storageLevel/100));};}
  if(!out.length)add('SYSTEM','No current system metrics reported');
 }else if(tab==='LICENSES'){
  out.push(...require('./licenses').rows(n.license||{},meta));
 }else{
  add('NAME',s.connectionName||'StreamHub');add('ADDRESS',s.hubAddress);add('API',s.online?'ONLINE':'OFFLINE');add('PREVIEWS',s.previewStatus||'Not connected');
  for(const [field,label]of [['product','MODEL'],['productName','MODEL'],['model','MODEL'],['version','SOFTWARE'],['firmwareVersion','FIRMWARE'],['isoVersion','SYSTEM IMAGE'],['hardwareIdentifier','HARDWARE ID'],['hostname','HOSTNAME']])if(meta[field]!==undefined)add(label,meta[field]);
  if(n.network?.hostname)add('PUBLIC HOST',n.network.hostname);if(n.network?.publicIp)add('PUBLIC IP',n.network.publicIp);for(const [i,address]of (n.network?.localIps||[]).entries())add('LOCAL IP '+(i+1),address);
  if(s.error)add('LAST ERROR',s.error);
 }return out;
}
function valueParts(value){
 const text=String(value);
 if(/^(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}$/i.test(text))return text.split(/[:-]/);
 if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text))return text.split('.');
 // Parse addresses before generic text: protocol, host components and port are separate keys.
 const url=text.match(/^([a-z][a-z0-9+.-]*:\/\/)(\[[^\]]+\]|[^/:\s]+)(?::(\d+))?(\/.*)?$/i);
 if(url)return [url[1],...hostParts(url[2]),...(url[3]?[url[3]]:[]),...(url[4]&&url[4]!=='/'?valueParts(url[4]):[])];
 const hostPort=text.match(/^((?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9_-]+\.)+[a-z][a-z0-9_-]*)(?::(\d+))?$/i);
 if(hostPort)return [...hostParts(hostPort[1]),...(hostPort[2]?[hostPort[2]]:[])];
 const out=[];let current='';
 for(let token of text.split(/(?<=[.:/\-\s])/)){if(current.length+token.length>10&&current){out.push(current);current='';}while(token.length>12){out.push(token.slice(0,10));token=token.slice(10);}current+=token;}if(current)out.push(current);
 return out.length?out:[''];
}
function hostParts(host){
 // Keep normal domain labels whole. Only unusually long labels need balanced subdivisions.
 return host.split('.').flatMap(component=>{
  if(component.length<=20)return [component];
  const tokens=component.includes('-')?component.match(/[^-]+-?/g):[component];
  return tokens.flatMap(token=>{if(token.length<=20)return [token];const count=Math.ceil(token.length/12),width=Math.ceil(token.length/count);return Array.from({length:count},(_,n)=>token.slice(n*width,(n+1)*width));});
 });
}
function rowTiles(values){
 const out=[],seen=new Set();
 for(const entry of values){const value=safe(entry.value);if(value===null)continue;const identity=entry.label+'='+value;if(seen.has(identity))continue;seen.add(identity);const balanced=/^(PUBLIC HOST|HOSTNAME)$/.test(entry.label),parts=balanced?balancedHostParts(value):valueParts(value);
  for(let offset=0;offset<parts.length;offset+=7){const row=parts.slice(offset,offset+7),lines=row.map(part=>balanced&&part.length>12?part.match(/.{1,12}/gu):[part]),longest=Math.max(...lines.flat().map(line=>line.length)),font=balanced?Math.min(lines.some(line=>line.length>1)?24:42,118/longest/.68):42;
   out.push({title:entry.label,kind:'heading'});for(let n=0;n<7;n++){const part=row[n];out.push(part===undefined?{title:'',blank:true}:{title:part,displayLines:lines[n],kind:'heading',color:'#ffffff',maxFont:font});}}
 }
 return out;
}
function balancedHostParts(value){
 const text=String(value),out=[];
 // At most seven value keys per row; long hostnames use multiple intact lines per key.
 for(let start=0;start<text.length;start+=336){const section=text.slice(start,start+336),count=Math.min(7,Math.max(1,Math.ceil(section.length/5))),target=section.length/count,min=Math.max(1,Math.floor(target)-2),max=Math.ceil(target)+2;
  let states=new Map([[0,{cost:0,parts:[]}]]);
  for(let slot=0;slot<count;slot++){const next=new Map();for(const [offset,state]of states)for(let width=min;width<=max;width++){const end=offset+width,remaining=section.length-end;if(end>section.length||remaining<(count-slot-1)*min||remaining>(count-slot-1)*max)continue;
    const boundary=end===section.length?0:/[.\-]/.test(section[end-1])?-2:/[.\-]/.test(section[end])?4:.6,cost=state.cost+(width-target)**2+boundary+(section.slice(offset,end-1).match(/\./g)||[]).length,old=next.get(end);if(!old||cost<old.cost)next.set(end,{cost,parts:[...state.parts,section.slice(offset,end)]});}states=next;}
  out.push(...states.get(section.length).parts);
 }
 return out;
}
function systemTiles(values){
 const out=[];
 for(const entry of values){const value=safe(entry.value);if(value===null)continue;
  const percent=entry.label.endsWith(' (%)'),label=percent?entry.label.replace(' USED (%)',' USAGE'):entry.label;
  const labelLines=label.split(' ');out.push({title:labelLines.join('\n'),displayLines:labelLines,kind:'heading',maxFont:28});
  const text=percent?value+'%':value,capacity=text.match(/^([\d.]+) (MiB|GiB)$/),displayLines=capacity?[capacity[1],capacity[2]]:text.length<=12?[text]:require('./render').wrap(text);
  out.push({title:displayLines.join('\n'),displayLines,kind:'heading',color:'#ffffff',maxFont:42});
 }
 return out;
}
module.exports={entries,valueParts,rowTiles,systemTiles,balancedHostParts};
