# M5Stack M5AtomS3R with AtomPoE (W5500) Tally & TSL 3.1 Listener

Adapted from the M5StickC/StickC-Plus Tally Arbiter listener firmware to run natively on the **M5Stack M5AtomS3R** attached to the **AtomPoE Base (W5500)**.

---

## 🌟 Key Adaptations

### 1. MycilaESPConnect Network & Ethernet Management
* **Wired Ethernet Priority:** Uses `MycilaESPConnect` with `-D ESPCONNECT_ETH_SUPPORT` for the W5500 SPI Ethernet controller.
* **Automatic Detection:** When an Ethernet cable connected to a PoE switch or injector is detected, MycilaConnect prioritizes Ethernet, fetches a DHCP IP address, and disables or shuts down AP/Captive Portal mode.
* **Failover to Wi-Fi / AP:** If Ethernet is disconnected, it gracefully falls back to Wi-Fi or opens the captive portal for wireless configuration.
* **Embedded Web Portal:** Built-in web dashboard on port `80` to configure Tally Arbiter IP, Socket.IO port, TSL UDP port, and view live status.

### 2. Double-Buffered Display (Zero Flicker)
* **Screen:** 0.85" 128×128 pixel Color LCD (GC9107 driver).
* **Buffer Memory Calculation:**
  $$\text{Memory} = 128 \times 128 \times 2\text{ bytes (RGB565)} = 32{,}768\text{ bytes } (\approx 32\text{ KB})$$
* **Hardware Capability:** The M5AtomS3R features an ESP32-S3FN8 with **8 MB Octal PSRAM** and **512 KB internal SRAM**.
* **Zero Flicker Implementation:** An `M5Canvas canvas(&M5.Display)` sprite of $128 \times 128$ is allocated in memory during `setup()`. All rendering (background fills, text drawing, tally borders, clock, and channel status) is drawn into off-screen memory first, then transferred to the LCD in a single atomic SPI DMA burst (`canvas.pushSprite(0, 0)`).
* **Safe Fallback:** If memory allocation ever fails, the firmware gracefully falls back to direct display rendering without crashing.

### 3. Hardware Pinout (AtomS3R + AtomPoE W5500)
The AtomS3R connects to the AtomPoE base via internal header pins:

| Function | Signal | AtomS3R GPIO | Notes |
| :--- | :--- | :--- | :--- |
| **SPI CLK** | SCK | **GPIO 5** | W5500 SPI Clock |
| **Chip Select** | CS | **GPIO 6** | W5500 Active Low Chip Select |
| **SPI MISO** | MISO | **GPIO 7** | W5500 Master In Slave Out |
| **SPI MOSI** | MOSI | **GPIO 8** | W5500 Master Out Slave In |
| **Reset** | RST | `-1` | Not wired on AtomPoE (pull-up) |
| **Interrupt** | IRQ | `-1` | Polling mode used |
| **Power** | 5V / 3.3V | VCC / GND | Powered via PoE 48V-to-5V stepdown |

### 4. Button & Interaction (Single Screen Button)
The M5StickC had two physical side buttons. The AtomS3R features a single tactile button integrated directly beneath the front LCD screen (`M5.BtnA`):

* **Single Click:** Toggle Channel 1 TSL Cue (`sendtally(1, state)`).
* **Double Click:** Toggle between **Screen 0 (Tally Screen)** and **Screen 1 (Network & Diagnostics Screen)**.
* **Hold (1.5s - 3s):** Cycle display brightness: $15\% \to 35\% \to 65\% \to 100\%$.
* **Emergency Long Press (>7s):** Clear network preferences and reboot.

---

## 🚀 Building & Flashing

### Option A: PlatformIO (Recommended)
1. Install [PlatformIO IDE](https://platformio.org/) in VSCode.
2. Clone or place this project folder in your workspace.
3. Use the provided `platformio.ini` (which pins `m5stack/M5GFX @ 0.2.24` and `m5stack/M5Unified @ 0.2.2`).
   *(Note: Avoid M5GFX 0.2.36 due to an upstream packaging bug with `result.hpp`). If you previously built with 0.2.36, delete the `.pio` directory first.*
4. Connect M5AtomS3R via USB-C.
5. Click **PlatformIO: Upload** (`pio run -t upload`).
6. Open Serial Monitor at `115200` baud.

### Option B: Arduino IDE (v2.x)
1. Add ESP32 board URL to **Preferences > Additional Boards Manager URLs**:
2. Install **esp32** platform by Espressif (version **3.0.0 or higher** — required for native `ETH_PHY_W5500` SPI Ethernet support).
3. Install required libraries from Library Manager:
   * `M5Unified` & `M5GFX`
   * `MycilaESPConnect`
   * `ESPAsyncWebServer` & `AsyncTCP`
   * `WebSockets` by Markus Sattler
   * `Arduino_JSON` by Arduino
4. In **Tools**:
   * Board: `ESP32S3 Dev Module` or `M5Stack AtomS3R`
   * PSRAM: `OPI PSRAM`
   * Flash Size: `8MB (64Mb)`
   * Partition Scheme: `8MB with spiffs`
   * USB CDC On Boot: `Enabled`
5. Compile and upload!

---

## 🛠️ Arduino IDE Troubleshooting

### Error: `'mbedtls_md5_starts_ret' was not declared in this scope`
```
c:\Users\...\Arduino\libraries\ESPAsyncWebServer\src\WebAuthentication.cpp:74:3: error: 'mbedtls_md5_starts_ret' was not declared in this scope; did you mean 'mbedtls_md5_starts'?
```

#### Cause
Arduino-ESP32 Board Package **v3.0.0+** upgrades the core to ESP-IDF 5.x and **mbedTLS 3.x**. In mbedTLS 3.x, the deprecated wrapper functions `mbedtls_md5_starts_ret`, `mbedtls_md5_update_ret`, and `mbedtls_md5_finish_ret` were permanently deleted. Legacy versions of `me-no-dev/ESPAsyncWebServer` (abandoned in 2020) fail to compile because of these old function names.

#### Solution 1: 10-Second Quick In-Place Edit (Fastest)
1. Open the file in Notepad, VSCode, or any text editor:
   `...\Arduino\libraries\ESPAsyncWebServer\src\WebAuthentication.cpp`
2. Scroll to lines 74–76 inside `getMD5`:
   **Replace:**
   ```cpp
   mbedtls_md5_starts_ret(&_ctx);
   mbedtls_md5_update_ret(&_ctx, data, len);
   mbedtls_md5_finish_ret(&_ctx, _buf);
   ```
   **With:**
   ```cpp
   mbedtls_md5_starts(&_ctx);
   mbedtls_md5_update(&_ctx, data, len);
   mbedtls_md5_finish(&_ctx, (unsigned char *)_buf);
   ```
3. Save the file and click **Verify/Compile** in Arduino IDE. It will compile cleanly!

#### Solution 2: Install Modern Mathieu Carbou Fork (Permanent)
Mathieu Carbou (the creator of `MycilaESPConnect`) maintains the modern fork of `ESPAsyncWebServer` specifically designed for Arduino-ESP32 3.x and ESP-IDF 5:
1. Close Arduino IDE.
2. In your `Arduino\libraries\` folder, delete the old `ESPAsyncWebServer` folder.
3. Open Arduino IDE > **Sketch > Include Library > Manage Libraries...**
4. Search for `ESPAsyncWebServer` and install the version by **Mathieu Carbou** (or **ESP32Async**).
5. Also ensure `AsyncTCP` is by **Mathieu Carbou** (v3.3.0+).

---

### Runtime Fixes (Clock Speed, Ethernet, and Port 80)

1. **Slow Clock (5-Second Stutter / Delay):**
   * **Cause:** When offline or when the server is unreachable, `SocketIOclient` (`socket.loop()`) attempts a blocking TCP connect with a 5000ms timeout per loop iteration.
   * **Solution:** `socket.loop()` is now gated by `if (networkConnected)`. `connectToServer()` is deferred until an IP is assigned. The clock now refreshes smoothly every second.

2. **W5500 Ethernet Initialization in Arduino IDE:**
   * **Cause:** In Arduino IDE, preprocessor macros (e.g. `#define ESPCONNECT_ETH_SUPPORT`) in a sketch do not propagate to precompiled library object files like `MycilaESPConnect.cpp`.
   * **Solution:** Explicit hardware initialization of the SPI bus (`SPI.begin(5, 7, 8, 6)`) and Ethernet driver (`ETH.begin(ETH_PHY_W5500, 1, 6, -1, -1, SPI)`) is performed directly in `setup()` with `WiFi.onEvent()` for DHCP and link monitoring.

3. **Web Interface "Connection Refused":**
   * **Cause:** `server.begin()` was omitted in `setupWebServer()`.
   * **Solution:** `server.begin()` is now called explicitly, making the dashboard and REST API immediately accessible on port 80 at `http://<device-ip>/`.
