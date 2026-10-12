'use strict';
function identity(value){if(!value||typeof value.hardwareIdentifier!=='string'||!value.hardwareIdentifier.trim())return null;return {hardwareIdentifier:value.hardwareIdentifier.trim(),...(typeof value.dockerId==='string'&&value.dockerId?{dockerId:value.dockerId}:{})};}
function sameServer(a,b){a=identity(a);b=identity(b);return !!(a&&b&&a.hardwareIdentifier===b.hardwareIdentifier&&(!a.dockerId||!b.dockerId||a.dockerId===b.dockerId));}
function normalized(value){try{return require('./client')({}).normalizeAddress(value);}catch{return String(value||'').trim();}}
function prepare(previous,next){
 const address=String(next.address||'').trim(),key=String(next.key||'').trim(),username=String(next.previewUsername||'').trim(),password=String(next.previewPassword||''),oldOrigin=String(previous.previewOrigin||'').trim();let origin=String(next.previewOrigin||'').trim(),autoFollow=previous.previewEndpointAutoFollow===true&&origin===oldOrigin;
 const addressChanged=normalized(address)!==normalized(previous.address),accessChanged=key!==previous.key||username!==String(previous.previewUsername||'').trim();
 // Follow the edited server when Advanced still contains its old web hostname.
 // Explicitly different web hosts and explicit new edits remain user choices.
 if(addressChanged&&origin&&origin===oldOrigin){try{const oldRest=new URL(normalized(previous.address)),newRest=new URL(normalized(address)),web=new URL(origin);if(web.hostname===oldRest.hostname&&!web.username&&!web.password){web.hostname=newRest.hostname;origin=web.origin;autoFollow=true;}}catch{}}
 const webChanged=origin!==oldOrigin,candidate=!accessChanged&&(addressChanged||webChanged)&&previous.previewToken&&identity(previous.previewServerIdentity)?{token:previous.previewToken,identity:identity(previous.previewServerIdentity)}:null;
 const invalidate=accessChanged||addressChanged||webChanged||!!password;
 const config={...previous,name:String(next.name||'').trim().slice(0,48),address,key,demo:!!next.demo,disconnected:false,previewOrigin:origin,previewEndpointAutoFollow:autoFollow,previewUsername:username,previewPassword:password,webGuiProtocol:['https','http','custom','auto'].includes(next.webGuiProtocol)?next.webGuiProtocol:previous.webGuiProtocol||'https',webGuiUrl:String(next.webGuiUrl??previous.webGuiUrl??'').trim()};
 if(invalidate){delete config.previewToken;delete config.previewServerIdentity;}
 return {config,candidate};
}
module.exports={identity,sameServer,prepare};
