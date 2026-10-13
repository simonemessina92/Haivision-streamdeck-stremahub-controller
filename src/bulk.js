'use strict';
const isActive=function active(s,c){
 if(['ejectInput','unassignInput'].includes(c.type)){const i=s.data.inputs.find(i=>i.id===c.id&&i.uid===c.uid);return !!i&&(i.enabled||i.status===2);}
 if(c.type==='ejectEncoder'){const e=s.encoders.find(e=>e.id===c.id);return !!e&&(e.enabled||e.status===2);}
 if(c.type==='ejectOutput'){const o=s.data.outputs.find(o=>o.key===c.key);return !!o&&o.enabled;}
 return false;
};
const canUnassignInput=i=>!!i&&Number.isInteger(i.protocolId)&&i.protocolId>=0;
const canEjectInput=i=>!!i&&!canUnassignInput(i)&&i.connected&&(i.isMojo||i.canLive||/^(PRO|AIR|HE|RACK|DMNG|STUDIO|SST|MOJO)/i.test(i.product||''));
module.exports={isActive,canUnassignInput,canEjectInput};
