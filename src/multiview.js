'use strict';
const truth=v=>v===true||v===1||v==='1';
function decode(config){
 if(!config||typeof config!=='object'||Array.isArray(config)||!('enable' in config))throw Error('Multiview configuration unavailable');
 const rows=Number(config.nbRow),columns=Number(config.nbCol);
 if(!Number.isInteger(rows)||rows<1||rows>4||!Number.isInteger(columns)||columns<1||columns>4)throw Error('Unsupported Multiview grid');
 let cells=config.videoChannelIndexes;
 if(cells==='')cells=undefined;
 if(typeof cells==='string'){try{cells=JSON.parse(cells);}catch{throw Error('Invalid Multiview cell configuration');}}
 if(cells===undefined||cells===null||cells==='')cells=Array(rows*columns).fill(0);
 if(!Array.isArray(cells)||cells.length!==rows*columns||cells.some(v=>!Number.isInteger(Number(v))||Number(v)<0||Number(v)>32))throw Error('Invalid Multiview input assignments');
 return {rows,columns,cells:cells.map(Number),enabled:truth(config.enable),overlay:truth(config.showOverlayInfo)};
}
function fingerprint(grid){return JSON.stringify([grid.rows,grid.columns,grid.cells]);}
function patch(config,operation){
 const grid=decode(config);
 if(operation.expected&&operation.expected!==fingerprint(grid))throw Error('Multiview changed on StreamHub. Refresh and select the cell again.');
 let result={};
 if(operation.kind==='resize'){
  if(!['rows','columns'].includes(operation.axis)||![1,-1].includes(operation.delta))throw Error('Invalid Multiview resize');
  const rows=grid.rows+(operation.axis==='rows'?operation.delta:0),columns=grid.columns+(operation.axis==='columns'?operation.delta:0);
  if(rows<1||rows>4||columns<1||columns>4)throw Error('Multiview grid is limited to 1 x 1 through 4 x 4');
  const cells=Array.from({length:rows*columns},(_,n)=>{const r=Math.floor(n/columns),c=n%columns;return r<grid.rows&&c<grid.columns?grid.cells[r*grid.columns+c]:0;});
  result={nbRow:rows,nbCol:columns,videoChannelIndexes:JSON.stringify(cells)};
 }else if(operation.kind==='cell'){
  if(!Number.isInteger(operation.cell)||operation.cell<0||operation.cell>=grid.cells.length||!Number.isInteger(operation.input)||operation.input<0||operation.input>32)throw Error('Invalid Multiview cell or source');
  const cells=[...grid.cells];cells[operation.cell]=operation.input;result={videoChannelIndexes:JSON.stringify(cells)};
 }else if(operation.kind==='power'){if(typeof operation.enabled!=='boolean')throw Error('Invalid Multiview power state');result={enable:operation.enabled};}
 else if(operation.kind==='overlay'){if(typeof operation.enabled!=='boolean')throw Error('Invalid Multiview overlay state');result={showOverlayInfo:operation.enabled};}
 else throw Error('Unknown Multiview command');
 if('audioChannelIndex' in config&&result.videoChannelIndexes&&!JSON.parse(result.videoChannelIndexes).includes(Number(config.audioChannelIndex)))result.audioChannelIndex=0;
 return result;
}
module.exports={decode,patch,fingerprint};
