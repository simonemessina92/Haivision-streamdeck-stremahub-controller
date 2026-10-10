'use strict';
const GROUPS=['SDI','NDI','IP'];
function outputGroup(o){const type=String(o?.type||'').toUpperCase().replace(/[ _-]/g,'');return ['SDI','ST2110','SMPTE2110','PHYSICAL','HARDWARE'].includes(type)?'SDI':type==='NDI'?'NDI':type==='IP'?'IP':null;}
function channel(o){const n=Number(o?.configIndex??o?.index??o?.id);return Number.isInteger(n)&&n>=1?n:null;}
function rows(data,group){return data.outputs.filter(o=>outputGroup(o)===group).sort((a,b)=>(channel(a)||0)-(channel(b)||0));}
function canEjectOutput(data,o){const group=outputGroup(o);if(group==='IP')return true;if(!['SDI','NDI'].includes(group))return false;const ids=rows(data,group).map(channel);return !ids.includes(null)&&channel(o)===Math.max(0,...ids);}
function nextOutputProfile(data,group){const ids=rows(data,group).map(channel);if(ids.includes(null))return null;const last=Math.max(0,...ids);if(!Array.from({length:last},(_,n)=>n+1).every(id=>ids.includes(id)))return null;return data.outputProfiles.find(p=>outputGroup(p)===group&&!p.present&&!p.locked&&p.canAdd!==false&&channel(p)===last+1)||null;}
function ipProfiles(data){return data.outputProfiles.filter(p=>outputGroup(p)==='IP'&&!p.present&&!p.locked);}
function assignedConfig(config,limit=Infinity){return Object.entries(config).filter(([id,row])=>Number(id)>=1&&Number(id)<=limit&&row&&row.outputOrder!==undefined&&Number(row.outputOrder)>=0).map(([id])=>Number(id));}
function assertConfigEject(config,id,limit=Infinity){const ids=assignedConfig(config,limit);if(Number(id)!==Math.max(0,...ids))throw Error('Eject the highest-numbered physical or NDI output first');}
function assertConfigAdd(config,id,limit=Infinity){const ids=assignedConfig(config,limit),last=Math.max(0,...ids);if(Number(id)!==last+1||Number(id)>limit||!Array.from({length:last},(_,n)=>n+1).every(n=>ids.includes(n)))throw Error('Add the next physical or NDI output in numeric order');}
module.exports={GROUPS,outputGroup,channel,rows,canEjectOutput,nextOutputProfile,ipProfiles,assertConfigEject,assertConfigAdd};
function supportedGroups(s){
 const m=s.capabilities||{},data=s.data;
 return GROUPS.filter(group=>{
  const field={SDI:'nbOutput',NDI:'NDIOutput',IP:'allowedIpOutputs'}[group],v=m[field]??data.serverIdentity?.[field];
  if(v!==undefined&&v!==null&&['number','boolean','string'].includes(typeof v))return Number(v)>0||v===true;
  return data.outputs.some(o=>outputGroup(o)===group)||data.outputProfiles.some(o=>outputGroup(o)===group);
 });
}
module.exports.supportedGroups=supportedGroups;
