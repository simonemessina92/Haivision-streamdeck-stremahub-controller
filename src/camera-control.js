'use strict';
class CameraControl {
 constructor(){this.pending=new Map();}
 clear(){this.pending.clear();}
 async set({connection,id,message,read,write,remember}){
  const groups=['WB','ISO','ShutterSpeed','Focus','Zoom','AudioGain'],patch=message.patch||{},changed=Object.keys(patch);
  if(changed.length!==1||!groups.includes(changed[0]))throw Error('Change one camera parameter at a time');
  const info=await read(),p=changed[0],current=info.settings[p]||{};
  if(message.expectedUID!==undefined&&info.deviceUID!==message.expectedUID)throw Error('Camera identity changed');
  if(p==='Focus'&&!info.focusAvailable)throw Error('Focus is unavailable on the selected camera');
  const key=connection.base+':'+id+':'+info.deviceUID+':'+info.settings.camera,now=Date.now(),pending=this.pending.get(key)||{};
  const settings=structuredClone(info.settings);
  for(const [group,entry]of Object.entries(pending)){
   const row=settings[group]||{},fields=Object.entries(entry.patch);
   const confirmed=fields.every(([field,value])=>typeof value==='number'?Number.isFinite(row[field])&&Math.abs(row[field]-value)<Math.max(1e-7,Math.abs(value)*1e-6):row[field]===value);
   if(confirmed||now-entry.time>3000)delete pending[group];
   else settings[group]={...row,...entry.patch};
  }
  for(const [field,value]of Object.entries(patch[p])){
   if(field===p){
    if(!Number.isFinite(value))throw Error('Invalid numeric value');
    const range=current[p+'Range'];
    if(Array.isArray(range)&&range.length===2&&(value<range[0]||value>range[1]))throw Error(p+' outside device range');
    if(p==='Zoom'&&value<1)throw Error('Zoom must be at least 1');
    if((['WB','ISO'].includes(p)||p==='ShutterSpeed'&&info.profile.shutterUnit!=='seconds')&&!Number.isInteger(value))throw Error('Use a whole number for '+p);
   }else if(field===p+'Mode'){
    if(!Array.isArray(current[p+'Modes'])||!current[p+'Modes'].includes(value))throw Error('Mode unavailable');
   }else throw Error('Unknown camera property');
  }
  settings[p]={...settings[p],...patch[p]};
  const body={remote:true,camera:settings.camera};
  for(const group of groups){
   const row=settings[group];if(!row||!Number.isFinite(row[group]))continue;
   body[group]={[group]:row[group]};
   if(row[group+'Mode']!==undefined)body[group][group+'Mode']=row[group+'Mode'];
  }
  if(!body[p])throw Error('Camera value unavailable');
  await write(body);await remember(body);
  pending[p]={patch:{...(pending[p]?.patch||{}),...patch[p]},time:Date.now()};
  this.pending.set(key,pending);
  return {settings:{[p]:body[p]},partial:info.partial};
 }
}
module.exports={CameraControl};
