'use strict';
const {isIP}=require('node:net');
function webOrigin(connection,custom){
 if(!connection?.base)return null;const rest=new URL(connection.base),u=custom?new URL(custom):new URL(rest.protocol+'//'+rest.hostname+(rest.protocol==='http:'?':8888':''));
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Invalid StreamHub web address');return u.origin;
}
function plan({origin,token,role,channel,device={},config}){
 if(!origin||!['ADMIN','USER'].includes(role)||!channel||!(Number(channel.connectionStatus)===1||Number(channel.channelStatus)>0)||! /^(DMNG-PRO|PRO|AIR|RACK|HE)/i.test(channel.product||'')||/mojo/i.test(channel.product||''))return null;
 const base=new URL(origin),id=Number(channel.id),instance=Number(channel.instanceId),tunnel=device.tunIpAddress;
 if(!Number.isInteger(id)||id<1||id>32)return null;
 const admin=role==='ADMIN',page=admin?'index-pc-desktop.html':'dmngpro_index.html';
 if(!tunnel||channel.product==='DMNG-PRO'){
  if(tunnel&&isIP(tunnel)!==4)return null;base.protocol='http:';base.pathname='/webconf/'+(tunnel?tunnel+':8888':'10.0.0.2:'+(4000+10*id+4))+'/'+page;
  return {url:base.href,origin:base.origin,replace:false,instance:channel.instanceId};
 }
 if(isIP(tunnel)!==4||!Number.isInteger(instance)||instance<1||typeof token!=='string'||!token)return null;
 const secure=Number(channel.remoteControl)!==0,port=Number(config?.tunRemoteControl?.[secure?'webProxyPortHttps':'webProxyPort']);if(!Number.isInteger(port)||port<1||port>65535)return null;
 base.protocol=secure?'https:':'http:';base.port=String(port);base.pathname='/sso/'+encodeURIComponent(token)+'/tunIp/'+tunnel+':8888/encoderId/'+(instance-1);
 const major=parseInt(channel.version||channel.firmwareVersion||'',10),firmware=channel.firmwareName,modern=(major>=5&&['air','pro3'].includes(firmware))||(!['air','pro3'].includes(firmware)&&channel.product!=='HE4000');
 return {url:base.href,origin:base.origin,replace:true,hardwareIdentifier:modern?(channel.hardwareIdentifier||channel.uid):'',tail:'/tunIp/'+tunnel+':8888/encoderId/'+(instance-1),instance:channel.instanceId};
}
function validateResponse(value,expected){
 if(typeof value!=='string'||value.length>8192||/[\r\n]/.test(value))throw Error('Invalid remote access response');
 let url;try{url=new URL(value);}catch{throw Error('Invalid remote access response');}
 if(url.origin!==expected.origin||url.username||url.password||!url.pathname.startsWith('/sso/')||!url.pathname.endsWith(expected.tail))throw Error('Remote access response does not match the selected transmitter');
 return url.href;
}
function webGuiAddress(connection,settings={}){
 if(!connection?.base)return null;const rest=new URL(connection.base),mode=settings.webGuiProtocol||'https';let url;
 if(mode==='custom'){if(!settings.webGuiUrl)return null;url=new URL(settings.webGuiUrl);}else if(mode==='auto')url=new URL(webOrigin(connection,settings.previewOrigin));else{url=new URL(rest.origin);url.protocol=mode==='http'?'http:':'https:';url.port=mode==='http'?'8888':'';url.pathname='/';}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Invalid web GUI address');return url.href;
}
function previewFallback(connection,origin,autoFollow=false){const rest=new URL(connection.base),current=new URL(origin),fallback=webOrigin(connection);return current.hostname!==rest.hostname||autoFollow&&current.origin!==fallback?fallback:null;}
module.exports={webOrigin,webGuiAddress,previewFallback,plan,validateResponse};
