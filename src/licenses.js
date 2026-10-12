'use strict';
const fields=[['input','INPUTS','count','nbChannel'],['MOJOPRO','MOJO PRO','count','MOJOPRO'],['DMNGApp','DMNG APP','count','DMNGApp'],['IPInput','STANDARD IP','bool'],['activeOutputs','MAX OUTPUTS','count'],['physicalOutput','PHYSICAL OUT','count','nbOutput'],['IPOutput','IP OUTPUTS','count','allowedIpOutputs'],['NDIInput','NDI INPUTS','count','NDIInput'],['NDIOutput','NDI OUTPUTS','count','NDIOutput'],['WebRTCInput','LIVE GUEST','count'],['SRTOutputsOnly','SRT ONLY','bool'],['encoder','ENCODERS','count','allowedEncoders'],['FTPPush','FTP PUSH','count'],['playback','PLAYBACK','bool'],['record','RECORDING','bool'],['intercom','INTERCOM','bool','allowedIntercom'],['AES67','AES67 INTERCOM','bool'],['AES','AES ENCRYPTION','bool'],['FourK','UHD','bool'],['multiView','MULTIVIEW','bool'],['HotSpot','DATA BRIDGE','count'],['videoReturn','VIDEO RETURN','count']];
function boolean(value){if([true,1,'1','true','YES'].includes(value))return 'YES';if([false,0,'0','false','NO'].includes(value))return 'NO';return null;}
function feature(value,kind){
 if(Array.isArray(value)){const usable=value.filter(r=>r&&Number.isFinite(Number(r.count)));if(!usable.length)return value.length?null:'0';return String(usable.filter(r=>!r.expirationDate||Number.isFinite(Date.parse(r.expirationDate))&&Date.parse(r.expirationDate)>=Date.now()).reduce((n,r)=>n+Number(r.count),0));}
 if(value&&typeof value==='object')return boolean(value.enabled);
 if(kind==='bool')return boolean(value);
 return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?String(Number(value)):null;
}
function decode(value){for(let n=0;n<4&&typeof value==='string';n++){try{value=JSON.parse(value);}catch{return {};}}return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function normalize(raw={}){raw=decode(raw);const license=decode(raw.license??raw.details??raw);let features=decode(raw.features);for(let n=0;n<4&&features.features!==undefined;n++)features=decode(features.features);return {...raw,license,features};}
function rows(raw={},meta={}){
 raw=normalize(raw);
 const license=raw.license||raw.details||raw,features=raw.features||{},out=[],seen=new Set(),add=(label,value)=>out.push({label,value});
 if(!fields.some(([name])=>features[name]!==undefined||license[name]!==undefined))return [{label:'LICENSE DATA',value:'UNAVAILABLE'}];
 if(raw.status!==undefined)add('LICENSE',String(raw.status).toUpperCase());if(raw.orionConnectionStatus!==undefined)add('LICENSE SERVER',boolean(raw.orionConnectionStatus)||'NOT REPORTED');
 const append=(name,label,kind,fallback)=>{seen.add(name);const source=features[name]??license[name],value=feature(source,kind);add(label,value??'NOT REPORTED');
  if(source&&!Array.isArray(source)&&typeof source==='object'&&source.enabled&&source.expirationDate)add(label+' EXPIRES',String(source.expirationDate).slice(0,10));
  if(Array.isArray(source))for(const entry of source)if(entry&&Number.isFinite(Number(entry.count))&&entry.expirationDate)add(label+' TERM',String(entry.count)+' / '+String(entry.expirationDate).slice(0,10));
 };
 for(const [name,label,kind,fallback]of fields){if(name==='DMNGApp'&&!(Number(feature(features[name]??license[name],'count'))>0)){seen.add(name);continue;}append(name,label,kind,fallback);}
 if(features.expirationDate)add('LICENSE EXPIRES',String(features.expirationDate).slice(0,10));return out;
}
module.exports={rows,feature,normalize};
