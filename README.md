# M5Stack AtomS3R + AtomPoE Tally Listener & P2P Controller

Tally Arbiter & TSL 3.1 listener for M5Stack AtomS3R with AtomPoE (W5500 SPI Ethernet). Features a double-buffered 128×128 display, an NTP synchronized clock with seconds in a dedicated high-contrast black box with white text, and zero-server Point-to-Point (P2P) pairing.

## 🎛️ Operating Modes
1. **`TP` Mode:** Technical Producer mode connected to Tally Arbiter. Single click sends TSL Program tally return (`0x32` Red).
2. **`Presenter` Mode:** Presenter mode connected to Tally Arbiter. Single click sends TSL Preview return cue (`0x31` Green).
3. **`TP no Tally Arbiter` (P2P Master):** Standalone point-to-point unit directly linked to Presenter unit(s). Toggles Program tally to Presenter; receives cue returns from Presenter to show a `>>> PRESENTER CUE! <<<` alert.
4. **`Presenter no Tally Arbiter` (P2P Slave):** Standalone point-to-point unit directly linked to a TP console. Receives Program (Red) and Preview (Green) tallies; sends Preview cue to paired TP.

## 🔍 Zero-Conf P2P Discovery & Pairing (mDNS & DNS-SD)
* Advertises over mDNS as `_cuelx-tally._udp` on UDP port `8910`.
* Web UI at `http://<device-ip>/` includes a **Scan for Local Peers** tool with 1-click pairing.
* Supports **Pairing Groups** (e.g. `Studio-1`, `Studio-2`) to allow multiple independent TP/Presenter pairs on the same local subnet without collisions.

