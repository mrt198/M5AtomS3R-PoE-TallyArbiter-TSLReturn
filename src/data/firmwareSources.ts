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
    adapted: `// AtomS3R: W5500 SPI Ethernet with Dual-Core FreeRTOS Task Isolation
SPI.begin(5, 7, 8, 6);
ETH.begin(ETH_PHY_W5500, 1, 6, -1, -1, SPI);

// Pin Socket.IO network loop to Core 0 (PRO_CPU):
xTaskCreatePinnedToCore(socketTask, "socketTask", 8192, NULL, 1, &socketTaskHandle, 0);

// Core 1 loop() is 100% dedicated to display, button, and <1ms UDP tally:
void loop() {
  processIncomingTSL(); // Instant UDP tally reception (<1ms)
  // Non-blocking clock updates exactly on the second
}`,
    explanation: 'The AtomPoE base connects via SPI (SCK:5, CS:6, MISO:7, MOSI:8). By pinning socket.loop() to Core 0 in a FreeRTOS background task, any 4-second TCP handshake timeouts when Tally Arbiter is offline are completely isolated, leaving Core 1 100% responsive for GC9107 display rendering, smooth 1-second clock ticks, and instant tally response.'
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
    category: 'ETC CueSystem Flashing Standby & Performer Acknowledgment',
    original: `// Legacy: Static standby indicator without performer return ack
case CUE_STANDBY:
  fillScreen(TFT_AMBER);
  break;`,
    adapted: `// AtomS3R: Flashing Red Standby -> Solid Red on Acknowledgment
if (actualType == "\"standby\"") {
  if (!cuesystem_ack_active) {
    bgColor = ((millis() / 400) % 2 == 0) ? TFT_RED : TFT_BLACK; // Flashes Red
    statusLabel = "STANDBY";
  } else {
    bgColor = TFT_RED; // Solid Red once acknowledged
    statusLabel = "ACKNOWLEDGED";
  }
}
// Button press transmits CS,<channel>,ACK\\n back to stage hub:
void sendCueAck() {
  cuesystem_ack_active = true;
  udp.beginPacket(cuesystem_host.c_str(), cuesystem_port);
  udp.print("CS," + String(cuesystem_channel) + ",ACK\\n");
  udp.endPacket();
}`,
    explanation: 'Opera houses and theatres require the cue light to flash red when the stage manager calls Standby, transitioning immediately to solid red when the performer acknowledges. Pressing the AtomS3R screen button transmits the acknowledgment packet back to the ETC hub.'
  },
  {
    category: 'Diagnostics Page Background Follows Tally State',
    original: `// Legacy: Diagnostics page was strictly static black
if (currentScreen == 1) {
  g->fillScreen(TFT_BLACK);
  g->setTextColor(TFT_WHITE);
  // Display was disconnected from active tally state
}`,
    adapted: `// AtomS3R: Diagnostics page dynamically mirrors active tally color
void renderScreen() {
  uint16_t bgColor = TFT_BLACK;
  uint16_t textColor = TFT_WHITE;
  // Compute bgColor from Tally Arbiter, TSL, ETC, NMOS, rtpMIDI, or OSC
  ...
  if (currentScreen == 1) {
    g->fillScreen(bgColor); // Whole diagnostics page follows tally!
    // Text rendered with high contrast against active tally color
    g->setTextColor(textColor, bgColor);
  }
}`,
    explanation: 'Operators and engineers checking network diagnostics, IP configurations, or pairing status on Screen 1 can still immediately see live tally changes (Red, Green, Amber, Blue, White, or Flashing) because the diagnostics background tracks the active tally engine in real time.'
  },
  {
    category: 'AMWA NMOS IS-07 Multi-Endpoint Tally (Program, Preview, Aux)',
    original: `// Legacy: Single binary tally event endpoint
String nmos_topic = "device/tally/state";`,
    adapted: `// AtomS3R: Three independent endpoints with strict broadcast priority
String nmos_program_topic = "tally/program"; // Red (Priority 1)
String nmos_preview_topic = "tally/preview"; // Green (Priority 2)
String nmos_aux_topic     = "tally/aux";     // Amber (Priority 3)

// Incoming state evaluation:
if (nmos_program_active) actualType = "\"program\"";
else if (nmos_preview_active) actualType = "\"preview\"";
else if (nmos_aux_active) actualType = "\"aux\"";`,
    explanation: 'Broadcast SMPTE ST 2110 facilities require independent monitoring of Program, Preview, and Aux tally buses from NMOS IS-04/IS-07 message streams with deterministic priority arbitration.'
  },
  {
    category: 'rtpMIDI / AppleMIDI 6-Color Priority Engine',
    original: `// Legacy: No MIDI support (broadcast video protocols only)`,
    adapted: `// AtomS3R: rtpMIDI UDP 5004 with 6-level priority arbitration
// Supports Note On/Off, Control Change (CC), and Program Change (PC):
// Priority order: Red > Flashing Red > Green > Yellow > Blue > White
void evaluateRTPMidiState() {
  if (midi_active_red) actualType = "\"program\"";         // Priority 1
  else if (midi_active_flash_red) actualType = "\"flashred\""; // Priority 2
  else if (midi_active_green) actualType = "\"preview\"";     // Priority 3
  else if (midi_active_yellow) actualType = "\"yellow\"";     // Priority 4
  else if (midi_active_blue) actualType = "\"blue\"";         // Priority 5
  else if (midi_active_white) actualType = "\"white\"";       // Priority 6
}`,
    explanation: 'Enables audio engineers, DAW operators (Logic, Pro Tools, QLab), and live sound desks to drive studio cue lights over AppleMIDI / rtpMIDI network sessions with standard Note, CC, or PC triggers.'
  },
  {
    category: 'OSC (Open Sound Control) & Scrolling Text Ticker',
    original: `// Legacy: Fixed 16-character static text from TSL 3.1
g->drawString(DeviceName, 64, 46); // Clips if text exceeds screen width`,
    adapted: `// AtomS3R: OSC UDP 8000 + Smooth Horizontal Scrolling Marquee
// Handles /cuelight/red, /flashred, /green, /yellow, /blue, /white, & /text
if (isOSC() && osc_custom_message.length() > 0) displayName = osc_custom_message;

int textWidth = g->textWidth(displayName.c_str());
if (textWidth > 116) {
  // Smooth ticker animation (28 px/sec) without buffer reallocation:
  int scrollRange = textWidth + 128;
  int offset = (millis() / 35) % scrollRange;
  g->drawString(displayName, 120 - offset, 46);
} else {
  g->drawCenterString(displayName, 64, 46);
}`,
    explanation: 'Receives OSC messages (e.g. from QLab, ETC Eos, Reaper, or custom controllers) on UDP 8000. When custom message text is sent via /cuelight/text, strings longer than 116px scroll continuously ticker-tape style across the 128x128 display.'
  },
  {
    category: 'Internal 6-Axis IMU Screen Auto-Orientation',
    original: `// Legacy: Fixed hardware orientation (0 degrees only)
M5.Display.setRotation(0); // Upside down if mounted inverted on camera rigs`,
    adapted: `// AtomS3R: 6-Axis IMU (MPU6886 / BMI270) Auto-Rotation
float ax, ay, az;
M5.Imu.getAccel(&ax, &ay, &az);
uint8_t targetRot = currentRotation;
if (ay > 0.6f)       targetRot = 0; // Upright
else if (ax > 0.6f)  targetRot = 1; // Rotated Right 90°
else if (ay < -0.6f) targetRot = 2; // Inverted 180°
else if (ax < -0.6f) targetRot = 3; // Rotated Left 270°

// Debounce 250ms before flipping hardware scanout & M5Canvas sprite:
if (targetRot != currentRotation) {
  currentRotation = targetRot;
  M5.Display.setRotation(currentRotation);
  canvas.setRotation(currentRotation);
  renderScreen();
}`,
    explanation: 'Camera operators often clamp tally lights upside-down or sideways onto camera cages or teleprompters. The AtomS3R internal IMU automatically detects tilt and re-orients both the hardware display scanout and M5Canvas sprite buffer with zero PSRAM reallocation.'
  },
  {
    category: 'NMOS IS-04/IS-07 DNS-SD Auto-Discovery vs Manual',
    original: `// Legacy: Hardcoded IP & manual registry port only
String nmos_registry_host = "192.168.1.200";
int nmos_registry_port = 8235;`,
    adapted: `// AtomS3R: Zero-touch DNS-SD Discovery of _nmos-registration._tcp
if (nmos_auto_discover) {
  int n = MDNS.queryService("nmos-registration", "tcp");
  if (n > 0) {
    nmos_registry_host = MDNS.address(0).toString();
    nmos_registry_port = MDNS.port(0);
    Serial.printf("[NMOS] Discovered via DNS-SD: %s:%d\\n", nmos_registry_host.c_str(), nmos_registry_port);
  }
} else {
  // Use saved manual NVS preferences host & port
}`,
    explanation: 'Broadcast facilities with AMWA NMOS registries advertise via DNS-SD (_nmos-registration._tcp or _nmos-register._tcp). The unit automatically detects the active registry or falls back to manual static IP/port configuration.'
  },
  {
    category: 'TSL 3.1 Dedicated Listener with Centered Screen Name',
    original: `// Legacy: TSL return packet sender only, no standalone TSL 3.1 UDP/TCP server`,
    adapted: `// AtomS3R: Dedicated TSL 3.1 Server (UDP & AsyncTCP) with Centered Text
void processTSL31Packet(uint8_t* data, size_t len) {
  if (len < 18) return;
  uint8_t addr = data[0] & 0x7F;
  uint8_t ctrl = data[1];
  char label[17] = {0};
  memcpy(label, &data[2], 16);
  // Parses Tally 1 (Red), Tally 2 (Green), Tally 3 (Amber), Tally 4 (Blue)
  // Centers 16-char camera name directly on 128x128 GC9107 LCD
}`,
    explanation: 'Enables direct integration with vision mixers (Grass Valley, Sony, Ross Video, Blackmagic ATEM) sending standard TSL 3.1 UMD packets over UDP or TCP, displaying tally colors and centering the camera name on screen.'
  },
  {
    category: 'Configurable TSL Return Port in Tally Arbiter Mode',
    original: `// Legacy: Fixed port 8910 hardcoded in binary
int tsl_port = 8910; // Inflexible if studio uses alternate UDP port`,
    adapted: `// AtomS3R: Configurable TSL Port in Web Portal & NVS
preferences.putInt("tslPort", tsl_port);
// Bind UDP socket & direct return packets to user-specified port
udpTSL.begin(tsl_port);`,
    explanation: 'Allows multi-studio facilities to run multiple Tally Arbiter instances or custom TSL receivers on custom UDP ports without port collision.'
  },
  {
    category: 'PoE Ethernet Priority (Wi-Fi Radio Disabling)',
    original: `// Legacy: Dual-homed Ethernet and Wi-Fi causing duplicate IP & ARP conflicts
ETH.begin(...);
WiFi.begin(...);
// Both interfaces active simultaneously with distinct IP addresses`,
    adapted: `// AtomS3R: Dynamic PoE Precedence & Wi-Fi Power Down
void checkEthernetWifiPrecedence() {
  if (ETH.linkUp() && ETH.localIP() != IPAddress(0,0,0,0)) {
    if (WiFi.getMode() != WIFI_OFF) {
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF); // Power down 2.4GHz RF radio
    }
  } else if (!ETH.linkUp()) {
    if (WiFi.getMode() == WIFI_OFF) {
      WiFi.mode(WIFI_STA); // Fall back to wireless
      WiFi.begin();
    }
  }
}`,
    explanation: 'When AtomPoE W5500 SPI link is connected and receives an IP, the 2.4GHz Wi-Fi radio is cleanly shut down. This eliminates dual-homed ARP conflicts, reduces RF noise, and ensures the unit has exactly one deterministic IP on the studio subnet.'
  },
  {
    category: 'TSL 5.0 Dedicated Listener (UDP / TCP)',
    original: `// Legacy: No TSL 5.0 protocol support`,
    adapted: `// AtomS3R: TSL 5.0 Binary Protocol Parser with Screen & Index Filter
struct TSL50Header {
  uint16_t pbc;
  uint8_t  ver;
  uint8_t  flags;
  uint16_t screen;
  uint16_t index;
};
// Decodes 16-bit tally status flags (Tally 1..4, brightness, text length, UTF-16/ASCII)
// Matches against configured screen & device index filter, centering name on LCD`,
    explanation: 'Supports modern production routers and multiviewers (Evertz, Riedel, Lawo, Imagine Communications) communicating via TSL 5.0 binary protocol over UDP or TCP.'
  },
  {
    category: 'RSMCK OSC Cue Light for iOS Protocol (Port 53000)',
    original: `// Legacy: No cue light protocol matching iOS cue light apps`,
    adapted: `// AtomS3R: RSMCK OSC Cue Light Protocol Handler on UDP 53000
// Addresses:
//   /cuelight/[station]/standby_ack -> Flashing Red, awaits button ACK
//   /cuelight/[station]/standby     -> Solid Red
//   /cuelight/[station]/go          -> Solid Green
//   /cuelight/[station]/off         -> Black / Off
//   /cuelight/[station]/banner      -> Displays persistent top banner text
// Button single click sends:
//   /cuelight/state/[station]/ack   -> Solid Red confirmed`,
    explanation: 'Provides seamless zero-configuration compatibility with the widely used iOS OSC Cue Light app by RSMCK, supporting stage manager standby with performer acknowledgment, go cues, and banner messages.'
  }
];


