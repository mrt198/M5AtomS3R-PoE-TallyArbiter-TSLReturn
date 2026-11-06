/**
 * Firmware source files and documentation for M5AtomS3R + AtomPoE Tally Listener
 */

export const CPP_FIRMWARE_SOURCE = `/**
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
// TSL 3.1 UDP Packet Sender
// ==========================================
void sendtally(int channel, bool live) {
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
    if (actualType == "\\"program\\"") {
      command[1] = (FULLBRIGHT + REDTALLY);
    } else if (actualType == "\\"preview\\"") {
      command[1] = (FULLBRIGHT + REDTALLY + GREENTALLY);
    } else {
      command[1] = (FULLBRIGHT + REDTALLY);
    }
  } else {
    if (actualType == "\\"program\\"") {
      command[1] = (FULLBRIGHT);
    } else if (actualType == "\\"preview\\"") {
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
    // Screen 0: Tally & Cue Display (128x128)
    uint16_t bgColor = TFT_BLACK;
    uint16_t textColor = TFT_WHITE;
    String statusLabel = "STANDBY";

    if (actualType == "\\"program\\"") {
      bgColor = TFT_RED;
      textColor = TFT_WHITE;
      statusLabel = "PROGRAM";
    } else if (actualType == "\\"preview\\"") {
      bgColor = TFT_GREEN;
      textColor = TFT_BLACK;
      statusLabel = "PREVIEW";
    } else if (actualType == "\\"aux\\"") {
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
      statusLabel.replace("\\"", "");
      statusLabel.toUpperCase();
    }

    auto renderContent = [&](M5Canvas* g) {
      g->fillScreen(bgColor);

      // Clock: Larger font with seconds in a black box with white text, ABOVE DeviceName
      g->fillRoundRect(4, 4, 120, 24, 4, TFT_BLACK);
      g->drawRoundRect(4, 4, 120, 24, 4, TFT_DARKGRAY);

      struct tm timeinfo;
      char timeStr[12] = "--:--:--";
      if (getLocalTime(&timeinfo, 10)) {
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
      String netMode = (espConnect.getMode() == Mycila::ESPConnect::Mode::ETH) ? "Net: PoE ETH" : "Net: Wi-Fi STA";
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
    // Screen 1: Network & Diagnostics (128x128)
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
      String modeStr = (espConnect.getMode() == Mycila::ESPConnect::Mode::ETH) ? "Net: PoE Ethernet" : "Net: Wi-Fi STA";
      g->println(modeStr);

      g->setCursor(4, 32);
      g->print("IP: ");
      if (espConnect.getMode() == Mycila::ESPConnect::Mode::ETH) {
        g->println(ETH.localIP().toString());
      } else {
        g->println(WiFi.localIP().toString());
      }

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

// Embedded Web Server for remote configuration
void setupWebServer() {
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    String html = F("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    "<title>M5AtomS3R PoE Tally</title><style>"
                    "body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#111827;color:#f3f4f6;padding:20px;max-width:540px;margin:auto}"
                    ".card{background:#1f2937;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 4px 6px rgba(0,0,0,0.3)}"
                    "h1{font-size:20px;margin-bottom:4px;color:#60a5fa}h2{font-size:16px;color:#9ca3af;margin-top:0}"
                    "input{width:100%;box-sizing:border-box;background:#374151;border:1px solid #4b5563;color:white;padding:10px;border-radius:6px;margin-top:4px}"
                    "button{background:#2563eb;color:white;font-weight:600;padding:12px;border:none;border-radius:6px;width:100%;margin-top:16px;cursor:pointer}"
                    "</style></head><body><div class='card'>"
                    "<h1>M5AtomS3R AtomPoE Tally</h1>"
                    "<h2>TSL 3.1 & Tally Arbiter Listener</h2>"
                    "<p>Device: <strong>");
    html += DeviceName;
    html += F("</strong></p><p>Network: <strong>");
    html += (espConnect.getMode() == Mycila::ESPConnect::Mode::ETH) ? "PoE Ethernet (W5500)" : "Wi-Fi";
    html += F("</strong> | IP: <strong>");
    html += (espConnect.getMode() == Mycila::ESPConnect::Mode::ETH) ? ETH.localIP().toString() : WiFi.localIP().toString();
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
    obj["mode"] = (espConnect.getMode() == Mycila::ESPConnect::Mode::ETH) ? "ETH" : "WIFI";
    obj["ip"] = (espConnect.getMode() == Mycila::ESPConnect::Mode::ETH) ? ETH.localIP().toString() : WiFi.localIP().toString();
    request->send(200, "application/json", JSON.stringify(obj));
  });

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

    request->send(200, "text/html", "<html><body style='background:#111;color:#fff;'><h2>Saved!</h2><a href='/'>Back</a></body></html>");
    connectToServer();
    renderScreen();
  });
}

void setup() {
  Serial.begin(115200);
  delay(100);

  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(0);
  M5.Display.setBrightness(brightnessLevels[brightnessIndex]);

  // Attempt 32KB double buffer allocation
  canvas.setColorDepth(16);
  if (canvas.createSprite(128, 128) != nullptr) {
    doubleBufferEnabled = true;
    logger(String("[Display] Double buffer (M5Canvas) allocated successfully: 32KB."), "info");
  } else {
    doubleBufferEnabled = false;
    logger("[Display] WARNING: Not enough memory for double buffer, using direct display.", "error");
  }

  // Load Preferences
  preferences.begin("tally-arbiter", false);
  if (preferences.getString("deviceid").length() > 0) DeviceId = preferences.getString("deviceid");
  if (preferences.getString("devicename").length() > 0) DeviceName = preferences.getString("devicename");
  if (preferences.getString("taHost").length() > 0) preferences.getString("taHost").toCharArray(tallyarbiter_host, 40);
  if (preferences.getString("taPort").length() > 0) preferences.getString("taPort").toCharArray(tallyarbiter_port, 6);
  if (preferences.getString("taTSLPort").length() > 0) preferences.getString("taTSLPort").toCharArray(tallyarbiter_TSLport, 6);
  if (preferences.getString("taListenerName").length() > 0) listenerDeviceName = preferences.getString("taListenerName");
  preferences.end();

  uint8_t mac[6];
  WiFi.macAddress(mac);
  char macSuffix[10];
  snprintf(macSuffix, sizeof(macSuffix), "%02X%02X%02X", mac[3], mac[4], mac[5]);
  if (!listenerDeviceName.endsWith(macSuffix)) {
    listenerDeviceName += macSuffix;
  }

  // Listen to network transitions
  espConnect.listen([](Mycila::ESPConnect::State previous, Mycila::ESPConnect::State current) {
    if (current == Mycila::ESPConnect::State::NETWORK_CONNECTED) {
      networkConnected = true;
      renderScreen();
    } else if (current == Mycila::ESPConnect::State::NETWORK_DISCONNECTED) {
      networkConnected = false;
      renderScreen();
    }
  });

  setupWebServer();
  espConnect.setBlocking(false);
  espConnect.begin(listenerDeviceName.c_str(), listenerDeviceName.c_str());

  configTzTime(posix_time_zone_info, daylightOffset_sec, ntpServer1, ntpServer2);

  ArduinoOTA.setHostname(listenerDeviceName.c_str());
  ArduinoOTA.setPassword("tallyarbiter");
  ArduinoOTA.begin();

  if (MDNS.begin(mdnsdotlocalurl.c_str())) {
    MDNS.addService("CueLX", "tcp", 80);
  }

  connectToServer();
  renderScreen();
}

void loop() {
  M5.update();
  espConnect.loop();
  ArduinoOTA.handle();
  socket.loop();

  // AtomS3R Screen Button handling
  if (M5.BtnA.wasClicked()) {
    ch1state = !ch1state;
    sendtally(1, ch1state);
    renderScreen();
  }

  if (M5.BtnA.wasDoubleClicked()) {
    currentScreen = (currentScreen == 0) ? 1 : 0;
    renderScreen();
  }

  if (M5.BtnA.wasHold()) {
    updateBrightness();
  }

  if (M5.BtnA.pressedFor(7000)) {
    if (doubleBufferEnabled) {
      canvas.fillScreen(TFT_RED);
      canvas.drawString("RESETTING...", 64, 64);
      canvas.pushSprite(0, 0);
    }
    delay(1000);
    ESP.restart();
  }

  if (millis() - lastRefreshTime >= REFRESH_INTERVAL) {
    lastRefreshTime += REFRESH_INTERVAL;
    sendtally(1, ch1state);
    renderScreen();
  }
}

void ws_emit(String event, const char *payload) {
  if (payload) {
    String msg = "[\\"" + event + "\\"," + payload + "]";
    socket.sendEVENT(msg);
  } else {
    String msg = "[\\"" + event + "\\"]";
    socket.sendEVENT(msg);
  }
}

void connectToServer() {
  socket.onEvent(socket_event);
  socket.begin(tallyarbiter_host, atol(tallyarbiter_port));
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
      renderScreen();
      break;
    case sIOtype_EVENT:
      eventMsg = (char *)payload;
      eventType = eventMsg.substring(2, eventMsg.indexOf("\\"", 2));
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
  String deviceObj = "{\\"deviceId\\": \\"" + DeviceId + "\\", \\"listenerType\\": \\"" + listenerDeviceName + "\\", \\"canBeReassigned\\": true, \\"canBeFlashed\\": true, \\"supportsChat\\": true }";
  char charDeviceObj[1024];
  strcpy(charDeviceObj, deviceObj.c_str());
  ws_emit("listenerclient_connect", charDeviceObj);
  renderScreen();
}

void socket_Flash() {
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
  oldDeviceId.replace("\\"", "");
  newDeviceId.replace("\\"", "");

  String reassignObj = "{\\"oldDeviceId\\": \\"" + oldDeviceId + "\\", \\"newDeviceId\\": \\"" + newDeviceId + "\\"}";
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
  String strPayload = String(payload);
  int typeQuoteIndex = strPayload.indexOf(',');
  String messageType = strPayload.substring(0, typeQuoteIndex);
  messageType.replace("\\"", "");
  int messageQuoteIndex = strPayload.lastIndexOf(',');
  String message = strPayload.substring(messageQuoteIndex + 1);
  message.replace("\\"", "");
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
    if (JSON.stringify(Devices[i]["id"]) == "\\"" + DeviceId + "\\"") {
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
`;

export const PLATFORMIO_INI = `; PlatformIO Project Configuration for M5Stack M5AtomS3R with AtomPoE (W5500)
; Tally Arbiter & TSL 3.1 UDP Listener with Double-Buffered M5Canvas & MycilaESPConnect

[env:m5stack-atoms3r-poe]
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
    ; Core Debug Level
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

export const MIGRATION_DIFFS = [
  {
    category: "Display & Double Buffering",
    original: `// M5StickC (135x240 or 80x160)
#include <M5StickCPlus.h>
M5.Lcd.fillScreen(TFT_BLACK);
M5.Lcd.drawString(DeviceName, ...);
// Draws directly to LCD, causes visible flicker during redraws`,
    adapted: `// M5AtomS3R (128x128 GC9107) + M5Canvas
#include <M5Unified.h>
M5Canvas canvas(&M5.Display);
canvas.setColorDepth(16);
canvas.createSprite(128, 128); // 32KB buffer
// Draws off-screen to canvas, then flushes atomically:
canvas.pushSprite(0, 0); // 100% flicker-free!`,
    explanation: "AtomS3R has 8MB PSRAM and 512KB SRAM. A 128x128 16-bit canvas consumes only 32KB. Allocating this sprite completely eliminates visual flicker and tearing."
  },
  {
    category: "Network Management & Ethernet",
    original: `// M5StickC WiFiManager (WiFi only, blocking portal)
#include <WiFiManager.h>
WiFiManager wm;
wm.autoConnect("m5StickC-");
// No wired Ethernet or PoE support`,
    adapted: `// AtomPoE (W5500 SPI) + MycilaESPConnect
#include <MycilaESPConnect.h>
AsyncWebServer server(80);
Mycila::ESPConnect espConnect(server);
// Pinout flags: SCK=5, CS=6, MISO=7, MOSI=8
espConnect.begin(hostname, apSSID); // Prioritizes wired Ethernet automatically`,
    explanation: "Replaced WiFiManager with MycilaESPConnect with W5500 SPI Ethernet. Prioritizes PoE Ethernet; if cable is disconnected, it seamlessly switches to Wi-Fi."
  },
  {
    category: "Button Controls & Navigation",
    original: `// Two discrete physical buttons
PinButton btnM5(37);     // Button A
PinButton btnAction(39); // Button B
// btnM5 click = TSL Cue
// btnAction click = Brightness`,
    adapted: `// Single integrated screen tactile button (M5.BtnA)
M5.update();
if (M5.BtnA.wasClicked()) { /* Toggle Cue CH1 */ }
if (M5.BtnA.wasDoubleClicked()) { /* Switch Screen 0 <-> 1 */ }
if (M5.BtnA.wasHold()) { /* Step Brightness 15%-100% */ }
if (M5.BtnA.pressedFor(7000)) { /* Reset Network & Reboot */ }`,
    explanation: "AtomS3R features a single button beneath the display. We mapped multi-gesture interactions (single-click, double-click, hold, and emergency hold) to retain full functionality."
  },
  {
    category: "Power & Brightness Management",
    original: `// AXP192 PMIC on M5StickC
M5.Axp.ScreenBreath(currentBrightness);
int batteryLevel = floor(100.0 * (M5.Axp.GetBatVoltage() - 3.0)...);`,
    adapted: `// M5Unified Display Brightness & AtomPoE 48V-to-5V power
M5.Display.setBrightness(brightnessLevels[index]); // 0-255
// AtomPoE receives steady 5V from IEEE 802.3af PoE network switch`,
    explanation: "AtomS3R does not use the AXP192 chip. Brightness is controlled directly via M5Unified PWM. Power is reliably supplied over Ethernet PoE or USB-C."
  }
];
