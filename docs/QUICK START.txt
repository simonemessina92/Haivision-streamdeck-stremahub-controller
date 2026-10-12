STREAMHUB XL — QUICK START — 0.17.0

INSTALL
Windows 10+, Stream Deck app 7.1+, Stream Deck XL or Stream Deck Mobile (32 keys, 8 columns x 4 rows).
Open haivision-streamdeck-streamhub-plugin.streamDeckPlugin and accept the StreamHub XL profile.
One complete 32-key panel is supplied. No Chrome, Companion or separate Node.js required.
If upgrading an existing installation, import StreamHub XL.streamDeckProfile if needed.

MOBILE SETUP
Install Stream Deck Mobile for Android or iOS/iPadOS:
Android: https://play.google.com/store/apps/details?id=com.corsair.android.streamdeck
Apple: https://apps.apple.com/app/elgato-stream-deck-mobile/id1440014184
Connect it to the Windows Stream Deck app, set 32 keys in an 8 x 4 layout,
and copy the supplied StreamHub XL profile to the Mobile device from the desktop app.
This layout requires Mobile Pro. Keep the same layout when rotating the device.
A temporary Mobile disconnection preserves access details and restores the session
when Mobile reconnects. The explicit Disconnect command still forgets credentials.

CONNECT
Select the top-right ONLINE / OFFLINE key in the Stream Deck app.
Enter a friendly unit name, address, API key and web username/password.
Save and connect. Web login enables previews and device features.

MORE STREAMHUBS
Press ADD STREAMHUB on the panel list screen, then select ONLINE / OFFLINE in
 the app to configure the new unit. You can also choose + Add StreamHub in settings.
NEXT HUB cycles all saved units in this same panel, with no fixed unit limit.
The unit name on ONLINE identifies the selected server.
PAGE continues to page assets within the selected StreamHub.
Existing saved units remain available; switching units retains their configuration.

HUB DETAILS
Press ONLINE / OFFLINE on the device for hub information, system readings and licenses.
OPEN WEB GUI opens the PC browser using HTTPS443, HTTP8888 or a custom URL.
RECONNECT retains access details. REMOTE ACCESS opens compatible transmitter web GUIs.
API ports: HTTP8893 / HTTPS8896. Web login/preview ports: HTTP8888 / HTTPS443.
Hub360-managed units are not currently validated.

CHANNEL DETAILS AND MULTIVIEW
STATUS DETAILS on inputs, outputs and encoders has CONFIG, STATS and ALERTS.
Only reported values are shown; these pages do not edit stream profiles.
LIVE PROFILE on compatible transmitters selects an existing preset without starting LIVE.
MULTIVIEW builds a 1 x 1 to 4 x 4 grid; PAGE switches between two sets of 16 sources.
Live inputs show cell previews. BASIC hides information overlays.
Multiview SDI/NDI routing is direct; IP routing uses an encoding profile, not passthrough.
Input ROUTE TO OUTPUT offers ADD TO ENCODER for SDI/IP. NDI remains direct.
Select outputs, then ASSIGN ONLY or ASSIGN & GO LIVE.
ENCODERS has BULK ON/OFF with multiselection and confirmation.
SYSTEM distinguishes RAM and disk, with capacities in MiB/GiB.
ASSIGN ONLY preserves power state; ASSIGN & GO LIVE enables the required channels.
Mojo microphone selection remains in the phone app.

CREDENTIALS AND DISCONNECT
Passwords are used only for login and are never written to plugin settings.
Address, API key, username and preview session token are saved locally in
Stream Deck settings so saved units can reconnect. These are sensitive local
settings, not an encrypted password vault. Do not share personal settings/backups.
Disconnect closes the selected unit's sessions and forgets its address, API key,
username, password, custom web URL and preview token. Its friendly name remains.
Other units are unaffected. Reconnecting a disconnected unit requires its details again.
Saved fields are locked after connection. Confirm Disconnect to edit and sign in again.
Disconnect and Delete StreamHub both require Confirm; Cancel leaves the unit unchanged.
Delete removes the saved unit without removing the controller profile.
No personal connection details are included in the installer or supplied profile.

DISTRIBUTION
The release ZIP contains the installer, the single XL profile and this guide.
Open StreamHub XL is an optional shortcut to the full profile; dragging this
shortcut creates one key. Use the supplied profile for the populated controller.
