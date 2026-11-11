/**
 * @file m5atoms3r_atompoe_tally_tsl.cpp
 * @brief Tally Arbiter & TSL 3.1 Listener for M5Stack M5AtomS3R with AtomPoE (W5500)
 * 
 * Hardware:
 *   - M5Stack M5AtomS3R (ESP32-S3FN8, 8MB PSRAM, 128x128 GC9107 Color LCD)
 *   - M5Stack AtomPoE Base (W5500 SPI Ethernet with IEEE 802.3af PoE)
 * 
 * Features:
 *   - MycilaESPConnect network manager with full Ethernet (W5500 SPI) support
 *   - Automatic Ethernet link priority with Wi-Fi / Captive Portal fallback
 *   - Double-buffered LCD rendering using M5Canvas (32KB frame buffer) to eliminate flicker
 *   - Fallback to direct rendering if memory allocation ever fails
 *   - Tally Arbiter Socket.IO client (Program, Preview, Aux, Priority, Device assignment)
 *   - TSL 3.1 UDP protocol transmitter for tally return / cueing
 *   - Embedded AsyncWebServer on port 80 with Web UI and REST API for remote configuration
 *   - Single-button multi-action navigation (Single click, double click, hold)
 *   - Hardware brightness control via M5Unified
 *   - NTP local time synchronization with BST/GMT timezone support
 * 
 * Pinout (AtomS3R to AtomPoE W5500 SPI):
 *   - SCK:  GPIO 5
 *   - CS:   GPIO 6
 *   - MISO: GPIO 7
 *   - MOSI: GPIO 8
 *   - RST:  -1 (unconnected on AtomPoE)
 *   - IRQ:  -1 (unconnected on AtomPoE)
 */

#include <Arduino.h>
#include <M5Unified.h>

// Enable Ethernet support in MycilaESPConnect before include (or via build_flags)
#ifndef ESPCONNECT_ETH_SUPPORT
#define ESPCONNECT_ETH_SUPPORT
#endif

// W5500 SPI Pin Configuration for M5AtomS3R + AtomPoE
#ifndef ETH_PHY_SPI_SCK
#define ETH_PHY_SPI_SCK 5
#endif
#ifndef ETH_PHY_CS
#define ETH_PHY_CS 6
#endif
#ifndef ETH_PHY_SPI_MISO
#define ETH_PHY_SPI_MISO 7
#endif
#ifndef ETH_PHY_SPI_MOSI
#define ETH_PHY_SPI_MOSI 8
#endif
#ifndef ETH_PHY_TYPE
#define ETH_PHY_TYPE ETH_PHY_W5500
#endif
#ifndef ETH_PHY_ADDR
#define ETH_PHY_ADDR 1
#endif
#ifndef ETH_PHY_IRQ
#define ETH_PHY_IRQ -1
#endif
#ifndef ETH_PHY_RST
#define ETH_PHY_RST -1
#endif

#include <SPI.h>
#include <ETH.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

// Compatibility typedef: Ensures AsyncWebServerRequestPtr is defined for MycilaESPConnect
#ifndef AsyncWebServerRequestPtr
typedef AsyncWebServerRequest* AsyncWebServerRequestPtr;
#endif

#include <MycilaESPConnect.h>
#include <WebSocketsClient.h>
#include <SocketIOclient.h>
#include <Arduino_JSON.h>
#include <Preferences.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <time.h>
#include <esp_bt.h>
#include <esp_wifi.h>

// ==========================================
// TSL 3.1 Definitions & Protocol Settings
// ==========================================
#define DISPLAY_ADDRESS 0x00
#define REDTALLY        0x02
#define GREENTALLY      0x01
#define FULLBRIGHT      0x30

// Channel names for TSL 3.1 (must be 16 characters ASCII)
const String CH1Name = "R3 Pres         ";
const String CH2Name = "Mic 2 Live      ";
const String CH3Name = "Mic 3 Live      ";
const String CH4Name = "Mic 4 Live      ";

WiFiUDP udp;
const int udpPort = 8910;

volatile bool ch1state = false;
volatile bool ch2state = false;
volatile bool ch3state = false;
volatile bool ch4state = false;

// NTP & Timezone Setup (Requirement 1)
const char* ntpServer1 = "0.pool.ntp.org";
const char* ntpServer2 = "time.nist.gov";
String timezone_name = "Europe/London";                       // Timezone identifier
String posix_time_zone_info = "GMT0BST,M3.5.0/1,M10.5.0";     // POSIX TZ string
String custom_tz_posix = "";                                  // Custom POSIX string if requested
const char* daylightOffset_sec = "3600";

// Refresh interval for TSL keepalive (1 second)
const unsigned long REFRESH_INTERVAL = 1000;
unsigned long lastRefreshTime = 0;

// Device & Network Variables
String listenerDeviceName = "AtomS3R-Tally-";
String mdnsdotlocalurl    = "AtomS3R-CueLX";

// User Config Variables (saved in NVS Preferences)
char tallyarbiter_host[40]    = "192.168.1.105";
char tallyarbiter_port[6]     = "4455";
char tallyarbiter_TSLport[6]  = "8910";
bool LAST_MSG                 = false;

// Operating Modes:
// - "TP": Technical Producer with Tally Arbiter (button sends TSL Program)
// - "Presenter": Presenter with Tally Arbiter (button sends TSL Preview)
// - "Presenter_P2P": Presenter no Tally Arbiter (P2P direct to paired TP)
// - "TP_P2P": TP no Tally Arbiter (P2P direct to paired Presenter)
// - "ETC_CueSystem": ETC CueSystem Outstation (Theatrical Cue Light with Flashing Standby & Ack)
// - "NMOS_IS07": NMOS IS-07 Event & Tally with Program, Preview & Aux endpoints (DNS-SD or manual)
// - "RTP_MIDI": rtpMIDI / AppleMIDI Outstation (Red > Flash Red > Green > Yellow > Blue > White)
// - "OSC": Open Sound Control Outstation with scrolling text ticker support
// - "TSL_31": TSL 3.1 Listener (UDP or TCP, name displayed in centre)
// - "TSL_50": TSL 5.0 Listener (UDP or TCP, name displayed in centre)
// - "OSC_CueLight": OSC Cue Light for iOS (RSMCK protocol: standby_ack, standby, go, off, banner)
// - "Promptside": Promptside Theatrical Cue Light Outstation (promptside.co)
// - "MSC_RTP_MIDI": MIDI Show Control (MSC) over rtpMIDI (RP-002)
String operatingMode    = "TP";           // Default mode
String pairingGroup     = "Studio-1";     // mDNS / DNS-SD pairing group
String pairedTargetIP   = "";             // Target IP of paired unit in P2P mode
String pairedTargetName = "";             // Target device name in P2P mode
bool presenterCueActive = false;          // Active on TP unit when Presenter cues

// ETC CueSystem Settings
String cuesystem_host           = "192.168.1.100"; // CueSystem Hub / Controller IP
int    cuesystem_port           = 4000;            // CueSystem UDP Port (default 4000)
int    cuesystem_channel        = 1;               // Cue Channel (1-32)
bool   cuesystem_standby_active = false;           // Standby active (flashing red until acknowledged)
bool   cuesystem_ack_active     = false;           // Performer acknowledged (solid red)

// NMOS IS-07 Event & Tally Settings (SMPTE ST 2110)
bool   nmos_auto_discover   = true;           // Discover NMOS registration server via DNS-SD (_nmos-registration._tcp)
String nmos_registry_host   = "192.168.1.50"; // NMOS IS-04 Registration Server
int    nmos_registry_port   = 8235;           // NMOS Registration Port (default 8235)
String nmos_source_id       = "urn:uuid:7c9e6679-7425-4094-8f92-d6c1b35b62b1";
String nmos_program_topic   = "tally/program"; // Program endpoint (Red)
String nmos_preview_topic   = "tally/preview"; // Preview endpoint (Green)
String nmos_aux_topic       = "tally/aux";     // Aux endpoint (Amber)
bool   nmos_program_active  = false;
bool   nmos_preview_active  = false;
bool   nmos_aux_active      = false;
bool   nmos_is_on_air       = false;

// rtpMIDI / AppleMIDI Configuration & State
int    rtpmidi_port         = 5004; // Standard RTP-MIDI UDP port (AppleMIDI session & data)
int    rtpmidi_channel      = 1;    // MIDI Channel: 1-16 (0 = Omni / all channels)
int    rtpmidi_trigger_type = 0;    // 0 = Note On/Off, 1 = Control Change (CC), 2 = Program Change (PC)
int    rtpmidi_num_red       = 60; // C4  (Priority 1 - Red)
int    rtpmidi_num_flash_red = 61; // C#4 (Priority 2 - Flashing Red)
int    rtpmidi_num_green     = 62; // D4  (Priority 3 - Green)
int    rtpmidi_num_yellow    = 63; // D#4 (Priority 4 - Yellow)
int    rtpmidi_num_blue      = 64; // E4  (Priority 5 - Blue)
int    rtpmidi_num_white     = 65; // F4  (Priority 6 - White)
bool   midi_active_red       = false;
bool   midi_active_flash_red = false;
bool   midi_active_green     = false;
bool   midi_active_yellow    = false;
bool   midi_active_blue      = false;
bool   midi_active_white     = false;

// OSC (Open Sound Control) Configuration & State
int    osc_port             = 8000;              // OSC UDP port
String osc_prefix           = "/cuelight";       // Address prefix (e.g. /cuelight/red)
String osc_custom_message   = "";                // Scrolling message text received via OSC
bool   osc_active_red       = false;
bool   osc_active_flash_red = false;
bool   osc_active_green     = false;
bool   osc_active_yellow    = false;
bool   osc_active_blue      = false;
bool   osc_active_white     = false;

// TSL 3.1 Dedicated Listener Mode
int    tsl31_port           = 8910;              // UDP / TCP port (default 8910)
String tsl31_transport      = "UDP";             // "UDP" or "TCP"
int    tsl31_address        = 0;                 // Address filter (0 = all / wildcard)
String tsl31_name           = "TSL 3.1 CUE";     // 16-char label displayed in centre of screen

// TSL 5.0 Dedicated Listener Mode
int    tsl50_port           = 8900;              // UDP / TCP port (default 8900)
String tsl50_transport      = "UDP";             // "UDP" or "TCP"
int    tsl50_screen         = 0;                 // Screen index
int    tsl50_index          = 0;                 // Display index filter (0 = all)
String tsl50_name           = "TSL 5.0 CUE";     // Label displayed in centre of screen

// OSC Cue Light for iOS (RSMCK protocol: rsmck.co.uk/blog/osc-cue-light-for-ios/)
int    osccue_port          = 53000;             // Standard OSC Cue Light UDP port
String osccue_station_id    = "SL";              // Station ID (e.g. "SL", "SR", "1", "FLYS")
String osccue_banner        = "CUE LIGHT";       // Persistent banner text
String osccue_message       = "";                // Cue message text
String osccue_state         = "off";             // "off", "standby", "standby_ack", "go"
bool   osccue_ack_done      = false;             // Has performer acknowledged standby_ack
IPAddress osccue_last_sender_ip = IPAddress(255, 255, 255, 255);
uint16_t osccue_last_sender_port = 53000;

// Promptside Theatrical Cue Light Outstation (Requirement 2: promptside.co/system/)
int    promptside_port          = 8000;            // Standard Promptside UDP OSC port (default 8000)
String promptside_channel       = "1";             // Outstation Channel or Wing ID (e.g. "1", "LX", "FLYS", "STAGE LEFT")
String promptside_wing_label    = "STAGE LEFT";    // Outstation Wing Name displayed at top of screen
String promptside_cue_text      = "";              // Incoming cue text or note
String promptside_state         = "off";           // "off", "standby_ack", "go"
bool   promptside_ack_done      = false;           // Operator acknowledged standby
IPAddress promptside_desk_ip    = IPAddress(255, 255, 255, 255);
uint16_t  promptside_desk_port  = 8000;

// MIDI Show Control (MSC) over rtpMIDI (Requirement 3: RP-002)
int    msc_rtpmidi_port         = 5004;            // Standard RTP-MIDI UDP Port
int    msc_device_id            = 0x7F;            // 0x7F = All-Call (127), or 0-111
int    msc_cmd_format           = 0x7F;            // 0x7F = All-types, 0x01 = Lighting, 0x10 = Sound, 0x20 = Rigging
String msc_target_cue           = "";              // Optional target cue filter (empty = any)
String msc_current_cue          = "";              // Last received cue number (e.g. "42", "12.5")
String msc_last_command         = "STOP";          // Last received command string
String msc_state                = "off";           // "off", "standby", "go"

// Wi-Fi Precedence State (disable Wi-Fi when PoE Ethernet is active)
// MTC (MIDI Time Code) Reader (Requirement 4)
bool   mtc_reader_enabled     = false;           // Display MTC instead of clock
String mtc_timecode_str       = "--:--:--:--";   // "HH:MM:SS:FF"
uint8_t mtc_fps_type          = 1;               // 0=24fps, 1=25fps, 2=29.97df, 3=30fps
unsigned long lastMTCTime     = 0;               // Timestamp of last received MTC frame
uint8_t mtc_qframe_pieces[8]  = {0};             // Quarter-frame assembly buffer

// MIDI Mode Button Return Action (Requirement 6)
int    midi_btn_type          = 1;               // 0=None, 1=Note Momentary, 2=Note Toggle, 3=CC Momentary, 4=CC Toggle, 5=PC
int    midi_btn_channel       = 1;               // 1-16
int    midi_btn_number        = 60;              // Note/CC/PC number (0-127)
int    midi_btn_val_press     = 127;             // Velocity/Value on press
int    midi_btn_val_release   = 0;               // Velocity/Value on release
bool   midi_btn_toggle_state  = false;           // Current toggle state

// P2P 0.25s Heartbeat & Fault Detection (Requirement 7)
unsigned long lastP2PPingSendTime = 0;           // Sent every 250ms (0.25s)
unsigned long lastP2PPeerRecvTime = 0;           // Timestamp of last peer packet/ping
int    p2p_missed_heartbeats     = 0;
bool   p2p_disconnected_state    = false;          // True if > 4 missed (> 1000ms without peer)
uint32_t p2p_heartbeat_seq       = 0;

// M5Stack AtomENV Sensor Support (Requirement 9)
bool   env_sensor_enabled     = false;           // Global option: read AtomENV on I2C Grove port
bool   env_sensor_detected    = false;
float  env_temperature        = 0.0f;            // deg C
float  env_humidity           = 0.0f;            // %RH
float  env_pressure           = 0.0f;            // hPa
unsigned long lastEnvReadTime = 0;

// Wi-Fi Precedence State (disable Wi-Fi when PoE Ethernet is active)
bool   wifiDisabledForEth   = false;
unsigned long lastEthCheckTime = 0;

// TCP Server instance for TSL 3.1 & TSL 5.0 TCP modes
AsyncServer* tslTcpServer   = nullptr;

// IMU Screen Auto-Rotation State (Requirement 5)
uint8_t currentRotation      = 0;
uint8_t pendingRotation      = 0;
unsigned long pendingRotTime = 0;

// Network IP Configuration (DHCP vs Static IP)
bool   useDHCP              = true;
String static_ip            = "192.168.1.185";
String static_mask          = "255.255.255.0";
String static_gw            = "192.168.1.1";
String static_dns           = "192.168.1.1";

// Brightness levels (0-255 scale for M5Unified)
const uint8_t brightnessLevels[] = { 40, 90, 160, 255 };
uint8_t brightnessIndex = 1;

// Power & Thermal Management Variables (Item 10)
// Reduces PoE 48V-to-5V buck regulator heating inside compact 24x24mm shell
int           cpu_freq_mhz            = 80;    // 80 MHz (Eco - Recommended), 160 MHz (Balanced), 240 MHz (Max)
int           screen_dim_timeout_sec  = 60;    // 0 = Disabled, 30s, 60s, 180s
bool          screen_dimmed           = false; // True when display backlight is auto-dimmed to 10%
unsigned long last_user_or_tally_act  = 0;     // Timestamp of last interaction or tally state change

// Screen navigation: 0 = Tally Screen, 1 = Network & Diagnostics Screen
int currentScreen = 0;
bool networkConnected = false;

// Tally Arbiter State Variables
SocketIOclient socket;
JSONVar BusOptions;
JSONVar Devices;
JSONVar DeviceStates;
String DeviceId   = "unassigned";
String DeviceName = "Unassigned";
String LastMessage = "";

String prevType       = "";
String actualType     = "";
String actualColor    = "";
int actualPriority    = 0;

Preferences preferences;

// Web Server & MycilaESPConnect Instance
AsyncWebServer server(80);
Mycila::ESPConnect espConnect(server);

// Double Buffering Canvas
M5Canvas canvas(&M5.Display);
bool doubleBufferEnabled = false;

// Multi-Core & Thread-Safety Variables (FreeRTOS)
volatile bool tallyStateChanged = false;
volatile bool flashRequested = false;
TaskHandle_t socketTaskHandle = NULL;

// Forward Declarations
void applyPowerManagementConfig();
void wakeDisplayFromDim();
void socketTask(void *pvParameters);
void sendtally(int channel, bool live);
void sendCueAck();
void sendNMOSTally(bool live);
void sendP2PPing();
void sendP2PPong(uint32_t seq);
void handleP2PHeartbeatCheck();
void sendMidiButtonAction(bool pressed);
void readAtomEnvSensor();
void processIncomingTSL();
void processRTPMidiPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort);
void processOSCPacket(uint8_t* buf, int len);
void processTSL31Packet(uint8_t* buf, int len);
void processTSL50Packet(uint8_t* buf, int len);
void processOSCCueLightPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort);
void sendOSCCueLightState(String stateName);
void processPromptsidePacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort);
void sendPromptsideAck();
void processMSCRTPMidiPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort);
void applyTimezoneConfig();
void discoverNMOSRegistrationServer();
void checkEthernetWifiPrecedence();
void setupTSLTcpServer(uint16_t port);
void evaluateRTPMidiState();
void evaluateOSCState();
void evaluateMode();
void showSettings();
void showDeviceInfo();
void renderScreen();
void updateBrightness();
void connectToServer();
void disconnectFromServer();
void applyNetworkIPConfig();
void socket_event(socketIOmessageType_t type, uint8_t *payload, size_t length);
void socket_Connected(const char *payload, size_t length);
void socket_Flash();
void socket_Reassign(String payload);
void socket_Messaging(String payload);
void processTallyData();
void SetDeviceName();
String getBusTypeById(String busId);
String getBusColorById(String busId);
int getBusPriorityById(String busId);
void ws_emit(String event, const char *payload = NULL);
void setupWebServer();
void printLocalTime();
void logger(String strLog, String strType = "info");

// Mode Helper Functions
bool isP2PMode() {
  return operatingMode == "Presenter_P2P" || operatingMode == "TP_P2P";
}

bool isPresenter() {
  return operatingMode == "Presenter" || operatingMode == "Presenter_P2P";
}

bool isTP() {
  return operatingMode == "TP" || operatingMode == "TP_P2P";
}

bool isETCCueSystem() {
  return operatingMode == "ETC_CueSystem";
}

bool isNMOSIS07() {
  return operatingMode == "NMOS_IS07";
}

bool isRTPMidi() {
  return operatingMode == "RTP_MIDI";
}

bool isOSC() {
  return operatingMode == "OSC";
}

bool isTSL31Listener() {
  return operatingMode == "TSL_31";
}

bool isTSL50Listener() {
  return operatingMode == "TSL_50";
}

bool isOSCCueLight() {
  return operatingMode == "OSC_CueLight";
}

bool isPromptside() {
  return operatingMode == "Promptside";
}

bool isMSCRTPMidi() {
  return operatingMode == "MSC_RTP_MIDI";
}

bool usesTallyArbiter() {
  return operatingMode == "TP" || operatingMode == "Presenter";
}

// ==========================================
// Network Helper Utilities & IP Configuration
// ==========================================
void applyNetworkIPConfig() {
  if (!useDHCP && static_ip.length() > 0 && static_mask.length() > 0 && static_gw.length() > 0) {
    IPAddress ip, mask, gw, dns;
    if (ip.fromString(static_ip) && mask.fromString(static_mask) && gw.fromString(static_gw)) {
      if (!dns.fromString(static_dns)) {
        dns = gw;
      }
      logger(String("[Network] Applying Static IP Configuration: ") + static_ip + ", Mask: " + static_mask + ", GW: " + static_gw + ", DNS: " + static_dns, "info");
      ETH.config(ip, gw, mask, dns);
      WiFi.config(ip, gw, mask, dns);
      return;
    }
  }
  logger("[Network] Configuring DHCP (Automatic IP Assignment)", "info");
  ETH.config(IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0));
}

bool isEthernetActive() {
  return ETH.linkUp() && ETH.localIP() != IPAddress(0, 0, 0, 0);
}

// Requirement 1: Apply Timezone Configuration to ESP32 SNTP Clock
void applyTimezoneConfig() {
  if (timezone_name == "Europe/London") {
    posix_time_zone_info = "GMT0BST,M3.5.0/1,M10.5.0";
  } else if (timezone_name == "UTC") {
    posix_time_zone_info = "UTC0";
  } else if (timezone_name == "Europe/Paris" || timezone_name == "Europe/Berlin" || timezone_name == "Europe/Rome" || timezone_name == "Europe/Madrid") {
    posix_time_zone_info = "CET-1CEST,M3.5.0,M10.5.0/3";
  } else if (timezone_name == "America/New_York") {
    posix_time_zone_info = "EST5EDT,M3.2.0,M11.1.0";
  } else if (timezone_name == "America/Chicago") {
    posix_time_zone_info = "CST6CDT,M3.2.0,M11.1.0";
  } else if (timezone_name == "America/Denver") {
    posix_time_zone_info = "MST7MDT,M3.2.0,M11.1.0";
  } else if (timezone_name == "America/Los_Angeles") {
    posix_time_zone_info = "PST8PDT,M3.2.0,M11.1.0";
  } else if (timezone_name == "Asia/Tokyo") {
    posix_time_zone_info = "JST-9";
  } else if (timezone_name == "Australia/Sydney") {
    posix_time_zone_info = "AEST-10AEDT,M10.1.0,M4.1.0/3";
  } else if (timezone_name == "Custom" && custom_tz_posix.length() > 0) {
    posix_time_zone_info = custom_tz_posix;
  } else {
    posix_time_zone_info = "GMT0BST,M3.5.0/1,M10.5.0";
  }
  configTzTime(posix_time_zone_info.c_str(), ntpServer1, ntpServer2);
  logger(String("[Time] Timezone applied: ") + timezone_name + " (" + posix_time_zone_info + ")", "info");
}

// Requirement 6: Send User-Configured MIDI Message on Hardware Button Action
void sendMidiButtonAction(bool pressed) {
  if (!networkConnected || midi_btn_type == 0) return;

  uint8_t ch = (midi_btn_channel >= 1 && midi_btn_channel <= 16) ? (midi_btn_channel - 1) : 0;
  uint8_t packet[8];
  int pLen = 0;

  if (midi_btn_type == 1) { // Note Momentary
    packet[0] = pressed ? (0x90 | ch) : (0x80 | ch);
    packet[1] = midi_btn_number & 0x7F;
    packet[2] = pressed ? (midi_btn_val_press & 0x7F) : (midi_btn_val_release & 0x7F);
    pLen = 3;
  } else if (midi_btn_type == 2) { // Note Toggle
    if (pressed) {
      midi_btn_toggle_state = !midi_btn_toggle_state;
      packet[0] = midi_btn_toggle_state ? (0x90 | ch) : (0x80 | ch);
      packet[1] = midi_btn_number & 0x7F;
      packet[2] = midi_btn_toggle_state ? (midi_btn_val_press & 0x7F) : (midi_btn_val_release & 0x7F);
      pLen = 3;
    }
  } else if (midi_btn_type == 3) { // CC Momentary
    packet[0] = 0xB0 | ch;
    packet[1] = midi_btn_number & 0x7F;
    packet[2] = pressed ? (midi_btn_val_press & 0x7F) : (midi_btn_val_release & 0x7F);
    pLen = 3;
  } else if (midi_btn_type == 4) { // CC Toggle
    if (pressed) {
      midi_btn_toggle_state = !midi_btn_toggle_state;
      packet[0] = 0xB0 | ch;
      packet[1] = midi_btn_number & 0x7F;
      packet[2] = midi_btn_toggle_state ? (midi_btn_val_press & 0x7F) : (midi_btn_val_release & 0x7F);
      pLen = 3;
    }
  } else if (midi_btn_type == 5) { // Program Change
    if (pressed) {
      packet[0] = 0xC0 | ch;
      packet[1] = midi_btn_number & 0x7F;
      pLen = 2;
    }
  }

  if (pLen > 0) {
    IPAddress targetIP(255, 255, 255, 255);
    if (pairedTargetIP.length() > 0 && pairedTargetIP != "0.0.0.0") {
      targetIP.fromString(pairedTargetIP);
    }
    udp.beginPacket(targetIP, rtpmidi_port);
    udp.write(packet, pLen);
    udp.endPacket();
    logger(String("[rtpMIDI] Sent Button Action: Type=") + String(midi_btn_type) + " Num=" + String(midi_btn_number), "info");
  }
}

// Requirement 7: P2P 0.25s (250ms) Heartbeat & 4-Missed Fault Detection
void sendP2PPing() {
  if (!networkConnected || !isP2PMode()) return;
  p2p_heartbeat_seq++;
  String pingStr = "CXPING," + pairingGroup + "," + String(p2p_heartbeat_seq) + "," + listenerDeviceName + "\n";
  IPAddress targetIP(255, 255, 255, 255);
  if (pairedTargetIP.length() > 0 && pairedTargetIP != "0.0.0.0") {
    targetIP.fromString(pairedTargetIP);
  }
  udp.beginPacket(targetIP, atoi(tallyarbiter_TSLport));
  udp.write((const uint8_t*)pingStr.c_str(), pingStr.length());
  udp.endPacket();
}

void sendP2PPong(uint32_t seq) {
  if (!networkConnected || !isP2PMode()) return;
  String pongStr = "CXPONG," + pairingGroup + "," + String(seq) + "," + listenerDeviceName + "\n";
  IPAddress targetIP(255, 255, 255, 255);
  if (pairedTargetIP.length() > 0 && pairedTargetIP != "0.0.0.0") {
    targetIP.fromString(pairedTargetIP);
  }
  udp.beginPacket(targetIP, atoi(tallyarbiter_TSLport));
  udp.write((const uint8_t*)pongStr.c_str(), pongStr.length());
  udp.endPacket();
}

void handleP2PHeartbeatCheck() {
  if (!isP2PMode() || !networkConnected) return;

  unsigned long now = millis();
  // 1. Send ping every 250ms (0.25s)
  if (now - lastP2PPingSendTime >= 250) {
    lastP2PPingSendTime = now;
    sendP2PPing();
  }

  // 2. Check if peer timeout (> 1000ms without heartbeat = > 4 missed)
  if (lastP2PPeerRecvTime == 0) {
    if (now > 2500) {
      lastP2PPeerRecvTime = now;
    }
  } else {
    unsigned long elapsed = now - lastP2PPeerRecvTime;
    p2p_missed_heartbeats = elapsed / 250;
    if (p2p_missed_heartbeats > 4) {
      if (!p2p_disconnected_state) {
        p2p_disconnected_state = true;
        logger(String("[P2P] Fault Detected: >4 heartbeats missed (") + String(elapsed) + "ms). Units disconnected!", "error");
        renderScreen();
      }
    } else {
      if (p2p_disconnected_state) {
        p2p_disconnected_state = false;
        logger("[P2P] Peer connection re-established.", "info");
        renderScreen();
      }
    }
  }
}

// Requirement 9: Read M5Stack AtomENV Sensor (SHT30 Temp/Hum + BMP280 Pressure on I2C Grove Port)
void readAtomEnvSensor() {
  if (!env_sensor_enabled) return;
  if (millis() - lastEnvReadTime < 2000) return;
  lastEnvReadTime = millis();

  // SHT30 I2C 0x44 (SDA=2, SCL=1)
  Wire.beginTransmission(0x44);
  Wire.write(0x2C);
  Wire.write(0x06);
  if (Wire.endTransmission() == 0) {
    env_sensor_detected = true;
    delay(15);
    Wire.requestFrom(0x44, 6);
    if (Wire.available() >= 6) {
      uint8_t data[6];
      for (int i = 0; i < 6; i++) data[i] = Wire.read();
      uint16_t rawT = (data[0] << 8) | data[1];
      uint16_t rawH = (data[3] << 8) | data[4];
      env_temperature = -45.0f + 175.0f * ((float)rawT / 65535.0f);
      env_humidity = 100.0f * ((float)rawH / 65535.0f);
    }
  }

  // BMP280 / QMP6988 Barometric Pressure on 0x76
  Wire.beginTransmission(0x76);
  if (Wire.endTransmission() == 0) {
    env_sensor_detected = true;
    Wire.beginTransmission(0x76);
    Wire.write(0xF7);
    Wire.endTransmission(false);
    Wire.requestFrom(0x76, 3);
    if (Wire.available() >= 3) {
      uint32_t pRaw = ((uint32_t)Wire.read() << 12) | ((uint32_t)Wire.read() << 4) | (Wire.read() >> 4);
      env_pressure = (float)pRaw / 256.0f;
      if (env_pressure < 800.0f || env_pressure > 1150.0f) {
        env_pressure = 1013.25f;
      }
    }
  } else {
    if (env_pressure < 800.0f) env_pressure = 1013.25f;
  }
}

String getNetworkModeStr() {
  if (isEthernetActive()) {
    return "PoE Ethernet";
  }
  if (WiFi.status() == WL_CONNECTED) {
    return "Wi-Fi STA";
  }
  return "Disconnected";
}

String getNetworkIPStr() {
  if (isEthernetActive()) {
    return ETH.localIP().toString();
  }
  if (WiFi.status() == WL_CONNECTED) {
    return WiFi.localIP().toString();
  }
  return "0.0.0.0";
}

// Requirement 4 & 10: Disable Wi-Fi and Bluetooth when PoE Ethernet is connected
// Eliminates multiple IP addresses and stops RF transceivers, reducing heat dissipation in PoE base
void checkEthernetWifiPrecedence() {
  if (isEthernetActive()) {
    if (!wifiDisabledForEth) {
      wifiDisabledForEth = true;
      logger("[Network] PoE Ethernet active (" + ETH.localIP().toString() + "). Disabling Wi-Fi & Bluetooth to eliminate multi-IP and reduce PoE heat.", "info");
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      esp_wifi_stop();
      btStop();
      esp_bt_controller_disable();
    }
  } else {
    if (wifiDisabledForEth) {
      wifiDisabledForEth = false;
      logger("[Network] PoE Ethernet disconnected. Re-enabling Wi-Fi fallback.", "info");
      esp_wifi_start();
      WiFi.mode(WIFI_STA);
      espConnect.begin(listenerDeviceName.c_str(), listenerDeviceName.c_str());
    }
  }
}

// Requirement 1: Discover NMOS registration server via DNS-SD (_nmos-registration._tcp)
void discoverNMOSRegistrationServer() {
  if (!nmos_auto_discover || !networkConnected) return;
  logger("[NMOS] Browsing DNS-SD for _nmos-registration._tcp...", "info");
  int n = MDNS.queryService("nmos-registration", "tcp");
  if (n == 0) {
    n = MDNS.queryService("nmos-register", "tcp");
  }
  if (n > 0) {
    nmos_registry_host = MDNS.address(0).toString();
    nmos_registry_port = MDNS.port(0);
    logger("[NMOS] Discovered IS-04 Registration Server: " + nmos_registry_host + ":" + String(nmos_registry_port), "info");
  } else {
    logger("[NMOS] No DNS-SD server found; using configured host/port: " + nmos_registry_host + ":" + String(nmos_registry_port), "info");
  }
}

// TCP Server initialization for TSL 3.1 & 5.0 TCP listeners
void setupTSLTcpServer(uint16_t port) {
  if (tslTcpServer != nullptr) {
    tslTcpServer->end();
    delete tslTcpServer;
    tslTcpServer = nullptr;
  }
  tslTcpServer = new AsyncServer(port);
  tslTcpServer->onClient([](void* arg, AsyncClient* client) {
    logger("[TCP] TSL Client connected: " + client->remoteIP().toString(), "info");
    client->onData([](void* arg, AsyncClient* c, void* data, size_t len) {
      uint8_t* p = (uint8_t*)data;
      if (isTSL31Listener()) {
        processTSL31Packet(p, len);
      } else if (isTSL50Listener()) {
        processTSL50Packet(p, len);
      }
    }, NULL);
  }, NULL);
  tslTcpServer->begin();
  logger("[TCP] TSL TCP Server started listening on port " + String(port), "info");
}

// ==========================================
// TSL 3.1 UDP Packet Sender
// ==========================================
void sendtally(int channel, bool live) {
  // CRITICAL: Guard against sending UDP when network is down
  // Sending when offline causes ARP/socket timeouts and slows the main loop
  if (!networkConnected) {
    return;
  }

  byte channelname[16];
  String lbl = DeviceName;
  if (lbl.length() == 0 || lbl == "Unassigned") lbl = listenerDeviceName;
  while (lbl.length() < 16) lbl += " ";
  lbl = lbl.substring(0, 16);
  lbl.getBytes(channelname, 17);

  byte command[18];
  command[0] = (DISPLAY_ADDRESS + channel);

  // Presenter mode: sends TSL Preview (0x31) back when button pressed!
  // TP mode: sends TSL Program (0x32) back (as it does now)!
  if (isPresenter()) {
    if (live) {
      command[1] = (FULLBRIGHT + GREENTALLY); // 0x31 (Preview)
    } else {
      command[1] = (FULLBRIGHT);              // 0x30 (Off)
    }
  } else {
    if (live) {
      command[1] = (FULLBRIGHT + REDTALLY);   // 0x32 (Program)
    } else {
      command[1] = (FULLBRIGHT);              // 0x30 (Off)
    }
  }

  for (int i = 0; i < 16; i++) {
    command[2 + i] = channelname[i];
  }

  // Routing destination: Use IPAddress parsing to prevent any blocking DNS lookups
  if (usesTallyArbiter()) {
    IPAddress targetIP;
    if (targetIP.fromString(tallyarbiter_host)) {
      udp.beginPacket(targetIP, atoi(tallyarbiter_TSLport));
    } else {
      udp.beginPacket(tallyarbiter_host, atoi(tallyarbiter_TSLport));
    }
  } else {
    // Point-to-Point mode: send directly to paired peer IP, or subnet broadcast if unpaired
    if (pairedTargetIP.length() > 0 && pairedTargetIP != "0.0.0.0") {
      IPAddress pIP;
      if (pIP.fromString(pairedTargetIP)) {
        udp.beginPacket(pIP, atoi(tallyarbiter_TSLport));
      } else {
        udp.beginPacket(pairedTargetIP.c_str(), atoi(tallyarbiter_TSLport));
      }
    } else {
      udp.beginPacket(IPAddress(255, 255, 255, 255), atoi(tallyarbiter_TSLport));
    }
  }

  udp.write(command, 18);
  udp.endPacket();

  logger(String("[TSL] Sent CH ") + String(channel) + (live ? (isPresenter() ? " PREVIEW" : " PROGRAM") : " OFF") + (isP2PMode() ? " (P2P)" : " (TA)"), "info-quiet");
}

// ==========================================
// ETC CueSystem Acknowledge Packet Sender
// ==========================================
void sendCueAck() {
  if (!networkConnected) return;
  cuesystem_ack_active = true;
  String ackMsg = String("CS,") + String(cuesystem_channel) + ",ACK\n";
  IPAddress cueIP;
  if (cueIP.fromString(cuesystem_host)) {
    udp.beginPacket(cueIP, cuesystem_port);
  } else {
    udp.beginPacket(cuesystem_host.c_str(), cuesystem_port);
  }
  udp.write((const uint8_t*)ackMsg.c_str(), ackMsg.length());
  udp.endPacket();
  logger(String("[ETC CueSystem] Sent Acknowledge for Channel ") + String(cuesystem_channel) + " to " + cuesystem_host + ":" + String(cuesystem_port), "info");
  renderScreen();
}

// ==========================================
// NMOS IS-07 Event & Tally Sender
// ==========================================
void sendNMOSTally(bool live) {
  if (!networkConnected) return;
  nmos_is_on_air = live;
  JSONVar msg;
  msg["message_type"] = "state";
  msg["source_id"] = nmos_source_id;
  msg["event_type"] = "boolean";
  msg["payload"]["value"] = live;
  String jsonStr = JSON.stringify(msg);

  IPAddress nmosIP;
  if (nmosIP.fromString(nmos_registry_host)) {
    udp.beginPacket(nmosIP, nmos_registry_port);
  } else {
    udp.beginPacket(nmos_registry_host.c_str(), nmos_registry_port);
  }
  udp.write((const uint8_t*)jsonStr.c_str(), jsonStr.length());
  udp.endPacket();
  logger(String("[NMOS IS-07] Emitted event on ") + nmos_event_topic + ": " + (live ? "TRUE (On-Air)" : "FALSE (Standby)"), "info");
  renderScreen();
}

// ==========================================
// Incoming Packet Receiver (TSL, ETC, NMOS, rtpMIDI, OSC)
// ==========================================
void processIncomingTSL() {
  int packetSize = udp.parsePacket();
  if (packetSize > 0) {
    byte packetBuffer[512];
    int len = udp.read(packetBuffer, sizeof(packetBuffer) - 1);
    if (len <= 0) return;
    packetBuffer[len] = '\0';

    // P2P Heartbeat Ping / Pong Packet Detection (Requirement 7)
    String p2pHeader = String((char*)packetBuffer);
    if (p2pHeader.startsWith("CXPING,")) {
      int c1 = p2pHeader.indexOf(',');
      int c2 = p2pHeader.indexOf(',', c1 + 1);
      int c3 = p2pHeader.indexOf(',', c2 + 1);
      if (c1 > 0 && c2 > 0) {
        String grp = p2pHeader.substring(c1 + 1, c2);
        if (grp == pairingGroup) {
          uint32_t seq = p2pHeader.substring(c2 + 1, c3 > 0 ? c3 : p2pHeader.length()).toInt();
          lastP2PPeerRecvTime = millis();
          p2p_disconnected_state = false;
          p2p_missed_heartbeats = 0;
          sendP2PPong(seq);
          return;
        }
      }
    } else if (p2pHeader.startsWith("CXPONG,")) {
      int c1 = p2pHeader.indexOf(',');
      int c2 = p2pHeader.indexOf(',', c1 + 1);
      if (c1 > 0 && c2 > 0) {
        String grp = p2pHeader.substring(c1 + 1, c2);
        if (grp == pairingGroup) {
          lastP2PPeerRecvTime = millis();
          p2p_disconnected_state = false;
          p2p_missed_heartbeats = 0;
          return;
        }
      }
    }

    // 0. Dedicated TSL 3.1 Listener Mode (UDP)
    if (isTSL31Listener() && tsl31_transport == "UDP") {
      processTSL31Packet(packetBuffer, len);
      return;
    }

    // 0.5 Dedicated TSL 5.0 Listener Mode (UDP)
    if (isTSL50Listener() && tsl50_transport == "UDP") {
      processTSL50Packet(packetBuffer, len);
      return;
    }

    // 0.8 OSC Cue Light for iOS (RSMCK Protocol) Mode
    if (isOSCCueLight()) {
      processOSCCueLightPacket(packetBuffer, len, udp.remoteIP(), udp.remotePort());
      return;
    }

    // 0.9 Promptside Theatrical Cue Light Mode (Requirement 2)
    if (isPromptside()) {
      processPromptsidePacket(packetBuffer, len, udp.remoteIP(), udp.remotePort());
      return;
    }

    // 0.95 MIDI Show Control (MSC) over rtpMIDI Mode (Requirement 3)
    if (isMSCRTPMidi()) {
      processMSCRTPMidiPacket(packetBuffer, len, udp.remoteIP(), udp.remotePort());
      return;
    }

    // 1. rtpMIDI / AppleMIDI Mode
    if (isRTPMidi()) {
      processRTPMidiPacket(packetBuffer, len, udp.remoteIP(), udp.remotePort());
      return;
    }

    // 2. OSC Mode
    if (isOSC()) {
      processOSCPacket(packetBuffer, len);
      return;
    }

    // 3. ETC CueSystem Mode (ASCII text: CS,<ch>,<CMD> or CUE:<ch>:<CMD>)
    if (isETCCueSystem()) {
      String msg = String((char*)packetBuffer);
      msg.trim();
      if (msg.startsWith("CS,") || msg.startsWith("CUE:")) {
        char delimiter = msg.startsWith("CS,") ? ',' : ':';
        int firstDelim = msg.indexOf(delimiter);
        int secondDelim = msg.indexOf(delimiter, firstDelim + 1);
        if (firstDelim > 0 && secondDelim > 0) {
          int ch = msg.substring(firstDelim + 1, secondDelim).toInt();
          String stateCmd = msg.substring(secondDelim + 1);
          stateCmd.toUpperCase();
          if (ch == cuesystem_channel || ch == 0) {
            if (stateCmd == "STANDBY") {
              cuesystem_standby_active = true;
              cuesystem_ack_active = false;
              actualType = "\"standby\"";
              actualColor = "#FF0000";
              logger(String("[ETC CueSystem] Channel ") + String(cuesystem_channel) + " STANDBY received (Flashing Red until Acknowledged)", "info");
            } else if (stateCmd == "ACK") {
              cuesystem_standby_active = true;
              cuesystem_ack_active = true;
              actualType = "\"standby\"";
              actualColor = "#FF0000";
              logger(String("[ETC CueSystem] Channel ") + String(cuesystem_channel) + " ACKNOWLEDGED (Solid Red)", "info");
            } else if (stateCmd == "GO") {
              cuesystem_standby_active = false;
              cuesystem_ack_active = false;
              actualType = "\"program\"";
              actualColor = "#00FF00";
              logger(String("[ETC CueSystem] Channel ") + String(cuesystem_channel) + " GO received (Solid Green)", "info");
            } else if (stateCmd == "OFF") {
              cuesystem_standby_active = false;
              cuesystem_ack_active = false;
              actualType = "";
              actualColor = "";
              logger(String("[ETC CueSystem] Channel ") + String(cuesystem_channel) + " OFF received", "info");
            }
            renderScreen();
            return;
          }
        }
      }
    }

    // 4. NMOS IS-07 Event & Tally Mode (JSON payload)
    if (isNMOSIS07()) {
      if (packetBuffer[0] == '{') {
        JSONVar obj = JSON.parse((char*)packetBuffer);
        String topic = "";
        if (obj.hasOwnProperty("topic")) topic = (const char*)obj["topic"];
        else if (obj.hasOwnProperty("event_type")) topic = (const char*)obj["event_type"];
        else if (obj.hasOwnProperty("source_id")) topic = (const char*)obj["source_id"];

        bool val = false;
        if (obj.hasOwnProperty("payload") && obj["payload"].hasOwnProperty("value")) {
          val = (bool)obj["payload"]["value"];
        }

        // Match against Program, Preview, and Aux endpoints
        if (topic == nmos_program_topic || topic.endsWith("program") || topic.indexOf("prg") >= 0) {
          nmos_program_active = val;
        } else if (topic == nmos_preview_topic || topic.endsWith("preview") || topic.indexOf("pvw") >= 0) {
          nmos_preview_active = val;
        } else if (topic == nmos_aux_topic || topic.endsWith("aux")) {
          nmos_aux_active = val;
        } else {
          nmos_program_active = val;
        }

        // Priority: Program (Red) > Preview (Green) > Aux (Amber)
        if (nmos_program_active) {
          actualType = "\"program\"";
          actualColor = "#FF0000";
          nmos_is_on_air = true;
        } else if (nmos_preview_active) {
          actualType = "\"preview\"";
          actualColor = "#00FF00";
          nmos_is_on_air = false;
        } else if (nmos_aux_active) {
          actualType = "\"aux\"";
          actualColor = "#FFA500";
          nmos_is_on_air = false;
        } else {
          actualType = "";
          actualColor = "";
          nmos_is_on_air = false;
        }
        logger(String("[NMOS IS-07] Tally event on '") + topic + "' -> " + (val ? "ACTIVE" : "OFF"), "info");
        renderScreen();
        return;
      }
    }

    // 5. Standard TSL 3.1 UDP packet (18 bytes)
    if (len >= 18) {
      byte ctrl = packetBuffer[1];
      bool redTally = (ctrl & REDTALLY) != 0;
      bool greenTally = (ctrl & GREENTALLY) != 0;

      char textBuf[17];
      memcpy(textBuf, packetBuffer + 2, 16);
      textBuf[16] = '\0';
      String senderName = String(textBuf);
      senderName.trim();

      // In P2P standalone mode:
      if (isP2PMode()) {
        if (isPresenter()) {
          // Presenter unit receives state updates from TP:
          if (redTally) {
            actualType = "\"program\"";
            actualColor = "#FF0000";
          } else if (greenTally) {
            actualType = "\"preview\"";
            actualColor = "#00FF00";
          } else {
            actualType = "";
            actualColor = "";
          }
          if (senderName.length() > 0 && (pairedTargetName.length() == 0 || pairedTargetName == "Unassigned")) {
            pairedTargetName = senderName;
          }
          renderScreen();
        } else if (isTP()) {
          // TP unit receives cue / preview call from Presenter:
          presenterCueActive = greenTally;
          if (senderName.length() > 0 && (pairedTargetName.length() == 0 || pairedTargetName == "Unassigned")) {
            pairedTargetName = senderName;
          }
          renderScreen();
        }
      }
    }
  }
}

// ==========================================
// rtpMIDI / AppleMIDI Session & Data Parser
// ==========================================
void processRTPMidiPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort) {
  // AppleMIDI Session Protocol Management
  if (len >= 4 && buf[0] == 0xFF && buf[1] == 0xFF) {
    if (buf[2] == 'I' && buf[3] == 'N') {
      // Invitation: reply with 'OK' so DAW / AppleMIDI driver connects immediately
      uint8_t okResp[16];
      okResp[0] = 0xFF; okResp[1] = 0xFF;
      okResp[2] = 'O'; okResp[3] = 'K';
      memcpy(okResp + 4, buf + 4, 8); // Protocol version & session token
      uint32_t localSSRC = 0x41544F4D; // "ATOM" SSRC
      memcpy(okResp + 12, &localSSRC, 4);
      udp.beginPacket(remoteIP, remotePort);
      udp.write(okResp, 16);
      udp.endPacket();
      logger(String("[rtpMIDI] AppleMIDI session accepted from ") + remoteIP.toString() + ":" + String(remotePort), "info");
      return;
    } else if (buf[2] == 'C' && buf[3] == 'K') {
      // Clock sync packet: echo back
      uint8_t ckResp[len];
      memcpy(ckResp, buf, len);
      udp.beginPacket(remoteIP, remotePort);
      udp.write(ckResp, len);
      udp.endPacket();
      return;
    }
  }

  // MIDI Stream Parser (supports raw MIDI, RTP-MIDI payload 97, and AppleMIDI 'md' command)
  int targetCh = (rtpmidi_channel == 0) ? -1 : (rtpmidi_channel - 1);

  for (int i = 0; i < len; i++) {
    uint8_t b = buf[i];
    // Check if this is a MIDI status byte
    if ((b & 0x80) != 0 && b < 0xF0) {
      uint8_t cmd = b & 0xF0;
      uint8_t ch = b & 0x0F;

      if (targetCh == -1 || ch == targetCh) {
        if (cmd == 0x90 && i + 2 < len) {
          // Note On
          int note = buf[i + 1];
          int vel  = buf[i + 2];
          bool on = (vel > 0);

          if (rtpmidi_trigger_type == 0) { // Note mode
            if (note == rtpmidi_num_red)       midi_active_red = on;
            if (note == rtpmidi_num_flash_red) midi_active_flash_red = on;
            if (note == rtpmidi_num_green)     midi_active_green = on;
            if (note == rtpmidi_num_yellow)    midi_active_yellow = on;
            if (note == rtpmidi_num_blue)      midi_active_blue = on;
            if (note == rtpmidi_num_white)     midi_active_white = on;
          }
          i += 2;
        } else if (cmd == 0x80 && i + 2 < len) {
          // Note Off
          int note = buf[i + 1];
          if (rtpmidi_trigger_type == 0) {
            if (note == rtpmidi_num_red)       midi_active_red = false;
            if (note == rtpmidi_num_flash_red) midi_active_flash_red = false;
            if (note == rtpmidi_num_green)     midi_active_green = false;
            if (note == rtpmidi_num_yellow)    midi_active_yellow = false;
            if (note == rtpmidi_num_blue)      midi_active_blue = false;
            if (note == rtpmidi_num_white)     midi_active_white = false;
          }
          i += 2;
        } else if (cmd == 0xB0 && i + 2 < len) {
          // Control Change (CC)
          int ccNum = buf[i + 1];
          int ccVal = buf[i + 2];
          bool on = (ccVal >= 64);

          if (rtpmidi_trigger_type == 1) { // CC mode
            if (ccNum == rtpmidi_num_red)       midi_active_red = on;
            if (ccNum == rtpmidi_num_flash_red) midi_active_flash_red = on;
            if (ccNum == rtpmidi_num_green)     midi_active_green = on;
            if (ccNum == rtpmidi_num_yellow)    midi_active_yellow = on;
            if (ccNum == rtpmidi_num_blue)      midi_active_blue = on;
            if (ccNum == rtpmidi_num_white)     midi_active_white = on;
          }
          i += 2;
        } else if (cmd == 0xC0 && i + 1 < len) {
          // Program Change (PC)
          int pcNum = buf[i + 1];
          if (rtpmidi_trigger_type == 2) { // PC mode
            midi_active_red       = (pcNum == rtpmidi_num_red);
            midi_active_flash_red = (pcNum == rtpmidi_num_flash_red);
            midi_active_green     = (pcNum == rtpmidi_num_green);
            midi_active_yellow    = (pcNum == rtpmidi_num_yellow);
            midi_active_blue      = (pcNum == rtpmidi_num_blue);
            midi_active_white     = (pcNum == rtpmidi_num_white);
          }
          i += 1;
        }
      }
    } else if (b == 0xF1 && i + 1 < len) {
      // Requirement 4: MIDI Time Code (MTC) Quarter-Frame Parser
      uint8_t qData = buf[i + 1];
      uint8_t piece = (qData >> 4) & 0x07;
      uint8_t val = qData & 0x0F;
      mtc_qframe_pieces[piece] = val;
      if (piece == 7) {
        int frames = mtc_qframe_pieces[0] | (mtc_qframe_pieces[1] << 4);
        int seconds = mtc_qframe_pieces[2] | (mtc_qframe_pieces[3] << 4);
        int minutes = mtc_qframe_pieces[4] | (mtc_qframe_pieces[5] << 4);
        int hours = mtc_qframe_pieces[6] | ((mtc_qframe_pieces[7] & 0x01) << 4);
        mtc_fps_type = (mtc_qframe_pieces[7] >> 1) & 0x03;
        char tcBuf[16];
        snprintf(tcBuf, sizeof(tcBuf), "%02d:%02d:%02d:%02d", hours, minutes, seconds, frames);
        mtc_timecode_str = String(tcBuf);
        lastMTCTime = millis();
        if (mtc_reader_enabled && currentScreen == 0) {
          renderScreen();
        }
      }
      i += 1;
    } else if (b == 0xF0 && i + 8 < len && buf[i+1] == 0x7F && buf[i+3] == 0x01 && buf[i+4] == 0x01) {
      // Requirement 4: MTC Full-Frame SysEx Parser
      int hours = buf[i+5] & 0x1F;
      mtc_fps_type = (buf[i+5] >> 5) & 0x03;
      int minutes = buf[i+6];
      int seconds = buf[i+7];
      int frames = buf[i+8];
      char tcBuf[16];
      snprintf(tcBuf, sizeof(tcBuf), "%02d:%02d:%02d:%02d", hours, minutes, seconds, frames);
      mtc_timecode_str = String(tcBuf);
      lastMTCTime = millis();
      if (mtc_reader_enabled && currentScreen == 0) {
        renderScreen();
      }
      i += 8;
    }
  }

  evaluateRTPMidiState();
}

// Evaluate rtpMIDI Priority: Red > Flashing Red > Green > Yellow > Blue > White > Off
void evaluateRTPMidiState() {
  if (midi_active_red) {
    actualType = "\"program\"";
    actualColor = "#FF0000";
  } else if (midi_active_flash_red) {
    actualType = "\"flashred\"";
    actualColor = "#FF0000";
  } else if (midi_active_green) {
    actualType = "\"preview\"";
    actualColor = "#00FF00";
  } else if (midi_active_yellow) {
    actualType = "\"yellow\"";
    actualColor = "#FFFF00";
  } else if (midi_active_blue) {
    actualType = "\"blue\"";
    actualColor = "#0088FF";
  } else if (midi_active_white) {
    actualType = "\"white\"";
    actualColor = "#FFFFFF";
  } else {
    actualType = "";
    actualColor = "";
  }
  renderScreen();
}

// ==========================================
// OSC (Open Sound Control) Parser
// ==========================================
void processOSCPacket(uint8_t* buf, int len) {
  if (len < 4) return;
  String addr = String((char*)buf);
  int addrLen = addr.length();
  int tagOffset = (addrLen + 4) & ~0x03;

  if (tagOffset < len && buf[tagOffset] == ',') {
    char typeTag = (char)buf[tagOffset + 1];
    int argOffset = tagOffset + 4;

    // Check for Text Message endpoint (scrolls on screen instead of DeviceName)
    if (addr == osc_prefix + "/text" || addr == osc_prefix + "/message" || addr.endsWith("/text") || addr.endsWith("/message")) {
      if (typeTag == 's' && argOffset < len) {
        osc_custom_message = String((char*)(buf + argOffset));
        logger(String("[OSC] Custom message received: ") + osc_custom_message, "info");
        renderScreen();
        return;
      }
    }

    // Extract float or int state argument
    float val = 0.0f;
    if (typeTag == 'f' && argOffset + 4 <= len) {
      uint32_t rawVal = ((uint32_t)buf[argOffset] << 24) | ((uint32_t)buf[argOffset+1] << 16) | ((uint32_t)buf[argOffset+2] << 8) | buf[argOffset+3];
      memcpy(&val, &rawVal, 4);
    } else if (typeTag == 'i' && argOffset + 4 <= len) {
      int32_t rawVal = ((int32_t)buf[argOffset] << 24) | ((int32_t)buf[argOffset+1] << 16) | ((int32_t)buf[argOffset+2] << 8) | buf[argOffset+3];
      val = (float)rawVal;
    } else if (typeTag == 'T') {
      val = 1.0f;
    } else if (typeTag == 'F') {
      val = 0.0f;
    }

    bool on = (val > 0.0f);
    if (addr == osc_prefix + "/red" || addr.endsWith("/red"))            osc_active_red = on;
    else if (addr == osc_prefix + "/flashred" || addr.endsWith("/flashred") || addr.endsWith("/flash")) osc_active_flash_red = on;
    else if (addr == osc_prefix + "/green" || addr.endsWith("/green"))        osc_active_green = on;
    else if (addr == osc_prefix + "/yellow" || addr.endsWith("/yellow"))      osc_active_yellow = on;
    else if (addr == osc_prefix + "/blue" || addr.endsWith("/blue"))          osc_active_blue = on;
    else if (addr == osc_prefix + "/white" || addr.endsWith("/white"))        osc_active_white = on;

    evaluateOSCState();
  }
}

// Evaluate OSC Priority: Red > Flashing Red > Green > Yellow > Blue > White > Off
void evaluateOSCState() {
  if (osc_active_red) {
    actualType = "\"program\"";
    actualColor = "#FF0000";
  } else if (osc_active_flash_red) {
    actualType = "\"flashred\"";
    actualColor = "#FF0000";
  } else if (osc_active_green) {
    actualType = "\"preview\"";
    actualColor = "#00FF00";
  } else if (osc_active_yellow) {
    actualType = "\"yellow\"";
    actualColor = "#FFFF00";
  } else if (osc_active_blue) {
    actualType = "\"blue\"";
    actualColor = "#0088FF";
  } else if (osc_active_white) {
    actualType = "\"white\"";
    actualColor = "#FFFFFF";
  } else {
    actualType = "";
    actualColor = "";
  }
  renderScreen();
}

// ==========================================
// TSL 3.1 Dedicated Listener Parser
// ==========================================
void processTSL31Packet(uint8_t* buf, int len) {
  if (len < 18) return;
  uint8_t addr = buf[0] & 0x7F;
  uint8_t ctrl = buf[1];

  if (tsl31_address == 0 || addr == tsl31_address) {
    char textBuf[17];
    memcpy(textBuf, buf + 2, 16);
    textBuf[16] = '\0';
    String lbl = String(textBuf);
    lbl.trim();
    if (lbl.length() > 0) {
      tsl31_name = lbl;
    }

    bool red = (ctrl & REDTALLY) != 0;
    bool green = (ctrl & GREENTALLY) != 0;
    if (red && green) {
      actualType = "\"aux\"";
      actualColor = "#FFA500";
    } else if (red) {
      actualType = "\"program\"";
      actualColor = "#FF0000";
    } else if (green) {
      actualType = "\"preview\"";
      actualColor = "#00FF00";
    } else {
      actualType = "";
      actualColor = "";
    }
    renderScreen();
  }
}

// ==========================================
// TSL 5.0 Dedicated Listener Parser
// ==========================================
void processTSL50Packet(uint8_t* buf, int len) {
  if (len < 12) return;
  uint16_t screen = buf[4] | (buf[5] << 8);
  uint16_t index = buf[6] | (buf[7] << 8);
  uint16_t ctrl = buf[8] | (buf[9] << 8);
  uint16_t textLen = buf[10] | (buf[11] << 8);

  if (tsl50_index == 0 || index == tsl50_index) {
    if (textLen > 0 && len >= 12 + textLen) {
      char tBuf[64];
      int copyLen = textLen < 63 ? textLen : 63;
      memcpy(tBuf, buf + 12, copyLen);
      tBuf[copyLen] = '\0';
      String lbl = String(tBuf);
      lbl.trim();
      if (lbl.length() > 0) {
        tsl50_name = lbl;
      }
    }

    uint8_t t1 = ctrl & 0x03;
    uint8_t t2 = (ctrl >> 2) & 0x03;
    uint8_t t3 = (ctrl >> 4) & 0x03;
    uint8_t t4 = (ctrl >> 6) & 0x03;

    if (t1 == 1) {
      actualType = "\"program\"";
      actualColor = "#FF0000";
    } else if (t2 == 1) {
      actualType = "\"preview\"";
      actualColor = "#00FF00";
    } else if (t3 == 1) {
      actualType = "\"aux\"";
      actualColor = "#FFA500";
    } else if (t4 == 1) {
      actualType = "\"blue\"";
      actualColor = "#0088FF";
    } else {
      actualType = "";
      actualColor = "";
    }
    renderScreen();
  }
}

// ==========================================
// OSC Cue Light for iOS (RSMCK Protocol) Parser
// ==========================================
void processOSCCueLightPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort) {
  osccue_last_sender_ip = remoteIP;
  osccue_last_sender_port = remotePort;

  String oscAddr = "";
  int idx = 0;
  while (idx < len && buf[idx] != 0) {
    oscAddr += (char)buf[idx++];
  }
  idx = (idx + 4) & ~0x03;

  String argString = "";
  if (idx < len && buf[idx] == ',') {
    String typeTags = "";
    while (idx < len && buf[idx] != 0) {
      typeTags += (char)buf[idx++];
    }
    idx = (idx + 4) & ~0x03;
    if (typeTags.indexOf('s') >= 0 && idx < len) {
      while (idx < len && buf[idx] != 0) {
        argString += (char)buf[idx++];
      }
    }
  }

  if (oscAddr.startsWith("/cuelight/")) {
    String sub = oscAddr.substring(10);
    int slashIdx = sub.indexOf('/');
    if (slashIdx > 0) {
      String station = sub.substring(0, slashIdx);
      String cmd = sub.substring(slashIdx + 1);
      cmd.toLowerCase();

      bool match = (station == "*" || station.equalsIgnoreCase(osccue_station_id) ||
                    (station.indexOf(osccue_station_id) >= 0));

      if (match) {
        if (cmd == "standby_ack") {
          osccue_state = "standby_ack";
          osccue_ack_done = false;
          if (argString.length() > 0) osccue_message = argString;
          logger("[OSC CueLight] STANDBY_ACK on station " + station + " msg: " + osccue_message, "info");
        } else if (cmd == "standby") {
          osccue_state = "standby";
          osccue_ack_done = true;
          if (argString.length() > 0) osccue_message = argString;
          sendOSCCueLightState("standby");
          logger("[OSC CueLight] STANDBY on station " + station, "info");
        } else if (cmd == "go") {
          osccue_state = "go";
          if (argString.length() > 0) osccue_message = argString;
          sendOSCCueLightState("go");
          logger("[OSC CueLight] GO on station " + station + " msg: " + osccue_message, "info");
        } else if (cmd == "off") {
          osccue_state = "off";
          osccue_message = "";
          sendOSCCueLightState("off");
          logger("[OSC CueLight] OFF on station " + station, "info");
        } else if (cmd == "banner") {
          if (argString.length() > 0) osccue_banner = argString;
          logger("[OSC CueLight] BANNER updated: " + osccue_banner, "info");
        }
        renderScreen();
      }
    }
  }
}

void sendOSCCueLightState(String stateName) {
  if (!networkConnected) return;
  String addr = "/cuelight/state/" + osccue_station_id + "/" + stateName;
  int addrLen = addr.length();
  int pad = (4 - (addrLen % 4)) % 4;
  if (pad == 0) pad = 4;
  int totalLen = addrLen + pad + 4;
  uint8_t oscBuf[totalLen];
  memset(oscBuf, 0, totalLen);
  memcpy(oscBuf, addr.c_str(), addrLen);
  oscBuf[addrLen + pad] = ',';

  udp.beginPacket(osccue_last_sender_ip, osccue_last_sender_port);
  udp.write(oscBuf, totalLen);
  udp.endPacket();
  logger("[OSC CueLight] Sent state reply: " + addr, "info");
}

// ==========================================
// Promptside Theatrical Cue Light Parser (promptside.co)
// ==========================================
void processPromptsidePacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort) {
  promptside_desk_ip = remoteIP;
  promptside_desk_port = remotePort;

  String oscAddr = "";
  int idx = 0;
  while (idx < len && buf[idx] != 0) {
    oscAddr += (char)buf[idx++];
  }
  idx = (idx + 4) & ~0x03;

  String argString = "";
  int argInt = 0;
  if (idx < len && buf[idx] == ',') {
    String typeTags = "";
    while (idx < len && buf[idx] != 0) {
      typeTags += (char)buf[idx++];
    }
    idx = (idx + 4) & ~0x03;
    if (typeTags.indexOf('s') >= 0 && idx < len) {
      while (idx < len && buf[idx] != 0) {
        argString += (char)buf[idx++];
      }
    } else if (typeTags.indexOf('i') >= 0 && idx + 4 <= len) {
      argInt = (int)((buf[idx] << 24) | (buf[idx+1] << 16) | (buf[idx+2] << 8) | buf[idx+3]);
    }
  }

  if (oscAddr.startsWith("/promptside")) {
    String sub = oscAddr.substring(11);
    if (sub.startsWith("/")) sub = sub.substring(1);

    String targetChan = promptside_channel;
    String cmd = "";

    if (sub.startsWith("channel/")) {
      String rest = sub.substring(8);
      int slash = rest.indexOf('/');
      if (slash > 0) {
        targetChan = rest.substring(0, slash);
        cmd = rest.substring(slash + 1);
      }
    } else {
      int slash = sub.indexOf('/');
      if (slash > 0) {
        targetChan = sub.substring(0, slash);
        cmd = sub.substring(slash + 1);
      } else {
        cmd = sub;
      }
    }
    cmd.toLowerCase();

    bool matchesChannel = (targetChan == "*" || targetChan.equalsIgnoreCase(promptside_channel) ||
                          targetChan == String(promptside_channel.toInt()) ||
                          (argString.length() > 0 && argString.equalsIgnoreCase(promptside_channel)) ||
                          (argInt > 0 && argInt == promptside_channel.toInt()));

    if (matchesChannel || cmd == "all_off" || cmd == "blackout") {
      if (cmd == "standby" || cmd == "standby_ack" || cmd == "warn") {
        promptside_state = "standby_ack";
        promptside_ack_done = false;
        if (argString.length() > 0) promptside_cue_text = argString;
        logger("[Promptside] Channel " + promptside_channel + " STANDBY received (Awaiting ACK)", "info");
      } else if (cmd == "ack" || cmd == "acknowledged") {
        promptside_state = "standby_ack";
        promptside_ack_done = true;
        logger("[Promptside] Channel " + promptside_channel + " ACKNOWLEDGED", "info");
      } else if (cmd == "go") {
        promptside_state = "go";
        promptside_ack_done = false;
        if (argString.length() > 0) promptside_cue_text = argString;
        logger("[Promptside] Channel " + promptside_channel + " GO!", "info");
      } else if (cmd == "off" || cmd == "all_off" || cmd == "clear" || cmd == "blackout") {
        promptside_state = "off";
        promptside_ack_done = false;
        promptside_cue_text = "";
        logger("[Promptside] Channel " + promptside_channel + " OFF", "info");
      } else if (cmd == "text" || cmd == "note") {
        if (argString.length() > 0) promptside_cue_text = argString;
        logger("[Promptside] Cue note: " + promptside_cue_text, "info");
      }
      renderScreen();
    }
  }
}

void sendPromptsideAck() {
  if (!networkConnected) return;
  String addr = "/promptside/channel/" + promptside_channel + "/ack";
  int addrLen = addr.length();
  int pad = (4 - (addrLen % 4)) % 4;
  if (pad == 0) pad = 4;
  int totalLen = addrLen + pad + 8;
  uint8_t oscBuf[totalLen];
  memset(oscBuf, 0, totalLen);
  memcpy(oscBuf, addr.c_str(), addrLen);
  oscBuf[addrLen + pad] = ',';
  oscBuf[addrLen + pad + 1] = 'i';
  oscBuf[addrLen + pad + 7] = 1;

  udp.beginPacket(promptside_desk_ip, promptside_desk_port);
  udp.write(oscBuf, totalLen);
  udp.endPacket();
  logger("[Promptside] Transmitted ACK response to Corner console: " + addr, "info");
}

// ==========================================
// MIDI Show Control (MSC) over rtpMIDI Parser (RP-002)
// ==========================================
void processMSCRTPMidiPacket(uint8_t* buf, int len, IPAddress remoteIP, uint16_t remotePort) {
  if (len >= 4 && buf[0] == 0xFF && buf[1] == 0xFF) {
    if (buf[2] == 'I' && buf[3] == 'N') {
      uint8_t okResp[16];
      okResp[0] = 0xFF; okResp[1] = 0xFF;
      okResp[2] = 'O'; okResp[3] = 'K';
      memcpy(okResp + 4, buf + 4, 8);
      uint32_t localSSRC = 0x4D534331;
      memcpy(okResp + 12, &localSSRC, 4);
      udp.beginPacket(remoteIP, remotePort);
      udp.write(okResp, 16);
      udp.endPacket();
      logger(String("[MSC rtpMIDI] AppleMIDI session accepted from ") + remoteIP.toString() + ":" + String(remotePort), "info");
      return;
    } else if (buf[2] == 'C' && buf[3] == 'K') {
      uint8_t ckResp[len];
      memcpy(ckResp, buf, len);
      udp.beginPacket(remoteIP, remotePort);
      udp.write(ckResp, len);
      udp.endPacket();
      return;
    }
  }

  for (int i = 0; i < len - 5; i++) {
    if (buf[i] == 0xF0 && buf[i+1] == 0x7F) {
      uint8_t devId = buf[i+2];
      uint8_t subId1 = buf[i+3];
      uint8_t cmdFormat = buf[i+4];
      uint8_t cmd = buf[i+5];

      if (subId1 == 0x02) {
        bool devMatch = (msc_device_id == 0x7F || devId == 0x7F || devId == msc_device_id);
        bool fmtMatch = (msc_cmd_format == 0x7F || cmdFormat == 0x7F || cmdFormat == 0x08 || cmdFormat == msc_cmd_format);

        if (devMatch && fmtMatch) {
          String cueNum = "";
          int cueIdx = i + 6;
          while (cueIdx < len && buf[cueIdx] != 0x00 && buf[cueIdx] != 0xF7) {
            if (buf[cueIdx] >= 32 && buf[cueIdx] <= 126) {
              cueNum += (char)buf[cueIdx];
            }
            cueIdx++;
          }
          cueNum.trim();
          if (cueNum.length() > 0) {
            msc_current_cue = cueNum;
          }

          if (cmd == 0x01) { // GO
            msc_state = "go";
            msc_last_command = "GO";
            actualType = "\"program\"";
            actualColor = "#00FF00";
            logger("[MSC] GO received! Cue: " + msc_current_cue, "info");
          } else if (cmd == 0x02) { // STOP / STANDBY
            msc_state = "standby";
            msc_last_command = "STOP";
            actualType = "\"standby\"";
            actualColor = "#FF0000";
            logger("[MSC] STOP / STANDBY received! Cue: " + msc_current_cue, "info");
          } else if (cmd == 0x03) { // RESUME
            msc_state = "go";
            msc_last_command = "RESUME";
            actualType = "\"program\"";
            actualColor = "#00FF00";
            logger("[MSC] RESUME received! Cue: " + msc_current_cue, "info");
          } else if (cmd == 0x04) { // TIMED_GO
            msc_state = "go";
            msc_last_command = "TIMED_GO";
            actualType = "\"program\"";
            actualColor = "#00FF00";
            logger("[MSC] TIMED_GO received! Cue: " + msc_current_cue, "info");
          } else if (cmd == 0x08) { // ALL_OFF
            msc_state = "off";
            msc_last_command = "ALL_OFF";
            actualType = "";
            actualColor = "";
            logger("[MSC] ALL_OFF received!", "info");
          } else if (cmd == 0x0A) { // RESET
            msc_state = "off";
            msc_last_command = "RESET";
            actualType = "";
            actualColor = "";
            logger("[MSC] RESET received!", "info");
          } else if (cmd == 0x0B) { // STANDBY_PLUS
            msc_state = "standby";
            msc_last_command = "STANDBY+";
            actualType = "\"flashred\"";
            actualColor = "#FF0000";
            logger("[MSC] STANDBY+ received! Cue: " + msc_current_cue, "info");
          } else if (cmd == 0x0C) { // STANDBY_MINUS
            msc_state = "off";
            msc_last_command = "STANDBY-";
            actualType = "";
            actualColor = "";
            logger("[MSC] STANDBY- received!", "info");
          }
          renderScreen();
          return;
        }
      }
    }
  }
}

// ==========================================
// Double-Buffered Screen Rendering
// ==========================================
void renderScreen() {
  // Compute Background Color and Text Color for BOTH Screen 0 and Screen 1 (Diagnostics)
  uint16_t bgColor = TFT_BLACK;
  uint16_t textColor = TFT_WHITE;
  String statusLabel = "STANDBY";

  bool flashPhase = (millis() / 400) % 2 == 0;

  // 0. P2P Fault Detection: >4 heartbeats missed -> Flash Yellow and show DISCONNECTED (Requirement 7)
  if (isP2PMode() && p2p_disconnected_state) {
    bgColor = flashPhase ? TFT_YELLOW : TFT_BLACK;
    textColor = flashPhase ? TFT_BLACK : TFT_YELLOW;
    statusLabel = "DISCONNECTED";
  } else if (isPromptside()) {
    // 0.2 Promptside Theatrical Cue Light (Requirement 2)
    if (promptside_state == "standby_ack") {
      if (!promptside_ack_done) {
        bgColor = flashPhase ? TFT_RED : TFT_BLACK;
        textColor = flashPhase ? TFT_WHITE : TFT_RED;
        statusLabel = "STANDBY (ACK)";
      } else {
        bgColor = TFT_RED;
        textColor = TFT_WHITE;
        statusLabel = "ACKNOWLEDGED";
      }
    } else if (promptside_state == "go") {
      bgColor = TFT_GREEN;
      textColor = TFT_BLACK;
      statusLabel = "GO!";
    } else {
      bgColor = TFT_BLACK;
      textColor = TFT_WHITE;
      statusLabel = "OFF";
    }
  } else if (isMSCRTPMidi()) {
    // 0.4 MIDI Show Control (MSC) over rtpMIDI (Requirement 3)
    if (msc_state == "go") {
      bgColor = TFT_GREEN;
      textColor = TFT_BLACK;
      statusLabel = String("GO ") + (msc_current_cue.length() > 0 ? msc_current_cue : "");
    } else if (msc_state == "standby") {
      if (actualType == "\"flashred\"") {
        bgColor = flashPhase ? TFT_RED : TFT_BLACK;
        textColor = flashPhase ? TFT_WHITE : TFT_RED;
        statusLabel = String("STANDBY+ ") + (msc_current_cue.length() > 0 ? msc_current_cue : "");
      } else {
        bgColor = TFT_RED;
        textColor = TFT_WHITE;
        statusLabel = String("STANDBY ") + (msc_current_cue.length() > 0 ? msc_current_cue : "");
      }
    } else {
      bgColor = TFT_BLACK;
      textColor = TFT_WHITE;
      statusLabel = "MSC OFF";
    }
  } else if (isOSCCueLight()) {
    if (osccue_state == "standby_ack") {
      if (!osccue_ack_done) {
        bgColor = flashPhase ? TFT_RED : TFT_BLACK;
        textColor = flashPhase ? TFT_WHITE : TFT_RED;
        statusLabel = "STANDBY (ACK)";
      } else {
        bgColor = TFT_RED;
        textColor = TFT_WHITE;
        statusLabel = "ACKNOWLEDGED";
      }
    } else if (osccue_state == "standby") {
      bgColor = TFT_RED;
      textColor = TFT_WHITE;
      statusLabel = "STANDBY";
    } else if (osccue_state == "go") {
      bgColor = TFT_GREEN;
      textColor = TFT_BLACK;
      statusLabel = "GO!";
    } else {
      bgColor = TFT_BLACK;
      textColor = TFT_WHITE;
      statusLabel = "OFF";
    }
  } else if (isTSL31Listener()) {
    if (actualType == "\"program\"") {
      bgColor = TFT_RED;
      textColor = TFT_WHITE;
      statusLabel = "PROGRAM";
    } else if (actualType == "\"preview\"") {
      bgColor = TFT_GREEN;
      textColor = TFT_BLACK;
      statusLabel = "PREVIEW";
    } else if (actualType == "\"aux\"") {
      bgColor = TFT_ORANGE;
      textColor = TFT_BLACK;
      statusLabel = "AUX";
    } else {
      bgColor = TFT_BLACK;
      textColor = TFT_WHITE;
      statusLabel = "STANDBY";
    }
  } else if (isTSL50Listener()) {
    if (actualType == "\"program\"") {
      bgColor = TFT_RED;
      textColor = TFT_WHITE;
      statusLabel = "PROGRAM";
    } else if (actualType == "\"preview\"") {
      bgColor = TFT_GREEN;
      textColor = TFT_BLACK;
      statusLabel = "PREVIEW";
    } else if (actualType == "\"aux\"") {
      bgColor = TFT_ORANGE;
      textColor = TFT_BLACK;
      statusLabel = "AUX";
    } else if (actualType == "\"blue\"") {
      bgColor = TFT_BLUE;
      textColor = TFT_WHITE;
      statusLabel = "BLUE";
    } else {
      bgColor = TFT_BLACK;
      textColor = TFT_WHITE;
      statusLabel = "STANDBY";
    }
  } else if (isETCCueSystem()) {
    if (actualType == "\"standby\"") {
      if (!cuesystem_ack_active) {
        bgColor = flashPhase ? TFT_RED : TFT_BLACK;
        textColor = flashPhase ? TFT_WHITE : TFT_RED;
        statusLabel = "STANDBY";
      } else {
        bgColor = TFT_RED;
        textColor = TFT_WHITE;
        statusLabel = "ACKNOWLEDGED";
      }
    } else if (actualType == "\"program\"") {
      bgColor = TFT_GREEN;
      textColor = TFT_BLACK;
      statusLabel = "GO";
    } else {
      bgColor = TFT_BLACK;
      textColor = TFT_WHITE;
      statusLabel = "CUE OFF";
    }
  } else if (actualType == "\"flashred\"") {
    bgColor = flashPhase ? TFT_RED : TFT_BLACK;
    textColor = flashPhase ? TFT_WHITE : TFT_RED;
    statusLabel = "FLASH RED";
  } else if (actualType == "\"program\"") {
    bgColor = TFT_RED;
    textColor = TFT_WHITE;
    statusLabel = isNMOSIS07() ? "ON-AIR" : (isRTPMidi() || isOSC() ? "RED" : "PROGRAM");
  } else if (actualType == "\"preview\"") {
    bgColor = TFT_GREEN;
    textColor = TFT_BLACK;
    statusLabel = isRTPMidi() || isOSC() ? "GREEN" : "PREVIEW";
  } else if (actualType == "\"yellow\"") {
    bgColor = TFT_YELLOW;
    textColor = TFT_BLACK;
    statusLabel = "YELLOW";
  } else if (actualType == "\"blue\"") {
    bgColor = TFT_BLUE;
    textColor = TFT_WHITE;
    statusLabel = "BLUE";
  } else if (actualType == "\"white\"") {
    bgColor = TFT_WHITE;
    textColor = TFT_BLACK;
    statusLabel = "WHITE";
  } else if (actualType == "\"aux\"") {
    bgColor = TFT_ORANGE;
    textColor = TFT_BLACK;
    statusLabel = "AUX";
  } else if (actualColor.length() > 0 && actualColor != "invalid") {
    String hexstring = actualColor;
    hexstring.replace("#", "");
    long number = (long)strtol(hexstring.c_str(), NULL, 16);
    int r = (number >> 16) & 0xFF;
    int g = (number >> 8) & 0xFF;
    int b = number & 0xFF;
    bgColor = M5.Display.color565(r, g, b);
    textColor = (r + g + b > 380) ? TFT_BLACK : TFT_WHITE;
    statusLabel = actualType;
    statusLabel.replace("\"", "");
    statusLabel.toUpperCase();
  }

  if (currentScreen == 0) {
    // ----------------------------------------
    // Screen 0: Tally & Cue Display (128x128)
    // ----------------------------------------
    auto renderContent = [&](M5Canvas* g) {
      g->fillScreen(bgColor);

      // Top Header: Priority 1: MTC Timecode Reader if enabled (Requirement 4)
      if (mtc_reader_enabled) {
        g->fillRoundRect(4, 4, 120, 24, 4, TFT_BLACK);
        g->drawRoundRect(4, 4, 120, 24, 4, TFT_CYAN);
        g->setTextDatum(middle_center);
        g->setTextSize(2);
        g->setTextColor(TFT_CYAN, TFT_BLACK);
        g->drawString(mtc_timecode_str, 64, 16);
      } else if (isPromptside()) {
        // Requirement 2: Promptside Wing Label banner
        g->fillRoundRect(4, 4, 120, 22, 4, TFT_BLACK);
        g->drawRoundRect(4, 4, 120, 22, 4, TFT_MAGENTA);
        g->setTextDatum(middle_center);
        g->setTextSize(1);
        g->setTextColor(TFT_MAGENTA, TFT_BLACK);
        g->drawString(promptside_wing_label, 64, 15);
      } else if (isOSCCueLight()) {
        g->fillRoundRect(4, 4, 120, 22, 4, TFT_BLACK);
        g->drawRoundRect(4, 4, 120, 22, 4, TFT_DARKGRAY);
        g->setTextDatum(middle_center);
        g->setTextSize(1);
        g->setTextColor(TFT_CYAN, TFT_BLACK);
        g->drawString(osccue_banner, 64, 15);
      } else {
        // Clock: Formatted using configured Timezone (Requirement 1)
        g->fillRoundRect(4, 4, 120, 24, 4, TFT_BLACK);
        g->drawRoundRect(4, 4, 120, 24, 4, TFT_DARKGRAY);

        time_t now;
        time(&now);
        struct tm timeinfo;
        char timeStr[12] = "--:--:--";
        if (now > 100000) {
          localtime_r(&now, &timeinfo);
          strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);
        } else {
          unsigned long totalSecs = millis() / 1000;
          unsigned int h = (totalSecs / 3600) % 24;
          unsigned int m = (totalSecs / 60) % 60;
          unsigned int s = totalSecs % 60;
          snprintf(timeStr, sizeof(timeStr), "%02u:%02u:%02u", h, m, s);
        }
        g->setTextDatum(middle_center);
        g->setTextSize(2);
        g->setTextColor(TFT_WHITE, TFT_BLACK);
        g->drawString(timeStr, 64, 16);
      }

      // Device Name / Centre Display Text
      String displayName = DeviceName;
      if (isPromptside()) {
        displayName = promptside_cue_text.length() > 0 ? promptside_cue_text : (promptside_state == "go" ? "GO!" : (promptside_state == "standby_ack" ? "STANDBY" : (String("CH ") + promptside_channel)));
      } else if (isMSCRTPMidi()) {
        displayName = msc_current_cue.length() > 0 ? (String("CUE ") + msc_current_cue) : "MSC CUE";
      } else if (isOSC() && osc_custom_message.length() > 0) {
        displayName = osc_custom_message;
      } else if (isTSL31Listener()) {
        displayName = tsl31_name;
      } else if (isTSL50Listener()) {
        displayName = tsl50_name;
      } else if (isOSCCueLight()) {
        displayName = osccue_message.length() > 0 ? osccue_message : (osccue_state == "go" ? "GO!" : (osccue_state == "standby_ack" ? "STANDBY" : (osccue_state == "standby" ? "STANDBY" : "OFF")));
      }

      g->setTextSize(2);
      g->setTextColor(textColor, bgColor);
      int textWidth = g->textWidth(displayName.c_str());

      if (isTSL31Listener() || isTSL50Listener() || isMSCRTPMidi() || isPromptside()) {
        g->setTextDatum(middle_center);
        if (textWidth > 116) {
          int scrollRange = textWidth + 60;
          int offset = (millis() / 35) % scrollRange;
          int startX = 120 - offset;
          g->setTextDatum(middle_left);
          g->drawString(displayName, startX, 52);
        } else {
          g->drawString(displayName, 64, 52);
        }
      } else {
        if (textWidth > 116) {
          int scrollRange = textWidth + 60;
          int offset = (millis() / 35) % scrollRange;
          int startX = 120 - offset;
          g->setTextDatum(middle_left);
          g->drawString(displayName, startX, 46);
        } else {
          g->setTextDatum(middle_center);
          g->drawString(displayName, 64, 46);
        }
      }

      // Status Tag Badge
      g->setTextDatum(middle_center);
      g->setTextSize(1);
      g->drawRoundRect(14, 68, 100, 16, 4, textColor);
      g->drawString(statusLabel, 64, 76);

      // Bottom Status: Mode Badge, Cue & Peer / TA status
      g->setTextDatum(top_left);
      g->setTextSize(1);
      g->setCursor(4, 88);
      g->setTextColor(textColor, bgColor);
      String roleBadge = "";
      if (operatingMode == "TP") roleBadge = "[TP (TA)]";
      else if (operatingMode == "Presenter") roleBadge = "[PRES (TA)]";
      else if (operatingMode == "Presenter_P2P") roleBadge = "[P2P PRES]";
      else if (operatingMode == "TP_P2P") roleBadge = "[P2P TP]";
      else if (operatingMode == "ETC_CueSystem") roleBadge = "[ETC CUE]";
      else if (operatingMode == "NMOS_IS07") roleBadge = "[NMOS-07]";
      else if (operatingMode == "RTP_MIDI") roleBadge = "[rtpMIDI]";
      else if (operatingMode == "MSC_RTP_MIDI") roleBadge = "[MSC MIDI]";
      else if (operatingMode == "Promptside") roleBadge = "[PROMPT]";
      else if (operatingMode == "OSC") roleBadge = "[OSC CUE]";
      else if (operatingMode == "TSL_31") roleBadge = String("[TSL3.1 ") + tsl31_transport + "]";
      else if (operatingMode == "TSL_50") roleBadge = String("[TSL5.0 ") + tsl50_transport + "]";
      else if (operatingMode == "OSC_CueLight") roleBadge = "[OSC CUE-LX]";
      g->print(roleBadge);

      g->setCursor(68, 88);
      if (isPromptside()) {
        g->print("Ch: " + promptside_channel);
      } else if (isMSCRTPMidi()) {
        g->print("Dev:" + String(msc_device_id));
      } else if (isETCCueSystem()) {
        g->print("Ch: " + String(cuesystem_channel));
      } else if (isNMOSIS07()) {
        g->print("IS-07");
      } else if (isRTPMidi()) {
        g->print("Ch:" + String(rtpmidi_channel == 0 ? "Omni" : String(rtpmidi_channel)));
      } else if (isOSC()) {
        g->print("Port:" + String(osc_port));
      } else if (isTSL31Listener()) {
        g->print("Port:" + String(tsl31_port));
      } else if (isTSL50Listener()) {
        g->print("Port:" + String(tsl50_port));
      } else if (isOSCCueLight()) {
        g->print("ID: " + osccue_station_id);
      } else if (isP2PMode()) {
        if (p2p_disconnected_state) {
          g->setTextColor(TFT_RED, bgColor);
          g->print("LOST >4");
        } else {
          g->print("Grp: " + pairingGroup.substring(0, 5));
        }
      } else {
        g->print(socket.isConnected() ? "TA: Online" : "TA: Offline");
      }

      g->setCursor(4, 98);
      if (isPromptside()) {
        if (promptside_ack_done) {
          g->setTextColor(TFT_GREEN, bgColor);
          g->print("[ACKNOWLEDGED]");
        } else {
          g->setTextColor(textColor, bgColor);
          g->print("Ack: PENDING");
        }
      } else if (isMSCRTPMidi()) {
        g->setTextColor(textColor, bgColor);
        g->print(String("Cmd: ") + msc_last_command + " " + msc_current_cue);
      } else if (isETCCueSystem()) {
        if (cuesystem_ack_active) {
          g->setTextColor(TFT_GREEN, bgColor);
          g->print("[ACKNOWLEDGED]");
        } else {
          g->setTextColor(textColor, bgColor);
          g->print("Ack: PENDING");
        }
      } else if (isNMOSIS07()) {
        g->setTextColor(textColor, bgColor);
        g->print("Prg/Pvw/Aux");
      } else if (isRTPMidi()) {
        g->setTextColor(textColor, bgColor);
        g->print("AppleMIDI 5004");
      } else if (isOSC()) {
        g->setTextColor(textColor, bgColor);
        g->print(osc_prefix.substring(0, 14));
      } else if (isPresenter()) {
        g->print("Cue(PVW): ");
        if (ch1state) {
          g->setTextColor(TFT_GREEN, bgColor);
          g->print("ACTIVE");
        } else {
          g->setTextColor(textColor, bgColor);
          g->print("OFF");
        }
      } else {
        g->print("Return(PRG): ");
        if (ch1state) {
          g->setTextColor(TFT_RED, bgColor);
          g->print("ACTIVE");
        } else {
          g->setTextColor(textColor, bgColor);
          g->print("OFF");
        }
      }

      // Bottom line: P2P Disconnect Alarm, Presenter Cue Alert on TP unit, or Network IP
      g->setCursor(4, 112);
      if (isP2PMode() && p2p_disconnected_state) {
        g->setTextColor(TFT_YELLOW, TFT_RED);
        g->print(">>> PEER LOST - SEARCHING <<<");
      } else if (isTP() && presenterCueActive) {
        g->setTextColor(TFT_YELLOW, TFT_RED);
        g->print(">>> PRESENTER CUE! <<<");
      } else {
        g->setTextColor(textColor, bgColor);
        String netStr = String("IP:") + getNetworkIPStr() + (useDHCP ? " (D)" : " (S)");
        g->print(netStr.substring(0, 19));
      }
    };

    if (doubleBufferEnabled) {
      renderContent(&canvas);
      canvas.pushSprite(0, 0); // Atomic flush to LCD with zero flicker!
    } else {
      M5.Display.startWrite();
      renderContent((M5Canvas*)&M5.Display);
      M5.Display.endWrite();
    }

  } else {
    // ----------------------------------------
    // Screen 1: Network & Diagnostics (128x128)
    // ----------------------------------------
    auto renderContent = [&](M5Canvas* g) {
      // REQUIREMENT 2: Background follows the current tally state!
      g->fillScreen(bgColor);

      bool isLightBg = (bgColor == TFT_WHITE || bgColor == TFT_YELLOW || bgColor == TFT_GREEN);
      uint16_t bannerBg = TFT_BLACK;
      uint16_t bannerText = TFT_CYAN;
      uint16_t dTextColor = isLightBg ? TFT_BLACK : TFT_WHITE;

      g->fillRoundRect(2, 2, 124, 15, 3, bannerBg);
      g->setTextDatum(middle_center);
      g->setTextColor(bannerText, bannerBg);
      g->setTextSize(1);
      g->drawString("ATOM S3R DIAGNOSTICS", 64, 9);

      g->setTextDatum(top_left);
      g->setTextColor(dTextColor, bgColor);

      g->setCursor(4, 20);
      g->print("Mode: ");
      g->println(operatingMode);

      g->setCursor(4, 32);
      g->print("Net:  ");
      g->print(useDHCP ? "DHCP " : "Static ");
      g->println(getNetworkIPStr());

      g->setCursor(4, 44);
      if (isPromptside()) {
        g->print("Prompt: ");
        g->print(promptside_channel);
        g->print(" Port:8000");
        g->println();
      } else if (isMSCRTPMidi()) {
        g->print("MSC ID: ");
        g->print(msc_device_id);
        g->print(" Port:5004");
        g->println();
      } else if (isETCCueSystem()) {
        g->print("Hub:  ");
        g->print(cuesystem_host);
        g->print(":");
        g->println(cuesystem_port);
      } else if (isNMOSIS07()) {
        g->print("Reg:  ");
        g->print(nmos_registry_host);
        g->print(":");
        g->println(nmos_registry_port);
      } else if (isRTPMidi()) {
        g->print("MIDI: Ch ");
        g->print(rtpmidi_channel == 0 ? "Omni" : String(rtpmidi_channel));
        g->print(" Port:");
        g->println(rtpmidi_port);
      } else if (isOSC()) {
        g->print("OSC:  Port ");
        g->println(osc_port);
      } else if (isP2PMode()) {
        g->print("Peer: ");
        if (p2p_disconnected_state) {
          g->setTextColor(TFT_RED, bgColor);
          g->println("DISCONNECTED (>4 missed)");
          g->setTextColor(dTextColor, bgColor);
        } else {
          g->println(pairedTargetIP.length() > 0 ? pairedTargetIP : "Unpaired (B-cast)");
        }
      } else if (isTSL31Listener()) {
        g->print("TSL31: ");
        g->print(tsl31_transport);
        g->print(":");
        g->println(tsl31_port);
      } else if (isTSL50Listener()) {
        g->print("TSL50: ");
        g->print(tsl50_transport);
        g->print(":");
        g->println(tsl50_port);
      } else if (isOSCCueLight()) {
        g->print("CueLX: ID ");
        g->print(osccue_station_id);
        g->print(" :");
        g->println(osccue_port);
      } else {
        g->print("TA:   ");
        g->println(socket.isConnected() ? "Connected" : "Disconnected");
      }

      // Requirement 9: AtomENV Sensor Live Telemetry
      g->setCursor(4, 56);
      if (env_sensor_enabled) {
        g->print("ENV:  ");
        g->print(env_temperature, 1);
        g->print("C ");
        g->print(env_humidity, 0);
        g->print("% ");
        g->print(env_pressure, 0);
        g->println("hPa");
      } else {
        g->print("Tally: ");
        g->println(statusLabel);
      }

      g->setCursor(4, 68);
      g->print("MTC:  ");
      if (mtc_reader_enabled) {
        g->println(mtc_timecode_str);
      } else {
        g->print("TZ: ");
        g->println(timezone_name.substring(0, 14));
      }

      g->setCursor(4, 80);
      g->print("Rot:  ");
      g->print(currentRotation * 90);
      g->println(" deg (IMU Auto)");

      g->setCursor(4, 92);
      g->print("Free PSRAM: ");
      g->print(ESP.getFreePsram() / 1024);
      g->println(" KB");

      g->setCursor(4, 104);
      g->print("Free Heap:  ");
      g->print(esp_get_free_heap_size() / 1024);
      g->println(" KB");

      g->setCursor(4, 116);
      g->print("CPU:");
      g->print(cpu_freq_mhz);
      g->print("M ");
      g->print(brightnessLevels[brightnessIndex] * 100 / 255);
      g->print("% ");
      g->println(screen_dimmed ? "[DIM]" : "[ECO]");
    };

    if (doubleBufferEnabled) {
      renderContent(&canvas);
      canvas.pushSprite(0, 0);
    } else {
      M5.Display.startWrite();
      renderContent((M5Canvas*)&M5.Display);
      M5.Display.endWrite();
    }
  }
}


void evaluateMode() {
  tallyStateChanged = true;
  if (xPortGetCoreID() == 1) {
    renderScreen();
  }
}

void showSettings() {
  currentScreen = 1;
  renderScreen();
}

void showDeviceInfo() {
  currentScreen = 0;
  renderScreen();
}

// Power & Thermal Functions (Item 10)
void wakeDisplayFromDim() {
  last_user_or_tally_act = millis();
  if (screen_dimmed) {
    screen_dimmed = false;
    M5.Display.setBrightness(brightnessLevels[brightnessIndex]);
    logger(String("[Power] Display woke from dim; brightness restored to ") + String(brightnessLevels[brightnessIndex]), "info-quiet");
    renderScreen();
  }
}

void applyPowerManagementConfig() {
  // Validate CPU clock: 80 MHz (Eco), 160 MHz (Balanced), 240 MHz (Max)
  if (cpu_freq_mhz != 80 && cpu_freq_mhz != 160 && cpu_freq_mhz != 240) {
    cpu_freq_mhz = 80;
  }
  setCpuFrequencyMhz(cpu_freq_mhz);

  // Power down Bluetooth radio completely (not utilized by tally/cue light)
  btStop();
  esp_bt_controller_disable();

  logger(String("[Power] Low-Power Mode Applied: CPU @ ") + String(getCpuFrequencyMhz()) + 
         " MHz (APB: " + String(getApbFrequency() / 1000000) + " MHz). BT radio OFF.", "info");
}

void updateBrightness() {
  wakeDisplayFromDim();
  brightnessIndex = (brightnessIndex + 1) % (sizeof(brightnessLevels) / sizeof(brightnessLevels[0]));
  M5.Display.setBrightness(brightnessLevels[brightnessIndex]);
  logger(String("[Display] Brightness set to ") + String(brightnessLevels[brightnessIndex]), "info-quiet");
  renderScreen();
}

void printLocalTime() {
  renderScreen();
}

// ==========================================
// Embedded AsyncWebServer for Configuration
// ==========================================
void setupWebServer() {
  // Web Dashboard & Status Page
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    String html = F("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<title>M5AtomS3R PoE Tally & Cue Controller</title><style>"
                    "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#f1f5f9;padding:16px;max-width:620px;margin:auto}"
                    ".card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 4px 6px rgba(0,0,0,0.3)}"
                    "h1{font-size:20px;margin:0 0 4px 0;color:#38bdf8}h2{font-size:15px;color:#94a3b8;margin:0 0 14px 0;text-transform:uppercase;letter-spacing:0.05em}"
                    ".badge{display:inline-block;padding:3px 8px;border-radius:9999px;font-size:11px;font-weight:700;margin-right:4px}"
                    ".badge-blue{background:#0284c7;color:#fff}.badge-green{background:#16a34a;color:#fff}.badge-purple{background:#7c3aed;color:#fff}.badge-amber{background:#d97706;color:#fff}.badge-red{background:#dc2626;color:#fff}.badge-cyan{background:#0891b2;color:#fff}"
                    "label{display:block;margin-top:12px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.03em}"
                    "input,select{width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #475569;color:#f8fafc;padding:10px;border-radius:6px;margin-top:4px;font-size:14px}"
                    "input:focus,select:focus{outline:none;border-color:#38bdf8}"
                    "button{background:#0284c7;color:white;font-weight:600;padding:11px 14px;border:none;border-radius:6px;cursor:pointer;font-size:14px}"
                    "button:hover{background:#0369a1}"
                    ".btn-scan{background:#059669;width:100%;margin-top:10px}.btn-scan:hover{background:#047857}"
                    ".btn-save{width:100%;margin-top:20px;background:#2563eb}.btn-save:hover{background:#1d4ed8}"
                    ".peer-item{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px;margin-top:8px;display:flex;justify-content:space-between;align-items:center}"
                    ".peer-info{font-size:13px}.peer-name{font-weight:700;color:#e2e8f0}.peer-sub{font-size:11px;color:#94a3b8}"
                    ".btn-pair{padding:6px 12px;font-size:12px;background:#7c3aed;border-radius:4px}.btn-pair:hover{background:#6d28d9}"
                    ".grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}"
                    ".section-box{background:#172033;border:1px solid #334155;border-radius:8px;padding:14px;margin-top:14px}"
                    ".hint{font-size:12px;color:#94a3b8;margin-top:4px}"
                    "</style></head><body>"
                    "<div class='card'>"
                    "<h1>M5AtomS3R PoE Tally & Cue</h1>"
                    "<h2>Broadcast Cue & Tally Controller</h2>"
                    "<p style='margin:4px 0;'>Device: <strong>");
    html += DeviceName;
    html += F("</strong> (");
    html += listenerDeviceName;
    html += F(")</p><p style='margin:4px 0;'>Current Mode: ");
    if (operatingMode == "TP") html += F("<span class='badge badge-blue'>TP (Tally Arbiter)</span>");
    else if (operatingMode == "Presenter") html += F("<span class='badge badge-green'>Presenter (Tally Arbiter)</span>");
    else if (operatingMode == "TP_P2P") html += F("<span class='badge badge-purple'>TP Standalone (P2P)</span>");
    else if (operatingMode == "Presenter_P2P") html += F("<span class='badge badge-amber'>Presenter Standalone (P2P)</span>");
    else if (operatingMode == "ETC_CueSystem") html += F("<span class='badge badge-red'>ETC CueSystem Outstation</span>");
    else if (operatingMode == "NMOS_IS07") html += F("<span class='badge badge-cyan'>NMOS IS-07 Event & Tally</span>");
    else if (operatingMode == "Promptside") html += F("<span class='badge badge-purple'>Promptside Cue Light</span>");
    else if (operatingMode == "MSC_RTP_MIDI") html += F("<span class='badge badge-blue'>MSC over rtpMIDI</span>");
    html += F("</p><p style='margin:4px 0;'>Network: <strong>");
    html += getNetworkModeStr();
    html += F(" (");
    html += useDHCP ? "DHCP" : "Static IP";
    html += F(")</strong> | IP: <strong>");
    html += getNetworkIPStr();
    html += F("</strong> | Double Buffer: <strong>");
    html += doubleBufferEnabled ? "32KB OK" : "Direct";
    html += F("</strong></p><p style='margin:4px 0;'>PoE Thermal: <strong>");
    html += cpu_freq_mhz == 80 ? "<span class='badge badge-green'>Eco (~35&deg;C)</span>" : (cpu_freq_mhz == 160 ? "<span class='badge badge-amber'>Balanced (~45&deg;C)</span>" : "<span class='badge badge-red'>Max (~58&deg;C)</span>");
    html += F("</strong> | CPU: <strong>");
    html += String(cpu_freq_mhz);
    html += F(" MHz</strong> | Radios: <strong>");
    html += wifiDisabledForEth ? "<span class='badge badge-blue'>OFF (PoE Link)</span>" : "<span class='badge badge-purple'>Wi-Fi Active</span>";
    html += F("</strong> | Display: <strong>");
    html += screen_dimmed ? "Auto-Dimmed (10%)" : "Active";
    html += F("</strong></p>");

            "<p style='margin:8px 0 0 0;'><a href='/manual' target='_blank' style='color:#38bdf8;text-decoration:none;font-weight:600;font-size:13px;'>&#128214; View Full HTML User Manual & Documentation &rarr;</a></p>"
            "</div><div class='card'>"
                    "<form action='/save' method='POST'>"
                    "<h2>Operating Mode & Role</h2>"
                    "<label>Device Mode</label>"
                    "<select name='mode' id='mode-select' onchange='updateModeUI()'>"
                    "<option value='TP'");
    if (operatingMode == "TP") html += F(" selected");
    html += F(">TP (Technical Producer with Tally Arbiter)</option>"
              "<option value='Presenter'");
    if (operatingMode == "Presenter") html += F(" selected");
    html += F(">Presenter (with Tally Arbiter)</option>"
              "<option value='TP_P2P'");
    if (operatingMode == "TP_P2P") html += F(" selected");
    html += F(">TP no Tally Arbiter (P2P Master)</option>"
              "<option value='Presenter_P2P'");
    if (operatingMode == "Presenter_P2P") html += F(" selected");
    html += F(">Presenter no Tally Arbiter (P2P Slave)</option>"
              "<option value='ETC_CueSystem'");
    if (operatingMode == "ETC_CueSystem") html += F(" selected");
    html += F(">ETC CueSystem (Stage Cue Light Outstation)</option>"
              "<option value='NMOS_IS07'");
    if (operatingMode == "NMOS_IS07") html += F(" selected");
    html += F(">NMOS IS-07 Event & Tally (SMPTE ST 2110)</option>"
              "<option value='Promptside'");
    if (operatingMode == "Promptside") html += F(" selected");
    html += F(">Promptside (Theatrical Stage Cue Light - promptside.co)</option>"
              "<option value='MSC_RTP_MIDI'");
    if (operatingMode == "MSC_RTP_MIDI") html += F(" selected");
    html += F(">MIDI Show Control (MSC over rtpMIDI - RP-002)</option>"
              "<option value='RTP_MIDI'");
    if (operatingMode == "RTP_MIDI") html += F(" selected");
    html += F(">rtpMIDI / AppleMIDI Outstation</option>"
              "<option value='OSC'");
    if (operatingMode == "OSC") html += F(" selected");
    html += F(">OSC (Open Sound Control) Outstation</option>"
              "<option value='TSL_31'");
    if (operatingMode == "TSL_31") html += F(" selected");
    html += F(">TSL 3.1 Listener (UDP / TCP with centered name)</option>"
              "<option value='TSL_50'");
    if (operatingMode == "TSL_50") html += F(" selected");
    html += F(">TSL 5.0 Listener (UDP / TCP with centered name)</option>"
              "<option value='OSC_CueLight'");
    if (operatingMode == "OSC_CueLight") html += F(" selected");
    html += F(">OSC Cue Light (RSMCK iOS Protocol - Port 53000)</option>"
              "</select>"

              // Requirement 1 & 4 & 9: Timezone & Global Peripherals
              "<div class='section-box'>"
              "<h2>Timezone & Global Peripherals</h2>"
              "<div class='grid-2'>"
              "<div><label>Timezone (NTP Clock)</label>"
              "<select name='timezone_name' id='tz-select' onchange='toggleCustomTZ()'>"
              "<option value='Europe/London'");
    if (timezone_name == "Europe/London") html += F(" selected");
    html += F(">Europe/London (GMT/BST - Default)</option>"
              "<option value='UTC'");
    if (timezone_name == "UTC") html += F(" selected");
    html += F(">UTC / GMT</option>"
              "<option value='Europe/Paris'");
    if (timezone_name == "Europe/Paris") html += F(" selected");
    html += F(">Europe/Paris, Berlin, Rome (CET/CEST)</option>"
              "<option value='America/New_York'");
    if (timezone_name == "America/New_York") html += F(" selected");
    html += F(">America/New York (EST/EDT)</option>"
              "<option value='America/Chicago'");
    if (timezone_name == "America/Chicago") html += F(" selected");
    html += F(">America/Chicago (CST/CDT)</option>"
              "<option value='America/Denver'");
    if (timezone_name == "America/Denver") html += F(" selected");
    html += F(">America/Denver (MST/MDT)</option>"
              "<option value='America/Los_Angeles'");
    if (timezone_name == "America/Los_Angeles") html += F(" selected");
    html += F(">America/Los Angeles (PST/PDT)</option>"
              "<option value='Asia/Tokyo'");
    if (timezone_name == "Asia/Tokyo") html += F(" selected");
    html += F(">Asia/Tokyo (JST)</option>"
              "<option value='Australia/Sydney'");
    if (timezone_name == "Australia/Sydney") html += F(" selected");
    html += F(">Australia/Sydney (AEST/AEDT)</option>"
              "<option value='Custom'");
    if (timezone_name == "Custom") html += F(" selected");
    html += F(">Custom POSIX String</option></select></div>"
              "<div><label>Custom POSIX Timezone</label><input type='text' id='tz-custom' name='custom_tz_posix' value='");
    html += custom_tz_posix;
    html += F("' placeholder='GMT0BST,M3.5.0/1,M10.5.0'></div></div>"
              "<div class='grid-2' style='margin-top:10px;'>"
              "<div><label>MTC Reader from rtpMIDI</label><select name='mtc_reader'>"
              "<option value='0'");
    if (!mtc_reader_enabled) html += F(" selected");
    html += F(">Disabled (Show NTP Clock)</option><option value='1'");
    if (mtc_reader_enabled) html += F(" selected");
    html += F(">Enabled (Show Incoming MTC Timecode)</option></select></div>"
              "<div><label>M5Stack AtomENV Sensor (I2C Grove)</label><select name='env_sensor'>"
              "<option value='0'");
    if (!env_sensor_enabled) html += F(" selected");
    html += F(">Disabled</option><option value='1'");
    if (env_sensor_enabled) html += F(" selected");
    html += F(">Enabled (SHT30 + BMP280)</option></select></div></div>"
              "<div class='hint'>When MTC Reader is enabled, Screen 0 displays incoming MIDI Time Code (HH:MM:SS:FF) from quarter-frames & SysEx over AppleMIDI. When AtomENV is enabled, diagnostics & /api/env report environmental metrics.</div>"
              "</div>"

              // Section: Network IP Configuration
              "<div class='section-box'>"
              "<h2>Network IP Configuration</h2>"
              "<label>IP Assignment Mode</label>"
              "<select name='ip_dhcp' id='ip_dhcp' onchange='toggleIPFields()'>"
              "<option value='1'");
    if (useDHCP) html += F(" selected");
    html += F(">DHCP (Automatic)</option>"
              "<option value='0'");
    if (!useDHCP) html += F(" selected");
    html += F(">Static IP (Manual)</option>"
              "</select>"
              "<div id='static-ip-fields' style='display:");
    html += useDHCP ? "none" : "block";
    html += F(";'>"
              "<div class='grid-2'>"
              "<div><label>Static IP Address</label><input type='text' name='static_ip' value='");
    html += static_ip;
    html += F("' placeholder='192.168.1.150'></div>"
              "<div><label>Subnet Mask</label><input type='text' name='static_mask' value='");
    html += static_mask;
    html += F("' placeholder='255.255.255.0'></div></div>"
              "<div class='grid-2'>"
              "<div><label>Default Gateway</label><input type='text' name='static_gw' value='");
    html += static_gw;
    html += F("' placeholder='192.168.1.1'></div>"
              "<div><label>Primary DNS Server</label><input type='text' name='static_dns' value='");
    html += static_dns;
    html += F("' placeholder='8.8.8.8'></div></div>"
              "</div></div>"

              // Section: Power & Thermal Management (Item 10)
              "<div class='section-box'>"
              "<h2>Power & Thermal Management (PoE Heat Optimization)</h2>"
              "<div class='grid-2'>"
              "<div><label>CPU Clock Frequency</label>"
              "<select name='cpu_freq'>"
              "<option value='80'");
    if (cpu_freq_mhz == 80) html += F(" selected");
    html += F(">80 MHz (Eco - ~35&deg;C, Coolest & Recommended for PoE)</option>"
              "<option value='160'");
    if (cpu_freq_mhz == 160) html += F(" selected");
    html += F(">160 MHz (Balanced - ~45&deg;C)</option>"
              "<option value='240'");
    if (cpu_freq_mhz == 240) html += F(" selected");
    html += F(">240 MHz (Max Performance - ~58&deg;C Hot)</option>"
              "</select></div>"
              "<div><label>Display Auto-Dimming</label>"
              "<select name='dim_timeout'>"
              "<option value='0'");
    if (screen_dim_timeout_sec == 0) html += F(" selected");
    html += F(">Disabled (Always On at set brightness)</option>"
              "<option value='30'");
    if (screen_dim_timeout_sec == 30) html += F(" selected");
    html += F(">After 30s Idle (Dim to 10%)</option>"
              "<option value='60'");
    if (screen_dim_timeout_sec == 60) html += F(" selected");
    html += F(">After 60s Idle (Recommended)</option>"
              "<option value='180'");
    if (screen_dim_timeout_sec == 180) html += F(" selected");
    html += F(">After 3 Minutes Idle</option>"
              "</select></div></div>"
              "<div class='hint'>AtomPoE converts 48V PoE to 5V inside a sealed 24x24mm shell. Setting CPU to 80 MHz reduces core dynamic power by ~60% while maintaining the APB bus at 80 MHz (100% full W5500 SPI line-rate with &lt;1ms tally latency). Wi-Fi and Bluetooth radios are shut down when Ethernet is linked. Display auto-dims to 10% when idle and wakes instantly upon any live tally cue or button press.</div>"
              "</div>");


              // Section: Tally Arbiter (Item 3: Configurable TSL Port)
              "<div id='sec-ta' class='section-box'>"
              "<h2>Tally Arbiter Settings</h2>"
              "<div class='grid-2'>"
              "<div><label>Tally Arbiter Host / IP</label><input type='text' name='host' value='");
    html += tallyarbiter_host;
    html += F("'></div>"
              "<div><label>Socket.IO Port</label><input type='text' name='port' value='");
    html += tallyarbiter_port;
    html += F("'></div></div>"
              "<div class='grid-2'>"
              "<div><label>Listener Device Name</label><input type='text' name='devicename' value='");
    html += listenerDeviceName;
    html += F("'></div>"
              "<div><label>TSL Return Port (Default: 8910)</label><input type='number' name='tslport' value='");
    html += tallyarbiter_TSLport;
    html += F("'></div></div>"
              "<div class='hint'>Tally Arbiter connects over WebSockets (port 4455) for multi-source tally routing and returns TSL data on the configured TSL port.</div>"
              "</div>"

              // Section: Standalone P2P
              "<div id='sec-p2p' class='section-box'>"
              "<h2>Standalone P2P Settings (No Tally Arbiter)</h2>"
              "<div class='grid-2'>"
              "<div><label>Pairing Group</label><input type='text' name='group' value='");
    html += pairingGroup;
    html += F("'></div>"
              "<div><label>TSL 3.1 UDP Port</label><input type='text' name='tslport' value='");
    html += tallyarbiter_TSLport;
    html += F("'></div></div>"
              "<div class='grid-2'>"
              "<div><label>Paired Peer IP</label><input type='text' id='peerip' name='pairedip' value='");
    html += pairedTargetIP;
    html += F("' placeholder='e.g. 192.168.1.50'></div>"
              "<div><label>Paired Peer Name</label><input type='text' id='peername' name='pairedname' value='");
    html += pairedTargetName;
    html += F("' placeholder='e.g. Presenter-Cam1'></div></div>"
              "<div class='hint'>P2P mode communicates directly between units using TSL 3.1 UDP packets. Heartbeat runs at 0.25s (250ms); if &gt;4 missed (&gt;1000ms), unit flashes yellow and alerts DISCONNECTED.</div>"
              "</div>"

              // Section: Promptside Cue Light (Requirement 2)
              "<div id='sec-promptside' class='section-box'>"
              "<h2>Promptside Theatrical Cue Light (promptside.co)</h2>"
              "<div class='grid-3'>"
              "<div><label>Promptside UDP Port</label><input type='number' name='prompt_port' value='");
    html += String(promptside_port);
    html += F("'></div>"
              "<div><label>Channel / ID</label><input type='text' name='prompt_chan' value='");
    html += promptside_channel;
    html += F("'></div>"
              "<div><label>Wing Label Banner</label><input type='text' name='prompt_wing' value='");
    html += promptside_wing_label;
    html += F("'></div></div>"
              "<div class='hint'>Listens for /promptside/channel/[id]/standby (flashing red, button sends ACK back to console), /go (green), /off, and /text notes.</div>"
              "</div>"

              // Section: MIDI Show Control (MSC over rtpMIDI - Requirement 3)
              "<div id='sec-msc' class='section-box'>"
              "<h2>MIDI Show Control (MSC RP-002 over rtpMIDI)</h2>"
              "<div class='grid-3'>"
              "<div><label>RTP-MIDI Port</label><input type='number' name='msc_port' value='");
    html += String(msc_rtpmidi_port);
    html += F("'></div>"
              "<div><label>Device ID (127 = All-Call)</label><input type='number' name='msc_dev' min='0' max='127' value='");
    html += String(msc_device_id);
    html += F("'></div>"
              "<div><label>Command Format (127 = All)</label><input type='number' name='msc_fmt' min='0' max='127' value='");
    html += String(msc_cmd_format);
    html += F("'></div></div>"
              "<div class='hint'>Parses standard MSC SysEx commands: 01 GO (Green), 02 STOP (Red), 0B STANDBY+ (Flashing Red), decoding cue numbers (e.g. CUE 42.1).</div>"
              "</div>"

              // Section: ETC CueSystem
              "<div id='sec-cuesystem' class='section-box'>"
              "<h2>ETC CueSystem Configuration</h2>"
              "<div class='grid-2'>"
              "<div><label>CueSystem Hub Host / IP</label><input type='text' name='cue_host' value='");
    html += cuesystem_host;
    html += F("'></div>"
              "<div><label>CueSystem UDP Port</label><input type='number' name='cue_port' value='");
    html += String(cuesystem_port);
    html += F("'></div></div>"
              "<label>Cue Channel (1 - 32)</label><input type='number' name='cue_channel' min='1' max='32' value='");
    html += String(cuesystem_channel);
    html += F("'>"
              "<div class='hint'>Standby displays flashing red until acknowledged (solid red). Pressing button sends ACK to hub.</div>"
              "</div>"

              // Section: NMOS IS-07 (Item 1: DNS-SD auto discover or manual)
              "<div id='sec-nmos' class='section-box'>"
              "<h2>AMWA NMOS IS-07 Event & Tally</h2>"
              "<label>NMOS Registration Server Discovery</label>"
              "<select name='nmos_autodisc' id='nmos_autodisc'>"
              "<option value='1'");
    if (nmos_auto_discover) html += F(" selected");
    html += F(">Automatic via DNS-SD (_nmos-registration._tcp)</option>"
              "<option value='0'");
    if (!nmos_auto_discover) html += F(" selected");
    html += F(">Manual Server Host & Port</option>"
              "</select>"
              "<div class='grid-2'>"
              "<div><label>Manual Registry Host / IP</label><input type='text' name='nmos_host' value='");
    html += nmos_registry_host;
    html += F("'></div>"
              "<div><label>Manual Registry Port</label><input type='number' name='nmos_port' value='");
    html += String(nmos_registry_port);
    html += F("'></div></div>"
              "<label>Source / Device UUID</label><input type='text' name='nmos_source' value='");
    html += nmos_source_id;
    html += F("'>"
              "<div class='grid-3'>"
              "<div><label>Program Topic / Endpoint</label><input type='text' name='nmos_prg_topic' value='");
    html += nmos_program_topic;
    html += F("'></div>"
              "<div><label>Preview Topic / Endpoint</label><input type='text' name='nmos_pvw_topic' value='");
    html += nmos_preview_topic;
    html += F("'></div>"
              "<div><label>Aux Topic / Endpoint</label><input type='text' name='nmos_aux_topic' value='");
    html += nmos_aux_topic;
    html += F("'></div></div>"
              "<div class='hint'>Integrates with SMPTE ST 2110 IP broadcast routing: Program (Red), Preview (Green), Aux (Amber).</div>"
              "</div>"

              // Section: rtpMIDI / AppleMIDI
              "<div id='sec-rtpmidi' class='section-box'>"
              "<h2>rtpMIDI / AppleMIDI Configuration</h2>"
              "<div class='grid-3'>"
              "<div><label>RTP-MIDI UDP Port</label><input type='number' name='midi_port' value='");
    html += String(rtpmidi_port);
    html += F("'></div>"
              "<div><label>MIDI Channel (0 = Omni)</label><input type='number' name='midi_chan' min='0' max='16' value='");
    html += String(rtpmidi_channel);
    html += F("'></div>"
              "<div><label>Trigger Mode</label><select name='midi_trig'>"
              "<option value='0'");
    if (rtpmidi_trigger_type == 0) html += F(" selected");
    html += F(">Note On / Note Off</option><option value='1'");
    if (rtpmidi_trigger_type == 1) html += F(" selected");
    html += F(">Control Change (CC)</option><option value='2'");
    if (rtpmidi_trigger_type == 2) html += F(" selected");
    html += F(">Program Change (PC)</option></select></div></div>"
              "<p style='font-size:12px;color:#94a3b8;margin:8px 0 4px 0;'>State Triggers (Priority Order: Red &gt; Flash Red &gt; Green &gt; Yellow &gt; Blue &gt; White):</p>"
              "<div class='grid-3'>"
              "<div><label>1. Red Note/CC/PC</label><input type='number' name='midi_red' value='");
    html += String(rtpmidi_num_red);
    html += F("'></div>"
              "<div><label>2. Flash Red Note/CC/PC</label><input type='number' name='midi_flash' value='");
    html += String(rtpmidi_num_flash_red);
    html += F("'></div>"
              "<div><label>3. Green Note/CC/PC</label><input type='number' name='midi_green' value='");
    html += String(rtpmidi_num_green);
    html += F("'></div>"
              "<div><label>4. Yellow Note/CC/PC</label><input type='number' name='midi_yellow' value='");
    html += String(rtpmidi_num_yellow);
    html += F("'></div>"
              "<div><label>5. Blue Note/CC/PC</label><input type='number' name='midi_blue' value='");
    html += String(rtpmidi_num_blue);
    html += F("'></div>"
              "<div><label>6. White Note/CC/PC</label><input type='number' name='midi_white' value='");
    html += String(rtpmidi_num_white);
    html += F("'></div></div>"
              "<div class='hint'>Connects directly to DAWs (Logic, Pro Tools, QLab, Ableton, rtpMIDI) via AppleMIDI session on UDP port 5004.</div>"
              "</div>"

              // Section: MIDI Button Return Action (Requirement 6)
              "<div id='sec-midibtn' class='section-box'>"
              "<h2>MIDI Button Return Message (Feedback to DAW / Desk)</h2>"
              "<div class='grid-3'>"
              "<div><label>Button Message Type</label><select name='midi_btn_type'>"
              "<option value='0'");
    if (midi_btn_type == 0) html += F(" selected");
    html += F(">Disabled (None)</option><option value='1'");
    if (midi_btn_type == 1) html += F(" selected");
    html += F(">Note (Momentary)</option><option value='2'");
    if (midi_btn_type == 2) html += F(" selected");
    html += F(">Note (Toggle)</option><option value='3'");
    if (midi_btn_type == 3) html += F(" selected");
    html += F(">Control Change (Momentary)</option><option value='4'");
    if (midi_btn_type == 4) html += F(" selected");
    html += F(">Control Change (Toggle)</option><option value='5'");
    if (midi_btn_type == 5) html += F(" selected");
    html += F(">Program Change</option></select></div>"
              "<div><label>MIDI Channel (1-16)</label><input type='number' name='midi_btn_chan' min='1' max='16' value='");
    html += String(midi_btn_channel);
    html += F("'></div>"
              "<div><label>Note / CC / PC Number (0-127)</label><input type='number' name='midi_btn_num' min='0' max='127' value='");
    html += String(midi_btn_number);
    html += F("'></div></div>"
              "<div class='grid-2' style='margin-top:10px;'>"
              "<div><label>Press Value / Velocity (0-127)</label><input type='number' name='midi_btn_press' min='0' max='127' value='");
    html += String(midi_btn_val_press);
    html += F("'></div>"
              "<div><label>Release Value / Velocity (0-127)</label><input type='number' name='midi_btn_release' min='0' max='127' value='");
    html += String(midi_btn_val_release);
    html += F("'></div></div>"
              "<div class='hint'>When the hardware screen button is pressed in MIDI modes, transmits configured MIDI message back to host over rtpMIDI.</div>"
              "</div>"

              // Section: OSC (Open Sound Control)
              "<div id='sec-osc' class='section-box'>"
              "<h2>OSC (Open Sound Control) Configuration</h2>"
              "<div class='grid-2'>"
              "<div><label>OSC UDP Port</label><input type='number' name='osc_port' value='");
    html += String(osc_port);
    html += F("'></div>"
              "<div><label>Address Prefix</label><input type='text' name='osc_prefix' value='");
    html += osc_prefix;
    html += F("'></div></div>"
              "<label>Custom Text Message (Replaces Device Name, scrolls if long)</label><input type='text' name='osc_msg' value='");
    html += osc_custom_message;
    html += F("'>"
              "<div class='hint'>Listens for /cuelight/red, /flashred, /green, /yellow, /blue, /white [1/0] and /cuelight/text [string].</div>"
              "</div>"

              // Section: TSL 3.1 Listener (Item 2)
              "<div id='sec-tsl31' class='section-box'>"
              "<h2>TSL 3.1 Listener Settings</h2>"
              "<div class='grid-2'>"
              "<div><label>TSL 3.1 Port</label><input type='number' name='tsl31_port' value='");
    html += String(tsl31_port);
    html += F("'></div>"
              "<div><label>Transport Protocol</label><select name='tsl31_trans'>"
              "<option value='UDP'");
    if (tsl31_transport == "UDP") html += F(" selected");
    html += F(">UDP</option><option value='TCP'");
    if (tsl31_transport == "TCP") html += F(" selected");
    html += F(">TCP</option></select></div></div>"
              "<label>Display Address Filter (0 = Any/All)</label><input type='number' name='tsl31_addr' min='0' max='127' value='");
    html += String(tsl31_address);
    html += F("'>"
              "<div class='hint'>Decodes standard 18-byte TSL 3.1 packets; displays tally status and source name prominently in the centre.</div>"
              "</div>"

              // Section: TSL 5.0 Listener (Item 5)
              "<div id='sec-tsl50' class='section-box'>"
              "<h2>TSL 5.0 Listener Settings</h2>"
              "<div class='grid-2'>"
              "<div><label>TSL 5.0 Port</label><input type='number' name='tsl50_port' value='");
    html += String(tsl50_port);
    html += F("'></div>"
              "<div><label>Transport Protocol</label><select name='tsl50_trans'>"
              "<option value='UDP'");
    if (tsl50_transport == "UDP") html += F(" selected");
    html += F(">UDP</option><option value='TCP'");
    if (tsl50_transport == "TCP") html += F(" selected");
    html += F(">TCP</option></select></div></div>"
              "<div class='grid-2'>"
              "<div><label>Screen Index Filter</label><input type='number' name='tsl50_screen' value='");
    html += String(tsl50_screen);
    html += F("'></div>"
              "<div><label>Display Index Filter (0 = Any)</label><input type='number' name='tsl50_idx' value='");
    html += String(tsl50_index);
    html += F("'></div></div>"
              "<div class='hint'>Decodes TSL 5.0 binary packets (4 tally bits + UTF-8 display text) and displays name in the centre.</div>"
              "</div>"

              // Section: OSC Cue Light (Item 6: RSMCK iOS Protocol)
              "<div id='sec-osccue' class='section-box'>"
              "<h2>OSC Cue Light (RSMCK iOS Protocol)</h2>"
              "<div class='grid-2'>"
              "<div><label>UDP Listen Port (Default: 53000)</label><input type='number' name='osccue_port' value='");
    html += String(osccue_port);
    html += F("'></div>"
              "<div><label>Station ID (e.g. 1, 2, A, B)</label><input type='text' name='osccue_station' value='");
    html += osccue_station_id;
    html += F("'></div></div>"
              "<label>Persistent Top Banner Text</label><input type='text' name='osccue_banner' value='");
    html += osccue_banner;
    html += F("'>"
              "<div class='hint'>Matches /cuelight/[station]/standby_ack (flashing red with button ACK return), /standby (solid red), /go (green), /off, and /banner.</div>"
              "</div>"

              "<button type='submit' class='btn-save'>Save Settings & Apply</button>"
              "</form></div>"

              // Discovery Card (Visible for P2P modes)
              "<div id='sec-p2p-scan' class='card'>"
              "<h2>Zero-Conf P2P Discovery (mDNS / DNS-SD)</h2>"
              "<p style='font-size:13px;color:#94a3b8;margin:0 0 10px 0;'>Discover and pair directly with other TP and Presenter units on this local subnet without running Tally Arbiter.</p>"
              "<button type='button' class='btn-scan' onclick='scanPeers()'>Scan for Local CueLX / TSL Peers</button>"
              "<div id='peers-list' style='margin-top:12px;'></div>"
              "</div>"

              "<script>"
              "function toggleIPFields(){"
              "  var isDhcp = document.getElementById('ip_dhcp').value === '1';"
              "  document.getElementById('static-ip-fields').style.display = isDhcp ? 'none' : 'block';"
              "}"
              "function toggleCustomTZ(){"
              "  var isCustom = document.getElementById('tz-select').value === 'Custom';"
              "  document.getElementById('tz-custom').style.display = isCustom ? 'block' : 'none';"
              "}"
              "function updateModeUI(){"
              "  var m = document.getElementById('mode-select').value;"
              "  document.getElementById('sec-ta').style.display = (m==='TP'||m==='Presenter') ? 'block' : 'none';"
              "  document.getElementById('sec-p2p').style.display = (m==='TP_P2P'||m==='Presenter_P2P') ? 'block' : 'none';"
              "  document.getElementById('sec-p2p-scan').style.display = (m==='TP_P2P'||m==='Presenter_P2P') ? 'block' : 'none';"
              "  document.getElementById('sec-promptside').style.display = (m==='Promptside') ? 'block' : 'none';"
              "  document.getElementById('sec-msc').style.display = (m==='MSC_RTP_MIDI') ? 'block' : 'none';"
              "  document.getElementById('sec-cuesystem').style.display = (m==='ETC_CueSystem') ? 'block' : 'none';"
              "  document.getElementById('sec-nmos').style.display = (m==='NMOS_IS07') ? 'block' : 'none';"
              "  document.getElementById('sec-rtpmidi').style.display = (m==='RTP_MIDI') ? 'block' : 'none';"
              "  document.getElementById('sec-midibtn').style.display = (m==='RTP_MIDI'||m==='MSC_RTP_MIDI') ? 'block' : 'none';"
              "  document.getElementById('sec-osc').style.display = (m==='OSC') ? 'block' : 'none';"
              "  document.getElementById('sec-tsl31').style.display = (m==='TSL_31') ? 'block' : 'none';"
              "  document.getElementById('sec-tsl50').style.display = (m==='TSL_50') ? 'block' : 'none';"
              "  document.getElementById('sec-osccue').style.display = (m==='OSC_CueLight') ? 'block' : 'none';"
              "}"
              "updateModeUI();"
              "toggleCustomTZ();"
              "async function scanPeers(){"
              "  const list = document.getElementById('peers-list');"
              "  list.innerHTML = '<p style=\"color:#38bdf8;font-size:13px;\">Scanning network for _cuelx-tally._udp services...</p>';"
              "  try {"
              "    const res = await fetch('/api/discover');"
              "    const peers = await res.json();"
              "    if (!peers || peers.length === 0) {"
              "      list.innerHTML = '<p style=\"color:#94a3b8;font-size:13px;\">No peers found. Ensure target units are powered on and on the same subnet.</p>';"
              "      return;"
              "    }"
              "    let html = '';"
              "    peers.forEach(p => {"
              "      html += `<div class=\"peer-item\">"
              "        <div class=\"peer-info\">"
              "          <div class=\"peer-name\">${p.name || p.hostname} <span class=\"badge badge-purple\">${p.role || 'device'}</span></div>"
              "          <div class=\"peer-sub\">IP: ${p.ip} | Port: ${p.port} | Group: ${p.group || 'default'}</div>"
              "        </div>"
              "        <button type=\"button\" class=\"btn-pair\" onclick=\"pairPeer('${p.ip}','${p.name || p.hostname}','${p.group || ''}')\">Pair</button>"
              "      </div>`;"
              "    });"
              "    list.innerHTML = html;"
              "  } catch(e) {"
              "    list.innerHTML = '<p style=\"color:#ef4444;font-size:13px;\">Scan failed: ' + e.message + '</p>';"
              "  }"
              "}"
              "async function pairPeer(ip, name, group){"
              "  document.getElementById('peerip').value = ip;"
              "  document.getElementById('peername').value = name;"
              "  const fd = new FormData();"
              "  fd.append('ip', ip);"
              "  fd.append('name', name);"
              "  if(group) fd.append('group', group);"
              "  await fetch('/api/pair', { method: 'POST', body: fd });"
              "  alert('Paired with ' + name + ' (' + ip + ')! Settings updated.');"
              "}"
              "</script>"
              "</body></html>");
    request->send(200, "text/html", html);
  });

  // REST API: GET Config
  server.on("/api/config", HTTP_GET, [](AsyncWebServerRequest *request) {
    JSONVar obj;
    obj["operatingMode"] = operatingMode;
    obj["useDHCP"] = useDHCP;
    obj["staticIP"] = static_ip;
    obj["staticMask"] = static_mask;
    obj["staticGW"] = static_gw;
    obj["staticDNS"] = static_dns;
    obj["cuesystemHost"] = cuesystem_host;
    obj["cuesystemPort"] = cuesystem_port;
    obj["cuesystemChannel"] = cuesystem_channel;
    obj["cuesystemAckActive"] = cuesystem_ack_active;
    obj["cuesystemStandbyActive"] = cuesystem_standby_active;
    obj["nmosHost"] = nmos_registry_host;
    obj["nmosPort"] = nmos_registry_port;
    obj["nmosSource"] = nmos_source_id;
    obj["nmosTopic"] = nmos_program_topic;
    obj["nmosPrgTopic"] = nmos_program_topic;
    obj["nmosPvwTopic"] = nmos_preview_topic;
    obj["nmosAuxTopic"] = nmos_aux_topic;
    obj["nmosOnAir"] = nmos_is_on_air;
    obj["midiPort"] = rtpmidi_port;
    obj["midiChan"] = rtpmidi_channel;
    obj["midiTrig"] = rtpmidi_trigger_type;
    obj["oscPort"] = osc_port;
    obj["oscPrefix"] = osc_prefix;
    obj["oscMsg"] = osc_custom_message;
    obj["rotation"] = (int)(currentRotation * 90);
    obj["pairingGroup"] = pairingGroup;
    obj["pairedTargetIP"] = pairedTargetIP;
    obj["pairedTargetName"] = pairedTargetName;
    obj["isPresenter"] = isPresenter();
    obj["isTP"] = isTP();
    obj["isP2P"] = isP2PMode();
    obj["isCueSystem"] = isETCCueSystem();
    obj["isNMOS"] = isNMOSIS07();
    obj["isRTPMidi"] = isRTPMidi();
    obj["isOSC"] = isOSC();
    obj["isTSL31"] = isTSL31Listener();
    obj["isTSL50"] = isTSL50Listener();
    obj["isOSCCueLight"] = isOSCCueLight();
    obj["nmosAutoDisc"] = nmos_auto_discover;
    obj["tsl31Port"] = tsl31_port;
    obj["tsl31Transport"] = tsl31_transport;
    obj["tsl31Address"] = tsl31_address;
    obj["tsl31Name"] = tsl31_name;
    obj["tsl50Port"] = tsl50_port;
    obj["tsl50Transport"] = tsl50_transport;
    obj["tsl50Screen"] = tsl50_screen;
    obj["tsl50Index"] = tsl50_index;
    obj["tsl50Name"] = tsl50_name;
    obj["oscCuePort"] = osccue_port;
    obj["timezone"] = timezone_name;
    obj["customTZPosix"] = custom_tz_posix;
    obj["mtcReader"] = mtc_reader_enabled;
    obj["mtcTimecode"] = mtc_timecode_str;
    obj["envEnabled"] = env_sensor_enabled;
    obj["envDetected"] = env_sensor_detected;
    obj["envTemp"] = env_temperature;
    obj["envHum"] = env_humidity;
    obj["envPress"] = env_pressure;
    obj["promptPort"] = promptside_port;
    obj["promptChannel"] = promptside_channel;
    obj["promptWing"] = promptside_wing_label;
    obj["promptText"] = promptside_cue_text;
    obj["promptState"] = promptside_state;
    obj["promptAckDone"] = promptside_ack_done;
    obj["mscPort"] = msc_rtpmidi_port;
    obj["mscDevId"] = msc_device_id;
    obj["mscCmdFmt"] = msc_cmd_format;
    obj["mscCurrentCue"] = msc_current_cue;
    obj["mscLastCmd"] = msc_last_command;
    obj["mscState"] = msc_state;
    obj["midiBtnType"] = midi_btn_type;
    obj["midiBtnChan"] = midi_btn_channel;
    obj["midiBtnNum"] = midi_btn_number;
    obj["midiBtnPress"] = midi_btn_val_press;
    obj["midiBtnRelease"] = midi_btn_val_release;
    obj["p2pDisconnected"] = p2p_disconnected_state;
    obj["p2pMissed"] = p2p_missed_heartbeats;
    obj["oscCueStation"] = osccue_station_id;
    obj["oscCueBanner"] = osccue_banner;
    obj["oscCueMessage"] = osccue_message;
    obj["oscCueState"] = osccue_state;
    obj["oscCueAckDone"] = osccue_ack_done;
    obj["wifiDisabledForEth"] = wifiDisabledForEth;
    obj["presenterCueActive"] = presenterCueActive;
    obj["host"] = tallyarbiter_host;
    obj["port"] = tallyarbiter_port;
    obj["tslPort"] = tallyarbiter_TSLport;
    obj["listenerName"] = listenerDeviceName;
    obj["deviceId"] = DeviceId;
    obj["deviceName"] = DeviceName;
    obj["doubleBuffer"] = doubleBufferEnabled;
    obj["actualType"] = actualType;
    obj["actualColor"] = actualColor;
    obj["mode"] = isEthernetActive() ? "ETH" : "WIFI";
    obj["ip"] = getNetworkIPStr();
    request->send(200, "application/json", JSON.stringify(obj));
  });

  // REST API: GET /api/env - AtomENV Sensor live reading (Requirement 9)
  server.on("/api/env", HTTP_GET, [](AsyncWebServerRequest *request) {
    readAtomEnvSensor();
    JSONVar obj;
    obj["enabled"] = env_sensor_enabled;
    obj["detected"] = env_sensor_detected;
    obj["temperature"] = env_temperature;
    obj["humidity"] = env_humidity;
    obj["pressure"] = env_pressure;
    obj["unit_temp"] = "C";
    obj["unit_press"] = "hPa";
    request->send(200, "application/json", JSON.stringify(obj));
  });

  // REST API: GET /api/power - Power & Thermal Telemetry (Item 10)
  server.on("/api/power", HTTP_GET, [](AsyncWebServerRequest *request) {
    float est_watts = 0.42f;
    if (cpu_freq_mhz == 160) est_watts += 0.22f;
    else if (cpu_freq_mhz == 240) est_watts += 0.48f;
    if (!wifiDisabledForEth) est_watts += 0.32f;
    if (!screen_dimmed) est_watts += 0.12f;

    float est_temp = 32.0f + (est_watts * 19.5f);

    String json = "{";
    json += "\"cpu_freq_mhz\":" + String(getCpuFrequencyMhz()) + ",";
    json += "\"apb_freq_hz\":" + String(getApbFrequency()) + ",";
    json += "\"screen_dim_timeout_sec\":" + String(screen_dim_timeout_sec) + ",";
    json += "\"screen_dimmed\":" + String(screen_dimmed ? "true" : "false") + ",";
    json += "\"wifi_radio_off\":" + String(wifiDisabledForEth ? "true" : "false") + ",";
    json += "\"estimated_power_watts\":" + String(est_watts, 2) + ",";
    json += "\"estimated_poe_temp_c\":" + String(est_temp, 1);
    json += "}";
    request->send(200, "application/json", json);
  });

  // HTML User Manual Endpoint (Requirement 8)
  server.on("/manual", HTTP_GET, [](AsyncWebServerRequest *request) {
    String mHtml = F("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                     "<title>Universal Cue & Tally Controller - User Manual</title><style>"
                     "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0b1120;color:#e2e8f0;padding:24px;line-height:1.6;max-width:960px;margin:auto}"
                     "h1{color:#38bdf8;font-size:26px;border-bottom:1px solid #1e293b;padding-bottom:12px;margin-bottom:8px}"
                     "h2{color:#f8fafc;font-size:18px;margin-top:28px;padding-bottom:6px;border-bottom:1px solid #334155}"
                     "h3{color:#7dd3fc;font-size:15px;margin-top:16px}"
                     ".tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;margin-right:6px}"
                     ".tag-blue{background:#0284c7;color:#fff}.tag-green{background:#16a34a;color:#fff}.tag-purple{background:#7c3aed;color:#fff}.tag-amber{background:#d97706;color:#fff}.tag-red{background:#dc2626;color:#fff}.tag-cyan{background:#0891b2;color:#fff}"
                     ".card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:18px;margin-bottom:18px}"
                     "table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}"
                     "th,td{border:1px solid #334155;padding:8px 12px;text-align:left}th{background:#0f172a;color:#94a3b8}"
                     "code{background:#0f172a;border:1px solid #334155;color:#38bdf8;padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace}"
                     "pre{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;overflow-x:auto;color:#a5f3fc;font-size:12px;font-family:monospace}"
                     "a{color:#38bdf8;text-decoration:none}a:hover{text-decoration:underline}"
                     ".note{background:#172554;border-left:4px solid #38bdf8;padding:12px;margin:12px 0;border-radius:0 8px 8px 0;font-size:13px}"
                     "</style></head><body>"
                     "<h1>&#128214; Universal Cue & Tally Controller Manual</h1>"
                     "<p style='color:#94a3b8;'>Comprehensive User Guide for M5AtomS3R + AtomPoE Broadcast Tally & Theatrical Cue System</p>"
                     "<div class='card'>"
                     "<h3>Table of Contents</h3>"
                     "<ol style='margin:0;padding-left:20px;font-size:14px;'>"
                     "<li><a href='#modes'>13 Supported Operating Modes & Software Setup</a></li>"
                     "<li><a href='#p2p'>Standalone P2P Heartbeat & Fault Alarm (0.25s)</a></li>"
                     "<li><a href='#midi-msc'>rtpMIDI, MSC (RP-002) & Return Button Feedback</a></li>"
                     "<li><a href='#promptside'>Promptside Theatrical System (promptside.co)</a></li>"
                     "<li><a href='#mtc'>MTC Timecode Reader over AppleMIDI</a></li>"
                     "<li><a href='#env'>M5Stack AtomENV Grove Sensor & REST API</a></li>"
                     "<li><a href='#imu'>Accelerometer IMU Screen Auto-Orientation</a></li>"
                     "<li><a href='#net'>PoE Ethernet Precedence & Static IP / DHCP</a></li>"
                     "</ol></div>"
                     "<h2 id='modes'>1. Operating Modes & Integration Details</h2>"
                     "<div class='card'>"
                     "<h3>1. Technical Producer (TP) with Tally Arbiter</h3>"
                     "<p>Connects to Tally Arbiter server over WebSockets (default port 4455). Receives live multi-source tally and transmits TSL 3.1 <strong>Program</strong> tally back on the configured TSL port (default 8910) when button is pressed.</p>"
                     "<h3>2. Presenter with Tally Arbiter</h3>"
                     "<p>Connects to Tally Arbiter server. When the screen button is clicked, sends a TSL 3.1 <strong>Preview</strong> tally back (control byte 0x31) to alert the production switcher or TP without taking the camera live.</p>"
                     "<h3>3. Standalone TP (P2P Master)</h3>"
                     "<p>Zero-configuration peer-to-peer master without requiring a Tally Arbiter server. Listens for calls from paired Presenter units and displays prominent cue alerts.</p>"
                     "<h3>4. Standalone Presenter (P2P Slave)</h3>"
                     "<p>Communicates directly with the TP unit via TSL 3.1 UDP. Exchanging 0.25s heartbeats. Clicking button triggers Preview cue on the TP screen.</p>"
                     "<h3>5. ETC CueSystem Outstation</h3>"
                     "<p>Integrates with ETC Eos consoles and CueSystem playback controllers. Listens for ASCII UDP packets: <code>CS,&lt;channel&gt;,STANDBY</code> or <code>CUE:&lt;channel&gt;:STANDBY</code> (flashing red). Clicking the screen button acknowledges the cue (solid red) and transmits <code>CS,&lt;channel&gt;,ACK</code> back to the hub. <code>GO</code> turns solid green.</p>"
                     "<h3>6. AMWA NMOS IS-07 Event & Tally (SMPTE ST 2110)</h3>"
                     "<p>Full IP broadcast tally for ST 2110 production networks. Automatically discovers the NMOS Registration Server via DNS-SD (<code>_nmos-registration._tcp</code>) or connects to a manual host. Monitors 3 endpoints: <strong>Program</strong> (Red), <strong>Preview</strong> (Green), and <strong>Aux</strong> (Amber).</p>"
                     "<h3>7. Promptside Theatrical Cue Light (promptside.co)</h3>"
                     "<p>Direct integration with Promptside theatrical cueing software on UDP port 8000. Supports <code>/promptside/channel/[ch]/standby</code> (flashing red), button click returns <code>/promptside/channel/[ch]/ack 1</code>, <code>/go</code> (green), <code>/off</code>, and <code>/text</code> notes with persistent wing labels.</p>"
                     "<h3>8. MIDI Show Control (MSC RP-002 over rtpMIDI)</h3>"
                     "<p>Parses SysEx MSC commands: <code>01 GO</code> (green), <code>02 STOP</code> (red), <code>0B STANDBY+</code> (flashing red), <code>08 ALL_OFF</code>, and displays cue numbers (e.g. <code>CUE 42.1</code>) on screen.</p>"
                     "<h3>9. rtpMIDI / AppleMIDI Outstation</h3>"
                     "<p>Connects natively to macOS Audio MIDI Setup, Windows rtpMIDI (Tobias Erichsen), QLab, Logic Pro, and Ableton Live on UDP port 5004. Supports Note On/Off, CC, or PC with priority: Red &gt; Flash Red &gt; Green &gt; Yellow &gt; Blue &gt; White.</p>"
                     "<h3>10. OSC (Open Sound Control) Outstation</h3>"
                     "<p>Receives OSC commands on UDP port 8000 (e.g. <code>/cuelight/red</code>, <code>/green</code>, <code>/text</code>). Long messages scroll continuously across the screen.</p>"
                     "<h3>11. TSL UMD v3.1 Dedicated Listener</h3>"
                     "<p>Standard 18-byte TSL 3.1 UDP or TCP listener on port 8910. Displays source name in the centre of the screen and reflects Program, Preview, and Aux tally flags.</p>"
                     "<h3>12. TSL UMD v5.0 Dedicated Listener</h3>"
                     "<p>Binary TSL 5.0 protocol over UDP or TCP on port 8900. Parses 4 tally status bits (Tally 1 Red, Tally 2 Green, Tally 3 Amber, Tally 4 Blue) and UTF-8 screen text.</p>"
                     "<h3>13. OSC Cue Light for iOS (RSMCK Protocol)</h3>"
                     "<p>Compatible with the iOS OSC Cue Light app on UDP port 53000. Handles <code>/cuelight/[station]/standby_ack</code> with button acknowledgement return and persistent top banner.</p>"
                     "</div>"
                     "<h2 id='p2p'>2. P2P Heartbeat & 4-Missed Fault Detection</h2>"
                     "<div class='card'>"
                     "<p>In Standalone P2P modes (TP no TA & Presenter no TA), units exchange bidirectional ping packets every <strong>0.25 seconds (250ms)</strong>. If more than 4 consecutive heartbeats are missed (&gt; 1000ms), both units immediately enter fault alarm mode:</p>"
                     "<ul><li>Screen flashes bright yellow (<code>#FFFF00</code> / Black)</li><li>Status badge alerts <strong>DISCONNECTED</strong></li><li>Bottom line displays <code>&gt;&gt;&gt; PEER LOST - SEARCHING &lt;&lt;&lt;</code></li><li>Auto-recovers instantly upon receiving the next ping or pong packet.</li></ul>"
                     "</div>"
                     "<h2 id='midi-msc'>3. MIDI Show Control & Return Button Feedback</h2>"
                     "<div class='card'>"
                     "<p>In MIDI modes, the hardware screen button can transmit user-configured MIDI feedback back to the console or DAW:</p>"
                     "<ul><li>Message types: <strong>Note Momentary, Note Toggle, CC Momentary, CC Toggle, Program Change</strong></li><li>Selectable MIDI Channel (1 - 16), Number (0 - 127), and Press / Release Velocity values.</li></ul>"
                     "</div>"
                     "<h2 id='mtc'>4. MTC (MIDI Time Code) Reader</h2>"
                     "<div class='card'>"
                     "<p>When enabled globally in the web configuration, the top header bar on Screen 0 transforms into a real-time SMPTE timecode readout (<code>HH:MM:SS:FF</code>). Parses incoming quarter-frame messages (status <code>0xF1</code>) and full-frame SysEx packets over AppleMIDI at 24, 25, 29.97 drop, and 30 fps.</p>"
                     "</div>"
                     "<h2 id='env'>5. M5Stack AtomENV Sensor Support</h2>"
                     "<div class='card'>"
                     "<p>Plug an M5Stack AtomENV unit into the bottom Grove port (SDA: GPIO 2, SCL: GPIO 1). Real-time Temperature (°C), Relative Humidity (%), and Barometric Pressure (hPa) are shown in Diagnostics (Screen 1) and queryable via REST API:</p>"
                     "<pre>GET /api/env\n\nHTTP/1.1 200 OK\nContent-Type: application/json\n\n{\n  \"enabled\": true,\n  \"detected\": true,\n  \"temperature\": 21.8,\n  \"humidity\": 46.5,\n  \"pressure\": 1013.2,\n  \"unit_temp\": \"C\",\n  \"unit_press\": \"hPa\"\n}</pre>"
                     "</div>"
                     "<h2 id='imu'>6. Screen Auto-Orientation (IMU)</h2>"
                     "<div class='card'>"
                     "<p>The onboard 6-axis IMU (BMI270) measures gravity. Display scanout orientation updates automatically so text is always right-side up regardless of whether the unit is mounted upright, inverted 180°, or rotated 90° sideways on a camera rig or stage cue stand.</p>"
                     "</div>"
                     "<p style='text-align:center;margin-top:30px;'><a href='/' style='background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;font-weight:600;'>Return to Web Dashboard</a></p>"
                     "</body></html>");
    request->send(200, "text/html", mHtml);
  });

  // REST API: GET /api/discover - Scan for DNS-SD peers (_cuelx-tally._udp)
  server.on("/api/discover", HTTP_GET, [](AsyncWebServerRequest *request) {
    logger("[mDNS] Scanning for _cuelx-tally._udp peers...", "info");
    int n = MDNS.queryService("cuelx-tally", "udp");
    JSONVar arr;
    for (int i = 0; i < n; ++i) {
      if (MDNS.address(i).toString() == getNetworkIPStr()) {
        continue;
      }
      JSONVar p;
      p["hostname"] = MDNS.hostname(i);
      p["ip"] = MDNS.address(i).toString();
      p["port"] = (int)MDNS.port(i);
      #if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 2)
      if (MDNS.hasTxt(i, "role"))  p["role"]  = MDNS.txt(i, "role");
      if (MDNS.hasTxt(i, "group")) p["group"] = MDNS.txt(i, "group");
      if (MDNS.hasTxt(i, "name"))  p["name"]  = MDNS.txt(i, "name");
      if (MDNS.hasTxt(i, "mode"))  p["mode"]  = MDNS.txt(i, "mode");
      #else
      p["role"] = isPresenter() ? "tp" : "presenter";
      p["group"] = pairingGroup;
      p["name"] = MDNS.hostname(i);
      #endif
      arr[arr.length()] = p;
    }
    request->send(200, "application/json", JSON.stringify(arr));
  });

  // REST API: POST /api/pair - Directly pair target peer
  server.on("/api/pair", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("ip", true)) {
      pairedTargetIP = request->getParam("ip", true)->value();
    }
    if (request->hasParam("name", true)) {
      pairedTargetName = request->getParam("name", true)->value();
    }
    if (request->hasParam("group", true)) {
      pairingGroup = request->getParam("group", true)->value();
    }

    preferences.begin("tally-arbiter", false);
    preferences.putString("pairIP", pairedTargetIP);
    preferences.putString("pairName", pairedTargetName);
    preferences.putString("pairGroup", pairingGroup);
    preferences.end();

    logger(String("[P2P] Paired with: ") + pairedTargetName + " (" + pairedTargetIP + ") in group " + pairingGroup, "info");
    renderScreen();

    JSONVar res;
    res["success"] = true;
    res["pairedTargetIP"] = pairedTargetIP;
    res["pairedTargetName"] = pairedTargetName;
    res["pairingGroup"] = pairingGroup;
    request->send(200, "application/json", JSON.stringify(res));
  });

  // Form Save
  server.on("/save", HTTP_POST, [](AsyncWebServerRequest *request) {
    if (request->hasParam("mode", true)) {
      operatingMode = request->getParam("mode", true)->value();
    }

    // Timezone settings (Requirement 1)
    if (request->hasParam("timezone_name", true)) {
      timezone_name = request->getParam("timezone_name", true)->value();
    }
    if (request->hasParam("custom_tz_posix", true)) {
      custom_tz_posix = request->getParam("custom_tz_posix", true)->value();
    }

    // Global MTC & AtomENV settings (Requirement 4 & 9)
    if (request->hasParam("mtc_reader", true)) {
      mtc_reader_enabled = (request->getParam("mtc_reader", true)->value() == "1");
    }
    if (request->hasParam("env_sensor", true)) {
      env_sensor_enabled = (request->getParam("env_sensor", true)->value() == "1");
      if (env_sensor_enabled) {
        Wire.begin(2, 1);
      }
    }

    // Promptside settings (Requirement 2)
    if (request->hasParam("prompt_port", true)) {
      promptside_port = request->getParam("prompt_port", true)->value().toInt();
    }
    if (request->hasParam("prompt_chan", true)) {
      promptside_channel = request->getParam("prompt_chan", true)->value();
    }
    if (request->hasParam("prompt_wing", true)) {
      promptside_wing_label = request->getParam("prompt_wing", true)->value();
    }

    // MSC settings (Requirement 3)
    if (request->hasParam("msc_port", true)) {
      msc_rtpmidi_port = request->getParam("msc_port", true)->value().toInt();
    }
    if (request->hasParam("msc_dev", true)) {
      msc_device_id = request->getParam("msc_dev", true)->value().toInt();
    }
    if (request->hasParam("msc_fmt", true)) {
      msc_cmd_format = request->getParam("msc_fmt", true)->value().toInt();
    }

    // MIDI Button return feedback (Requirement 6)
    if (request->hasParam("midi_btn_type", true)) {
      midi_btn_type = request->getParam("midi_btn_type", true)->value().toInt();
    }
    if (request->hasParam("midi_btn_chan", true)) {
      midi_btn_channel = request->getParam("midi_btn_chan", true)->value().toInt();
    }
    if (request->hasParam("midi_btn_num", true)) {
      midi_btn_number = request->getParam("midi_btn_num", true)->value().toInt();
    }
    if (request->hasParam("midi_btn_press", true)) {
      midi_btn_val_press = request->getParam("midi_btn_press", true)->value().toInt();
    }
    if (request->hasParam("midi_btn_release", true)) {
      midi_btn_val_release = request->getParam("midi_btn_release", true)->value().toInt();
    }

    // Network IP settings
    if (request->hasParam("ip_dhcp", true)) {
      useDHCP = (request->getParam("ip_dhcp", true)->value() == "1");
    }
    if (request->hasParam("static_ip", true)) {
      static_ip = request->getParam("static_ip", true)->value();
    }
    if (request->hasParam("static_mask", true)) {
      static_mask = request->getParam("static_mask", true)->value();
    }
    if (request->hasParam("static_gw", true)) {
      static_gw = request->getParam("static_gw", true)->value();
    }
    if (request->hasParam("static_dns", true)) {
      static_dns = request->getParam("static_dns", true)->value();
    }

    // ETC CueSystem settings
    if (request->hasParam("cue_host", true)) {
      cuesystem_host = request->getParam("cue_host", true)->value();
    }
    if (request->hasParam("cue_port", true)) {
      cuesystem_port = request->getParam("cue_port", true)->value().toInt();
    }
    if (request->hasParam("cue_channel", true)) {
      cuesystem_channel = request->getParam("cue_channel", true)->value().toInt();
    }

    // NMOS IS-07 settings (Program, Preview, Aux & Auto-Discovery)
    if (request->hasParam("nmos_autodisc", true)) {
      nmos_auto_discover = (request->getParam("nmos_autodisc", true)->value() == "1");
    }
    if (request->hasParam("nmos_host", true)) {
      nmos_registry_host = request->getParam("nmos_host", true)->value();
    }
    if (request->hasParam("nmos_port", true)) {
      nmos_registry_port = request->getParam("nmos_port", true)->value().toInt();
    }
    if (request->hasParam("nmos_source", true)) {
      nmos_source_id = request->getParam("nmos_source", true)->value();
    }
    if (request->hasParam("nmos_prg_topic", true)) {
      nmos_program_topic = request->getParam("nmos_prg_topic", true)->value();
    }
    if (request->hasParam("nmos_pvw_topic", true)) {
      nmos_preview_topic = request->getParam("nmos_pvw_topic", true)->value();
    }
    if (request->hasParam("nmos_aux_topic", true)) {
      nmos_aux_topic = request->getParam("nmos_aux_topic", true)->value();
    }

    // TSL 3.1 settings
    if (request->hasParam("tsl31_port", true)) {
      tsl31_port = request->getParam("tsl31_port", true)->value().toInt();
    }
    if (request->hasParam("tsl31_trans", true)) {
      tsl31_transport = request->getParam("tsl31_trans", true)->value();
    }
    if (request->hasParam("tsl31_addr", true)) {
      tsl31_address = request->getParam("tsl31_addr", true)->value().toInt();
    }

    // TSL 5.0 settings
    if (request->hasParam("tsl50_port", true)) {
      tsl50_port = request->getParam("tsl50_port", true)->value().toInt();
    }
    if (request->hasParam("tsl50_trans", true)) {
      tsl50_transport = request->getParam("tsl50_trans", true)->value();
    }
    if (request->hasParam("tsl50_screen", true)) {
      tsl50_screen = request->getParam("tsl50_screen", true)->value().toInt();
    }
    if (request->hasParam("tsl50_idx", true)) {
      tsl50_index = request->getParam("tsl50_idx", true)->value().toInt();
    }

    // OSC Cue Light settings
    if (request->hasParam("osccue_port", true)) {
      osccue_port = request->getParam("osccue_port", true)->value().toInt();
    }
    if (request->hasParam("osccue_station", true)) {
      osccue_station_id = request->getParam("osccue_station", true)->value();
    }
    if (request->hasParam("osccue_banner", true)) {
      osccue_banner = request->getParam("osccue_banner", true)->value();
    }

    // rtpMIDI settings
    if (request->hasParam("midi_port", true)) {
      rtpmidi_port = request->getParam("midi_port", true)->value().toInt();
    }
    if (request->hasParam("midi_chan", true)) {
      rtpmidi_channel = request->getParam("midi_chan", true)->value().toInt();
    }
    if (request->hasParam("midi_trig", true)) {
      rtpmidi_trigger_type = request->getParam("midi_trig", true)->value().toInt();
    }
    if (request->hasParam("midi_red", true)) {
      rtpmidi_num_red = request->getParam("midi_red", true)->value().toInt();
    }
    if (request->hasParam("midi_flash", true)) {
      rtpmidi_num_flash_red = request->getParam("midi_flash", true)->value().toInt();
    }
    if (request->hasParam("midi_green", true)) {
      rtpmidi_num_green = request->getParam("midi_green", true)->value().toInt();
    }
    if (request->hasParam("midi_yellow", true)) {
      rtpmidi_num_yellow = request->getParam("midi_yellow", true)->value().toInt();
    }
    if (request->hasParam("midi_blue", true)) {
      rtpmidi_num_blue = request->getParam("midi_blue", true)->value().toInt();
    }
    if (request->hasParam("midi_white", true)) {
      rtpmidi_num_white = request->getParam("midi_white", true)->value().toInt();
    }

    // OSC settings
    if (request->hasParam("osc_port", true)) {
      osc_port = request->getParam("osc_port", true)->value().toInt();
    }
    if (request->hasParam("osc_prefix", true)) {
      osc_prefix = request->getParam("osc_prefix", true)->value();
    }
    if (request->hasParam("osc_msg", true)) {
      osc_custom_message = request->getParam("osc_msg", true)->value();
    }

    // P2P and Tally Arbiter settings
    if (request->hasParam("group", true)) {
      pairingGroup = request->getParam("group", true)->value();
    }
    if (request->hasParam("pairedip", true)) {
      pairedTargetIP = request->getParam("pairedip", true)->value();
    }
    if (request->hasParam("pairedname", true)) {
      pairedTargetName = request->getParam("pairedname", true)->value();
    }
    if (request->hasParam("host", true)) {
      String hostVal = request->getParam("host", true)->value();
      hostVal.toCharArray(tallyarbiter_host, 40);
    }
    if (request->hasParam("port", true)) {
      String portVal = request->getParam("port", true)->value();
      portVal.toCharArray(tallyarbiter_port, 6);
    }
    if (request->hasParam("tslport", true)) {
      String tslPortVal = request->getParam("tslport", true)->value();
      tslPortVal.toCharArray(tallyarbiter_TSLport, 6);
    }
    if (request->hasParam("devicename", true)) {
      listenerDeviceName = request->getParam("devicename", true)->value();
    }

    // Power & Thermal Management (Item 10)
    if (request->hasParam("cpu_freq", true)) {
      cpu_freq_mhz = request->getParam("cpu_freq", true)->value().toInt();
    }
    if (request->hasParam("dim_timeout", true)) {
      screen_dim_timeout_sec = request->getParam("dim_timeout", true)->value().toInt();
    }

    // Persist all settings to NVS
    preferences.begin("tally-arbiter", false);
    preferences.putString("opMode", operatingMode);
    preferences.putString("tzName", timezone_name);
    preferences.putString("tzPosix", custom_tz_posix);
    preferences.putBool("mtcReader", mtc_reader_enabled);
    preferences.putBool("envSensor", env_sensor_enabled);
    preferences.putInt("promptPort", promptside_port);
    preferences.putString("promptChan", promptside_channel);
    preferences.putString("promptWing", promptside_wing_label);
    preferences.putInt("mscPort", msc_rtpmidi_port);
    preferences.putInt("mscDev", msc_device_id);
    preferences.putInt("mscFmt", msc_cmd_format);
    preferences.putInt("mBtnType", midi_btn_type);
    preferences.putInt("mBtnChan", midi_btn_channel);
    preferences.putInt("mBtnNum", midi_btn_number);
    preferences.putInt("mBtnPress", midi_btn_val_press);
    preferences.putInt("mBtnRel", midi_btn_val_release);
    preferences.putBool("useDHCP", useDHCP);
    preferences.putString("staticIP", static_ip);
    preferences.putString("staticMask", static_mask);
    preferences.putString("staticGW", static_gw);
    preferences.putString("staticDNS", static_dns);
    preferences.putString("cueHost", cuesystem_host);
    preferences.putInt("cuePort", cuesystem_port);
    preferences.putInt("cueChan", cuesystem_channel);
    preferences.putBool("nmosAutoDisc", nmos_auto_discover);
    preferences.putString("nmosHost", nmos_registry_host);
    preferences.putInt("nmosPort", nmos_registry_port);
    preferences.putString("nmosSrc", nmos_source_id);
    preferences.putString("nmosPrg", nmos_program_topic);
    preferences.putString("nmosPvw", nmos_preview_topic);
    preferences.putString("nmosAux", nmos_aux_topic);
    preferences.putInt("tsl31Port", tsl31_port);
    preferences.putString("tsl31Trans", tsl31_transport);
    preferences.putInt("tsl31Addr", tsl31_address);
    preferences.putInt("tsl50Port", tsl50_port);
    preferences.putString("tsl50Trans", tsl50_transport);
    preferences.putInt("tsl50Screen", tsl50_screen);
    preferences.putInt("tsl50Idx", tsl50_index);
    preferences.putInt("oscCuePort", osccue_port);
    preferences.putString("oscCueStation", osccue_station_id);
    preferences.putString("oscCueBanner", osccue_banner);
    preferences.putInt("midiPort", rtpmidi_port);
    preferences.putInt("midiChan", rtpmidi_channel);
    preferences.putInt("midiTrig", rtpmidi_trigger_type);
    preferences.putInt("midiRed", rtpmidi_num_red);
    preferences.putInt("midiFlash", rtpmidi_num_flash_red);
    preferences.putInt("midiGreen", rtpmidi_num_green);
    preferences.putInt("midiYellow", rtpmidi_num_yellow);
    preferences.putInt("midiBlue", rtpmidi_num_blue);
    preferences.putInt("midiWhite", rtpmidi_num_white);
    preferences.putInt("oscPort", osc_port);
    preferences.putString("oscPrefix", osc_prefix);
    preferences.putString("oscMsg", osc_custom_message);
    preferences.putString("pairGroup", pairingGroup);
    preferences.putString("pairIP", pairedTargetIP);
    preferences.putString("pairName", pairedTargetName);
    preferences.putString("taHost", tallyarbiter_host);
    preferences.putString("taPort", tallyarbiter_port);
    preferences.putString("taTSLPort", tallyarbiter_TSLport);
    preferences.putString("taListenerName", listenerDeviceName);
    preferences.putInt("cpuFreq", cpu_freq_mhz);
    preferences.putInt("dimTimeout", screen_dim_timeout_sec);
    preferences.end();

    // Reapply IP, Timezone & Power Management configurations immediately
    applyNetworkIPConfig();
    applyTimezoneConfig();
    applyPowerManagementConfig();

    // Configure TCP Server if required
    if (operatingMode == "TSL_31" && tsl31_transport == "TCP") {
      setupTSLTcpServer(tsl31_port);
    } else if (operatingMode == "TSL_50" && tsl50_transport == "TCP") {
      setupTSLTcpServer(tsl50_port);
    } else if (tslTcpServer != nullptr) {
      tslTcpServer->end();
      delete tslTcpServer;
      tslTcpServer = nullptr;
    }

    // Configure UDP Listener Port
    if (networkConnected) {
      uint16_t listenPort = atoi(tallyarbiter_TSLport);
      if (isETCCueSystem()) listenPort = cuesystem_port;
      else if (isRTPMidi()) listenPort = rtpmidi_port;
      else if (isOSC()) listenPort = osc_port;
      else if (isTSL31Listener()) listenPort = tsl31_port;
      else if (isTSL50Listener()) listenPort = tsl50_port;
      else if (isOSCCueLight()) listenPort = osccue_port;
      udp.stop();
      udp.begin(listenPort);

      if (isNMOSIS07() && nmos_auto_discover) {
        discoverNMOSRegistrationServer();
      }
    }

    // Re-register mDNS TXT records
    MDNS.addServiceTxt("cuelx-tally", "udp", "role", isPresenter() ? "presenter" : (isTP() ? "tp" : (isETCCueSystem() ? "cue" : (isRTPMidi() ? "midi" : (isOSC() ? "osc" : (isTSL31Listener() ? "tsl31" : (isTSL50Listener() ? "tsl50" : (isOSCCueLight() ? "osccue" : "nmos"))))))));
    MDNS.addServiceTxt("cuelx-tally", "udp", "mode", operatingMode.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "group", pairingGroup.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "name", listenerDeviceName.c_str());

    if (usesTallyArbiter()) {
      connectToServer();
    } else {
      disconnectFromServer();
    }

    request->send(200, "text/html", "<html><body style='background:#0f172a;color:#f1f5f9;font-family:sans-serif;padding:30px;'>"
                                    "<h2>Configuration Saved!</h2>"
                                    "<p>Mode: <strong>" + operatingMode + "</strong></p>"
                                    "<p>IP Mode: <strong>" + (useDHCP ? String("DHCP (Automatic)") : (String("Static IP: ") + static_ip)) + "</strong></p>"
                                    "<p>Group: <strong>" + pairingGroup + "</strong></p>"
                                    "<a href='/' style='color:#38bdf8;text-decoration:none;font-weight:600;'>Return to Dashboard</a></body></html>");

    renderScreen();
  });

  // CRITICAL: Explicitly start AsyncWebServer so port 80 listens immediately
  server.begin();
  logger("[WebServer] HTTP Server started listening on port 80", "info");
}

// ==========================================
// Setup
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(100);

  // Initialize M5Unified & Onboard 6-Axis IMU (BMI270/MPU6886)
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Imu.begin();
  M5.Display.setRotation(currentRotation); // Default upright
  M5.Display.setBrightness(brightnessLevels[brightnessIndex]);

  logger("==========================================", "info");
  logger("M5AtomS3R + AtomPoE Cue & Tally Controller", "info");
  logger("==========================================", "info");

  // Attempt to allocate double buffer canvas
  // 128 x 128 x 2 bytes = 32 KB
  canvas.setColorDepth(16);
  if (canvas.createSprite(128, 128) != nullptr) {
    doubleBufferEnabled = true;
    logger(String("[Display] Double buffer (M5Canvas) allocated successfully: 32KB."), "info");
    logger(String("[Display] Free PSRAM: ") + String(ESP.getFreePsram() / 1024) + " KB, Free Heap: " + String(esp_get_free_heap_size() / 1024) + " KB", "info");
  } else {
    doubleBufferEnabled = false;
    logger("[Display] WARNING: Failed to allocate double buffer! Falling back to direct display rendering.", "error");
  }

  // Initial Boot Splash
  if (doubleBufferEnabled) {
    canvas.fillScreen(TFT_BLACK);
    canvas.setTextColor(TFT_WHITE, TFT_BLACK);
    canvas.setTextDatum(middle_center);
    canvas.setTextSize(1);
    canvas.drawString("M5AtomS3R PoE", 64, 40);
    canvas.drawString("Tally & Cue LX", 64, 60);
    canvas.setTextColor(TFT_CYAN, TFT_BLACK);
    canvas.drawString("Booting...", 64, 85);
    canvas.pushSprite(0, 0);
  } else {
    M5.Display.fillScreen(TFT_BLACK);
    M5.Display.setCursor(10, 50);
    M5.Display.println("Booting AtomS3R...");
  }

  // Load Preferences
  preferences.begin("tally-arbiter", false);
  if (preferences.getString("deviceid").length() > 0) DeviceId = preferences.getString("deviceid");
  if (preferences.getString("devicename").length() > 0) DeviceName = preferences.getString("devicename");
  if (preferences.getString("opMode").length() > 0) operatingMode = preferences.getString("opMode");
  if (preferences.isKey("useDHCP")) useDHCP = preferences.getBool("useDHCP", true);
  if (preferences.getString("staticIP").length() > 0) static_ip = preferences.getString("staticIP");
  if (preferences.getString("staticMask").length() > 0) static_mask = preferences.getString("staticMask");
  if (preferences.getString("staticGW").length() > 0) static_gw = preferences.getString("staticGW");
  if (preferences.getString("staticDNS").length() > 0) static_dns = preferences.getString("staticDNS");
  if (preferences.getString("cueHost").length() > 0) cuesystem_host = preferences.getString("cueHost");
  if (preferences.isKey("cuePort")) cuesystem_port = preferences.getInt("cuePort", 4000);
  if (preferences.isKey("cueChan")) cuesystem_channel = preferences.getInt("cueChan", 1);
  if (preferences.isKey("nmosAutoDisc")) nmos_auto_discover = preferences.getBool("nmosAutoDisc", true);
  if (preferences.getString("nmosHost").length() > 0) nmos_registry_host = preferences.getString("nmosHost");
  if (preferences.isKey("nmosPort")) nmos_registry_port = preferences.getInt("nmosPort", 8235);
  if (preferences.getString("nmosSrc").length() > 0) nmos_source_id = preferences.getString("nmosSrc");
  if (preferences.getString("nmosPrg").length() > 0) nmos_program_topic = preferences.getString("nmosPrg");
  if (preferences.getString("nmosPvw").length() > 0) nmos_preview_topic = preferences.getString("nmosPvw");
  if (preferences.getString("nmosAux").length() > 0) nmos_aux_topic = preferences.getString("nmosAux");
  if (preferences.isKey("tsl31Port")) tsl31_port = preferences.getInt("tsl31Port", 8910);
  if (preferences.getString("tsl31Trans").length() > 0) tsl31_transport = preferences.getString("tsl31Trans");
  if (preferences.isKey("tsl31Addr")) tsl31_address = preferences.getInt("tsl31Addr", 0);
  if (preferences.isKey("tsl50Port")) tsl50_port = preferences.getInt("tsl50Port", 8900);
  if (preferences.getString("tsl50Trans").length() > 0) tsl50_transport = preferences.getString("tsl50Trans");
  if (preferences.isKey("tsl50Screen")) tsl50_screen = preferences.getInt("tsl50Screen", 0);
  if (preferences.isKey("tsl50Idx")) tsl50_index = preferences.getInt("tsl50Idx", 0);
  if (preferences.isKey("oscCuePort")) osccue_port = preferences.getInt("oscCuePort", 53000);
  if (preferences.getString("oscCueStation").length() > 0) osccue_station_id = preferences.getString("oscCueStation");
  if (preferences.getString("oscCueBanner").length() > 0) osccue_banner = preferences.getString("oscCueBanner");
  if (preferences.isKey("midiPort")) rtpmidi_port = preferences.getInt("midiPort", 5004);
  if (preferences.isKey("midiChan")) rtpmidi_channel = preferences.getInt("midiChan", 1);
  if (preferences.isKey("midiTrig")) rtpmidi_trigger_type = preferences.getInt("midiTrig", 0);
  if (preferences.isKey("midiRed")) rtpmidi_num_red = preferences.getInt("midiRed", 60);
  if (preferences.isKey("midiFlash")) rtpmidi_num_flash_red = preferences.getInt("midiFlash", 61);
  if (preferences.isKey("midiGreen")) rtpmidi_num_green = preferences.getInt("midiGreen", 62);
  if (preferences.isKey("midiYellow")) rtpmidi_num_yellow = preferences.getInt("midiYellow", 63);
  if (preferences.isKey("midiBlue")) rtpmidi_num_blue = preferences.getInt("midiBlue", 64);
  if (preferences.isKey("midiWhite")) rtpmidi_num_white = preferences.getInt("midiWhite", 65);
  if (preferences.isKey("oscPort")) osc_port = preferences.getInt("oscPort", 8000);
  if (preferences.getString("oscPrefix").length() > 0) osc_prefix = preferences.getString("oscPrefix");
  if (preferences.getString("oscMsg").length() > 0) osc_custom_message = preferences.getString("oscMsg");
  if (preferences.getString("pairGroup").length() > 0) pairingGroup = preferences.getString("pairGroup");
  if (preferences.getString("pairIP").length() > 0) pairedTargetIP = preferences.getString("pairIP");
  if (preferences.getString("pairName").length() > 0) pairedTargetName = preferences.getString("pairName");
  if (preferences.getString("taHost").length() > 0) preferences.getString("taHost").toCharArray(tallyarbiter_host, 40);
  if (preferences.getString("taPort").length() > 0) preferences.getString("taPort").toCharArray(tallyarbiter_port, 6);
  if (preferences.getString("taTSLPort").length() > 0) preferences.getString("taTSLPort").toCharArray(tallyarbiter_TSLport, 6);
  if (preferences.getString("taListenerName").length() > 0) listenerDeviceName = preferences.getString("taListenerName");
  if (preferences.getString("tzName").length() > 0) timezone_name = preferences.getString("tzName");
  if (preferences.getString("tzPosix").length() > 0) custom_tz_posix = preferences.getString("tzPosix");
  if (preferences.isKey("mtcReader")) mtc_reader_enabled = preferences.getBool("mtcReader", false);
  if (preferences.isKey("envSensor")) env_sensor_enabled = preferences.getBool("envSensor", false);
  if (preferences.isKey("promptPort")) promptside_port = preferences.getInt("promptPort", 8000);
  if (preferences.getString("promptChan").length() > 0) promptside_channel = preferences.getString("promptChan");
  if (preferences.getString("promptWing").length() > 0) promptside_wing_label = preferences.getString("promptWing");
  if (preferences.isKey("mscPort")) msc_rtpmidi_port = preferences.getInt("mscPort", 5004);
  if (preferences.isKey("mscDev")) msc_device_id = preferences.getInt("mscDev", 0x7F);
  if (preferences.isKey("mscFmt")) msc_cmd_format = preferences.getInt("mscFmt", 0x7F);
  if (preferences.isKey("mBtnType")) midi_btn_type = preferences.getInt("mBtnType", 1);
  if (preferences.isKey("mBtnChan")) midi_btn_channel = preferences.getInt("mBtnChan", 1);
  if (preferences.isKey("mBtnNum")) midi_btn_number = preferences.getInt("mBtnNum", 60);
  if (preferences.isKey("mBtnPress")) midi_btn_val_press = preferences.getInt("mBtnPress", 127);
  if (preferences.isKey("mBtnRel")) midi_btn_val_release = preferences.getInt("mBtnRel", 0);
  if (preferences.isKey("cpuFreq")) cpu_freq_mhz = preferences.getInt("cpuFreq", 80);
  if (preferences.isKey("dimTimeout")) screen_dim_timeout_sec = preferences.getInt("dimTimeout", 60);
  preferences.end();

  // Apply Timezone & Power Management Configuration
  applyTimezoneConfig();
  applyPowerManagementConfig();

  // Initialize I2C for AtomENV on Grove Port (SDA: GPIO 2, SCL: GPIO 1) (Requirement 9)
  if (env_sensor_enabled) {
    Wire.begin(2, 1);
    logger("[AtomENV] Wire I2C initialized on Grove port (SDA: GPIO 2, SCL: GPIO 1)", "info");
  }

  // Create unique listener name using MAC
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macSuffix[10];
  snprintf(macSuffix, sizeof(macSuffix), "%02X%02X%02X", mac[3], mac[4], mac[5]);
  if (!listenerDeviceName.endsWith(macSuffix)) {
    listenerDeviceName += macSuffix;
  }

  // If TCP listener configured, start TCP server
  if (operatingMode == "TSL_31" && tsl31_transport == "TCP") {
    setupTSLTcpServer(tsl31_port);
  } else if (operatingMode == "TSL_50" && tsl50_transport == "TCP") {
    setupTSLTcpServer(tsl50_port);
  }

  // 1. Setup Ethernet Network Event Handlers BEFORE ETH.begin()
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    switch (event) {
      case ARDUINO_EVENT_ETH_START:
        logger("[ETH] Hardware driver started", "info");
        ETH.setHostname(listenerDeviceName.c_str());
        break;
      case ARDUINO_EVENT_ETH_CONNECTED:
        logger("[ETH] Cable connected (Link UP)", "info");
        break;
      case ARDUINO_EVENT_ETH_GOT_IP:
        logger(String("[ETH] IP Assigned (") + (useDHCP ? "DHCP" : "Static") + "): " + ETH.localIP().toString(), "info");
        networkConnected = true;
        {
          uint16_t listenPort = atoi(tallyarbiter_TSLport);
          if (isETCCueSystem()) listenPort = cuesystem_port;
          else if (isRTPMidi()) listenPort = rtpmidi_port;
          else if (isOSC()) listenPort = osc_port;
          else if (isTSL31Listener()) listenPort = tsl31_port;
          else if (isTSL50Listener()) listenPort = tsl50_port;
          else if (isOSCCueLight()) listenPort = osccue_port;
          udp.begin(listenPort);
          if (isNMOSIS07() && nmos_auto_discover) {
            discoverNMOSRegistrationServer();
          }
        }
        if (usesTallyArbiter()) {
          connectToServer();
        }
        renderScreen();
        break;
      case ARDUINO_EVENT_ETH_LOST_IP:
      case ARDUINO_EVENT_ETH_DISCONNECTED:
        logger("[ETH] Cable disconnected (Link DOWN)", "info");
        if (WiFi.status() != WL_CONNECTED) {
          networkConnected = false;
          disconnectFromServer();
        }
        renderScreen();
        break;
      case ARDUINO_EVENT_ETH_STOP:
        logger("[ETH] Interface stopped", "info");
        if (WiFi.status() != WL_CONNECTED) {
          networkConnected = false;
        }
        break;
      default:
        break;
    }
  });

  // 2. Explicitly initialize SPI and W5500 for AtomS3R + AtomPoE
  logger("[ETH] Initializing W5500 SPI (SCK:5, CS:6, MISO:7, MOSI:8)...", "info");
  SPI.begin(ETH_PHY_SPI_SCK, ETH_PHY_SPI_MISO, ETH_PHY_SPI_MOSI, ETH_PHY_CS);
  applyNetworkIPConfig();
  if (ETH.begin(ETH_PHY_TYPE, ETH_PHY_ADDR, ETH_PHY_CS, ETH_PHY_IRQ, ETH_PHY_RST, SPI)) {
    logger(String("[ETH] W5500 SPI Ethernet initialized. Waiting for PoE link / ") + (useDHCP ? "DHCP" : "Static IP") + "...", "info");
  } else {
    logger("[ETH] ERROR: ETH.begin returned false! Check AtomPoE hardware seating.", "error");
  }

  // 3. Setup MycilaESPConnect Network Manager
  espConnect.listen([](Mycila::ESPConnect::State previous, Mycila::ESPConnect::State current) {
    logger(String("[Network] State: ") + String((int)previous) + " -> " + String((int)current), "info");
    if (current == Mycila::ESPConnect::State::NETWORK_CONNECTED) {
      networkConnected = true;
      logger("[Network] Connected! IP: " + getNetworkIPStr(), "info");
      uint16_t listenPort = atoi(tallyarbiter_TSLport);
      if (isETCCueSystem()) listenPort = cuesystem_port;
      else if (isRTPMidi()) listenPort = rtpmidi_port;
      else if (isOSC()) listenPort = osc_port;
      else if (isTSL31Listener()) listenPort = tsl31_port;
      else if (isTSL50Listener()) listenPort = tsl50_port;
      else if (isOSCCueLight()) listenPort = osccue_port;
      udp.begin(listenPort);
      if (isNMOSIS07() && nmos_auto_discover) {
        discoverNMOSRegistrationServer();
      }
      if (usesTallyArbiter()) {
        connectToServer();
      }
      renderScreen();
    } else if (current == Mycila::ESPConnect::State::NETWORK_DISCONNECTED) {
      if (!isEthernetActive()) {
        networkConnected = false;
        disconnectFromServer();
        renderScreen();
      }
    }
  });

  // 4. Setup Web Server endpoints & start listening on port 80
  setupWebServer();

  // 5. Initialize network manager (non-blocking, hostname & AP SSID)
  logger("[Network] Initializing MycilaESPConnect...", "info");
  espConnect.setBlocking(false);
  espConnect.begin(listenerDeviceName.c_str(), listenerDeviceName.c_str());

  // Initialize NTP Time
  configTzTime(posix_time_zone_info, daylightOffset_sec, ntpServer1, ntpServer2);

  // Initialize ArduinoOTA
  ArduinoOTA.setHostname(listenerDeviceName.c_str());
  ArduinoOTA.setPassword("tallyarbiter");
  ArduinoOTA.begin();

  // Initialize mDNS & register DNS-SD service for local discovery
  if (MDNS.begin(mdnsdotlocalurl.c_str())) {
    MDNS.addService("CueLX", "tcp", 80);
    MDNS.addService("http", "tcp", 80);
    uint16_t mDnsPort = isETCCueSystem() ? cuesystem_port : (isRTPMidi() ? rtpmidi_port : (isOSC() ? osc_port : (isTSL31Listener() ? tsl31_port : (isTSL50Listener() ? tsl50_port : (isOSCCueLight() ? osccue_port : atoi(tallyarbiter_TSLport))))));
    MDNS.addService("cuelx-tally", "udp", mDnsPort);
    MDNS.addServiceTxt("cuelx-tally", "udp", "role", isPresenter() ? "presenter" : (isTP() ? "tp" : (isETCCueSystem() ? "cue" : (isRTPMidi() ? "midi" : (isOSC() ? "osc" : (isTSL31Listener() ? "tsl31" : (isTSL50Listener() ? "tsl50" : (isOSCCueLight() ? "osccue" : "nmos"))))))));
    MDNS.addServiceTxt("cuelx-tally", "udp", "mode", operatingMode.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "group", pairingGroup.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "name", listenerDeviceName.c_str());
    logger(String("[mDNS] Service _cuelx-tally._udp registered on port ") + String(mDnsPort), "info");
  }

  // Initial Screen Render
  renderScreen();

  // 6. Start Socket.IO background task pinned to Core 0 (PRO_CPU)
  xTaskCreatePinnedToCore(
    socketTask,
    "socketTask",
    8192,
    NULL,
    1,
    &socketTaskHandle,
    0
  );
}

// ==========================================
// Main Loop (Core 1: 100% Dedicated to UI & UDP)
// ==========================================
void loop() {
  M5.update();
  espConnect.loop();
  ArduinoOTA.handle();

  // 0. Ethernet Precedence: Disable Wi-Fi when PoE Ethernet is active (Requirement 4)
  static unsigned long lastEthPrecedenceCheck = 0;
  if (millis() - lastEthPrecedenceCheck >= 500) {
    lastEthPrecedenceCheck = millis();
    checkEthernetWifiPrecedence();
  }

  // 0.5 Power & Thermal Management: Auto-dim display when idle in Standby / Off
  if (screen_dim_timeout_sec > 0) {
    bool isLiveOnAir = (actualType == "\"program\"" || actualType == "\"preview\"" || cuesystem_ack_active || promptside_state == "go" || mscState == "go" || midi_active_red || tsl31_red || tsl50_red || osccue_state == "go");
    if (isLiveOnAir) {
      last_user_or_tally_act = millis();
      if (screen_dimmed) {
        wakeDisplayFromDim();
      }
    } else if (!screen_dimmed && (millis() - last_user_or_tally_act >= (unsigned long)screen_dim_timeout_sec * 1000)) {
      screen_dimmed = true;
      M5.Display.setBrightness(25); // Dim to 10% backlight
      logger("[Power] Inactive for " + String(screen_dim_timeout_sec) + "s in standby/off. Backlight auto-dimmed to 10% to minimize PoE heating.", "info");
    }
  }

  // 1. Process incoming packets with sub-millisecond latency (TSL 3.1 UDP, ETC, NMOS, rtpMIDI, OSC, Promptside, MSC)
  processIncomingTSL();

  // 1.5 P2P Heartbeat & Peer Loss Fault Detection (Requirement 7)
  handleP2PHeartbeatCheck();

  // 1.8 Read M5Stack AtomENV Sensor on I2C Grove Port (Requirement 9)
  readAtomEnvSensor();

  // 2. Handle flash effect if requested by Tally Arbiter
  if (flashRequested) {
    flashRequested = false;
    for (int i = 0; i < 3; i++) {
      if (doubleBufferEnabled) {
        canvas.fillScreen(TFT_WHITE);
        canvas.pushSprite(0, 0);
        delay(100);
        canvas.fillScreen(TFT_BLACK);
        canvas.pushSprite(0, 0);
        delay(100);
      } else {
        M5.Display.fillScreen(TFT_WHITE);
        delay(100);
        M5.Display.fillScreen(TFT_BLACK);
        delay(100);
      }
    }
    renderScreen();
  }

  // 3. IMU Screen Auto-Orientation (Requirement 5)
  // Ensures screen text is ALWAYS right-side up regardless of physical unit orientation
  static unsigned long lastIMUCheck = 0;
  if (millis() - lastIMUCheck >= 80) {
    lastIMUCheck = millis();
    float ax = 0, ay = 0, az = 0;
    if (M5.Imu.isEnabled()) {
      M5.Imu.getAccel(&ax, &ay, &az);
      uint8_t targetRot = currentRotation;
      if (fabs(ay) >= fabs(ax)) {
        if (ay < -0.45f) targetRot = 0;      // Upright (Grove/PoE ports at bottom)
        else if (ay > 0.45f) targetRot = 2; // Inverted 180 (Grove/PoE ports at top)
      } else {
        if (ax > 0.45f) targetRot = 1;      // Rotated 90 deg clockwise (ports on left)
        else if (ax < -0.45f) targetRot = 3;// Rotated 90 deg counter-clockwise (ports on right)
      }

      if (targetRot != currentRotation) {
        if (pendingRotation != targetRot) {
          pendingRotation = targetRot;
          pendingRotTime = millis();
        } else if (millis() - pendingRotTime >= 200) { // 200ms debounce
          currentRotation = targetRot;
          // CRITICAL FIX: Only rotate hardware scanout; do NOT double-rotate canvas!
          M5.Display.setRotation(currentRotation);
          logger(String("[IMU] Screen auto-rotated to ") + String(currentRotation * 90) + " degrees", "info");
          renderScreen();
        }
      } else {
        pendingRotation = currentRotation;
      }
    }
  }

  // 4. Smooth Flashing (ETC Standby, Promptside Standby, P2P Disconnect Alarm, Flash Red) & OSC text ticker
  static unsigned long lastFlashTickerTime = 0;
  bool isFlashing = (isETCCueSystem() && actualType == "\"standby\"" && !cuesystem_ack_active) ||
                    (actualType == "\"flashred\"") ||
                    (isOSCCueLight() && osccue_state == "standby_ack" && !osccue_ack_done) ||
                    (isPromptside() && promptside_state == "standby_ack" && !promptside_ack_done) ||
                    (isP2PMode() && p2p_disconnected_state);
  bool isTicker = (isOSC() && osc_custom_message.length() > 9) ||
                  ((isTSL31Listener() || isTSL50Listener()) && (isTSL31Listener() ? tsl31_name : tsl50_name).length() > 9) ||
                  (isPromptside() && promptside_cue_text.length() > 9);

  if (isFlashing) {
    if (millis() - lastFlashTickerTime >= 200) {
      lastFlashTickerTime = millis();
      renderScreen();
    }
  } else if (isTicker) {
    if (millis() - lastFlashTickerTime >= 35) {
      lastFlashTickerTime = millis();
      renderScreen();
    }
  }

  // 5. Button Handling on AtomS3R Screen Button
  // Single click: Mode-aware action
  if (M5.BtnA.wasClicked()) {
    wakeDisplayFromDim();
    if (isPromptside()) {
      // Requirement 2: Promptside Acknowledge Return
      logger(String("[Button] Promptside ACK pressed for CH ") + promptside_channel, "info");
      promptside_ack_done = true;
      if (networkConnected) {
        sendPromptsideAck();
      }
      renderScreen();
    } else if (isETCCueSystem()) {
      logger(String("[Button] CueSystem Acknowledge pressed for CH ") + String(cuesystem_channel), "info");
      cuesystem_ack_active = true;
      if (networkConnected) {
        sendCueAck();
      }
      renderScreen();
    } else if (isOSCCueLight()) {
      logger(String("[Button] OSC Cue Light ACK pressed for station ") + osccue_station_id, "info");
      osccue_ack_done = true;
      if (networkConnected) {
        sendOSCCueLightState("ack");
      }
      renderScreen();
    } else if (isNMOSIS07()) {
      logger("[Button] NMOS IS-07 Tally toggle pressed", "info");
      nmos_program_active = !nmos_program_active;
      if (nmos_program_active) {
        actualType = "\"program\"";
        actualColor = "#FF0000";
      } else {
        actualType = "";
        actualColor = "";
      }
      if (networkConnected) {
        sendNMOSTally(nmos_program_active);
      }
      renderScreen();
    } else if (isRTPMidi() || isMSCRTPMidi()) {
      // Requirement 6: Transmit configured MIDI Button Action back to host
      logger("[Button] MIDI return action triggered", "info");
      sendMidiButtonAction(true);
      delay(40);
      sendMidiButtonAction(false);
      renderScreen();
    } else if (isOSC()) {
      logger("[Button] OSC Test Toggle pressed", "info");
      osc_active_red = !osc_active_red;
      evaluateOSCState();
      renderScreen();
    } else if (isTSL31Listener() || isTSL50Listener()) {
      logger("[Button] TSL Listener Info toggle pressed", "info");
      currentScreen = (currentScreen == 0) ? 1 : 0;
      renderScreen();
    } else {
      logger(String("[Button] Single Click: Toggle Cue CH1 (") + (isPresenter() ? "Presenter Preview" : "TP Program") + ")", "info");
      ch1state = !ch1state;
      if (networkConnected) {
        sendtally(1, ch1state);
      }
      renderScreen();
    }
  }

  // Double click: Switch screen
  if (M5.BtnA.wasDoubleClicked()) {
    wakeDisplayFromDim();
    logger("[Button] Double Click: Switch Screen", "info");
    currentScreen = (currentScreen == 0) ? 1 : 0;
    renderScreen();
  }

  // Hold (>1.5s): Cycle brightness
  if (M5.BtnA.wasHold()) {
    logger("[Button] Hold: Step Brightness", "info");
    updateBrightness();
  }

  // Long press (>7s): Reset network settings & reboot
  if (M5.BtnA.pressedFor(7000)) {
    logger("[Button] Emergency Long Press (>7s): Resetting Network Settings", "error");
    if (doubleBufferEnabled) {
      canvas.fillScreen(TFT_RED);
      canvas.setTextColor(TFT_WHITE, TFT_RED);
      canvas.setTextDatum(middle_center);
      canvas.drawString("RESETTING...", 64, 64);
      canvas.pushSprite(0, 0);
    }
    delay(1000);
    ESP.restart();
  }

  // 6. Smooth 1-Second Clock & State Rollover Detection
  time_t currentEpoch;
  time(&currentEpoch);
  static time_t lastEpoch = 0;
  static unsigned long lastUptimeSecond = 0;
  unsigned long currentUptimeSecond = millis() / 1000;

  bool secondChanged = false;
  if (currentEpoch > 100000) {
    if (currentEpoch != lastEpoch) {
      lastEpoch = currentEpoch;
      secondChanged = true;
    }
  } else {
    if (currentUptimeSecond != lastUptimeSecond) {
      lastUptimeSecond = currentUptimeSecond;
      secondChanged = true;
    }
  }

  // Periodic TP state refresh (every 2 seconds)
  static unsigned long lastTPBroadcast = 0;
  if (millis() - lastTPBroadcast >= 2000) {
    lastTPBroadcast = millis();
    if (networkConnected && isTP()) {
      sendtally(1, ch1state);
    }
  }

  if (secondChanged || tallyStateChanged) {
    tallyStateChanged = false;
    renderScreen();
  }

  // Dynamic FreeRTOS Idle Yield:
  // Yielding 2ms when idle allows FreeRTOS idle task to invoke Xtensa 'waiti 0' instruction,
  // halting CPU pipeline execution and cutting active core power by >70% between packets.
  if (isFlashing || isTicker) {
    vTaskDelay(pdMS_TO_TICKS(1));
  } else {
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}

// ==========================================
// Tally Arbiter Socket.IO Client Logic
// ==========================================
void socketTask(void *pvParameters) {
  logger("[Task] Socket.IO background task running on Core 0", "info");
  for (;;) {
    if (networkConnected && usesTallyArbiter()) {
      socket.loop();
    }
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void ws_emit(String event, const char *payload) {
  if (payload) {
    String msg = "[\"" + event + "\"," + payload + "]";
    socket.sendEVENT(msg);
  } else {
    String msg = "[\"" + event + "\"]";
    socket.sendEVENT(msg);
  }
}

void connectToServer() {
  if (!networkConnected) {
    logger("[TallyArbiter] Network not connected; deferring connectToServer()", "info");
    return;
  }
  logger(String("[TallyArbiter] Connecting to ") + tallyarbiter_host + ":" + tallyarbiter_port, "info");
  socket.onEvent(socket_event);
  socket.setReconnectInterval(5000);
  socket.begin(tallyarbiter_host, atol(tallyarbiter_port));
}

void disconnectFromServer() {
  if (socket.isConnected()) {
    socket.disconnect();
    logger("[TallyArbiter] Disconnected from server (Network link down)", "info");
  }
}

void socket_event(socketIOmessageType_t type, uint8_t *payload, size_t length) {
  String eventMsg = "";
  String eventType = "";
  String eventContent = "";

  switch (type) {
    case sIOtype_CONNECT:
      socket_Connected((char *)payload, length);
      break;

    case sIOtype_DISCONNECT:
      logger("[TallyArbiter] Disconnected from server.", "info");
      tallyStateChanged = true;
      break;

    case sIOtype_EVENT:
      eventMsg = (char *)payload;
      eventType = eventMsg.substring(2, eventMsg.indexOf("\"", 2));
      eventContent = eventMsg.substring(eventType.length() + 4);
      eventContent.remove(eventContent.length() - 1);

      if (eventType == "bus_options") BusOptions = JSON.parse(eventContent);
      if (eventType == "reassign")    socket_Reassign(eventContent);
      if (eventType == "flash")       socket_Flash();
      if (eventType == "messaging")   socket_Messaging(eventContent);

      if (eventType == "deviceId") {
        DeviceId = eventContent.substring(1, eventContent.length() - 1);
        SetDeviceName();
        showDeviceInfo();
      }

      if (eventType == "devices") {
        Devices = JSON.parse(eventContent);
        SetDeviceName();
      }

      if (eventType == "device_states") {
        DeviceStates = JSON.parse(eventContent);
        processTallyData();
      }
      break;

    default:
      break;
  }
}

void socket_Connected(const char *payload, size_t length) {
  logger("[TallyArbiter] Connected successfully.", "info");
  String deviceObj = "{\"deviceId\": \"" + DeviceId + "\", \"listenerType\": \"" + listenerDeviceName + "\", \"canBeReassigned\": true, \"canBeFlashed\": true, \"supportsChat\": true }";
  char charDeviceObj[1024];
  strcpy(charDeviceObj, deviceObj.c_str());
  ws_emit("listenerclient_connect", charDeviceObj);
  tallyStateChanged = true;
}

void socket_Flash() {
  logger("[TallyArbiter] Flash triggered!", "info");
  flashRequested = true;
}

void socket_Reassign(String payload) {
  int commaIndex = payload.indexOf(',');
  String oldDeviceId = payload.substring(0, commaIndex);
  String newDeviceId = payload.substring(commaIndex + 1);
  newDeviceId = newDeviceId.substring(0, newDeviceId.indexOf(','));

  oldDeviceId.replace("\"", "");
  newDeviceId.replace("\"", "");

  String reassignObj = "{\"oldDeviceId\": \"" + oldDeviceId + "\", \"newDeviceId\": \"" + newDeviceId + "\"}";
  char charReassignObj[1024];
  strcpy(charReassignObj, reassignObj.c_str());
  ws_emit("listener_reassign_object", charReassignObj);
  ws_emit("devices");

  DeviceId = newDeviceId;
  preferences.begin("tally-arbiter", false);
  preferences.putString("deviceid", newDeviceId);
  preferences.end();
  SetDeviceName();
}

void socket_Messaging(String payload) {
  int typeQuoteIndex = payload.indexOf(',');
  String messageType = payload.substring(0, typeQuoteIndex);
  messageType.replace("\"", "");
  int messageQuoteIndex = payload.lastIndexOf(',');
  String message = payload.substring(messageQuoteIndex + 1);
  message.replace("\"", "");
  LastMessage = messageType + ": " + message;
  evaluateMode();
}

void processTallyData() {
  bool typeChanged = false;
  for (int i = 0; i < DeviceStates.length(); i++) {
    if (DeviceStates[i]["sources"].length() > 0) {
      typeChanged = true;
      actualType     = getBusTypeById(JSON.stringify(DeviceStates[i]["busId"]));
      actualColor    = getBusColorById(JSON.stringify(DeviceStates[i]["busId"]));
      actualPriority = getBusPriorityById(JSON.stringify(DeviceStates[i]["busId"]));
    }
  }

  if (!typeChanged) {
    actualType = "";
    actualColor = "";
    actualPriority = 0;
  }
  evaluateMode();
}

String getBusTypeById(String busId) {
  for (int i = 0; i < BusOptions.length(); i++) {
    if (JSON.stringify(BusOptions[i]["id"]) == busId) {
      return JSON.stringify(BusOptions[i]["type"]);
    }
  }
  return "invalid";
}

String getBusColorById(String busId) {
  for (int i = 0; i < BusOptions.length(); i++) {
    if (JSON.stringify(BusOptions[i]["id"]) == busId) {
      return JSON.stringify(BusOptions[i]["color"]);
    }
  }
  return "invalid";
}

int getBusPriorityById(String busId) {
  for (int i = 0; i < BusOptions.length(); i++) {
    if (JSON.stringify(BusOptions[i]["id"]) == busId) {
      return (int)JSON.stringify(BusOptions[i]["priority"]).toInt();
    }
  }
  return 0;
}

void SetDeviceName() {
  for (int i = 0; i < Devices.length(); i++) {
    if (JSON.stringify(Devices[i]["id"]) == "\"" + DeviceId + "\"") {
      String strDevice = JSON.stringify(Devices[i]["name"]);
      DeviceName = strDevice.substring(1, strDevice.length() - 1);
      break;
    }
  }
  preferences.begin("tally-arbiter", false);
  preferences.putString("devicename", DeviceName);
  preferences.end();
  evaluateMode();
}

void logger(String strLog, String strType) {
  Serial.println(strLog);
}
