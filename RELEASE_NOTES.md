# v0.16.0 — Golden release

For Stream Deck XL and Stream Deck Mobile using 32 keys in an 8 x 4 layout.

- Add HUB DETAILS with hub information, system readings and the full reported license list.
- Open the hub web GUI in the PC browser using HTTPS 443, HTTP 8888 or a custom URL.
- Add REMOTE ACCESS for compatible transmitters when supported by the server and account.
- Improve preview-session recovery when changing between a hostname and a local address, with server identity checks.
- Lock saved connection fields after a successful connection. Disconnect and Delete StreamHub now require confirmation.
- Keep NEXT HUB working across configured, disconnected and incomplete saved units.
- Recover when OPEN occupies the connection key in an existing controller page.
- Prevent deleted units from returning through stale page references, and isolate slow or failing device sessions.
- Clarify API connection errors and preserve the separate API and web transports.
- Align the Multiview label with adjacent bulk controls and place the monitor icon beneath it.

Existing channel controls, Multiview, previews and Mojo Pro controls are retained. The local version was tested by the project owner; 167 automated tests pass, along with Elgato validation.

Windows 10+, Stream Deck app 7.1+ and an XL or Mobile Pro 32-key layout are required. Hub360-managed StreamHubs are not currently validated. Saved access details remain local to the PC and are not included when exporting a Stream Deck profile.

The previous v0.15.0 release remains available.
