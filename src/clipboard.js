'use strict';
const {execFile}=require('node:child_process');
function copyText(text,{signal}={}){
 if(typeof text!=='string'||!text.length||text.length>16384)throw Error('Stream link unavailable');
 return new Promise((resolve,reject)=>{
  const command="[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);$text=[Console]::In.ReadToEnd();Set-Clipboard -Value $text";
  const child=execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-STA','-Command',command],{windowsHide:true,timeout:8000,maxBuffer:1024,signal},error=>error?reject(Error('Could not copy the stream link to the Windows clipboard')):resolve());
  child.stdin.on('error',()=>{});child.stdin.end(text,'utf8');
 });
}
module.exports={copyText};
