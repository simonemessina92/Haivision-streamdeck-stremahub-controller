# v0.18.0 — Golden release

For Stream Deck XL and Stream Deck Mobile using 32 keys in an 8 x 4 layout. Promotes the locally approved 0.18.0 development version to stable.

- Replace the three hub-detail tabs with one INFO / SYSTEM / LICENSES key. Each press changes the view; the current view is highlighted in white bold text.
- Give INFO fields horizontal label/value rows with large text and automatic pagination. IPv4 uses four octet keys, MAC uses six byte keys, and ADDRESS separates protocol, host and port.
- Balance PUBLIC HOST and HOSTNAME across up to seven value keys, preserving all dots and using one font size across the row. The layout adapts to the actual reported name.
- Fit six SYSTEM measurements into twelve keys on one page. Labels use multiple lines, percentages include %, and capacities include MiB/GiB. Readouts continue to refresh automatically.
- Add encoder BULK UNASSIGN, clearing only the selected input sources while retaining profiles, power states and output assignments. Fresh checks reject changed assignments before writing.
- Separate input BULK UNASSIGN for assigned IP profiles from BULK EJECT for connected transmitters and Mojo devices, retaining selection and live-operation confirmation.
- Place SELECT INPUT beside the input status for eligible IP profile slots. Show READY/LIVE/OFFLINE as colored text on black.
- Rename NEXT HUB to NEXT STREAMHUB and show the selected unit's position. Add NEXT STREAMDECK PAGE in hub details for the second page of the supplied profile, when that page has been added in the Stream Deck app.
- Reorganize Multiview controls, standardize the orange SELECT ENCODER controls, distinguish unit/hub recording icons and remove redundant REFRESH keys.

192 automated tests pass, along with Elgato validation and installer packaging. The project owner approved the local version for publication. Existing connection settings, profiles, previews, routing, recording and Mojo Pro controls are retained.

Windows 10+, Stream Deck app 7.1+ and an XL or Mobile Pro 32-key layout are required. Hub360-managed units remain unvalidated. Saved access details stay local to the PC and are not included in the distributed profile.

The previous v0.17.0 release remains available.
