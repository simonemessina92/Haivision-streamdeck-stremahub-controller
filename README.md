# Haivision StreamHub Controller for Stream Deck XL

Control a StreamHub from a Stream Deck XL, using a supplied profile that fills all 32 keys. Inputs, outputs, encoders and Mojo Pro each have their own section.

The plugin includes video previews, source routing, recording, intercom, video return, camera controls and bulk actions. Controls appear according to what the connected StreamHub and devices support.

## Download and install

**[Download v0.13.0 ZIP](https://github.com/simonemessina92/Haivision-streamdeck-stremahub-controller/releases/download/v0.13.0/haivision-streamdeck-streamhub-plugin-v0.13.0.zip)**

You need Windows 10 or later, Stream Deck app 7.1 or later, and a **Stream Deck XL with 32 keys**.

1. Extract the ZIP and open `haivision-streamdeck-streamhub-plugin.streamDeckPlugin`.
2. Approve the installation, then accept and select the **StreamHub XL** profile. If it is not imported automatically, open `StreamHub XL.streamDeckProfile` from the ZIP.
3. In the Stream Deck app, select the **ONLINE / OFFLINE** key in the top-right corner.
4. Enter a name for the unit, its address and API key, plus the web username and password. Click **Save and connect**.

The web login is used for previews and device features. If the preview session expires, enter the password again and reconnect. Chrome, Companion and a separate Node.js installation are not needed to use the plugin.

Once the plugin is installed and the profile imported, you can delete the downloaded ZIP and its extracted files. Stream Deck keeps its own copies of the plugin and profile. Keep the Stream Deck app installed and running.

## Switching StreamHubs

Press **ADD STREAMHUB**, then configure the new unit from **ONLINE / OFFLINE** in the app. **NEXT HUB** cycles through your configured units in the same panel; the name above ONLINE shows which one you are controlling. There is no fixed limit on saved units.

**PAGE** moves between pages of inputs, outputs or encoders within the current unit.

## Saved access details

The password is used to log in and is not saved. Stream Deck stores the address, API key, username and preview token locally so the plugin can reconnect after a restart.

**Disconnect** closes that unit's sessions and removes its access details. Its name stays in the list, and the other saved units are left alone. You will need to enter the connection details again to reconnect it. Do not share your personal settings or backups.

## Building from source

`main` is the stable branch; `develop` is for ongoing work. Version **0.13.0** was tested on Windows with a Stream Deck XL, including reconnection after a PC restart.

Install Node.js 24, then run:

```sh
npm ci
npm run build
npm test
npm run validate
npm run pack
```

The installer is written to `dist/`. The repository contains everything needed to build it.

This is an independent project, not an official Haivision or Elgato plugin.
