# Haivision StreamHub Controller — XL and Mobile

Control a StreamHub from a Stream Deck XL or Stream Deck Mobile, using the same 32-key, 8 x 4 layout. Inputs, outputs, encoders and Mojo Pro each have their own section.

The plugin includes video previews, source routing, recording, intercom, video return, camera controls, Multiview and bulk actions. Controls appear according to what the connected StreamHub and devices support.

## Download and install

**[Download v0.18.1 ZIP](https://github.com/simonemessina92/Haivision-streamdeck-stremahub-controller/releases/download/v0.18.1/haivision-streamdeck-streamhub-plugin-v0.18.1.zip)**

You need Windows 10 or later, Stream Deck app 7.1 or later, and either a **Stream Deck XL** or **Stream Deck Mobile configured with 32 keys in an 8 x 4 layout**.

1. Extract the ZIP and open `haivision-streamdeck-streamhub-plugin.streamDeckPlugin`.
2. Approve the installation, then accept and select the **StreamHub XL** profile. If it is not imported automatically, open `StreamHub XL.streamDeckProfile` from the ZIP.
3. In the Stream Deck app, select the **ONLINE / OFFLINE** key in the top-right corner.
4. Enter a name for the unit, its address and API key, plus the web username and password. Click **Save and connect**.

The web login is used for previews and device features. Saved connection fields are locked after a successful connection. To change them, confirm Disconnect, then enter the access details again. Chrome, Companion and a separate Node.js installation are not needed to use the plugin.

Once the plugin is installed and the profile imported, you can delete the downloaded ZIP and its extracted files. Stream Deck keeps its own copies of the plugin and profile. Keep the Stream Deck app installed and running.

## Stream Deck Mobile

Install the official Elgato app: [Android / Google Play](https://play.google.com/store/apps/details?id=com.corsair.android.streamdeck) or [iPhone and iPad / App Store](https://apps.apple.com/app/elgato-stream-deck-mobile/id1440014184).

Connect Mobile to the Stream Deck desktop app on your Windows PC, configure **32 keys with 8 columns and 4 rows**, and copy the supplied **StreamHub XL** profile to the Mobile device from the desktop app. Keep that layout when rotating the phone or tablet.

The 32-key layout requires [Stream Deck Mobile Pro](https://help.elgato.com/hc/en-us/articles/19662381509261-Stream-Deck-Mobile-Pro). The plugin runs on the Windows PC; Mobile is its control surface.

Temporary Mobile disconnections preserve the saved StreamHub access details. When Mobile reconnects, the plugin restores its controller session. Two registered Mobile devices using the same account were tested, including switching between devices.

## Switching StreamHubs

Press **ADD STREAMHUB**, then configure the new unit from **ONLINE / OFFLINE** in the app. **NEXT STREAMHUB** cycles through all saved units in the same panel and shows the selected unit's position in the list; the name above ONLINE shows which one you are controlling. There is no fixed limit on saved units.

**PAGE** moves between pages of inputs, outputs or encoders within the current unit.

## Hub details and remote access

Press ONLINE / OFFLINE on the device to view hub information, system readings and reported licenses. One **INFO / SYSTEM / LICENSES** key cycles through these views, highlighting the current view in white bold text. **PAGE** cycles through additional readout pages when needed.

INFO gives each field its own horizontal row: the name is followed by large value segments. IPv4 addresses use one key per octet and MAC addresses one per byte. ADDRESS separates the protocol, host and explicit port. PUBLIC HOST and HOSTNAME distribute the full name, including its dots, across balanced segments with a consistent font size. SYSTEM places labels and values side by side; six available metrics fit on one page, with percentages and capacity units included.

OPEN WEB GUI opens the default browser on the Windows PC; choose HTTPS 443, HTTP 8888 or a custom browser URL in the connection settings. RECONNECT restarts the selected hub session without forgetting its saved access details. **NEXT STREAMDECK PAGE** targets the second page of the supplied StreamHub XL profile. Add that page in the Stream Deck app if you want to use it, and place a native Previous Page action there to return.

REMOTE ACCESS opens a compatible transmitter’s remote interface when the connected server and account allow it.

REST API access uses HTTP 8893 or HTTPS 8896; web login and previews use HTTP 8888 or HTTPS 443. Use `https://hostname` for HTTPS API access. The API port must be reachable and the certificate trusted. StreamHubs managed through Hub360 are not currently validated.

## Channel controls

- **STATUS DETAILS** is available on inputs, outputs and encoders. CONFIG shows reported stream parameters, STATS shows available live measurements, and ALERTS shows errors and warnings. These pages are read-only.
- **LIVE PROFILE** on a compatible connected transmitter selects an existing encoding preset. The current preset is highlighted; changing it does not start the input.
- **ROUTE TO OUTPUT** on an input offers an optional **SELECT ENCODER** step. Choose an encoder, select SDI/IP destinations, then **ASSIGN ONLY** or **ASSIGN & GO LIVE**. NDI stays available on direct routing.
- **BULK ON/OFF** in ENCODERS toggles selected encoders after confirmation, preserving their sources and profiles.
- **BULK UNASSIGN** in ENCODERS clears selected input sources while retaining encoding profiles, power states and output assignments.
- **BULK UNASSIGN** in OUTPUTS disconnects both direct input and encoder routes on selected SDI, NDI and IP outputs. Output profiles, power states and encoder input/profile assignments are retained. The plugin rereads the configuration before confirming success; incomplete operations remain selected for retry. If a native update leaves an encoder assigned, a guarded REST retry clears only the selected routing fields.
- INPUTS has separate **BULK UNASSIGN** for assigned IP input profiles and **BULK EJECT** for connected transmitters and Mojo devices. Select compatible inputs and confirm; live inputs require the additional live-operation confirmation.
- **SELECT INPUT**, beside the input status, chooses an IP input profile for an eligible input slot. Connected transmitters and Mojo devices do not expose this selector. READY, LIVE and OFFLINE use colored text on a black background.
- **MULTIVIEW**, beside input bulk controls, builds a 1 x 1 to 4 x 4 grid. Select sources across two pages of 16 inputs. Cell previews appear when their sources are live; BASIC hides the information overlays.
- Route Multiview directly to SDI or NDI. IP routing requires an assigned encoding profile; passthrough is excluded. Choose **ASSIGN ONLY** to keep the current power states, or **ASSIGN & GO LIVE** to enable the required channels.
- Multiview power is in the top row; row/column controls, BASIC and ROUTE TO OUTPUT are grouped on the right. **SELECT ENCODER** uses the same orange control in input routing and Multiview IP routing.
- Mojo Pro provides camera selection, manual/auto controls, fixed shutter steps, zoom reset and 2 dB audio gain steps. Microphone selection stays in the phone app.

Available controls and statistics depend on the StreamHub version, license and connected device. Profile and routing changes wait for server or device confirmation.

SYSTEM shows CPU usage, RAM usage/capacity and disk usage/capacity in MiB/GiB when reported. Readouts refresh automatically; redundant REFRESH keys have been removed from STATUS DETAILS and Multiview. Unit recording and hub recording have distinct device and server icons. Device-detail requests stop for disconnected inputs and pause when switching to another saved hub.

## Saved access details

The password is used to log in and is not saved. Stream Deck stores the address, API key, username and preview token locally so the plugin can reconnect after a restart.

**Disconnect** asks for confirmation, closes that unit's sessions and removes its access details. Its name stays in the list, and the other saved units are left alone. You will need to enter the connection details again to reconnect it. **Delete StreamHub** asks for confirmation and removes the saved unit. Other units and the controller profile are retained. Exporting a Stream Deck profile does not transfer the plugin’s saved access details to another PC.

Do not share your personal settings or backups.

## Building from source

`main` is the stable branch; `develop` is for ongoing work. Version **0.18.1** is the current golden release. Stream Deck XL and two registered Mobile devices were verified on hardware. Previous releases remain available on the Releases page.

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
