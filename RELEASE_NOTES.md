# v0.17.0 — Golden release

For Stream Deck XL and Stream Deck Mobile using 32 keys in an 8 x 4 layout.

- Add optional ADD TO ENCODER inside input ROUTE TO OUTPUT. Select multiple SDI/IP destinations and confirm ASSIGN ONLY or ASSIGN & GO LIVE. NDI remains available for direct routing.
- Add BULK ON/OFF for encoders, with selection and confirmation. Sources, profiles and unrelated channels are retained.
- Fix the overly restrictive Multiview encoder filter. Existing encoding profiles are accepted; passthrough is excluded.
- Show Multiview last in encoder source selection: READY when ON, NOT READY when OFF. Both states can be assigned.
- Keep one encoder selector in Multiview IP routing and remove the redundant main-screen assignment buttons.
- Show RAM and disk capacity in MiB/GiB. Read disk measurements from recurring monitor updates so they remain visible.
- Avoid device-detail subscriptions to disconnected sources, close them when sources change and pause them on inactive hubs.

179 automated tests pass, along with Elgato validation. The project owner approved the local version. Previous hub controls, previews, recording and Mojo Pro functions are retained.

Windows 10+, Stream Deck app 7.1+ and an XL or Mobile Pro 32-key layout are required. Hub360-managed units remain unvalidated. The earlier device-information timeout banner was not reproduced during idle diagnostics; this release removes unnecessary requests without claiming to resolve every server-side timeout.

The previous v0.16.0 release remains available.
