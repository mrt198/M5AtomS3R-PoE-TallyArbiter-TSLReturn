import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Copy, 
  Check, 
  Wrench, 
  ExternalLink, 
  FileCode, 
  Sparkles, 
  Cpu, 
  PackageCheck,
  FolderOpen
} from 'lucide-react';

export const ArduinoTroubleshooting: React.FC = () => {
  const [selectedSolution, setSelectedSolution] = useState<'quick_patch' | 'modern_lib'>('quick_patch');
  const [copiedPatch, setCopiedPatch] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  const fileLocation = `c:\\Users\\mark.thackeray\\OneDrive - Royal Opera House\\Documents\\Arduino\\libraries\\ESPAsyncWebServer\\src\\WebAuthentication.cpp`;

  const patchedCodeSnippet = `// In WebAuthentication.cpp lines 73-78:
bool getMD5(uint8_t * data, uint16_t len, char * output) {
  mbedtls_md5_context _ctx;
  char _buf[16];
  mbedtls_md5_init(&_ctx);
  // Remove the "_ret" suffix for mbedTLS 3.x (ESP32 Core 3.x):
  mbedtls_md5_starts(&_ctx);
  mbedtls_md5_update(&_ctx, data, len);
  mbedtls_md5_finish(&_ctx, (unsigned char *)_buf);
  mbedtls_md5_free(&_ctx);
  for (uint8_t i = 0; i < 16; i++) {
    sprintf(output + (i * 2), "%02x", (uint8_t)_buf[i]);
  }
  return true;
}`;

  const handleCopyPatch = () => {
    navigator.clipboard.writeText(patchedCodeSnippet);
    setCopiedPatch(true);
    setTimeout(() => setCopiedPatch(false), 2000);
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(fileLocation);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert */}
      <div className="bg-gradient-to-r from-red-950/80 via-neutral-900 to-amber-950/80 border border-red-800/60 rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-700/60 text-red-400 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Arduino IDE Build Error: <code className="text-red-300 font-mono text-sm">mbedtls_md5_starts_ret was not declared</code>
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  Known ESP-IDF 5 Issue
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                <strong>Why this occurs:</strong> ESP32 Arduino Core <strong>3.0+</strong> (required for AtomPoE W5500 SPI Ethernet) upgrades the underlying cryptography engine to <strong>mbedTLS 3.x</strong>. In mbedTLS 3.x, the obsolete legacy wrapper methods <code className="text-amber-200">_starts_ret</code>, <code className="text-amber-200">_update_ret</code>, and <code className="text-amber-200">_finish_ret</code> were removed in favor of standard <code className="text-emerald-300">mbedtls_md5_starts()</code>. The legacy 2020 version of <code className="text-neutral-300">ESPAsyncWebServer</code> still uses the old names.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="mt-5 flex gap-2 border-t border-neutral-800/80 pt-4">
          <button
            type="button"
            onClick={() => setSelectedSolution('quick_patch')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              selectedSolution === 'quick_patch'
                ? 'bg-red-900/60 text-red-200 border border-red-700 shadow-md shadow-red-950'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-red-400" />
            <span>Option 1: 10-Second Quick Patch (Fastest)</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedSolution('modern_lib')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              selectedSolution === 'modern_lib'
                ? 'bg-cyan-950 text-cyan-200 border border-cyan-700 shadow-md shadow-cyan-950'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Option 2: Install Modern Mathieu Carbou Library (Recommended)</span>
          </button>
        </div>
      </div>

      {/* Option 1: 10-Second Quick Patch */}
      {selectedSolution === 'quick_patch' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-red-900/80 text-red-300 text-xs font-bold flex items-center justify-center border border-red-700">
                1
              </span>
              <h3 className="text-sm font-bold text-white">
                Edit 3 Lines in your local <code className="text-cyan-400">WebAuthentication.cpp</code>
              </h3>
            </div>
            <button
              type="button"
              onClick={handleCopyPath}
              className="text-xs font-mono text-neutral-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{copiedPath ? 'Path Copied!' : 'Copy File Path'}</span>
            </button>
          </div>

          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-neutral-400 overflow-x-auto">
            <span className="text-neutral-500">File location:</span><br />
            <span className="text-cyan-300 select-all">{fileLocation}</span>
          </div>

          <div className="space-y-2 text-xs text-neutral-300 leading-relaxed">
            <p>
              Open that file in any editor (Notepad, VS Code, or Notepad++). Around <strong>line 74–76</strong>, you will see the <code className="text-amber-300">getMD5()</code> function.
            </p>
            <p>
              Simply remove the <code className="text-red-400 font-bold bg-neutral-950 px-1 py-0.5 rounded">_ret</code> suffix from the three function calls:
            </p>
          </div>

          {/* Visual Diff */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* Before */}
            <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-xl">
              <div className="text-red-400 font-bold mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span>BEFORE (Lines 74–76 — Fails in Core 3.0+):</span>
              </div>
              <pre className="text-neutral-300 overflow-x-auto text-[11px] leading-5">
{`mbedtls_md5_starts_ret(&_ctx);
mbedtls_md5_update_ret(&_ctx, data, len);
mbedtls_md5_finish_ret(&_ctx, _buf);`}
              </pre>
            </div>

            {/* After */}
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl">
              <div className="text-emerald-400 font-bold mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>AFTER (Fixed for mbedTLS 3.x / Core 3.0+):</span>
              </div>
              <pre className="text-emerald-300 overflow-x-auto text-[11px] leading-5">
{`mbedtls_md5_starts(&_ctx);
mbedtls_md5_update(&_ctx, data, len);
mbedtls_md5_finish(&_ctx, (unsigned char *)_buf);`}
              </pre>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-neutral-400">
              Save the file and hit <strong>Verify (Ctrl+R / Cmd+R)</strong> in Arduino IDE. The sketch will compile cleanly!
            </p>
            <button
              type="button"
              onClick={handleCopyPatch}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 border border-neutral-700 transition-colors"
            >
              {copiedPatch ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied Function</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy getMD5() Code</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Option 2: Modern Mathieu Carbou Library */}
      {selectedSolution === 'modern_lib' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-cyan-900/80 text-cyan-300 text-xs font-bold flex items-center justify-center border border-cyan-700">
              2
            </span>
            <h3 className="text-sm font-bold text-white">
              Install the Modernized <code className="text-cyan-400">ESPAsyncWebServer</code> Fork
            </h3>
          </div>

          <p className="text-xs text-neutral-300 leading-relaxed">
            The author of <strong>MycilaESPConnect</strong> (Mathieu Carbou) actively maintains modern forks of both 
            <code className="text-cyan-300"> ESPAsyncWebServer</code> and <code className="text-cyan-300">AsyncTCP</code> specifically 
            updated for ESP32 Arduino Core 3.x, ESP-IDF 5.x, and mbedTLS 3.x.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
              <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <span>Step 1: Close Arduino IDE</span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Close Arduino IDE to release file locks on the installed libraries folder.
              </p>
            </div>

            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
              <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <span>Step 2: Delete Old Folder</span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Delete or move the old <code className="text-neutral-200">ESPAsyncWebServer</code> folder in:
                <br />
                <span className="font-mono text-[10px] text-amber-300 break-all">Documents\Arduino\libraries\ESPAsyncWebServer</span>
              </p>
            </div>

            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
              <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <span>Step 3: Install via Library Manager</span>
              </div>
              <p className="text-[11px] text-neutral-400">
                Reopen Arduino IDE &gt; <strong>Tools &gt; Manage Libraries...</strong>
                <br />
                Search for <strong className="text-white">ESPAsyncWebServer</strong> by <strong className="text-cyan-300">Mathieu Carbou</strong> (or <strong className="text-cyan-300">ESP32Async</strong>) and install v3.6.0+.
              </p>
            </div>
          </div>

          <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-xl text-xs text-cyan-200 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong>Why this is ideal:</strong> Mathieu Carbou&apos;s library natively includes support for both ESP-IDF 4 and ESP-IDF 5, eliminates the need for any compatibility typedefs (<code className="text-neutral-100">AsyncWebServerRequestPtr</code>), and features zero-copy buffers for high-speed streaming.
            </div>
          </div>
        </div>
      )}

      {/* Arduino IDE Board Settings Checklist */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-bold text-white">
            Recommended Arduino IDE Tools Menu Configuration for M5AtomS3R
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
            <span className="text-neutral-500 block text-[11px]">Board</span>
            <span className="text-white font-bold">M5Stack AtomS3R</span>
            <span className="text-[10px] text-neutral-400 block mt-0.5">(or ESP32S3 Dev Module)</span>
          </div>

          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
            <span className="text-neutral-500 block text-[11px]">PSRAM</span>
            <span className="text-emerald-400 font-bold">OPI PSRAM</span>
            <span className="text-[10px] text-neutral-400 block mt-0.5">8MB Octal PSRAM enabled</span>
          </div>

          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
            <span className="text-neutral-500 block text-[11px]">Flash Size &amp; Partition</span>
            <span className="text-cyan-300 font-bold">8MB (64Mb)</span>
            <span className="text-[10px] text-neutral-400 block mt-0.5">8MB with spiffs/fat</span>
          </div>

          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
            <span className="text-neutral-500 block text-[11px]">USB CDC On Boot</span>
            <span className="text-purple-300 font-bold">Enabled</span>
            <span className="text-[10px] text-neutral-400 block mt-0.5">For Serial monitor @ 115200</span>
          </div>
        </div>
      </div>

      {/* Runtime & Ethernet Fixes Summary */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">
            Root Cause &amp; Fix: 4-Second Clock Freeze &amp; Slow Tally Response (ESP32-S3 Dual-Core Architecture)
          </h3>
        </div>

        <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl space-y-3 text-xs leading-relaxed">
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Dual-Core FreeRTOS Isolation Architecture Implemented</span>
          </div>
          <p className="text-neutral-200">
            <strong>Why it happened:</strong> Even with Ethernet connected, if the Tally Arbiter server is offline or unreachable at the configured IP/port, <code className="text-amber-300 font-mono">socket.loop()</code> triggers a synchronous TCP handshake inside <code className="text-neutral-200 font-mono">WiFiClient::connect()</code>. In lwIP, the SYN-ACK timeout is <strong>4000ms (4 seconds)</strong>. When executed in the main Arduino <code className="text-neutral-200 font-mono">loop()</code> on Core 1, it completely froze execution for 4 seconds on every reconnect cycle, halting clock updates, button clicks, and incoming UDP packets.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800">
              <span className="text-emerald-400 font-bold block mb-1">1. Pinned to Core 0</span>
              <p className="text-[11px] text-neutral-300">
                <code className="text-cyan-300 font-mono">socket.loop()</code> is moved to a background task pinned to <strong>Core 0 (PRO_CPU)</strong>. Any 4s network stall is confined to Core 0. Core 1 remains 100% free!
              </p>
            </div>
            <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800">
              <span className="text-cyan-400 font-bold block mb-1">2. Instant UDP Tally (&lt;1ms)</span>
              <p className="text-[11px] text-neutral-300">
                <code className="text-cyan-300 font-mono">processIncomingTSL()</code> runs on Core 1 at full speed, delivering instantaneous tally color changes without network delay.
              </p>
            </div>
            <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800">
              <span className="text-purple-400 font-bold block mb-1">3. Rollover Clock &amp; DNS Bypass</span>
              <p className="text-[11px] text-neutral-300">
                Clock detects exact second rollover with live uptime fallback. <code className="text-cyan-300 font-mono">IPAddress::fromString()</code> bypasses blocking DNS in <code className="text-neutral-200 font-mono">sendtally()</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
            <span className="text-amber-400 font-bold block">1. 5-Second Offline Stutter Fix</span>
            <p className="text-neutral-300 leading-relaxed text-[11px]">
              <strong>Cause:</strong> <code className="text-red-300">socket.loop()</code> was called unconditionally in <code className="text-neutral-200">loop()</code>. When offline, SocketIOclient blocks the MCU for 5000ms attempting TCP connect.
            </p>
            <p className="text-emerald-300 leading-relaxed text-[11px]">
              <strong>Fix:</strong> Gated <code className="text-cyan-300">socket.loop()</code> with <code className="text-cyan-300">if (networkConnected)</code>. Clock now ticks smoothly every second without any delay!
            </p>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
            <span className="text-cyan-400 font-bold block">2. W5500 Ethernet Direct Init</span>
            <p className="text-neutral-300 leading-relaxed text-[11px]">
              <strong>Cause:</strong> In Arduino IDE, sketch <code className="text-amber-300">#define</code>s don&apos;t reach compiled library files, so <code className="text-red-300">ETH.begin()</code> was never called by MycilaESPConnect.
            </p>
            <p className="text-emerald-300 leading-relaxed text-[11px]">
              <strong>Fix:</strong> Explicitly initialized <code className="text-cyan-300">SPI.begin(5, 7, 8, 6)</code> and <code className="text-cyan-300">ETH.begin(ETH_PHY_W5500, 1, 6, -1, -1, SPI)</code> with <code className="text-cyan-300">WiFi.onEvent()</code> DHCP listener.
            </p>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
            <span className="text-purple-400 font-bold block">3. Port 80 Connection Refused Fix</span>
            <p className="text-neutral-300 leading-relaxed text-[11px]">
              <strong>Cause:</strong> <code className="text-red-300">server.begin()</code> was missing from <code className="text-neutral-200">setupWebServer()</code>, so the kernel actively rejected incoming TCP packets with RST.
            </p>
            <p className="text-emerald-300 leading-relaxed text-[11px]">
              <strong>Fix:</strong> <code className="text-cyan-300">server.begin()</code> is now called explicitly, making the dashboard and REST API live immediately on port 80.
            </p>
          </div>
        </div>
      </div>

      {/* UniversalCueLight.ino: MDNS.IP and Type Assignment Fixes */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-bold text-white">
            Resolved: UniversalCueLight.ino Arduino IDE Errors (<code className="text-amber-300 font-mono">MDNS.IP</code> & <code className="text-amber-300 font-mono">char[]</code> types)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2">
            <span className="text-red-400 font-bold block flex items-center justify-between">
              <span>1. &apos;class MDNSResponder&apos; has no member named &apos;IP&apos;</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">ESP32 Core API</span>
            </span>
            <p className="text-neutral-300 font-sans text-xs leading-relaxed">
              <strong>Cause:</strong> In the ESP32 Arduino Core library <code className="text-neutral-200">ESPmDNS.h</code>, the method to retrieve a resolved service IP address is <code className="text-emerald-300 font-mono">MDNS.address(i)</code>, NOT <code className="text-red-300 font-mono">MDNS.IP(i)</code> (which was an older ESP8266 convention).
            </p>
            <div className="p-2.5 bg-neutral-900 rounded border border-neutral-800 text-[11px] text-emerald-300">
              ✓ Change <code className="text-red-300">MDNS.IP(i)</code> to <code className="text-emerald-300">MDNS.address(i)</code> at lines 1052 and 1057.
            </div>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2 md:col-span-2">
            <span className="text-amber-400 font-bold block flex items-center justify-between">
              <span>3. Periodic Reboot Every Few Minutes (<code className="text-amber-300">rst:0xc RTC_SW_CPU_RST</code>)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">Fixed</span>
            </span>
            <p className="text-neutral-300 font-sans text-xs leading-relaxed">
              <strong>Cause:</strong> In <code className="text-neutral-200">MycilaESPConnect</code>, the captive portal has a default timeout of 180 seconds and defaults to <code className="text-red-300 font-mono">autoRestart = true</code>. When the 180s timer elapsed, the state machine transitioned from <code className="text-neutral-200 font-mono">PORTAL_STARTED (10)</code> to <code className="text-neutral-200 font-mono">PORTAL_TIMEOUT (12)</code> and executed <code className="text-red-300 font-mono">ESP.restart()</code>.
            </p>
            <div className="p-2.5 bg-neutral-900 rounded border border-neutral-800 text-[11px] text-emerald-300 space-y-1">
              <div>✓ Configured <code className="text-cyan-300">espConnect.setAutoRestart(false)</code> in <code className="text-neutral-200 font-mono">setup()</code> to prohibit automatic reboots.</div>
              <div>✓ Used <code className="text-cyan-300">WiFi.enableAP(false)</code> to disable the Wi-Fi AP gracefully without deinitializing the LwIP network interface.</div>
            </div>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-2 md:col-span-2">
            <span className="text-cyan-400 font-bold block flex items-center justify-between">
              <span>4. Tally Arbiter Socket.IO Connection &amp; Settings Save Network Drop</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">Fixed</span>
            </span>
            <p className="text-neutral-300 font-sans text-xs leading-relaxed">
              <strong>Cause 1 (Tally Arbiter):</strong> Calling <code className="text-red-300 font-mono">esp_wifi_stop()</code> and <code className="text-red-300 font-mono">espConnect.end()</code> destroyed the shared LwIP <code className="text-neutral-200 font-mono">esp-netif</code> mappings used by <code className="text-neutral-200 font-mono">WiFiClient</code>, preventing <code className="text-neutral-200 font-mono">SocketIOclient</code> from opening TCP connections to Tally Arbiter over Ethernet.
            </p>
            <p className="text-neutral-300 font-sans text-xs leading-relaxed">
              <strong>Cause 2 (Network Drop on Save):</strong> The settings POST handler called <code className="text-red-300 font-mono">ETH.config(0,0,0,0)</code> unconditionally on every save, terminating the active DHCP lease while serving the HTTP response. In addition, dynamic CPU frequency switching disrupted the SPI clock to the W5500.
            </p>
            <div className="p-2.5 bg-neutral-900 rounded border border-neutral-800 text-[11px] text-emerald-300 space-y-1">
              <div>✓ Replaced destructive Wi-Fi teardown with safe <code className="text-cyan-300 font-mono">WiFi.enableAP(false)</code>; all Socket.IO and TCP traffic routes cleanly over Ethernet.</div>
              <div>✓ Added change-detection to <code className="text-cyan-300 font-mono">applyNetworkIPConfig()</code>: unchanged DHCP leases are preserved so the PoE network never drops.</div>
              <div>✓ Sent HTTP 200 response immediately before applying configurations, and restricted CPU frequency changes to when the clock frequency actually differs.</div>
              <div>✓ Added a 3-second keep-alive watchdog in <code className="text-neutral-200 font-mono">loop()</code> to maintain continuous connection to Tally Arbiter.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
