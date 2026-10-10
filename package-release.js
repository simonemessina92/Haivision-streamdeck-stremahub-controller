'use strict';
const fs=require('node:fs'),path=require('node:path');
const dist=path.join(__dirname,'dist');
fs.renameSync(path.join(dist,'org.streamhub.controller.streamDeckPlugin'),path.join(dist,'haivision-streamdeck-streamhub-plugin.streamDeckPlugin'));
fs.copyFileSync(path.join(__dirname,'docs/QUICK START.txt'),path.join(dist,'QUICK START.txt'));
console.log('Release installer: haivision-streamdeck-streamhub-plugin.streamDeckPlugin');
