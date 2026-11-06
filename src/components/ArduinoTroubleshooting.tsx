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
    </div>
  );
};
