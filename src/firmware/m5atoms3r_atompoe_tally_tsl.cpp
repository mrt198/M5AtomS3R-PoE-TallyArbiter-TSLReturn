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

// NTP & Timezone Setup
const char* ntpServer1 = "0.pool.ntp.org";
const char* ntpServer2 = "time.nist.gov";
const char* posix_time_zone_info = "GMT0BST,M3.5.0/1,M10.5.0"; // Europe/London
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
// - "ETC_CueSystem": ETC CueSystem Outstation (Theatrical Cue Light with Acknowledge)
// - "NMOS_IS07": NMOS IS-07 Event & Tally (SMPTE ST 2110 IP Broadcast)
String operatingMode    = "TP";           // Default mode
String pairingGroup     = "Studio-1";     // mDNS / DNS-SD pairing group
String pairedTargetIP   = "";             // Target IP of paired unit in P2P mode
String pairedTargetName = "";             // Target device name in P2P mode
bool presenterCueActive = false;          // Active on TP unit when Presenter cues

// ETC CueSystem Settings
String cuesystem_host       = "192.168.1.100"; // CueSystem Hub / Controller IP
int    cuesystem_port       = 4000;            // CueSystem UDP Port (default 4000)
int    cuesystem_channel    = 1;               // Cue Channel (1-32)
bool   cuesystem_ack_active = false;           // Acknowledged standby status

// NMOS IS-07 Event & Tally Settings (SMPTE ST 2110)
String nmos_registry_host   = "192.168.1.50"; // NMOS IS-04 Registration Server
int    nmos_registry_port   = 8235;           // NMOS Registration Port (default 8235)
String nmos_source_id       = "urn:uuid:7c9e6679-7425-4094-8f92-d6c1b35b62b1";
String nmos_event_topic     = "tally/program";
bool   nmos_is_on_air       = false;

// Network IP Configuration (DHCP vs Static IP)
bool   useDHCP              = true;
String static_ip            = "192.168.1.185";
String static_mask          = "255.255.255.0";
String static_gw            = "192.168.1.1";
String static_dns           = "192.168.1.1";

// Brightness levels (0-255 scale for M5Unified)
const uint8_t brightnessLevels[] = { 40, 90, 160, 255 };
uint8_t brightnessIndex = 1;

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

// ==========================================
// Double Buffering Canvas
// ==========================================
// 128x128 pixels @ 16-bit color depth (RGB565) = 32,768 bytes (32 KB).
// AtomS3R ESP32-S3 has 8MB PSRAM and 512KB SRAM, easily accommodating this.
M5Canvas canvas(&M5.Display);
bool doubleBufferEnabled = false;
// Multi-Core & Thread-Safety Variables (FreeRTOS)
volatile bool tallyStateChanged = false;
volatile bool flashRequested = false;
TaskHandle_t socketTaskHandle = NULL;

// Forward Declarations
void socketTask(void *pvParameters);
void sendtally(int channel, bool live);
void sendCueAck();
void sendNMOSTally(bool live);
void processIncomingTSL();
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
// Incoming Packet Receiver (TSL, ETC CueSystem & NMOS IS-07)
// ==========================================
void processIncomingTSL() {
  int packetSize = udp.parsePacket();
  if (packetSize > 0) {
    byte packetBuffer[256];
    int len = udp.read(packetBuffer, sizeof(packetBuffer) - 1);
    if (len <= 0) return;
    packetBuffer[len] = '\0';

    // 1. Check for ETC CueSystem packet (ASCII text starting with 'CS' or 'CUE')
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
              actualType = "\"standby\"";
              actualColor = "#FFA500"; // Amber
              cuesystem_ack_active = false;
              logger(String("[ETC CueSystem] Channel ") + String(cuesystem_channel) + " STANDBY received", "info");
            } else if (stateCmd == "GO") {
              actualType = "\"program\"";
              actualColor = "#00FF00"; // Green
              cuesystem_ack_active = false;
              logger(String("[ETC CueSystem] Channel ") + String(cuesystem_channel) + " GO received", "info");
            } else if (stateCmd == "OFF") {
              actualType = "";
              actualColor = "";
              cuesystem_ack_active = false;
              logger(String("[ETC CueSystem] Channel ") + String(cuesystem_channel) + " OFF received", "info");
            }
            renderScreen();
            return;
          }
        }
      }
    }

    // 2. Check for NMOS IS-07 JSON packet (starts with '{')
    if (isNMOSIS07()) {
      if (packetBuffer[0] == '{') {
        JSONVar obj = JSON.parse((char*)packetBuffer);
        if (obj.hasOwnProperty("payload") && obj["payload"].hasOwnProperty("value")) {
          bool val = (bool)obj["payload"]["value"];
          nmos_is_on_air = val;
          if (val) {
            actualType = "\"program\"";
            actualColor = "#FF0000";
          } else {
            actualType = "";
            actualColor = "";
          }
          logger(String("[NMOS IS-07] Tally event updated: ") + (val ? "ON-AIR" : "STANDBY"), "info");
          renderScreen();
          return;
        }
      }
    }

    // 3. Standard TSL 3.1 UDP packet (18 bytes)
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
// Double-Buffered Screen Rendering
// ==========================================
void renderScreen() {
  if (currentScreen == 0) {
    // ----------------------------------------
    // Screen 0: Tally & Cue Display (128x128)
    // ----------------------------------------
    uint16_t bgColor = TFT_BLACK;
    uint16_t textColor = TFT_WHITE;
    String statusLabel = "STANDBY";

    if (actualType == "\"program\"") {
      bgColor = TFT_RED;
      textColor = TFT_WHITE;
      statusLabel = "PROGRAM";
    } else if (actualType == "\"preview\"") {
      bgColor = TFT_GREEN;
      textColor = TFT_BLACK;
      statusLabel = "PREVIEW";
    } else if (actualType == "\"standby\"") {
      bgColor = TFT_ORANGE;
      textColor = TFT_BLACK;
      statusLabel = "STANDBY";
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

    auto renderContent = [&](M5Canvas* g) {
      g->fillScreen(bgColor);

      // Clock: Larger font with seconds in a black box with white text, ABOVE DeviceName
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
        // Fallback to live ticking uptime clock until NTP sync completes
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

      // Device Name directly below clock box
      g->setTextDatum(middle_center);
      g->setTextSize(2);
      g->setTextColor(textColor, bgColor);
      g->drawString(DeviceName, 64, 46);

      // Tally Status Tag
      g->setTextSize(1);
      g->drawRoundRect(14, 62, 100, 18, 4, textColor);
      g->drawString(statusLabel, 64, 71);

      // Bottom Status: Mode Badge, Cue & Peer / TA status
      g->setTextDatum(top_left);
      g->setTextSize(1);
      g->setCursor(4, 86);
      g->setTextColor(textColor, bgColor);
      String roleBadge = "";
      if (operatingMode == "TP") roleBadge = "[TP (TA)]";
      else if (operatingMode == "Presenter") roleBadge = "[PRES (TA)]";
      else if (operatingMode == "Presenter_P2P") roleBadge = "[P2P PRES]";
      else if (operatingMode == "TP_P2P") roleBadge = "[P2P TP]";
      else if (operatingMode == "ETC_CueSystem") roleBadge = "[ETC CUE]";
      else if (operatingMode == "NMOS_IS07") roleBadge = "[NMOS-07]";
      g->print(roleBadge);

      g->setCursor(68, 86);
      if (isETCCueSystem()) {
        g->print("Ch: " + String(cuesystem_channel));
      } else if (isNMOSIS07()) {
        g->print("IS-07");
      } else if (isP2PMode()) {
        g->print("Grp: " + pairingGroup.substring(0, 6));
      } else {
        g->print(socket.isConnected() ? "TA: ONLINE" : "TA: OFFLINE");
      }

      g->setCursor(4, 98);
      if (isETCCueSystem()) {
        if (cuesystem_ack_active) {
          g->setTextColor(TFT_GREEN, bgColor);
          g->print("[ACKNOWLEDGED]");
        } else {
          g->setTextColor(textColor, bgColor);
          g->print("Ack: PENDING");
        }
      } else if (isNMOSIS07()) {
        g->setTextColor(textColor, bgColor);
        g->print("Topic: ");
        g->print(String(nmos_event_topic).substring(0, 9));
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

      // Presenter Cue Alert on TP unit OR Network IP
      g->setCursor(4, 112);
      if (isTP() && presenterCueActive) {
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
      g->fillScreen(TFT_BLACK);
      g->setTextDatum(top_left);
      g->setTextColor(TFT_CYAN, TFT_BLACK);
      g->setTextSize(1);
      g->setCursor(4, 4);
      g->println("ATOM S3R DIAGNOSTICS");
      g->drawFastHLine(2, 16, 124, TFT_DARKGRAY);

      g->setTextColor(TFT_WHITE, TFT_BLACK);
      g->setCursor(4, 20);
      g->print("Mode: ");
      g->println(operatingMode);

      g->setCursor(4, 32);
      g->print("Net:  ");
      g->print(useDHCP ? "DHCP " : "Static ");
      g->println(getNetworkIPStr());

      g->setCursor(4, 44);
      if (isETCCueSystem()) {
        g->print("Hub:  ");
        g->print(cuesystem_host);
        g->print(":");
        g->println(cuesystem_port);
      } else if (isNMOSIS07()) {
        g->print("Reg:  ");
        g->print(nmos_registry_host);
        g->print(":");
        g->println(nmos_registry_port);
      } else if (isP2PMode()) {
        g->print("Peer: ");
        g->println(pairedTargetIP.length() > 0 ? pairedTargetIP : "Unpaired (B-cast)");
      } else {
        g->print("TA:   ");
        g->println(socket.isConnected() ? "Connected" : "Disconnected");
      }

      g->setCursor(4, 56);
      if (!useDHCP) {
        g->print("Mask: ");
        g->println(static_mask);
      } else {
        g->print("Grp:  ");
        g->println(pairingGroup);
      }

      g->setCursor(4, 68);
      if (!useDHCP) {
        g->print("GW:   ");
        g->println(static_gw);
      } else {
        g->print("Port: ");
        g->println(tallyarbiter_TSLport);
      }

      g->setCursor(4, 80);
      g->print("D-Buffer: ");
      g->println(doubleBufferEnabled ? "32KB (OK)" : "Disabled");

      g->setCursor(4, 92);
      g->print("Free PSRAM: ");
      g->print(ESP.getFreePsram() / 1024);
      g->println(" KB");

      g->setCursor(4, 104);
      g->print("Free Heap:  ");
      g->print(esp_get_free_heap_size() / 1024);
      g->println(" KB");

      g->setCursor(4, 116);
      g->print("Brightness: ");
      g->print(brightnessLevels[brightnessIndex] * 100 / 255);
      g->println("%");
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

void updateBrightness() {
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
    html += F("</p><p style='margin:4px 0;'>Network: <strong>");
    html += getNetworkModeStr();
    html += F(" (");
    html += useDHCP ? "DHCP" : "Static IP";
    html += F(")</strong> | IP: <strong>");
    html += getNetworkIPStr();
    html += F("</strong> | Double Buffer: <strong>");
    html += doubleBufferEnabled ? "32KB OK" : "Direct";
    html += F("</strong></p></div><div class='card'>"
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
              "</select>"

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

              // Section: Tally Arbiter
              "<div id='sec-ta' class='section-box'>"
              "<h2>Tally Arbiter Settings</h2>"
              "<div class='grid-2'>"
              "<div><label>Tally Arbiter Host / IP</label><input type='text' name='host' value='");
    html += tallyarbiter_host;
    html += F("'></div>"
              "<div><label>Socket.IO Port</label><input type='text' name='port' value='");
    html += tallyarbiter_port;
    html += F("'></div></div>"
              "<label>Listener Device Name</label><input type='text' name='devicename' value='");
    html += listenerDeviceName;
    html += F("'>"
              "<div class='hint'>Tally Arbiter connects over WebSockets (port 4455) for multi-source tally routing.</div>"
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
              "<div class='hint'>P2P mode communicates directly between units using TSL 3.1 UDP packets.</div>"
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
              "<div class='hint'>Listens for Standby (Amber) and Go (Green). Pressing button sends ACK to hub.</div>"
              "</div>"

              // Section: NMOS IS-07
              "<div id='sec-nmos' class='section-box'>"
              "<h2>AMWA NMOS IS-07 Event & Tally</h2>"
              "<div class='grid-2'>"
              "<div><label>NMOS Registration Server Host / IP</label><input type='text' name='nmos_host' value='");
    html += nmos_registry_host;
    html += F("'></div>"
              "<div><label>IS-04 Registry Port</label><input type='number' name='nmos_port' value='");
    html += String(nmos_registry_port);
    html += F("'></div></div>"
              "<div class='grid-2'>"
              "<div><label>Source / Device UUID</label><input type='text' name='nmos_source' value='");
    html += nmos_source_id;
    html += F("'></div>"
              "<div><label>IS-07 Event Topic</label><input type='text' name='nmos_topic' value='");
    html += nmos_event_topic;
    html += F("'></div></div>"
              "<div class='hint'>Integrates with SMPTE ST 2110 IP broadcast routing & IS-07 state emitters.</div>"
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
              "function updateModeUI(){"
              "  var m = document.getElementById('mode-select').value;"
              "  document.getElementById('sec-ta').style.display = (m==='TP'||m==='Presenter') ? 'block' : 'none';"
              "  document.getElementById('sec-p2p').style.display = (m==='TP_P2P'||m==='Presenter_P2P') ? 'block' : 'none';"
              "  document.getElementById('sec-p2p-scan').style.display = (m==='TP_P2P'||m==='Presenter_P2P') ? 'block' : 'none';"
              "  document.getElementById('sec-cuesystem').style.display = (m==='ETC_CueSystem') ? 'block' : 'none';"
              "  document.getElementById('sec-nmos').style.display = (m==='NMOS_IS07') ? 'block' : 'none';"
              "}"
              "updateModeUI();"
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
    obj["nmosHost"] = nmos_registry_host;
    obj["nmosPort"] = nmos_registry_port;
    obj["nmosSource"] = nmos_source_id;
    obj["nmosTopic"] = nmos_event_topic;
    obj["nmosOnAir"] = nmos_is_on_air;
    obj["pairingGroup"] = pairingGroup;
    obj["pairedTargetIP"] = pairedTargetIP;
    obj["pairedTargetName"] = pairedTargetName;
    obj["isPresenter"] = isPresenter();
    obj["isTP"] = isTP();
    obj["isP2P"] = isP2PMode();
    obj["isCueSystem"] = isETCCueSystem();
    obj["isNMOS"] = isNMOSIS07();
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

    // NMOS IS-07 settings
    if (request->hasParam("nmos_host", true)) {
      nmos_registry_host = request->getParam("nmos_host", true)->value();
    }
    if (request->hasParam("nmos_port", true)) {
      nmos_registry_port = request->getParam("nmos_port", true)->value().toInt();
    }
    if (request->hasParam("nmos_source", true)) {
      nmos_source_id = request->getParam("nmos_source", true)->value();
    }
    if (request->hasParam("nmos_topic", true)) {
      nmos_event_topic = request->getParam("nmos_topic", true)->value();
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

    // Persist all settings to NVS
    preferences.begin("tally-arbiter", false);
    preferences.putString("opMode", operatingMode);
    preferences.putBool("useDHCP", useDHCP);
    preferences.putString("staticIP", static_ip);
    preferences.putString("staticMask", static_mask);
    preferences.putString("staticGW", static_gw);
    preferences.putString("staticDNS", static_dns);
    preferences.putString("cueHost", cuesystem_host);
    preferences.putInt("cuePort", cuesystem_port);
    preferences.putInt("cueChan", cuesystem_channel);
    preferences.putString("nmosHost", nmos_registry_host);
    preferences.putInt("nmosPort", nmos_registry_port);
    preferences.putString("nmosSrc", nmos_source_id);
    preferences.putString("nmosTopic", nmos_event_topic);
    preferences.putString("pairGroup", pairingGroup);
    preferences.putString("pairIP", pairedTargetIP);
    preferences.putString("pairName", pairedTargetName);
    preferences.putString("taHost", tallyarbiter_host);
    preferences.putString("taPort", tallyarbiter_port);
    preferences.putString("taTSLPort", tallyarbiter_TSLport);
    preferences.putString("taListenerName", listenerDeviceName);
    preferences.end();

    // Reapply IP configuration immediately
    applyNetworkIPConfig();

    // Re-register mDNS TXT records
    MDNS.addServiceTxt("cuelx-tally", "udp", "role", isPresenter() ? "presenter" : (isTP() ? "tp" : (isETCCueSystem() ? "cue" : "nmos")));
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

  // Initialize M5Unified
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(0); // 128x128 upright
  M5.Display.setBrightness(brightnessLevels[brightnessIndex]);

  logger("==========================================", "info");
  logger("M5AtomS3R + AtomPoE TSL / Tally Arbiter", "info");
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
    canvas.drawString("Tally Arbiter", 64, 60);
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
  if (preferences.getString("deviceid").length() > 0) {
    DeviceId = preferences.getString("deviceid");
  }
  if (preferences.getString("devicename").length() > 0) {
    DeviceName = preferences.getString("devicename");
  }
  if (preferences.getString("opMode").length() > 0) {
    operatingMode = preferences.getString("opMode");
  }
  if (preferences.isKey("useDHCP")) {
    useDHCP = preferences.getBool("useDHCP", true);
  }
  if (preferences.getString("staticIP").length() > 0) {
    static_ip = preferences.getString("staticIP");
  }
  if (preferences.getString("staticMask").length() > 0) {
    static_mask = preferences.getString("staticMask");
  }
  if (preferences.getString("staticGW").length() > 0) {
    static_gw = preferences.getString("staticGW");
  }
  if (preferences.getString("staticDNS").length() > 0) {
    static_dns = preferences.getString("staticDNS");
  }
  if (preferences.getString("cueHost").length() > 0) {
    cuesystem_host = preferences.getString("cueHost");
  }
  if (preferences.isKey("cuePort")) {
    cuesystem_port = preferences.getInt("cuePort", 4000);
  }
  if (preferences.isKey("cueChan")) {
    cuesystem_channel = preferences.getInt("cueChan", 1);
  }
  if (preferences.getString("nmosHost").length() > 0) {
    nmos_registry_host = preferences.getString("nmosHost");
  }
  if (preferences.isKey("nmosPort")) {
    nmos_registry_port = preferences.getInt("nmosPort", 8235);
  }
  if (preferences.getString("nmosSrc").length() > 0) {
    nmos_source_id = preferences.getString("nmosSrc");
  }
  if (preferences.getString("nmosTopic").length() > 0) {
    nmos_event_topic = preferences.getString("nmosTopic");
  }
  if (preferences.getString("pairGroup").length() > 0) {
    pairingGroup = preferences.getString("pairGroup");
  }
  if (preferences.getString("pairIP").length() > 0) {
    pairedTargetIP = preferences.getString("pairIP");
  }
  if (preferences.getString("pairName").length() > 0) {
    pairedTargetName = preferences.getString("pairName");
  }
  if (preferences.getString("taHost").length() > 0) {
    preferences.getString("taHost").toCharArray(tallyarbiter_host, 40);
  }
  if (preferences.getString("taPort").length() > 0) {
    preferences.getString("taPort").toCharArray(tallyarbiter_port, 6);
  }
  if (preferences.getString("taTSLPort").length() > 0) {
    preferences.getString("taTSLPort").toCharArray(tallyarbiter_TSLport, 6);
  }
  if (preferences.getString("taListenerName").length() > 0) {
    listenerDeviceName = preferences.getString("taListenerName");
  }
  preferences.end();

  // Create unique listener name using MAC
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macSuffix[10];
  snprintf(macSuffix, sizeof(macSuffix), "%02X%02X%02X", mac[3], mac[4], mac[5]);
  if (!listenerDeviceName.endsWith(macSuffix)) {
    listenerDeviceName += macSuffix;
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
        udp.begin(isETCCueSystem() ? cuesystem_port : atoi(tallyarbiter_TSLport));
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
  // Apply static IP or DHCP configuration to Ethernet stack
  logger("[ETH] Initializing W5500 SPI (SCK:5, CS:6, MISO:7, MOSI:8)...", "info");
  SPI.begin(ETH_PHY_SPI_SCK, ETH_PHY_SPI_MISO, ETH_PHY_SPI_MOSI, ETH_PHY_CS);
  applyNetworkIPConfig();
  if (ETH.begin(ETH_PHY_TYPE, ETH_PHY_ADDR, ETH_PHY_CS, ETH_PHY_IRQ, ETH_PHY_RST, SPI)) {
    logger(String("[ETH] W5500 SPI Ethernet initialized. Waiting for PoE link / ") + (useDHCP ? "DHCP" : "Static IP") + "...", "info");
  } else {
    logger("[ETH] ERROR: ETH.begin returned false! Check AtomPoE hardware seating.", "error");
  }

  // 3. Setup MycilaESPConnect Network Manager
  // Listens to network state transitions for Wi-Fi fallback & Captive Portal
  espConnect.listen([](Mycila::ESPConnect::State previous, Mycila::ESPConnect::State current) {
    logger(String("[Network] State: ") + String((int)previous) + " -> " + String((int)current), "info");
    if (current == Mycila::ESPConnect::State::NETWORK_CONNECTED) {
      networkConnected = true;
      logger("[Network] Connected! IP: " + getNetworkIPStr(), "info");
      udp.begin(isETCCueSystem() ? cuesystem_port : atoi(tallyarbiter_TSLport));
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
    MDNS.addService("cuelx-tally", "udp", isETCCueSystem() ? cuesystem_port : atoi(tallyarbiter_TSLport));
    MDNS.addServiceTxt("cuelx-tally", "udp", "role", isPresenter() ? "presenter" : (isTP() ? "tp" : (isETCCueSystem() ? "cue" : "nmos")));
    MDNS.addServiceTxt("cuelx-tally", "udp", "mode", operatingMode.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "group", pairingGroup.c_str());
    MDNS.addServiceTxt("cuelx-tally", "udp", "name", listenerDeviceName.c_str());
    logger(String("[mDNS] Service _cuelx-tally._udp registered. Mode: ") + operatingMode + ", Name: " + listenerDeviceName, "info");
  }

  // Initial Screen Render
  renderScreen();

  // 6. Start Socket.IO background task pinned to Core 0 (PRO_CPU)
  // Isolating socket.loop() to Core 0 guarantees that TCP handshake timeouts
  // when Tally Arbiter is offline will NEVER block Core 1 (UI, clock, button, UDP tally).
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

  // 1. Process incoming packets with sub-millisecond latency (TSL 3.1 UDP, ETC CueSystem, NMOS IS-07)
  processIncomingTSL();

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

  // 3. Button Handling on AtomS3R Screen Button
  // Single click: Mode-aware action
  if (M5.BtnA.wasClicked()) {
    if (isETCCueSystem()) {
      logger(String("[Button] CueSystem Acknowledge button pressed for CH ") + String(cuesystem_channel), "info");
      cuesystem_ack_active = !cuesystem_ack_active;
      if (networkConnected) {
        sendCueAck();
      }
    } else if (isNMOSIS07()) {
      logger("[Button] NMOS IS-07 Tally toggle pressed", "info");
      nmos_is_on_air = !nmos_is_on_air;
      if (networkConnected) {
        sendNMOSTally(nmos_is_on_air);
      }
    } else {
      logger(String("[Button] Single Click: Toggle Cue CH1 (") + (isPresenter() ? "Presenter Preview" : "TP Program") + ")", "info");
      ch1state = !ch1state;
      if (networkConnected) {
        sendtally(1, ch1state);
      }
    }
    renderScreen();
  }

  // Double click: Switch screen
  if (M5.BtnA.wasDoubleClicked()) {
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

  // 4. Smooth 1-Second Clock & State Rollover Detection
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

  // Yield 1ms to FreeRTOS watchdog & idle task
  vTaskDelay(pdMS_TO_TICKS(1));
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
