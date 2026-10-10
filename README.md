# Haivision StreamHub Controller for Stream Deck XL

Standalone Windows plugin with a complete 32-key controller for StreamHub inputs, outputs, encoders and Mojo Pro. Includes video previews, routing, recording, intercom, video return, camera controls and bulk operations. Independent community project; not an official Haivision or Elgato product.

## Install

**Requirements:** Windows 10 or later, Stream Deck app 7.1 or later, and a Stream Deck XL (32 keys). Chrome, Companion and a separate Node.js installation are not required.

1. Download the ZIP from [the latest release](https://github.com/simonemessina92/Haivision-streamdeck-stremahub-controller/releases/latest) and extract it.
2. Open `haivision-streamdeck-streamhub-plugin.streamDeckPlugin` and approve installation.
3. Accept and select the supplied **StreamHub XL** profile. All 32 keys are already populated. If the profile is not added automatically, open the included `StreamHub XL.streamDeckProfile`.
4. In the Stream Deck app, select the top-right **ONLINE / OFFLINE** key. Enter a name, StreamHub address, API key and web username/password, then **Save and connect**.

Web login enables previews and device features. If a preview session expires, enter the password again and reconnect. Available controls depend on the connected StreamHub and devices.

## More StreamHubs

**ADD STREAMHUB** creates another entry; configure it from **ONLINE / OFFLINE** in the app. **NEXT HUB** cycles configured units in the same XL panel, without a fixed unit limit. The name above ONLINE identifies the current unit. **PAGE** cycles assets within that unit.

## Disconnect

Passwords are used for login and are not saved. Address, API key, username and preview token are stored locally in Stream Deck settings. **Disconnect** closes the selected unit's sessions and forgets all its access details; its name remains, and other saved units are unaffected. Personal settings and backups must not be shared.

## Development

`main` contains stable releases; `develop` is for upcoming changes. The initial stable release is **v0.13.0**, tested on Windows with a Stream Deck XL, including reconnection after a PC restart.

With Node.js 24 installed:

```sh
npm ci
npm run build
npm test
npm run validate
npm run pack
```

The build is self-contained. The installer is generated in `dist/`. See [the quick start](docs/QUICK%20START.txt) for further setup details.
