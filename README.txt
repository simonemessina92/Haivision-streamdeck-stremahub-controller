STREAMHUB XL — QUICK START — 0.14.0

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
NEXT HUB cycles configured units in this same panel, with no fixed unit limit.
The unit name on ONLINE identifies the selected server.
PAGE continues to page assets within the selected StreamHub.
Existing saved units remain available; switching units retains their configuration.

CREDENTIALS AND DISCONNECT
Passwords are used only for login and are never written to plugin settings.
Address, API key, username and preview session token are saved locally in
Stream Deck settings so saved units can reconnect. These are sensitive local
settings, not an encrypted password vault. Do not share personal settings/backups.
Disconnect closes the selected unit's sessions and forgets its address, API key,
username, password, custom web URL and preview token. Its friendly name remains.
Other units are unaffected. Reconnecting a disconnected unit requires its details again.
If a preview token expires, enter the web password again and Save and connect.
No personal connection details are included in the installer or supplied profile.

DISTRIBUTION
The release ZIP contains the installer, the single XL profile and this guide.
Open StreamHub XL is an optional shortcut to the full profile; dragging this
shortcut creates one key. Use the supplied profile for the populated controller.
