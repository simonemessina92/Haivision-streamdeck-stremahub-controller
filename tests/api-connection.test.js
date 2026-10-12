'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),client=require('../org.streamhub.controller.sdPlugin/bin/client');
test('REST transport uses API ports independent of web GUI',()=>{const c=client({});assert.equal(c.normalizeAddress('192.0.2.1'),'http://192.0.2.1:8893');assert.equal(c.normalizeAddress('https://hub.example.test'),'https://hub.example.test:8896');assert.equal(c.normalizeAddress('https://hub.example.test:8896'),'https://hub.example.test:8896');});
