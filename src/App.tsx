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
  AlertTriangle,
  BookOpen
} from 'lucide-react';
import { AtomSimulator, SimulatorState } from './components/AtomSimulator';
import { CodeViewer } from './components/CodeViewer';
import { DiffViewer } from './components/DiffViewer';
import { WebPortalPreview } from './components/WebPortalPreview';
import { HardwareSpecs } from './components/HardwareSpecs';
import { ArduinoTroubleshooting } from './components/ArduinoTroubleshooting';
import { UserManual } from './components/UserManual';
import { CPP_FIRMWARE_SOURCE, PLATFORMIO_INI } from './data/firmwareSources';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'diff' | 'portal' | 'hardware' | 'troubleshooting' | 'manual'>('simulator');
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
    operatingMode: 'TP',
    pairingGroup: 'Studio-1',
    pairedTargetIP: '192.168.1.120',
    pairedTargetName: 'Presenter-Cam1',
    presenterCueActive: false,
    useDHCP: true,
    staticIP: '192.168.1.150',
    staticMask: '255.255.255.0',
    staticGW: '192.168.1.1',
    staticDNS: '8.8.8.8',
    wifiDisabledForEth: false,
    // Power & Thermal Management (Item 10)
    cpuFrequency: 80,
    screenDimTimeout: 60,
    isScreenDimmed: false,
    // Timezone & Clock (Item 1)
    timezone: 'Europe/London',
    customTZPosix: 'GMT0BST,M3.5.0/1,M10.5.0',
    // MTC Reader (Item 4)
    mtcReaderEnabled: false,
    mtcTimecode: '01:00:00:00',
    // AtomENV Sensor (Item 9)
    envSensorEnabled: true,
    envTemperature: 22.4,
    envHumidity: 48.0,
    envPressure: 1013.2,
    // Promptside (Item 2)
    promptsidePort: 8000,
    promptsideChannel: 1,
    promptsideWingLabel: 'Prompt Corner',
    promptsideCueText: '',
    promptsideState: 'off',
    promptsideAckDone: false,
    // MSC rtpMIDI (Item 3)
    mscPort: 5004,
    mscDeviceId: 1,
    mscCmdFormat: 1,
    mscCurrentCue: '1.0',
    mscLastCommand: 'READY',
    mscState: 'off',
    // MIDI Button Return Action (Item 6)
    midiBtnType: 1,
    midiBtnChannel: 1,
    midiBtnNumber: 60,
    midiBtnPress: 127,
    midiBtnRelease: 0,
    // P2P Heartbeat & Disconnect (Item 7)
    p2pDisconnected: false,
    p2pMissed: 0,
    nmosAutoDiscover: true,
    tsl31Port: 8910,
    tsl31Transport: 'UDP',
    tsl31Address: 0,
    tsl31Name: 'CAM 1',
    tsl50Port: 8900,
    tsl50Transport: 'UDP',
    tsl50Screen: 0,
    tsl50Index: 0,
    tsl50Name: 'STUDIO A',
    oscCuePort: 53000,
    oscCueStation: '1',
    oscCueBanner: 'CUE LIGHT - STAGE LEFT',
    oscCueMessage: '',
    oscCueState: 'off',
    oscCueAckDone: false,
    cueHost: '192.168.1.50',
    cuePort: 4000,
    cueChannel: 1,
    cueAckActive: false,
    cueState: 'off',
    nmosHost: '192.168.1.200',
    nmosPort: 8235,
    nmosSource: 'm5atoms3r-tally-source-01',
    nmosTopic: 'device/tally/state',
    nmosProgramTopic: 'tally/program',
    nmosPreviewTopic: 'tally/preview',
    nmosAuxTopic: 'tally/aux',
    nmosOnAir: false,
    nmosPreview: false,
    nmosAux: false,
    rtpMidiPort: 5004,
    rtpMidiChannel: 1,
    rtpMidiTriggerType: 0,
    rtpMidiNumRed: 60,
    rtpMidiNumFlashRed: 61,
    rtpMidiNumGreen: 62,
    rtpMidiNumYellow: 63,
    rtpMidiNumBlue: 64,
    rtpMidiNumWhite: 65,
    rtpMidiState: {
      red: false,
      flashRed: false,
      green: false,
      yellow: false,
      blue: false,
      white: false
    },
    oscPort: 8000,
    oscPrefix: '/cuelight',
    oscCustomMessage: '',
    oscState: {
      red: false,
      flashRed: false,
      green: false,
      yellow: false,
      blue: false,
      white: false
    },
    imuRotation: 0
  });

  // Track simulated UDP transmission
  const [lastTslPacket, setLastTslPacket] = useState<{
    hex: string;
    decoded: string;
    timestamp: string;
    channel: number;
    live: boolean;
  } | null>({
    hex: '01 32 52 33 20 50 72 65 73 20 20 20 20 20 20 20 20 20',
    decoded: 'Addr:0x01 | Ctrl:0x32 (Red Tally - Program Return) | Text:"R3 Pres         "',
    timestamp: '10:42:15',
    channel: 1,
    live: true
  });

  const handleSendTslPacket = (channel: number, live: boolean) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    if (simState.operatingMode === 'TSL_31') {
      const addrByte = (0x80 + (simState.tsl31Address & 0x7F)).toString(16).padStart(2, '0').toUpperCase();
      const ctrlByte = (0x30 + (live ? 0x02 : 0x00)).toString(16).padStart(2, '0').toUpperCase();
      const paddedName = (simState.tsl31Name || 'CAM 1').padEnd(16, ' ').slice(0, 16);
      const nameHex = Array.from(paddedName).map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
      setLastTslPacket({
        hex: `${addrByte} ${ctrlByte} ${nameHex}`,
        decoded: `TSL 3.1 (${simState.tsl31Transport} :${simState.tsl31Port}) Addr:${simState.tsl31Address} | Ctrl:${live ? 'Red (Tally 1)' : 'Off'} | Centered: "${paddedName.trim()}"`,
        timestamp: timeStr,
        channel: simState.tsl31Address,
        live
      });
      return;
    }

    if (simState.operatingMode === 'TSL_50') {
      const paddedName = (simState.tsl50Name || 'STUDIO A').padEnd(16, ' ').slice(0, 16);
      setLastTslPacket({
        hex: `00 00 00 00 00 01 00 00 ${live ? '00 01' : '00 00'} ...`,
        decoded: `TSL 5.0 (${simState.tsl50Transport} :${simState.tsl50Port}) Screen:${simState.tsl50Screen} Index:${simState.tsl50Index} | Tally:${live ? 'Red' : 'Off'} | Centered: "${paddedName.trim()}"`,
        timestamp: timeStr,
        channel: simState.tsl50Index,
        live
      });
      return;
    }

    if (simState.operatingMode === 'OSC_CueLight') {
      const addr = `/cuelight/state/${simState.oscCueStation}/ack`;
      const hex = Array.from(addr).map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
      setLastTslPacket({
        hex: `${hex} 2C 73 00 00 61 63 6B 00`,
        decoded: `OSC Cue Light (UDP ${simState.oscCuePort}) RSMCK ACK: "${addr}" -> Station ${simState.oscCueStation}`,
        timestamp: timeStr,
        channel: parseInt(simState.oscCueStation) || 1,
        live
      });
      return;
    }

    if (simState.operatingMode === 'ETC_CueSystem') {
      const payload = `CS,${simState.cueChannel},ACK\n`;
      const hex = Array.from(payload).map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
      setLastTslPacket({
        hex,
        decoded: `ETC CueSystem Outstation ACK: "CS,${simState.cueChannel},ACK" -> ${simState.cueHost}:${simState.cuePort}`,
        timestamp: timeStr,
        channel: simState.cueChannel,
        live
      });
      return;
    }

    if (simState.operatingMode === 'NMOS_IS07') {
      const payload = `{"topic":"${simState.nmosProgramTopic}","payload":{"value":${live}}}`;
      const hex = Array.from(payload).slice(0, 18).map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
      setLastTslPacket({
        hex,
        decoded: `NMOS IS-07 Event: ${payload} -> ${simState.nmosHost}:${simState.nmosPort}`,
        timestamp: timeStr,
        channel: 1,
        live
      });
      return;
    }

    if (simState.operatingMode === 'RTP_MIDI') {
      const hex = `90 ${simState.rtpMidiNumRed.toString(16).toUpperCase()} ${live ? '7F' : '00'}`;
      setLastTslPacket({
        hex,
        decoded: `rtpMIDI AppleMIDI (UDP ${simState.rtpMidiPort}) Ch:${simState.rtpMidiChannel} ${live ? 'NoteOn' : 'NoteOff'} Note:${simState.rtpMidiNumRed} Vel:${live ? 127 : 0}`,
        timestamp: timeStr,
        channel: 1,
        live
      });
      return;
    }

    if (simState.operatingMode === 'Promptside') {
      const addr = `/promptside/channel/${channel}/ack`;
      const hex = Array.from(addr).map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
      setLastTslPacket({
        hex: `${hex} 2C 69 00 00 00 00 00 01`,
        decoded: `Promptside Outstation ACK (UDP ${simState.promptsidePort}): ${addr} [i: 1] -> Promptside Host`,
        timestamp: timeStr,
        channel,
        live
      });
      return;
    }

    if (simState.operatingMode === 'MSC_RTP_MIDI') {
      const hex = `F0 7F ${simState.mscDeviceId.toString(16).padStart(2, '0').toUpperCase()} 02 01 01 F7`;
      setLastTslPacket({
        hex,
        decoded: `MSC / rtpMIDI Button Return: Dev:${simState.mscDeviceId} Ch:${simState.midiBtnChannel} Num:${simState.midiBtnNumber} PressVal:${simState.midiBtnPress}`,
        timestamp: timeStr,
        channel: 1,
        live
      });
      return;
    }

    if (simState.operatingMode === 'OSC') {
      const addr = `${simState.oscPrefix}/red`;
      const hex = Array.from(addr).map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(' ');
      setLastTslPacket({
        hex: `${hex} 2C 69 00 00 ${live ? '01' : '00'}`,
        decoded: `OSC UDP (Port ${simState.oscPort}): ${addr} [i: ${live ? 1 : 0}]`,
        timestamp: timeStr,
        channel: 1,
        live
      });
      return;
    }

    const channelNames: Record<number, string> = {
      1: 'R3 Pres         ',
      2: 'Mic 2 Live      ',
      3: 'Mic 3 Live      ',
      4: 'Mic 4 Live      ',
    };
    const name = channelNames[channel] || 'R3 Pres         ';

    // Address byte
    const addrHex = (0x00 + channel).toString(16).padStart(2, '0').toUpperCase();
    
    // Control byte:
    // Presenter mode sends TSL Preview (0x31) on button click
    // TP mode sends TSL Program (0x32) on button click
    const isPresenter = simState.operatingMode === 'Presenter' || simState.operatingMode === 'Presenter_P2P';
    let ctrlByte = 0x30; // FULLBRIGHT (Off)
    let cueDescription = 'Standby / Off';

    if (isPresenter) {
      if (live) {
        ctrlByte = 0x30 + 0x01; // 0x31: FULLBRIGHT + GREENTALLY (Preview cue)
        cueDescription = 'Preview Return (0x31 Green)';
      }
    } else {
      if (live) {
        ctrlByte = 0x30 + 0x02; // 0x32: FULLBRIGHT + REDTALLY (Program return)
        cueDescription = 'Program Return (0x32 Red)';
      }
    }

    const ctrlHex = ctrlByte.toString(16).padStart(2, '0').toUpperCase();

    // 16 ASCII bytes
    const nameHex = Array.from(name)
      .map(c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    const fullHex = `${addrHex} ${ctrlHex} ${nameHex}`;

    setLastTslPacket({
      hex: fullHex,
      decoded: `Addr:0x${addrHex} | Ctrl:0x${ctrlHex} (${cueDescription}) | Text:"${name}"`,
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

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`py-2.5 px-3.5 rounded-t-lg font-semibold flex items-center gap-2 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'manual'
                ? 'border-sky-500 text-white bg-neutral-850'
                : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>User Manual &amp; Docs</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
              13 Modes
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

        {activeTab === 'manual' && <UserManual />}
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
