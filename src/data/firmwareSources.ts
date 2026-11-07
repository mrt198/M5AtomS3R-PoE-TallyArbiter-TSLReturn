/**
 * Firmware source files and documentation for M5AtomS3R + AtomPoE Tally Listener
 */
import cppRaw from '../firmware/m5atoms3r_atompoe_tally_tsl.cpp?raw';

export const CPP_FIRMWARE_SOURCE = cppRaw;

export const PLATFORMIO_INI = `; PlatformIO Project Configuration for M5Stack M5AtomS3R with AtomPoE (W5500)
; Tally Arbiter, TSL 3.1 UDP, ETC CueSystem, & NMOS IS-07 Listener with Double-Buffered M5Canvas

; MycilaESPConnect with W5500 SPI Ethernet requires Arduino-ESP32 v3.x (ESP-IDF 5)
platform = https://github.com/pioarduino/platform-espressif32/releases/download/55.03.311/platform-espressif32.zip
board = esp32-s3-devkitc-1
framework = arduino

; Serial Monitor & Upload Speeds
monitor_speed = 115200
upload_speed = 921600

; Flash and PSRAM settings for M5AtomS3R (8MB Flash, 8MB Octal PSRAM)
board_build.mcu = esp32s3
board_build.f_cpu = 240000000L
board_build.f_flash = 80000000L
board_build.flash_mode = qio
board_build.partitions = default_8MB.csv

build_flags =
    -D ARDUINO_USB_CDC_ON_BOOT=1
    -D ARDUINO_USB_MODE=1
    -D BOARD_HAS_PSRAM
    -mfix-esp32-psram-cache-issue
    ; MycilaESPConnect Ethernet Configuration (W5500 SPI on AtomPoE)
    -D ESPCONNECT_ETH_SUPPORT
    -D ETH_PHY_TYPE=ETH_PHY_W5500
    -D ETH_PHY_ADDR=1
    -D ETH_PHY_CS=6
    -D ETH_PHY_IRQ=-1
    -D ETH_PHY_RST=-1
    -D ETH_PHY_SPI_SCK=5
    -D ETH_PHY_SPI_MISO=7
    -D ETH_PHY_SPI_MOSI=8
    -D ETH_PHY_SPI_HOST=SPI2_HOST
    ; Core Debug Level (Set to ARDUHAL_LOG_LEVEL_INFO or DEBUG for diagnostics)
    -D CORE_DEBUG_LEVEL=ARDUHAL_LOG_LEVEL_INFO

lib_deps =
    m5stack/M5Unified @ 0.2.2
    m5stack/M5GFX @ 0.2.24
    mathieucarbou/MycilaESPConnect @ ^10.6.3
    ESP32Async/AsyncTCP @ ^3.3.2
    ESP32Async/ESPAsyncWebServer @ ^3.6.0
    links2004/WebSockets @ ^2.4.1
    arduino-libraries/Arduino_JSON @ ^0.2.0
    bblanchon/ArduinoJson @ ^7.2.0
`;

export interface MigrationDiff {
  category: string;
  original: string;
  adapted: string;
  explanation: string;
}

export const MIGRATION_DIFFS: MigrationDiff[] = [
  {
    category: 'Display & Double Buffering',
    original: `// M5StickC: Direct screen drawing with visible flicker
M5.Lcd.fillScreen(bgColor);
M5.Lcd.setTextSize(2);
M5.Lcd.drawString(DeviceName, 10, 40);
// Every redraw directly updates LCD controller,
// causing flicker and tearing across color changes.`,
    adapted: `// AtomS3R: Zero-flicker double-buffered M5Canvas
M5Canvas canvas(&M5.Display);
canvas.setColorDepth(16);
canvas.createSprite(128, 128); // 32KB buffer in PSRAM

// Draw everything off-screen:
canvas.fillScreen(bgColor);
canvas.drawString(DeviceName, 64, 46);

// Single atomic SPI DMA blast to LCD:
canvas.pushSprite(0, 0);`,
    explanation: 'The AtomS3R features 8MB Octal PSRAM. Allocating a 32KB RGB565 sprite enables 100% flicker-free rendering by composing frames off-screen and blitting to the GC9107 display in a single atomic DMA burst.'
  },
  {
    category: 'Network Management & Ethernet',
    original: `// M5StickC: Hardcoded Wi-Fi & blocking reconnect loop
WiFi.mode(WIFI_STA);
WiFi.begin(ssid, password);
while (WiFi.status() != WL_CONNECTED) {
  delay(500); // Blocks MCU
}
// Deadlocks if Wi-Fi drops or credentials change.`,
    adapted: `// AtomS3R: W5500 SPI Ethernet with Wi-Fi / AP fallback
SPI.begin(5, 7, 8, 6);
ETH.begin(ETH_PHY_W5500, 1, 6, -1, -1, SPI);

// Non-blocking loop guard:
if (networkConnected) {
  socket.loop(); // Prevents 5-second socket timeout stalls
}`,
    explanation: 'The AtomPoE base connects via SPI (SCK:5, CS:6, MISO:7, MOSI:8). Native ETH.begin() with WiFi.onEvent() guarantees instant DHCP over PoE, while socket.loop() is gated to eliminate 5-second connection stalls when offline.'
  },
  {
    category: 'Network IP Configuration: DHCP vs Static IP',
    original: `// Legacy: DHCP only, no manual IP configuration
ETH.begin(); // Relied strictly on DHCP router availability`,
    adapted: `// AtomS3R: Mode-aware DHCP vs Static IP support
void applyNetworkIPConfig() {
  if (useDHCP) {
    ETH.config(IPAddress(0,0,0,0), IPAddress(0,0,0,0), IPAddress(0,0,0,0));
  } else {
    IPAddress ip, gw, mask, dns;
    ip.fromString(static_ip);
    gw.fromString(static_gw);
    mask.fromString(static_mask);
    dns.fromString(static_dns);
    ETH.config(ip, gw, mask, dns);
  }
}`,
    explanation: 'Studio facilities often require fixed Static IP addressing on dedicated broadcast VLANs without DHCP servers. Configurable IP, Subnet Mask, Gateway, and DNS Server settings are persisted in NVS and applied dynamically.'
  },
  {
    category: 'Button Controls & Navigation',
    original: `// M5StickC: Two physical buttons
if (digitalRead(M5_BUTTON_HOME) == LOW) {
  // Action A (BtnA)
}
if (digitalRead(M5_BUTTON_RST) == LOW) {
  // Action B (BtnB)
}`,
    adapted: `// AtomS3R: Single LCD button gesture multiplexer
if (M5.BtnA.wasClicked()) {
  if (isETCCueSystem()) sendCueAck();
  else if (isNMOSIS07()) sendNMOSTally(nmos_is_on_air);
  else sendtally(1, ch1state);
}
if (M5.BtnA.wasDoubleClicked()) currentScreen = !currentScreen;
if (M5.BtnA.wasHold())          updateBrightness();
if (M5.BtnA.pressedFor(7000))   resetNetworkAndReboot();`,
    explanation: 'The AtomS3R replaces separate physical buttons with a single tactile switch beneath the LCD. Multi-click and hold duration gestures provide full navigation for Cue toggle, diagnostics screen switching, and brightness control.'
  },
  {
    category: 'Operating Modes: TP vs Presenter TSL Returns',
    original: `// Legacy: Hardcoded to send TSL Program tally return
command[1] = live ? (FULLBRIGHT + REDTALLY) : FULLBRIGHT;
udp.beginPacket(tallyarbiter_host, 8910);
// Presenters had no way to send Preview cueing`,
    adapted: `// AtomS3R: Mode-aware TSL 3.1 return protocol
if (isPresenter()) {
  command[1] = live ? (FULLBRIGHT + GREENTALLY) : FULLBRIGHT; // 0x31 Preview cue
} else {
  command[1] = live ? (FULLBRIGHT + REDTALLY) : FULLBRIGHT;   // 0x32 Program cue
}`,
    explanation: 'Presenter mode sends green TSL 3.1 Preview (0x31) cues on button click, while TP mode sends red TSL Program (0x32) return cues, giving camera operators, vision mixers, and presenters dedicated bidirectional feedback.'
  },
  {
    category: 'Zero-Conf P2P Pairing (mDNS / DNS-SD)',
    original: `// Legacy: Strictly required a running Tally Arbiter server
socket.begin(tallyarbiter_host, port);
// No direct unit-to-unit communication possible
// If TA server went down, entire tally was lost.`,
    adapted: `// AtomS3R: mDNS _cuelx-tally._udp DNS-SD advertising & discovery
MDNS.addService("cuelx-tally", "udp", 8910);
MDNS.addServiceTxt("cuelx-tally", "udp", "role", isPresenter() ? "presenter" : "tp");
MDNS.addServiceTxt("cuelx-tally", "udp", "group", pairingGroup.c_str());

// Scan local subnet and pair directly:
int count = MDNS.queryService("cuelx-tally", "udp");`,
    explanation: 'Point-to-Point (P2P) mode allows Presenter and TP units to discover and pair directly over mDNS / DNS-SD without needing Tally Arbiter. Group tags (e.g. Studio-1, Studio-2) isolate multiple pairs on the same subnet.'
  },
  {
    category: 'ETC CueSystem Theatrical Stage Cue Protocol',
    original: `// Legacy: Broadcast video tally only (no stage cueing support)`,
    adapted: `// AtomS3R: ETC CueSystem Outstation Protocol
// Standby (Amber) and Go (Green) commands received from master hub:
// CS,<channel>,STANDBY  -> Amber Display
// CS,<channel>,GO       -> Green Display
// Button press sends stage performer acknowledgment:
udp.beginPacket(cuesystem_host, cuesystem_port);
udp.write("CS,1,ACK\\n");
udp.endPacket();`,
    explanation: 'Direct compatibility with ETC CueSystem hubs used in opera houses and theatres. The AtomS3R functions as a networked stage cue light outstation with performer acknowledgment return.'
  },
  {
    category: 'AMWA NMOS IS-07 Event & Tally (SMPTE ST 2110)',
    original: `// Legacy: Proprietary WebSocket or legacy TSL 3.1 only`,
    adapted: `// AtomS3R: NMOS IS-07 Event & Tally integration
// JSON state event payload registered with IS-04 node:
{
  "source_id": "m5atoms3r-tally-01",
  "topic": "device/tally/state",
  "payload": { "value": true }
}`,
    explanation: 'AMWA NMOS IS-07 provides open-standard IP tally and GPI events for SMPTE ST 2110 broadcast infrastructures, with IS-04 Registration & Discovery Server support.'
  }
];
