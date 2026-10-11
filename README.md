# Haivision StreamHub Controller — XL and Mobile

Control a StreamHub from a Stream Deck XL or Stream Deck Mobile, using the same 32-key, 8 x 4 layout. Inputs, outputs, encoders and Mojo Pro each have their own section.

The plugin includes video previews, source routing, recording, intercom, video return, camera controls and bulk actions. Controls appear according to what the connected StreamHub and devices support.

## Download and install

**[Download v0.14.0 ZIP](https://github.com/simonemessina92/Haivision-streamdeck-stremahub-controller/releases/download/v0.14.0/haivision-streamdeck-streamhub-plugin-v0.14.0.zip)**

You need Windows 10 or later, Stream Deck app 7.1 or later, and either a **Stream Deck XL** or **Stream Deck Mobile configured with 32 keys in an 8 x 4 layout**.

1. Extract the ZIP and open `haivision-streamdeck-streamhub-plugin.streamDeckPlugin`.
2. Approve the installation, then accept and select the **StreamHub XL** profile. If it is not imported automatically, open `StreamHub XL.streamDeckProfile` from the ZIP.
3. In the Stream Deck app, select the **ONLINE / OFFLINE** key in the top-right corner.
4. Enter a name for the unit, its address and API key, plus the web username and password. Click **Save and connect**.

The web login is used for previews and device features. If the preview session expires, enter the password again and reconnect. Chrome, Companion and a separate Node.js installation are not needed to use the plugin.

Once the plugin is installed and the profile imported, you can delete the downloaded ZIP and its extracted files. Stream Deck keeps its own copies of the plugin and profile. Keep the Stream Deck app installed and running.

## Stream Deck Mobile

Install the official Elgato app: [Android / Google Play](https://play.google.com/store/apps/details?id=com.corsair.android.streamdeck) or [iPhone and iPad / App Store](https://apps.apple.com/app/elgato-stream-deck-mobile/id1440014184).

Connect Mobile to the Stream Deck desktop app on your Windows PC, configure **32 keys with 8 columns and 4 rows**, and copy the supplied **StreamHub XL** profile to the Mobile device from the desktop app. Keep that layout when rotating the phone or tablet.

The 32-key layout requires [Stream Deck Mobile Pro](https://help.elgato.com/hc/en-us/articles/19662381509261-Stream-Deck-Mobile-Pro). The plugin runs on the Windows PC; Mobile is its control surface.

Temporary Mobile disconnections preserve the saved StreamHub access details. When Mobile reconnects, the plugin restores its controller session. Two registered Mobile devices using the same account were tested, including switching between devices.

## Switching StreamHubs

Press **ADD STREAMHUB**, then configure the new unit from **ONLINE / OFFLINE** in the app. **NEXT HUB** cycles through your configured units in the same panel; the name above ONLINE shows which one you are controlling. There is no fixed limit on saved units.

**PAGE** moves between pages of inputs, outputs or encoders within the current unit.

## Saved access details

The password is used to log in and is not saved. Stream Deck stores the address, API key, username and preview token locally so the plugin can reconnect after a restart.

**Disconnect** closes that unit's sessions and removes its access details. Its name stays in the list, and the other saved units are left alone. You will need to enter the connection details again to reconnect it. Do not share your personal settings or backups.

## Building from source

`main` is the stable branch; `develop` is for ongoing work. Version **0.14.0** is the current stable release, verified with Stream Deck XL and two registered Mobile devices.

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
