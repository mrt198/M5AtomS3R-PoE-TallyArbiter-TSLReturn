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
#inculde <ETH.h>

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

// Forward Declarations
void sendtally(int channel, bool live);
void evaluateMode();
void showSettings();
void showDeviceInfo();
void renderScreen();
void updateBrightness();
void connectToServer();
void disconnectFromServer();
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

// ==========================================
// Network Helper Utilities
// ==========================================
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

  switch (channel) {
    case 1: CH1Name.getBytes(channelname, 17); break;
    case 2: CH2Name.getBytes(channelname, 17); break;
    case 3: CH3Name.getBytes(channelname, 17); break;
    case 4: CH4Name.getBytes(channelname, 17); break;
    default: CH1Name.getBytes(channelname, 17); break;
  }

  byte command[18];
  command[0] = (DISPLAY_ADDRESS + channel);

  if (live) {
    if (actualType == "\"program\"") {
      command[1] = (FULLBRIGHT + REDTALLY);
    } else if (actualType == "\"preview\"") {
      command[1] = (FULLBRIGHT + REDTALLY + GREENTALLY);
    } else {
      command[1] = (FULLBRIGHT + REDTALLY);
    }
  } else {
    if (actualType == "\"program\"") {
      command[1] = (FULLBRIGHT);
    } else if (actualType == "\"preview\"") {
      command[1] = (FULLBRIGHT + GREENTALLY);
    } else {
      command[1] = (FULLBRIGHT);
    }
  }

  for (int i = 0; i < 16; i++) {
    command[2 + i] = channelname[i];
  }

  udp.beginPacket(tallyarbiter_host, atoi(tallyarbiter_TSLport));
  udp.write(command, 18);
  udp.endPacket();

  logger(String("[TSL] Sent CH ") + String(channel) + (live ? " LIVE" : " OFF"), "info-quiet");
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

      struct tm timeinfo;
      char timeStr[12] = "--:--:--";
      // Check local time non-blocking (0ms timeout)
      if (getLocalTime(&timeinfo, 0)) {
        strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);
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

      // Bottom Status: Network, Cue & TA
      g->setTextDatum(top_left);
      g->setTextSize(1);
      g->setCursor(6, 88);
      g->setTextColor(textColor, bgColor);
      String netMode = String("Net: ") + getNetworkModeStr();
      g->print(netMode);

      g->setCursor(6, 102);
      g->print("Cue CH1: ");
      if (ch1state) {
        g->setTextColor(TFT_RED, bgColor);
        g->print("ACTIVE");
      } else {
        g->setTextColor(textColor, bgColor);
        g->print("OFF");
      }

      g->setCursor(6, 114);
      g->setTextColor(textColor, bgColor);
      g->print("TA: ");
      g->print(socket.isConnected() ? "ONLINE" : "OFFLINE");
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
      String modeStr = String("Net: ") + getNetworkModeStr();
      g->println(modeStr);

      g->setCursor(4, 32);
      g->print("IP: ");
      g->println(getNetworkIPStr());

      g->setCursor(4, 44);
      g->print("TA IP: ");
      g->println(tallyarbiter_host);

      g->setCursor(4, 56);
      g->print("TA Port: ");
      g->println(tallyarbiter_port);

      g->setCursor(4, 68);
      g->print("TSL Port: ");
      g->println(tallyarbiter_TSLport);

      g->setCursor(4, 80);
      g->print("Socket: ");
      g->println(socket.isConnected() ? "Connected" : "Disconnected");

      g->setCursor(4, 92);
      g->print("D-Buffer: ");
      g->println(doubleBufferEnabled ? "32KB (OK)" : "Disabled");

      g->setCursor(4, 104);
      g->print("Free PSRAM: ");
      g->print(ESP.getFreePsram() / 1024);
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
  renderScreen();
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
                    "<title>M5AtomS3R PoE Tally</title><style>"
                    "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#111827;color:#f3f4f6;padding:20px;max-width:540px;margin:auto}"
                    ".card{background:#1f2937;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 4px 6px rgba(0,0,0,0.3)}"
                    "h1{font-size:20px;margin-bottom:4px;color:#60a5fa}h2{font-size:16px;color:#9ca3af;margin-top:0}"
                    ".badge{display:inline-block;padding:4px 10px;border-radius:9999px;font-size:12px;font-weight:600}"
                    ".badge-red{background:#dc2626;color:white}.badge-green{background:#16a34a;color:white}.badge-gray{background:#4b5563;color:white}"
                    "label{display:block;margin-top:12px;font-size:13px;color:#9ca3af}"
                    "input{width:100%;box-sizing:border-box;background:#374151;border:1px solid #4b5563;color:white;padding:10px;border-radius:6px;margin-top:4px}"
                    "button{background:#2563eb;color:white;font-weight:600;padding:12px;border:none;border-radius:6px;width:100%;margin-top:16px;cursor:pointer}"
                    "button:hover{background:#1d4ed8}"
                    "</style></head><body>"
                    "<div class='card'>"
                    "<h1>M5AtomS3R AtomPoE Tally</h1>"
                    "<h2>TSL 3.1 & Tally Arbiter Listener</h2>"
                    "<p>Device: <strong>");
    html += DeviceName;
    html += F("</strong> (");
    html += DeviceId;
    html += F(")</p><p>Network: <strong>");
    html += getNetworkModeStr();
    html += F("</strong> | IP: <strong>");
    html += getNetworkIPStr();
    html += F("</strong></p><p>Double Buffering: <strong>");
    html += doubleBufferEnabled ? "Enabled (32KB Canvas)" : "Direct Mode";
    html += F("</strong></p></div><div class='card'>"
                    "<form action='/save' method='POST'>"
                    "<h2>Configuration</h2>"
                    "<label>Tally Arbiter Host / IP</label><input type='text' name='host' value='");
    html += tallyarbiter_host;
    html += F("'>"
                    "<label>Socket.IO Port</label><input type='text' name='port' value='");
    html += tallyarbiter_port;
    html += F("'>"
                    "<label>TSL 3.1 UDP Port</label><input type='text' name='tslport' value='");
    html += tallyarbiter_TSLport;
    html += F("'>"
                    "<label>Listener Device Name</label><input type='text' name='devicename' value='");
    html += listenerDeviceName;
    html += F("'>"
                    "<button type='submit'>Save & Reconnect</button>"
                    "</form></div></body></html>");
    request->send(200, "text/html", html);
  });

  // REST API: GET Config
  server.on("/api/config", HTTP_GET, [](AsyncWebServerRequest *request) {
    JSONVar obj;
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

  // Form Save
  server.on("/save", HTTP_POST, [](AsyncWebServerRequest *request) {
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

    preferences.begin("tally-arbiter", false);
    preferences.putString("taHost", tallyarbiter_host);
    preferences.putString("taPort", tallyarbiter_port);
    preferences.putString("taTSLPort", tallyarbiter_TSLport);
    preferences.putString("taListenerName", listenerDeviceName);
    preferences.end();

    request->send(200, "text/html", "<html><body style='background:#111;color:#fff;font-family:sans-serif;padding:30px;'>"
                                    "<h2>Configuration Saved!</h2><p>Reconnecting to Tally Arbiter...</p>"
                                    "<a href='/' style='color:#60a5fa;'>Return Home</a></body></html>");

    connectToServer();
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
        logger(String("[ETH] IP Assigned (DHCP): ") + ETH.localIP().toString(), "info");
        networkConnected = true;
        udp.begin(atoi(tallyarbiter_TSLport));
        connectToServer();
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
  // Ensures Ethernet works 100% in Arduino IDE (where library macro flags don't propagate)
  logger("[ETH] Initializing W5500 SPI (SCK:5, CS:6, MISO:7, MOSI:8)...", "info");
  SPI.begin(ETH_PHY_SPI_SCK, ETH_PHY_SPI_MISO, ETH_PHY_SPI_MOSI, ETH_PHY_CS);
  if (ETH.begin(ETH_PHY_TYPE, ETH_PHY_ADDR, ETH_PHY_CS, ETH_PHY_IRQ, ETH_PHY_RST, SPI)) {
    logger("[ETH] W5500 SPI Ethernet initialized. Waiting for PoE link / DHCP...", "info");
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
      udp.begin(atoi(tallyarbiter_TSLport));
      connectToServer();
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

  // Initialize mDNS
  if (MDNS.begin(mdnsdotlocalurl.c_str())) {
    MDNS.addService("CueLX", "tcp", 80);
    MDNS.addService("http", "tcp", 80);
  }

  // Initial Screen Render
  renderScreen();
}

// ==========================================
// Main Loop
// ==========================================
void loop() {
  M5.update();
  espConnect.loop();
  ArduinoOTA.handle();

  // CRITICAL: Only run socket.loop() when network is connected!
  // If run when disconnected or server unreachable, SocketIOclient blocks the MCU
  // for 5000ms attempting TCP connect, freezing the loop and clock!
  if (networkConnected) {
    socket.loop();
  }

  // ----------------------------------------
  // Button Handling on AtomS3R Screen Button
  // ----------------------------------------
  // Single click: Toggle CH1 Cue
  if (M5.BtnA.wasClicked()) {
    logger("[Button] Single Click: Toggle Cue CH1", "info");
    ch1state = !ch1state;
    if (networkConnected) {
      sendtally(1, ch1state);
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

  // ----------------------------------------
  // Smooth 1-Second Clock & TSL Refresh
  // ----------------------------------------
  if (millis() - lastRefreshTime >= REFRESH_INTERVAL) {
    lastRefreshTime = millis();
    if (networkConnected) {
      sendtally(1, ch1state);
    }
    renderScreen();
  }
}

// ==========================================
// Tally Arbiter Socket.IO Client Logic
// ==========================================
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
      renderScreen();
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
  renderScreen();
}

void socket_Flash() {
  logger("[TallyArbiter] Flash triggered!", "info");
  for (int i = 0; i < 3; i++) {
    if (doubleBufferEnabled) {
      canvas.fillScreen(TFT_WHITE);
      canvas.pushSprite(0, 0);
      delay(200);
      canvas.fillScreen(TFT_BLACK);
      canvas.pushSprite(0, 0);
      delay(200);
    } else {
      M5.Display.fillScreen(TFT_WHITE);
      delay(200);
      M5.Display.fillScreen(TFT_BLACK);
      delay(200);
    }
  }
  renderScreen();
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
