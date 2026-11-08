import React from 'react';
import { Cpu, Network, Layers, ShieldCheck, Zap, AlertCircle } from 'lucide-react';

export const HardwareSpecs: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Pinout Mapping Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              AtomS3R to AtomPoE (W5500 SPI) Pin Assignment
            </h3>
          </div>
          <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
            ESP32-S3 Architecture
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400">
                <th className="py-2.5 px-3">W5500 Signal</th>
                <th className="py-2.5 px-3">AtomS3R GPIO</th>
                <th className="py-2.5 px-3">Legacy Atom Lite (Older)</th>
                <th className="py-2.5 px-3">Build Flag</th>
                <th className="py-2.5 px-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 text-neutral-300">
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-cyan-400">SPI_SCK (Clock)</td>
                <td className="py-3 px-3 font-bold text-white bg-neutral-950/60 rounded">GPIO 5</td>
                <td className="py-3 px-3 text-neutral-500">GPIO 22</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_SPI_SCK=5</td>
                <td className="py-3 px-3 text-neutral-400">SPI Bus Serial Clock</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-cyan-400">CS (Chip Select)</td>
                <td className="py-3 px-3 font-bold text-white bg-neutral-950/60 rounded">GPIO 6</td>
                <td className="py-3 px-3 text-neutral-500">GPIO 19</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_CS=6</td>
                <td className="py-3 px-3 text-neutral-400">Active-Low Chip Select</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-cyan-400">SPI_MISO</td>
                <td className="py-3 px-3 font-bold text-white bg-neutral-950/60 rounded">GPIO 7</td>
                <td className="py-3 px-3 text-neutral-500">GPIO 23</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_SPI_MISO=7</td>
                <td className="py-3 px-3 text-neutral-400">Master In Slave Out data line</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 font-bold text-cyan-400">SPI_MOSI</td>
                <td className="py-3 px-3 font-bold text-white bg-neutral-950/60 rounded">GPIO 8</td>
                <td className="py-3 px-3 text-neutral-500">GPIO 33</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_SPI_MOSI=8</td>
                <td className="py-3 px-3 text-neutral-400">Master Out Slave In data line</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 text-neutral-400">IRQ / INT</td>
                <td className="py-3 px-3 text-neutral-500">-1 (Unconnected)</td>
                <td className="py-3 px-3 text-neutral-500">-1</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_IRQ=-1</td>
                <td className="py-3 px-3 text-neutral-400">Not physically wired on AtomPoE base (polling)</td>
              </tr>
              <tr className="hover:bg-neutral-800/40">
                <td className="py-3 px-3 text-neutral-400">RST (Reset)</td>
                <td className="py-3 px-3 text-neutral-500">-1 (Unconnected)</td>
                <td className="py-3 px-3 text-neutral-500">-1</td>
                <td className="py-3 px-3 text-purple-300">-D ETH_PHY_RST=-1</td>
                <td className="py-3 px-3 text-neutral-400">Pulled high on AtomPoE PCB</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-3 bg-amber-950/30 border border-amber-900/40 rounded-xl text-xs text-amber-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Crucial Hardware Note:</strong> Older Atom tutorials reference GPIO 22, 19, 23, and 33. Because the 
            <strong> AtomS3R uses the ESP32-S3FN8</strong> chip, the internal header maps the W5500 SPI to 
            <strong> GPIO 5, 6, 7, and 8</strong>. Using the old pins will cause Ethernet initialization to fail!
          </span>
        </div>
      </div>

      {/* Double Buffering Math & Architecture */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-purple-400" />
          <h3 className="text-base font-bold text-white">
            Display Double-Buffering Architecture
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
            <p>
              On microcontrollers, refreshing an LCD by writing text or clearing the screen directly causes visible
              <strong> flicker and tearing</strong> because individual pixel writes happen while the display controller is scanning.
            </p>
            <p>
              The user requested: <em>&quot;The screen should double buffer if there is enough memory to prevent screen flicker during refresh&quot;</em>.
            </p>
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-neutral-400 space-y-1">
              <div className="text-white font-bold text-xs mb-1">Memory Calculation:</div>
              <div>Width × Height = 128 × 128 = 16,384 pixels</div>
              <div>Color Depth = 16 bits (RGB565) = 2 bytes / pixel</div>
              <div>Buffer Size = 16,384 × 2 = <strong className="text-purple-400">32,768 bytes (32 KB)</strong></div>
              <div>AtomS3R PSRAM = <strong className="text-emerald-400">8,388,608 bytes (8 MB)</strong></div>
              <div>Internal SRAM = <strong className="text-blue-400">524,288 bytes (512 KB)</strong></div>
            </div>
          </div>

          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 font-mono">
              <div className="text-purple-400 font-bold mb-2">// Implemented in firmware:</div>
              <pre className="text-[11px] text-neutral-300 overflow-x-auto space-y-1">
{`M5Canvas canvas(&M5.Display);
canvas.setColorDepth(16);

// Attempt 32KB allocation in PSRAM/SRAM:
if (canvas.createSprite(128, 128) != nullptr) {
  doubleBufferEnabled = true;
  // All drawing operations go to canvas off-screen
  // pushSprite flushes atomically in 1 SPI DMA burst:
  canvas.pushSprite(0, 0); 
} else {
  // Safe fallback to direct rendering
  doubleBufferEnabled = false;
}`}
              </pre>
            </div>
            <p className="text-[11px] text-neutral-400">
              The 32KB buffer consumes only <strong>0.39%</strong> of the 8MB Octal PSRAM on the AtomS3R, 
              ensuring 100% reliable allocation with vast headroom for network buffers and Socket.IO messages.
            </p>
          </div>
        </div>
      </div>
      {/* Protocols & Broadcast Integration Standards */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold text-white">
            Supported Protocols & Broadcast Standards
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
            <div className="text-red-400 font-bold mb-1 flex items-center justify-between">
              <span>ETC CueSystem Stage Cue</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">UDP 4000</span>
            </div>
            <p className="text-neutral-400 font-sans text-xs mt-1">
              Standard theatrical cue light system for opera houses and playhouses. Standby triggers flashing red until performer clicks the screen or hub receives ACK to turn solid red. Go displays green.
            </p>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
            <div className="text-cyan-400 font-bold mb-1 flex items-center justify-between">
              <span>NMOS IS-07 Endpoints</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">SMPTE ST 2110</span>
            </div>
            <p className="text-neutral-400 font-sans text-xs mt-1">
              Three independent endpoints for Program (Red), Preview (Green), and Aux (Amber) with priority arbitration. Emits IS-07 state events to NMOS IS-04 Registration Server on port 8235.
            </p>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
            <div className="text-indigo-400 font-bold mb-1 flex items-center justify-between">
              <span>rtpMIDI / AppleMIDI</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">UDP 5004</span>
            </div>
            <p className="text-neutral-400 font-sans text-xs mt-1">
              Standard AppleMIDI session on UDP 5004 with selectable channel (1–16 or Omni) and trigger modes (Note, CC, PC). Strict priority: Red &gt; Flash Red &gt; Green &gt; Yellow &gt; Blue &gt; White.
            </p>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
            <div className="text-teal-400 font-bold mb-1 flex items-center justify-between">
              <span>OSC UDP + Marquee Ticker</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">UDP 8000</span>
            </div>
            <p className="text-neutral-400 font-sans text-xs mt-1">
              Listens for <code className="text-teal-300">/cuelight/red</code>, <code className="text-teal-300">/flashred</code>, <code className="text-teal-300">/green</code>, <code className="text-teal-300">/yellow</code>, <code className="text-teal-300">/blue</code>, <code className="text-teal-300">/white</code>, and <code className="text-teal-300">/text</code>. Messages &gt; 116px smoothly scroll across the 128x128 LCD.
            </p>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
            <div className="text-purple-400 font-bold mb-1 flex items-center justify-between">
              <span>6-Axis IMU Auto-Rotation</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">MPU6886 / BMI270</span>
            </div>
            <p className="text-neutral-400 font-sans text-xs mt-1">
              Internal accelerometer checks tilt every 100ms. When mounted upside-down or sideways, automatically rotates the hardware scanout and M5Canvas buffer (0°, 90°, 180°, 270°) with 250ms debouncing.
            </p>
          </div>

          <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800">
            <div className="text-emerald-400 font-bold mb-1 flex items-center justify-between">
              <span>TSL 3.1 &amp; P2P Zero-Conf</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">UDP 8910</span>
            </div>
            <p className="text-neutral-400 font-sans text-xs mt-1">
              TSL 3.1 UDP tally listener with mDNS / DNS-SD discovery for standalone serverless pairing between Presenter and Technical Producer units.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};


