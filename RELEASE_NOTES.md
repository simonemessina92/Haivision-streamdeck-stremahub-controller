# v0.15.0 — Golden release

For Stream Deck XL and Stream Deck Mobile with 32 keys in an 8 x 4 layout.

- Build and route Multiview grids from 1 x 1 to 4 x 4, with live cell previews and a two-page input picker.
- Route Multiview directly to SDI/NDI, or through an H.264/HEVC encoder for IP outputs. Assignment and going live remain separate choices.
- Read channel configuration, available live statistics and alerts from STATUS DETAILS on inputs, outputs and encoders.
- Select existing LIVE profiles on compatible transmitters and see the selected preset. Profile selection does not start transmission.
- Show input recording, intercom and video return controls according to the assigned source and its capabilities.
- Improve Mojo Pro command responsiveness, keep parameter modes independent, and use manual/auto white balance, fixed shutter steps, zoom reset and 2 dB audio gain steps.
- Replace the redundant Mojo program thumbnail with an output indicator. OUTPUT LIVE requires both a live input and an active routed output.

Microphone selection remains in the Mojo Pro app; no remote audio-source selector is included.

The local controller was tested by the project owner. All 131 automated tests pass, and Elgato validation passes. The installer contains no connection credentials and has no Chrome dependency.

Existing saved units and profiles are retained when upgrading. Windows 10+, Stream Deck app 7.1+ and an XL or Mobile Pro 32-key layout are required.

The previous v0.14.0 release remains available.
