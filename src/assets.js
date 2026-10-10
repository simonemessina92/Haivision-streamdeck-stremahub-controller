'use strict';
function assets(s){
 if(s.view==='input')return s.data.inputs.map(i=>({id:i.id,uid:i.uid}));
 if(s.view==='mojo')return s.data.inputs.filter(i=>i.isMojo&&i.connected).map(i=>({id:i.id,uid:i.uid}));
 if(s.view==='output'){
  const selected=s.data.outputs.find(o=>o.key===s.selected?.key),group=selected?require('./outputs').outputGroup(selected):s.outputGroup;
  return require('./outputs').rows(s.data,group).map(o=>({key:o.key}));
 }
 if(s.view==='encoder')return s.encoders.filter(e=>e.profile!=='-1').sort((a,b)=>a.id-b.id).map(e=>({id:e.id}));
 return [];
}
function sameAsset(a,b){return !!a&&!!b&&(a.key!==undefined?a.key===b.key:a.id===b.id&&(a.uid===undefined||a.uid===b.uid));}
function programRoutes(s){
 const source=s.selected?.id;
 return s.data.outputs.filter(o=>o.enabled&&(o.source===source||o.encoder&&s.encoders.some(e=>e.id===o.encoder&&e.input===source&&e.enabled)));
}
module.exports={assets,sameAsset,programRoutes};
