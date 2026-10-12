'use strict';
// Explicit public fields only. Never traverse arbitrary configuration or expose credentials.
const fields={name:'PROFILE',type:'PROTOCOL',mode:'PROTOCOL',protocol:'TRANSPORT',serverMode:'SERVER MODE',host:'HOST',port:'PORT',uri:'DESTINATION',destinations:'DESTINATIONS',label:'STREAM LABEL',streamName:'STREAM NAME',delay:'LATENCY (ms)',latency:'LATENCY (ms)',latencyMode:'LATENCY MODE',enableMulticast:'MULTICAST',enableSSM:'SSM',uriSSM:'SSM SOURCE',outputStandard:'VIDEO STANDARD',resolution:'RESOLUTION',videoFrequency:'FRAME RATE',frameRate:'FRAME RATE',videoBitrateMode:'RATE CONTROL',cbrMode:'CBR',bitrate:'BITRATE (kbps)',videoBitrate:'VIDEO (kbps)',audioBitrate:'AUDIO (kbps)',videoMaxBitrate:'MAX VIDEO (kbps)',videoMinBitrate:'MIN VIDEO (kbps)',videoCappedBitrate:'CAPPED (kbps)',encoderVideoType:'VIDEO CODEC',encoderAudioType:'AUDIO CODEC',encoderVideoBitrate:'VIDEO (kbps)',encoderAudioBitrate:'AUDIO (kbps)',audioChannelMode:'AUDIO CHANNELS',audioFrequency:'AUDIO RATE',audioSampleRate:'AUDIO RATE',quality:'QUALITY',inputInfo:'INPUT FORMAT',outputInfo:'OUTPUT FORMAT',channelType:'SOURCE TYPE',product:'DEVICE TYPE',connections:'CONNECTIONS',nbConnect:'CONNECTIONS',tallyState:'TALLY',refInputStatus:'REFERENCE STATUS',hasRefInput:'REFERENCE INPUT',videoInput:'VIDEO INPUT',audioInput:'AUDIO INPUT',sdiIdx:'SDI INDEX',sdiNbChannels:'SDI CHANNELS',gopSize:'GOP SIZE',gopLength:'GOP LENGTH',videoProfile:'VIDEO PROFILE',videoLevel:'VIDEO LEVEL',audioNbChannels:'AUDIO CHANNELS',interlaced:'INTERLACED'};
const metrics={rx_bitrate:'RX (kbps)',tx_bitrate:'TX (kbps)',bitrate:'BITRATE (kbps)',videoBitrate:'VIDEO (kbps)',audioBitrate:'AUDIO (kbps)',cur_rx_lost_packets:'LOST / INTERVAL',tot_rx_lost_packets:'LOST / TOTAL',rx_lost_nb_packets:'LOST / TOTAL',rx_lost_nb_packets_current:'LOST / INTERVAL',outVideoPktDrop:'VIDEO DROP TOTAL',outAudioPktDrop:'AUDIO DROP TOTAL',rtt:'RTT (ms)',jitter:'JITTER',delayLineCountDown:'DELAY COUNTDOWN',packetsLost:'LOST PACKETS'};
function safe(value){
 if(typeof value==='boolean')return value?'YES':'NO';
 if(typeof value==='number')return Number.isFinite(value)?String(value):null;
 if(typeof value!=='string'||!value.trim())return null;
 let text=value.trim();
 // URL credentials, query tokens and keys are never rendered, including nested stream URLs.
 text=text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi,'$1').replace(/[?#][^\s]*/g,'');
 if(/(?:password|passphrase|api[_ -]?key|token|stream[_ -]?key)\s*[:=]/i.test(text))return null;
 return text.slice(0,1200);
}
function readFields(source,labels,prefix=''){
 const result=[];if(!source||typeof source!=='object')return result;
 for(const [field,label]of Object.entries(labels)){const v=source[field];if(Array.isArray(v)){for(let n=0;n<Math.min(v.length,16);n++){const x=v[n],value=safe(typeof x==='object'&&x?x.host&&x.port?x.host+':'+x.port:x.uri:x);if(value!==null)result.push({label:prefix+label+' '+(n+1),value});}}else{const value=safe(v);if(value!==null)result.push({label:prefix+label,value});}}
 return result;
}
function configuration(...sources){const out=[],seen=new Set();for(const source of sources)for(const entry of readFields(source,fields)){const id=entry.label+'='+entry.value;if(!seen.has(id)){seen.add(id);out.push(entry);}}return out;}
function statistics(source){const result=readFields(source,metrics);for(const group of ['video','audio','mpegtsUp','link'])if(Array.isArray(source?.[group]))source[group].slice(0,16).forEach((row,n)=>result.push(...readFields(row,metrics,group.toUpperCase()+' '+(n+1)+' ')));return result;}
class LiveDetails{
 constructor(){this.rows=new Map();}
 clear(){this.rows.clear();}
 put(key,row,uid){this.rows.set(key,{row,time:Date.now(),uid});}
 get(key,uid){const entry=this.rows.get(key);return entry&&Date.now()-entry.time<15000&&(!entry.uid||entry.uid===uid)?entry:null;}
 receive(name,value,envelope,channels){
  if(name==='inputStatsChange'){const body=envelope?.result??envelope;for(const [id,row]of Object.entries(body||{}))if(/^\d+$/.test(id)&&row&&typeof row==='object'){const channel=channels[Number(id)-1],uid=channel?.hardwareIdentifier||channel?.uid;if(uid)this.put('input:'+id,row,uid);};return true;}
  if(name==='getOutputStats'){for(const [group,type]of [['output','SDI'],['NDIOutput','NDI'],['IPOutput','IP']])for(const row of value?.[group]||[]){const id=row.configKey??row.outputId;if(id!==undefined)this.put(type+':'+id,row);}return true;}
  if(name==='encoderPreviewChange'&&value?.encoderId&&(Number.isFinite(value.videoBitrate)||Number.isFinite(value.audioBitrate))){this.put('encoder:'+value.encoderId,{videoBitrate:value.videoBitrate,audioBitrate:value.audioBitrate});return false;}
  if(name==='getLiveInfo'){const id=envelope?.channelId,uid=channels[Number(id)-1]?.hardwareIdentifier;if(id&&uid)this.put('inputInfo:'+id,value,uid);return true;}
  if(name==='getOutputStatus'){for(const [group,type]of [['output','SDI'],['NDIOutput','NDI'],['IPOutput','IP']])(value?.[group]||[]).forEach((row,n)=>this.put('outputInfo:'+type+':'+(row.configKey??n+1),row));return true;}
  if(name==='getEncoderStatus'){
(value?.encoder||[]).forEach((row,n)=>this.put('encoderStatus:'+(n+1),row));return true;}
  return false;
 }
}
function tiles(entries){
 const out=[],seen=new Set(),wrap=require('./render').wrap;
 for(const entry of entries){if(entry.value===undefined||entry.value===null)continue;const id=entry.label+'='+entry.value;if(seen.has(id))continue;seen.add(id);
 const label=wrap(entry.label).slice(0,3),valueLines=require('./diagnostics').chunks(String(entry.value)).flatMap(part=>part.split('\n')),capacity=4-label.length;
 for(let offset=0;offset<valueLines.length;offset+=capacity)out.push({title:[...label,...valueLines.slice(offset,offset+capacity)].join('\n')});
 }return out;
}
module.exports={configuration,statistics,safe,LiveDetails,tiles};
