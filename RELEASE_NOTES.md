# v0.18.1 — Golden bugfix release

Fixes OUTPUTS > BULK UNASSIGN leaving an encoder attached to SDI or IP outputs after routing an input through that encoder.

- Clear both direct input and encoder assignments on selected SDI, NDI and IP outputs. Presets without an encoder field retain their original schema.
- Recognize numeric indices returned as text, including encoder 1 represented by index "0". Preserve SDI encoder assignments in the readout when runtime output information is unavailable.
- Allow supported REST encoder-assignment writes for physical and NDI outputs as well as IP outputs.
- Check the current assignment before writing and reject confirmations from a replaced connection. Reread the complete output assignment before declaring success; incomplete outputs remain selected for retry.
- If the native update leaves an encoder attached, retry only the selected routing fields through the supported REST item API. Stop the retry if the output or its assignment has changed.
- Preserve output profiles, output power/order, unrelated outputs and each encoder's source, profile and power state.

207 automated tests pass, including SDI/IP operations through both native and REST paths, numeric-string indices, missing SDI runtime information, rejected writes, guarded retry and incomplete confirmations. Elgato validation and installer packaging pass.

The project owner confirmed that the local fix works and approved publication. Additional testing on the Haibox using the GitHub release download is planned. Existing v0.18.0 controls and layouts are retained.

Windows 10+, Stream Deck app 7.1+ and Stream Deck XL or Mobile Pro with 32 keys in an 8 x 4 layout are required. Hub360-managed units remain unvalidated. Connection details remain local and are not included in the distributed profile.

The previous v0.18.0 release remains available.
