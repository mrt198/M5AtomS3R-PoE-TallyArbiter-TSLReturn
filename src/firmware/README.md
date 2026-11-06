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
