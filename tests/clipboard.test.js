'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('Windows clipboard passes exact text through stdin without interpolating stream credentials into shell code',async()=>{
 let invocation,stdin;const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../org.streamhub.controller.sdPlugin/bin/clipboard.js','utf8'),{module,require:()=>({execFile:(file,args,options,callback)=>{
  invocation={file,args,options};return {stdin:{on:()=>{},end:(text,encoding)=>{stdin={text,encoding};callback(null);}}};
 }})});
 const text='srt://server:9000?passphrase=$(&danger); Unicode-é';
 await module.exports.copyText(text);
 assert.equal(stdin.text,text);assert.equal(stdin.encoding,'utf8');assert.equal(invocation.options.windowsHide,true);
 assert.ok(!invocation.args.join(' ').includes(text));assert.ok(invocation.args.includes('-STA'));
});
