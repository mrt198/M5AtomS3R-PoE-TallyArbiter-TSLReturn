import React, { useState } from 'react';
import { 
  Tv, 
  FileCode, 
  ArrowRightLeft, 
  Globe, 
  Cpu, 
  Download, 
  Copy, 
  Check, 
  Sparkles,
  Layers,
  Radio,
  ExternalLink,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { AtomSimulator, SimulatorState } from './components/AtomSimulator';
import { CodeViewer } from './components/CodeViewer';
import { DiffViewer } from './components/DiffViewer';
import { WebPortalPreview } from './components/WebPortalPreview';
import { HardwareSpecs } from './components/HardwareSpecs';
import { ArduinoTroubleshooting } from './components/ArduinoTroubleshooting';
import { CPP_FIRMWARE_SOURCE, PLATFORMIO_INI } from './data/firmwareSources';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'diff' | 'portal' | 'hardware' | 'troubleshooting'>('simulator');
  const [copiedAll, setCopiedAll] = useState(false);

  // Simulator State
  const [simState, setSimState] = useState<SimulatorState>({
    tallyState: 'program',
    deviceName: 'CAM 1 PRES',
    deviceId: 'cam1_studio_a',
    isCueActive: false,
    currentScreen: 0,
    networkMode: 'ETH',
    ethernetCableConnected: true,
    brightnessLevel: 1, // 35%
    doubleBufferEnabled: true,
    taHost: '192.168.1.105',
    taPort: '4455',
    tslPort: '8910',
    flashActive: false,
  });

  // Track simulated TSL UDP transmission
  const [lastTslPacket, setLastTslPacket] = useState<{
    hex: string;
    decoded: string;
    timestamp: string;
    channel: number;
    live: boolean;
  } | null>({
    hex: '01 32 52 33 20 50 72 65 73 20 20 20 20 20 20 20 20 20',
    decoded: 'Addr:0x01 | Ctrl:0x32 (Red Tally) | Text:"R3 Pres         "',
    timestamp: '10:42:15',
    channel: 1,
    live: true
  });

  const handleSendTslPacket = (channel: number, live: boolean) => {
    const channelNames: Record<number, string> = {
      1: 'R3 Pres         ',
      2: 'Mic 2 Live      ',
      3: 'Mic 3 Live      ',
      4: 'Mic 4 Live      ',
    };
    const name = channelNames[channel] || 'R3 Pres         ';

    // Address byte
    const addrHex = (0x00 + channel).toString(16).padStart(2, '0').toUpperCase();
    
    // Control byte
    let ctrlByte = 0x30; // FULLBRIGHT
    if (live) {
      if (simState.tallyState === 'program') ctrlByte = 0x30 + 0x02; // FULLBRIGHT + REDTALLY (0x32)
      else if (simState.tallyState === 'preview') ctrlByte = 0x30 + 0x02 + 0x01; // RED + GREEN (0x33)
      else ctrlByte = 0x30 + 0x02;
    } else {
      if (simState.tallyState === 'preview') ctrlByte = 0x30 + 0x01; // GREENTALLY (0x31)
      else ctrlByte = 0x30;
    }
    const ctrlHex = ctrlByte.toString(16).padStart(2, '0').toUpperCase();

    // 16 ASCII bytes
    const nameHex = Array.from(name)
      .map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    const fullHex = `${addrHex} ${ctrlHex} ${nameHex}`;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    setLastTslPacket({
      hex: fullHex,
      decoded: `Addr:0x${addrHex} | Ctrl:0x${ctrlHex} | Text:"${name}"`,
      timestamp: timeStr,
      channel,
      live
    });
  };

  const downloadAllFiles = () => {
    const files = [
      { name: 'm5atoms3r_atompoe_tally_tsl.cpp', content: CPP_FIRMWARE_SOURCE },
      { name: 'platformio.ini', content: PLATFORMIO_INI }
    ];

    files.forEach(file => {
      const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };

  const handleCopyCpp = () => {
    navigator.clipboard.writeText(CPP_FIRMWARE_SOURCE);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Top Banner & Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 via-amber-500 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-red-950/40">
              <div className="w-full h-full bg-neutral-950 rounded-[10px] flex items-center justify-center">
                <Tv className="w-5 h-5 text-red-500" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  M5AtomS3R + AtomPoE Tally Listener
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 hidden sm:inline-block">
                  W5500 SPI + PoE
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Ported from M5StickC with MycilaESPConnect Ethernet, double-buffered GC9107 LCD &amp; TSL 3.1 UDP
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCpp}
              className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 border border-neutral-700 transition-colors cursor-pointer"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied .cpp</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy .cpp</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={downloadAllFiles}
              className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-md shadow-red-950 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Files</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex space-x-1 overflow-x-auto text-xs font-mono scrollbar-none border-t border-neutral-800/60 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`py-2.5 px-3.5 rounded-t-lg font-semibold flex items-center gap-2 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'simulator'
                ? 'border-red-500 text-white bg-neutral-850'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <Tv className="w-3.5 h-3.5 text-red-400" />
            <span>Interactive Simulator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`py-2.5 px-3.5 rounded-t-lg font-semibold flex items-center gap-2 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'code'
                ? 'border-cyan-500 text-white bg-neutral-850'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5 text-cyan-400" />
            <span>Adapted C++ Firmware</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('diff')}
            className={`py-2.5 px-3.5 rounded-t-lg font-semibold flex items-center gap-2 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'diff'
                ? 'border-purple-500 text-white bg-neutral-850'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-purple-400" />
            <span>Migration Comparison</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('portal')}
            className={`py-2.5 px-3.5 rounded-t-lg font-semibold flex items-center gap-2 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'portal'
                ? 'border-blue-500 text-white bg-neutral-850'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Web Portal (Port 80)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hardware')}
            className={`py-2.5 px-3.5 rounded-t-lg font-semibold flex items-center gap-2 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'hardware'
                ? 'border-emerald-500 text-white bg-neutral-850'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pinout &amp; Memory Specs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('troubleshooting')}
            className={`py-2.5 px-3.5 rounded-t-lg font-semibold flex items-center gap-2 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'troubleshooting'
                ? 'border-amber-500 text-white bg-neutral-850'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
            <span>Arduino IDE &amp; Build Fixes</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
              Fix
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'simulator' && (
          <AtomSimulator
            state={simState}
            setState={setSimState}
            onSendTslPacket={handleSendTslPacket}
            lastTslPacket={lastTslPacket}
          />
        )}

        {activeTab === 'code' && <CodeViewer />}

        {activeTab === 'diff' && <DiffViewer />}

        {activeTab === 'portal' && (
          <WebPortalPreview
            state={simState}
            setState={setSimState}
          />
        )}

        {activeTab === 'hardware' && <HardwareSpecs />}

        {activeTab === 'troubleshooting' && <ArduinoTroubleshooting />}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-850 bg-neutral-950 py-6 px-4 text-center text-xs text-neutral-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Target: M5Stack M5AtomS3R + AtomPoE (W5500 SPI Ethernet Base)</span>
          </div>
          <div>
            Libraries: MycilaESPConnect · M5Unified · M5GFX · SocketIOclient · Arduino_JSON
          </div>
        </div>
      </footer>
    </div>
  );
}
