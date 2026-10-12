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
module.exports={entries};
