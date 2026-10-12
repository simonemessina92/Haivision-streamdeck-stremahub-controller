'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{prepare,sameServer}=require('../org.streamhub.controller.sdPlugin/bin/connection-session');
const previous={name:'Hub',address:'hub.example.test',key:'api-key',previewUsername:'admin',previewToken:'saved-web-session',previewServerIdentity:{hardwareIdentifier:'hub-1',dockerId:'container-1'},previewOrigin:'https://hub.example.test'};
test('domain to LAN address migration follows the web host and defers token reuse until hardware identity matches',()=>{
 const p=prepare(previous,{...previous,address:'192.0.2.15',previewPassword:''});assert.equal(p.config.previewOrigin,'https://192.0.2.15');assert.equal(p.config.previewUsername,'admin');assert.equal(p.config.key,'api-key');assert.equal(p.config.previewToken,undefined);assert.equal(p.config.previewServerIdentity,undefined);assert.equal(p.candidate.token,'saved-web-session');
 assert.equal(sameServer(p.candidate.identity,{hardwareIdentifier:'hub-1',dockerId:'container-1'}),true);assert.equal(sameServer(p.candidate.identity,{hardwareIdentifier:'another-hub'}),false);assert.equal(sameServer(p.candidate.identity,{hardwareIdentifier:'hub-1',dockerId:'another-container'}),false);
 const reverse=prepare({...p.config,previewToken:previous.previewToken,previewServerIdentity:previous.previewServerIdentity},{...p.config,address:previous.address,previewPassword:''});assert.equal(reverse.config.previewOrigin,'https://hub.example.test');
});
test('automatic preview origin stays automatic and explicit independent web choices are retained',()=>{
 const auto=prepare({...previous,previewOrigin:''},{...previous,address:'192.0.2.15',previewOrigin:'',previewPassword:''});assert.equal(auto.config.previewOrigin,'');assert.ok(auto.candidate);
 const explicit=prepare(previous,{...previous,address:'192.0.2.15',previewOrigin:'http://192.0.2.15:8888',previewPassword:''});assert.equal(explicit.config.previewOrigin,'http://192.0.2.15:8888');
 const independent=prepare({...previous,previewOrigin:'https://web.example.test'},{...previous,address:'192.0.2.15',previewOrigin:'https://web.example.test',previewPassword:''});assert.equal(independent.config.previewOrigin,'https://web.example.test');
});
test('username, API key or new password changes invalidate old sessions; unverified identities are not reused',()=>{
 for(const change of [{previewUsername:'other'},{key:'new-key'}]){const p=prepare(previous,{...previous,address:'192.0.2.15',...change});assert.equal(p.candidate,null);assert.equal(p.config.previewToken,undefined);}
 const unknown=prepare({...previous,previewServerIdentity:undefined},{...previous,address:'192.0.2.15',previewPassword:''});assert.equal(unknown.candidate,null);
 const equivalent=prepare(previous,{...previous,address:'http://hub.example.test:8893/',previewPassword:''});assert.equal(equivalent.config.previewToken,previous.previewToken);assert.equal(equivalent.candidate,null);
});

test('address-only edit retains a verified session candidate when a password is reentered, and browser preferences are separate',()=>{
 const p=prepare(previous,{...previous,address:'192.0.2.15',previewPassword:'temporary',webGuiProtocol:'http',webGuiUrl:''});assert.equal(p.candidate.token,previous.previewToken);assert.equal(p.config.webGuiProtocol,'http');assert.equal(p.config.previewPassword,'temporary');
 const passwordOnly=prepare(previous,{...previous,previewPassword:'replacement'});assert.equal(passwordOnly.candidate,null);assert.equal(passwordOnly.config.previewToken,undefined);
});

test('migrated HTTPS domain URLs permit local transport recovery after restart, while explicit HTTPS edits remain explicit',()=>{
 const {previewFallback}=require('../org.streamhub.controller.sdPlugin/bin/remote-access');const p=prepare(previous,{...previous,address:'192.0.2.15',previewPassword:''});assert.equal(p.config.previewEndpointAutoFollow,true);assert.equal(previewFallback({base:'http://192.0.2.15:8893'},p.config.previewOrigin,p.config.previewEndpointAutoFollow),'http://192.0.2.15:8888');
 const explicit=prepare(p.config,{...p.config,previewOrigin:'https://192.0.2.15:4443',previewPassword:''});assert.equal(explicit.config.previewEndpointAutoFollow,false);assert.equal(previewFallback({base:'http://192.0.2.15:8893'},explicit.config.previewOrigin,explicit.config.previewEndpointAutoFollow),null);
});
