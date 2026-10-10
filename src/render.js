'use strict';
const CAMERA_ICONS={"WB":"<circle cx=\"0\" cy=\"0\" r=\"8\"/><path d=\"M-14 0H-11M11 0H14M0-14V-11M0 11V14M-10-10L-8-8M8 8L10 10M-10 10L-8 8M8-8L10-10\"/>","ISO":"<path d=\"M0-13L11-6V6L0 13L-11 6V-6Z M-11-6L0-6L6 4L0 13M0-13L6-3L-6 4L-11 6M11-6L6 4L-6 4L0-6\"/>","ShutterSpeed":"<circle r=\"12\"/><path d=\"M0-8V0L6 4\"/>","Zoom":"<circle cx=\"-3\" cy=\"-3\" r=\"9\"/><path d=\"M4 4L13 13M-8-3H2M-3-8V2\"/>","Focus":"<path d=\"M-5-12H-12V-5M5-12H12V-5M-12 5V12H-5M12 5V12H5\"/><circle r=\"4\"/>","AudioGain":"<path d=\"M-13-5H-7L0-12V12L-7 5H-13Z M5-7Q13 0 5 7M9-12Q22 0 9 12\"/>"};
CAMERA_ICONS.Alert='<path d="M0-14L15 12H-15Z M0-5V3M0 7V8"/>';
CAMERA_ICONS.Link='<path d="M-3-7L1-11A7 7 0 0 1 11-1L7 3M3 7L-1 11A7 7 0 0 1-11 1L-7-3M-5 5L5-5"/>';
CAMERA_ICONS.Record='<circle r="9" fill="currentColor"/>';
CAMERA_ICONS.Intercom='<path d="M-12 3V-2A12 12 0 0 1 12-2V3M-12 1H-7V12H-12ZM7 1H12V12H7ZM12 10V14H3"/>';
CAMERA_ICONS.VideoReturn='<rect x="-16" y="-11" width="32" height="22" rx="2"/><path d="M-4-6L6 0L-4 6Z M-7 15H7"/>';
function escapeXml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function wrap(text,limit=12){
 return String(text).split('\n').flatMap(row=>{
  const words=row.split(/\s+/),lines=[];let line='';
  for(let word of words){while(word.length>limit){if(line){lines.push(line);line='';}lines.push(word.slice(0,limit));word=word.slice(limit);}
   if(line&&line.length+word.length+1>limit){lines.push(line);line=word;}else line+=(line?' ':'')+word;
  }if(line)lines.push(line);return lines.length?lines:[''];
 }).slice(0,4);
}
function svg(key){
 const badge=key.notice?'<rect x="4" y="4" width="136" height="22" rx="5" fill="'+escapeXml(key.color)+'"/><text x="72" y="16" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="14" font-weight="700" fill="#071018">'+escapeXml(key.notice)+'</text>':'';
 const base='<rect width="144" height="144" fill="#000000"/>';
 if((key.overlay||key.notice)&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(key.thumbnail||''))return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144">'+base+'<image x="4" y="4" width="136" height="136" preserveAspectRatio="xMidYMid slice" xlink:href="'+escapeXml(key.thumbnail)+'"/>'+badge+'<rect x="4" y="115" width="136" height="25" fill="#000000" fill-opacity="'+(key.overlay?'.85':'0')+'"/><text x="72" y="129" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="15" font-weight="700" fill="'+escapeXml(key.color||'#ffffff')+'">'+escapeXml(String(key.title).slice(0,18))+'</text><rect x="4" y="4" width="136" height="136" rx="13" fill="none" stroke="'+escapeXml(key.color||'#ffffff')+'" stroke-width="3"/></svg>';
 if(key.blank||!key.title)return '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">'+base+'</svg>';
 if(key.kind==='add')return '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">'+base+'<rect x="4" y="4" width="136" height="136" rx="13" fill="#13333b" stroke="#d5dce5" stroke-width="3"/><path d="M36 66H66V36H78V66H108V78H78V108H66V78H36Z" fill="#ffffff"/></svg>';
 const accent=key.disabled&&key.kind!=='navigation'?'#69727e':key.color||'#d5dce5';
 const passive=['heading','value','preview'].includes(key.kind);
 const solid=key.kind==='status'||key.active;
 const fill=key.disabled&&key.kind!=='navigation'?'#161b22':solid?accent:key.color==='#ba9cff'?'#33264d':key.kind==='tab'||key.color==='#4c9dff'?'#15345a':key.color==='#ffa64d'?'#4a3018':key.color==='#ff6969'||key.color==='#ff687f'?'#57212b':key.color==='#78df75'||key.color==='#64df96'?'#183e2a':passive?'#10151c':'#13333b';
 const lines=key.stateLabel?[...wrap(String(key.title).split('\n').slice(0,-1).join('\n')).slice(0,3),key.stateLabel]:wrap(key.title),font=lines.length>3?18:21,gap=key.repeat?38:font+5,top=(key.icon?86:72)-(lines.length-1)*gap/2;
 const text=lines.map((line,n)=>{
  const value=key.kind==='value'&&n===1,size=key.kind==='add'?88:key.repeat&&n===1?44:value?Math.min(32,118/Math.max(1,line.length)/.66):Math.min(font,118/Math.max(1,line.length)/.68);
  return '<text x="72" y="'+(top+n*gap)+'" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="'+size+'" font-weight="700" fill="'+escapeXml(key.disabled&&key.kind!=='navigation'?'#8b949f':solid?'#071018':key.stateLabel&&n===lines.length-1?key.stateColor:n===0?accent:'#ffffff')+'">'+escapeXml(line)+'</text>';
 }).join('');
 const icon=key.icon&&CAMERA_ICONS[key.icon]?'<g transform="translate(72 26)" fill="none" color="'+(solid?'#ffffff':accent)+'" stroke="'+(solid?'#ffffff':accent)+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+CAMERA_ICONS[key.icon]+'</g>':'';
 const border='<rect x="4" y="4" width="136" height="136" rx="13" fill="'+fill+'" stroke="'+accent+'" stroke-width="'+(solid?4:passive?1:3)+'"/>';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">'+base+border+icon+text+'</svg>';
}
function image(key){return key.kind==='preview'&&!key.overlay&&!key.notice&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(key.thumbnail||'')?key.thumbnail:'data:image/svg+xml;base64,'+Buffer.from(svg(key)).toString('base64');}
module.exports={svg,image,wrap};