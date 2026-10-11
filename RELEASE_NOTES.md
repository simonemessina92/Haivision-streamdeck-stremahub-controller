# v0.14.0 — XL and Mobile golden release

Adds Stream Deck Mobile support to the existing Stream Deck XL controller.

- Use the full 32-key controller on XL or Mobile with an 8 x 4 layout.
- Recognize Mobile devices connected after plugin startup.
- Restore sessions and button references after temporary Mobile disconnections.
- Recover ONLINE connection settings after reconnecting.
- Preserve saved access details during a temporary device disconnection; the explicit Disconnect command still forgets them.

Verified with two registered Mobile devices using the same account and switching between devices. All 105 automated tests pass; the plugin also passes Elgato validation.

Download the ZIP, install the plugin on Windows and select the supplied StreamHub XL profile. For Mobile, pair the official Android or iOS/iPadOS app, set 32 keys in an 8 x 4 layout, and copy the XL profile to Mobile from the desktop app. Mobile Pro is required for this layout.

Android: https://play.google.com/store/apps/details?id=com.corsair.android.streamdeck
Apple: https://apps.apple.com/app/elgato-stream-deck-mobile/id1440014184

The previous v0.13.0 release remains available.
