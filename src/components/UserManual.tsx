import React, { useState } from 'react';
import { 
  BookOpen, 
  Radio, 
  Cpu, 
  Layers, 
  Activity, 
  Tv, 
  Music, 
  Sliders, 
  Clock, 
  Thermometer, 
  Compass, 
  ShieldAlert, 
  CheckCircle2, 
  Copy, 
  Check, 
  ExternalLink,
  Zap,
  Sparkles,
  Info
} from 'lucide-react';

export function UserManual() {
  const [activeSection, setActiveSection] = useState<string>('modes');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 border border-slate-700/60 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg border border-sky-500/30">
                <BookOpen className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">System User Manual & Protocol Reference</h1>
            </div>
            <p className="text-slate-400 text-sm max-w-2xl">
              Complete engineering manual for the M5AtomS3R + AtomPoE Broadcast Tally & Theatrical Cue System.
              Details all 14 operating modes, wiring pinouts, third-party software integration guides, and live APIs.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/manual"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold rounded-lg border border-slate-600 transition shadow"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Raw HTML (/manual)
            </a>
          </div>
        </div>
      </div>

      {/* Navigation Pills */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'modes', label: '14 Operating Modes', icon: Layers },
          { id: 'power', label: 'PoE Thermal & Low Power', icon: Zap },
          { id: 'p2p', label: 'P2P Heartbeat & Alarm', icon: ShieldAlert },
          { id: 'midi', label: 'rtpMIDI & MSC Control', icon: Music },
          { id: 'promptside', label: 'Promptside System', icon: Radio },
          { id: 'mtc', label: 'MTC Timecode Reader', icon: Clock },
          { id: 'env', label: 'AtomENV Sensor & API', icon: Thermometer },
          { id: 'imu', label: 'Auto-Orientation (IMU)', icon: Compass },
          { id: 'pinout', label: 'Hardware Specs & Pinouts', icon: Cpu },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activeSection === tab.id
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SECTION: 14 Operating Modes */}
      {activeSection === 'modes' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-sky-400" />
              Overview of the 14 Operating Modes
            </h2>
            <p className="text-slate-300 text-sm">
              The M5AtomS3R + AtomPoE firmware contains a universal protocol stack that allows the unit to transform into any of the following roles simply by selecting it in the web interface:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {[
                {
                  mode: 'TP (Technical Producer)',
                  badge: 'Tally Arbiter',
                  color: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
                  desc: 'Connects to Tally Arbiter over Socket.IO (port 4455). Receives multi-source program/preview tally. Clicking screen button returns a TSL 3.1 Program tally (0x32).'
                },
                {
                  mode: 'Presenter Mode',
                  badge: 'Tally Arbiter',
                  color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
                  desc: 'Connects to Tally Arbiter. When talent presses the screen button, sends a TSL 3.1 Preview tally (0x31) back to alert control room without taking camera live.'
                },
                {
                  mode: 'TP Standalone (P2P Master)',
                  badge: 'Zero-Conf P2P',
                  color: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
                  desc: 'Direct unit-to-unit operation without Tally Arbiter. Exchanges 250ms heartbeats with Presenter units and displays prominent call cues.'
                },
                {
                  mode: 'Presenter Standalone (P2P Slave)',
                  badge: 'Zero-Conf P2P',
                  color: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
                  desc: 'Direct unit-to-unit operation. Talent pushes button to call TP unit over TSL 3.1 UDP. Monitors connection health with 4-missed fault alarm.'
                },
                {
                  mode: 'ETC CueSystem Outstation',
                  badge: 'Theatrical Cue',
                  color: 'bg-red-500/20 text-red-400 border-red-500/40',
                  desc: 'Listens for ASCII CS,<ch>,STANDBY or CUE:<ch>:STANDBY. Flashes red until talent acknowledges with button (solid red) and returns ACK to desk.'
                },
                {
                  mode: 'AMWA NMOS IS-07 Event & Tally',
                  badge: 'SMPTE ST 2110',
                  color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
                  desc: 'Broadcast IP tally. Discovers IS-04 Registration Server via DNS-SD (_nmos-registration._tcp) and routes Program (Red), Preview (Green), Aux (Amber).'
                },
                {
                  mode: 'Promptside Theatrical System',
                  badge: 'promptside.co',
                  color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40',
                  desc: 'Integrates with Promptside cue lights on UDP 8000. Handles /standby (flashing red), button ACK (/ack 1), /go (green), /off, and /text cue notes.'
                },
                {
                  mode: 'MIDI Show Control (MSC RP-002)',
                  badge: 'AppleMIDI 5004',
                  color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
                  desc: 'Parses standard MSC SysEx commands: 01 GO, 02 STOP, 0B STANDBY+, displaying cue numbers (e.g. CUE 42.1) received from lighting/sound desks.'
                },
                {
                  mode: 'rtpMIDI / AppleMIDI Outstation',
                  badge: 'DAW & QLab',
                  color: 'bg-teal-500/20 text-teal-400 border-teal-500/40',
                  desc: 'Connects to macOS Audio MIDI Setup & rtpMIDI driver. Drives Red, Flashing Red, Green, Yellow, Blue, White with customizable Note/CC/PC feedback.'
                },
                {
                  mode: 'OSC (Open Sound Control)',
                  badge: 'UDP Port 8000',
                  color: 'bg-violet-500/20 text-violet-400 border-violet-500/40',
                  desc: 'Listens for OSC color commands with address prefix (/cuelight/red, /green) and smooth scrolling text messages on /cuelight/text.'
                },
                {
                  mode: 'TSL UMD v3.1 Dedicated Listener',
                  badge: 'UDP / TCP 8910',
                  color: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
                  desc: 'Direct TSL 3.1 receiver (18 bytes). Decodes tally flags (Red, Green, Amber) and centers 16-character source name prominently on screen.'
                },
                {
                  mode: 'TSL UMD v5.0 Dedicated Listener',
                  badge: 'UDP / TCP 8900',
                  color: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
                  desc: 'Direct binary TSL 5.0 receiver. Parses 4 tally flags (Red, Green, Amber, Blue) and UTF-8 source label with screen/index filtering.'
                },
                {
                  mode: 'OSC Cue Light (RSMCK Protocol)',
                  badge: 'iOS Port 53000',
                  color: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
                  desc: 'Compatible with RSMCK OSC Cue Light iOS app. Matches station ID, handles /standby_ack, returns ACK to iPad, and shows top banner.'
                },
                {
                  mode: 'vMix Live Production Tally',
                  badge: 'TCP API 8099',
                  color: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
                  desc: 'Connects directly to vMix TCP API (SUBSCRIBE TALLY). Shows Red for Program (1), Green for Preview (2), and optional PreviewInput / ActiveInput button triggers.'
                }
              ].map((item, idx) => (
                <div key={idx} className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-white text-sm">{idx + 1}. {item.mode}</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.color}`}>
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION: P2P Heartbeat & Alarm */}
      {activeSection === 'p2p' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white">Standalone P2P Heartbeat & Fault Alarm (0.25s)</h2>
            </div>
            <p className="text-slate-300 text-sm">
              In production environments where no server or router is present (e.g. OB vans or live theater rigs), TP and Presenter units operate in standalone peer-to-peer mode over Ethernet or Wi-Fi.
            </p>

            <div className="bg-amber-950/30 border border-amber-500/40 rounded-lg p-4 space-y-2">
              <h4 className="text-amber-300 font-semibold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4" /> 0.25-Second Heartbeat Protocol:
              </h4>
              <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-1">
                <li>Every <strong>250ms (0.25s)</strong>, each paired unit transmits a UDP ping: <code>CXPING,&lt;group&gt;,&lt;seq&gt;,&lt;name&gt;</code></li>
                <li>The receiver immediately returns a pong: <code>CXPONG,&lt;group&gt;,&lt;seq&gt;,&lt;name&gt;</code></li>
                <li>If <strong>more than 4 consecutive heartbeats are missed (&gt; 1000ms elapsed)</strong>, the unit declares a disconnection fault.</li>
              </ul>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2">
              <h4 className="text-white font-semibold text-sm">Alarm Indicators on Disconnect:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="bg-yellow-500/20 border border-yellow-500/40 p-3 rounded text-center">
                  <div className="text-yellow-400 font-bold text-xs uppercase">Flashing Screen</div>
                  <div className="text-slate-300 text-[11px] mt-1">Screen flashes high-visibility Yellow and Black</div>
                </div>
                <div className="bg-red-500/20 border border-red-500/40 p-3 rounded text-center">
                  <div className="text-red-400 font-bold text-xs uppercase">DISCONNECTED Tag</div>
                  <div className="text-slate-300 text-[11px] mt-1">Center status badge reads "DISCONNECTED"</div>
                </div>
                <div className="bg-slate-700/40 border border-slate-600/40 p-3 rounded text-center">
                  <div className="text-cyan-400 font-bold text-xs uppercase">PEER LOST Alert</div>
                  <div className="text-slate-300 text-[11px] mt-1">Bottom line shows &quot;&gt;&gt;&gt; PEER LOST - SEARCHING &lt;&lt;&lt;&quot;</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: rtpMIDI & MSC */}
      {activeSection === 'midi' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold text-white">rtpMIDI (AppleMIDI) & MIDI Show Control (MSC RP-002)</h2>
            </div>
            <p className="text-slate-300 text-sm">
              The AtomS3R firmware contains a full native AppleMIDI session initiator and responder on UDP port 5004. It connects natively to macOS Audio MIDI Setup, the rtpMIDI driver on Windows, and directly to QLab, Logic Pro, and lighting consoles.
            </p>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-white text-sm">Standard MSC SysEx Command Mapping:</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400">
                      <th className="p-2 border border-slate-700">MSC Command</th>
                      <th className="p-2 border border-slate-700">Hex Code</th>
                      <th className="p-2 border border-slate-700">Tally Color / State</th>
                      <th className="p-2 border border-slate-700">Display Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    <tr>
                      <td className="p-2 border border-slate-700 font-mono">GO</td>
                      <td className="p-2 border border-slate-700 font-mono">0x01</td>
                      <td className="p-2 border border-slate-700 text-emerald-400 font-semibold">Solid Green</td>
                      <td className="p-2 border border-slate-700">Displays "GO" and cue number</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-slate-700 font-mono">STOP / STANDBY</td>
                      <td className="p-2 border border-slate-700 font-mono">0x02</td>
                      <td className="p-2 border border-slate-700 text-red-400 font-semibold">Solid Red</td>
                      <td className="p-2 border border-slate-700">Displays "STANDBY" and target cue</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-slate-700 font-mono">STANDBY+</td>
                      <td className="p-2 border border-slate-700 font-mono">0x0B</td>
                      <td className="p-2 border border-slate-700 text-red-400 font-semibold">Flashing Red</td>
                      <td className="p-2 border border-slate-700">Displays "STANDBY+" awaiting cue go</td>
                    </tr>
                    <tr>
                      <td className="p-2 border border-slate-700 font-mono">ALL_OFF / RESET</td>
                      <td className="p-2 border border-slate-700 font-mono">0x08 / 0x0A</td>
                      <td className="p-2 border border-slate-700 text-slate-400 font-semibold">Black (Off)</td>
                      <td className="p-2 border border-slate-700">Clears tally status</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-white text-sm">MIDI Hardware Button Return Action:</h3>
              <p className="text-slate-300 text-xs">
                When operating in MIDI modes, clicking the AtomS3R screen button transmits a configured MIDI message back to the host computer:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <span className="text-slate-400">Type:</span> <strong className="text-white">Note/CC/PC</strong>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <span className="text-slate-400">Channel:</span> <strong className="text-white">1 - 16</strong>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <span className="text-slate-400">Number:</span> <strong className="text-white">0 - 127</strong>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-700">
                  <span className="text-slate-400">Velocity:</span> <strong className="text-white">0 - 127</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: Promptside System */}
      {activeSection === 'promptside' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-fuchsia-400" />
              <h2 className="text-xl font-bold text-white">Promptside Theatrical System (promptside.co)</h2>
            </div>
            <p className="text-slate-300 text-sm">
              The Promptside mode provides first-class support for the modern digital cue light platform used across major West End and Broadway theatrical productions.
            </p>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-white text-sm">Supported OSC Address Endpoints:</h3>
              <div className="space-y-2 font-mono text-xs">
                <div className="bg-slate-900 p-2 rounded border border-slate-700 flex justify-between">
                  <span>/promptside/channel/[ch]/standby [text]</span>
                  <span className="text-red-400">Flashing Red (Awaiting ACK)</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-700 flex justify-between">
                  <span>/promptside/channel/[ch]/ack</span>
                  <span className="text-emerald-400">Solid Red (Acknowledged)</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-700 flex justify-between">
                  <span>/promptside/channel/[ch]/go [text]</span>
                  <span className="text-emerald-400">Solid Green (Cue Go!)</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-700 flex justify-between">
                  <span>/promptside/channel/[ch]/off</span>
                  <span className="text-slate-400">Cue Off</span>
                </div>
                <div className="bg-slate-900 p-2 rounded border border-slate-700 flex justify-between">
                  <span>/promptside/channel/[ch]/text [str]</span>
                  <span className="text-cyan-400">Displays Scrolling Cue Note</span>
                </div>
              </div>
            </div>

            <div className="bg-fuchsia-950/20 border border-fuchsia-500/30 rounded-lg p-4 text-xs text-fuchsia-200 space-y-1">
              <p className="font-semibold">Performer Acknowledgment Workflow:</p>
              <p>When the Stage Manager presses Standby on the console, the outstation flashes red. When talent presses the physical AtomS3R screen button, the outstation turns solid red and immediately sends <code>/promptside/channel/[ch]/ack 1</code> back to the Promptside corner console.</p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: MTC Timecode Reader */}
      {activeSection === 'mtc' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold text-white">MTC (MIDI Time Code) Reader</h2>
            </div>
            <p className="text-slate-300 text-sm">
              When the global <strong>MTC Reader</strong> option is enabled in Web configuration, the top header on Screen 0 transforms from an NTP clock into an ultra-precise, real-time SMPTE timecode readout.
            </p>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-white text-sm">Timecode Decoding Specs:</h3>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1.5">
                <li>Parses standard <strong>Quarter-Frame messages</strong> (status byte <code>0xF1</code>): 8 pieces assembled per 2 frames.</li>
                <li>Parses <strong>Full-Frame SysEx messages</strong> (<code>0xF0 0x7F ... 01 01 hr min sec fr 0xF7</code>) on cue jumps and locator scrubbing.</li>
                <li>Supports standard frame rates: <strong>24 fps, 25 fps, 29.97 drop-frame, and 30 fps</strong>.</li>
                <li>Displays format: <code>HH:MM:SS:FF</code> in bright cyan on black badge.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: AtomENV Sensor & API */}
      {activeSection === 'env' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Thermometer className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">M5Stack AtomENV Grove Sensor & REST API</h2>
            </div>
            <p className="text-slate-300 text-sm">
              When an M5Stack AtomENV unit is connected to the Grove port, the firmware monitors temperature, relative humidity, and atmospheric pressure.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4">
                <div className="text-slate-400 text-xs uppercase font-medium">Temperature</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">21.8 °C</div>
                <div className="text-slate-400 text-[11px] mt-1">SHT30 (I2C 0x44)</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4">
                <div className="text-slate-400 text-xs uppercase font-medium">Relative Humidity</div>
                <div className="text-2xl font-bold text-sky-400 mt-1">46.5 %</div>
                <div className="text-slate-400 text-[11px] mt-1">Range: 0 - 100% RH</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4">
                <div className="text-slate-400 text-xs uppercase font-medium">Pressure</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">1013.2 hPa</div>
                <div className="text-slate-400 text-[11px] mt-1">BMP280 / QMP6988 (0x76)</div>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm">REST API Endpoint: GET /api/env</h3>
                <button
                  onClick={() => copyToClipboard('curl -X GET http://192.168.1.185/api/env', 'curl')}
                  className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                >
                  {copiedCode === 'curl' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  Copy cURL
                </button>
              </div>
              <pre className="text-xs bg-slate-950 p-3 rounded border border-slate-800 text-sky-300">
{`HTTP/1.1 200 OK
Content-Type: application/json

{
  "enabled": true,
  "detected": true,
  "temperature": 21.8,
  "humidity": 46.5,
  "pressure": 1013.2,
  "unit_temp": "C",
  "unit_press": "hPa"
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: IMU Auto-Orientation */}
      {activeSection === 'imu' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-sky-400" />
              <h2 className="text-xl font-bold text-white">6-Axis Accelerometer IMU Auto-Orientation</h2>
            </div>
            <p className="text-slate-300 text-sm">
              The internal BMI270 6-axis IMU automatically detects gravity and changes display orientation so all text and cue graphics are always right-side up.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-lg">
                <div className="text-white font-bold text-xs">0° (Upright)</div>
                <div className="text-slate-400 text-[11px] mt-1">PoE & Grove base at bottom</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-lg">
                <div className="text-white font-bold text-xs">90° Right</div>
                <div className="text-slate-400 text-[11px] mt-1">PoE base on left side</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-lg">
                <div className="text-white font-bold text-xs">180° Inverted</div>
                <div className="text-slate-400 text-[11px] mt-1">PoE base at top</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-lg">
                <div className="text-white font-bold text-xs">270° Left</div>
                <div className="text-slate-400 text-[11px] mt-1">PoE base on right side</div>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2 text-xs text-slate-300">
              <h4 className="font-semibold text-white">Zero-Artifact Scanout Architecture:</h4>
              <p>
                To eliminate distortion and double-rotation bugs, the 32KB off-screen frame buffer remains in canonical 128x128 space, while <code>M5.Display.setRotation()</code> re-programs the hardware LCD MADCTL registers directly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: Hardware Specs & Pinouts */}
      {activeSection === 'pinout' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">Hardware Specs, Pinouts & Power Architecture</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-white text-sm">W5500 AtomPoE SPI Pinout</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400">
                      <th className="p-1.5 border border-slate-700">Signal</th>
                      <th className="p-1.5 border border-slate-700">ESP32-S3 GPIO</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    <tr><td className="p-1.5 border border-slate-700 font-mono">SCK</td><td className="p-1.5 border border-slate-700 font-mono font-bold text-sky-400">GPIO 5</td></tr>
                    <tr><td className="p-1.5 border border-slate-700 font-mono">CS</td><td className="p-1.5 border border-slate-700 font-mono font-bold text-sky-400">GPIO 6</td></tr>
                    <tr><td className="p-1.5 border border-slate-700 font-mono">MISO</td><td className="p-1.5 border border-slate-700 font-mono font-bold text-sky-400">GPIO 7</td></tr>
                    <tr><td className="p-1.5 border border-slate-700 font-mono">MOSI</td><td className="p-1.5 border border-slate-700 font-mono font-bold text-sky-400">GPIO 8</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-white text-sm">Grove Port I2C (AtomENV Sensor)</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400">
                      <th className="p-1.5 border border-slate-700">Wire Signal</th>
                      <th className="p-1.5 border border-slate-700">ESP32-S3 GPIO</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    <tr><td className="p-1.5 border border-slate-700 font-mono">SDA</td><td className="p-1.5 border border-slate-700 font-mono font-bold text-emerald-400">GPIO 2</td></tr>
                    <tr><td className="p-1.5 border border-slate-700 font-mono">SCL</td><td className="p-1.5 border border-slate-700 font-mono font-bold text-emerald-400">GPIO 1</td></tr>
                    <tr><td className="p-1.5 border border-slate-700 font-mono">Power</td><td className="p-1.5 border border-slate-700 text-slate-300 font-mono">5V / 3.3V</td></tr>
                    <tr><td className="p-1.5 border border-slate-700 font-mono">Ground</td><td className="p-1.5 border border-slate-700 text-slate-300 font-mono">GND</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2 text-xs text-slate-300">
              <h4 className="font-semibold text-white">PoE vs Wi-Fi Precedence (No Dual-IP Collisions):</h4>
              <p>
                When an active 802.3af PoE Ethernet cable is plugged into the AtomPoE base, the ESP32 automatically disconnects Wi-Fi and powers down the Wi-Fi radio (<code>WIFI_OFF</code>). This prevents IP conflicts, duplicate mDNS announcements, and routing loops. If Ethernet is unplugged, Wi-Fi automatically re-engages.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: PoE Thermal & Low-Power ESP32 Optimization */}
      {activeSection === 'power' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                <h2 className="text-xl font-bold text-white">PoE Thermal &amp; Low-Power Optimization Guide</h2>
              </div>
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                Eco Profile (35°C Cool)
              </span>
            </div>

            <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-4 text-xs text-amber-200/90 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <Info className="w-4 h-4" />
                <span>Why Does the AtomPoE Unit Get Very Warm Out of the Box?</span>
              </div>
              <p className="leading-relaxed">
                The M5Stack AtomPoE base houses an IEEE 802.3af Power-over-Ethernet buck converter that drops incoming 48V DC down to 5V DC. Because the enclosure is a sealed 24×24×13 mm plastic shell with minimal surface area and no ventilation, power conversion inefficiencies directly convert into heat. At the default ESP32-S3 clock of 240 MHz with dual cores running, 100% LCD backlight, and active 2.4GHz RF radios, total electrical load reaches ~1.8 Watts, causing the enclosure to heat up to <strong>55°C – 60°C</strong>.
              </p>
            </div>

            {/* Why standard sleep modes break tally functionality */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2 text-xs text-slate-300">
              <h3 className="font-bold text-white text-sm">Why Generic Light Sleep / Deep Sleep Cannot Be Used</h3>
              <p className="leading-relaxed">
                On the M5Stack AtomPoE base, the W5500 Ethernet interrupt pin (<code>ETH_PHY_IRQ</code>) is hardwired to <strong>-1 (unconnected)</strong>. The ESP32 SPI driver communicates with the W5500 over SPI2 (SCK:5, CS:6, MISO:7, MOSI:8) via task polling.
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                <li><strong className="text-red-400">Deep Sleep:</strong> Shuts down digital cores, dropping all TCP/UDP sockets. Waking requires a full MCU reboot (300ms+ delay), completely unsuitable for live cue lights.</li>
                <li><strong className="text-amber-400">Automatic Light Sleep:</strong> Gates the APB bus clock. Because the W5500 has no interrupt line to wake the CPU when a broadcast packet arrives, incoming TSL 3.1, TSL 5.0, OSC, or rtpMIDI cue packets would experience severe latency (&gt;100ms) or buffer overflow.</li>
              </ul>
            </div>

            {/* 4-Pillar Solution */}
            <div className="space-y-3">
              <h3 className="font-bold text-white text-sm">The 4-Pillar Non-Disruptive Power Architecture</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg space-y-2">
                  <div className="font-bold text-sky-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-sky-950 text-sky-300 flex items-center justify-center text-[10px] font-mono border border-sky-800">1</span>
                    <span>80 MHz CPU Clock (APB Bus Locked at 80 MHz)</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    By invoking <code>setCpuFrequencyMhz(80)</code>, both Xtensa LX7 cores run at 80 MHz instead of 240 MHz. Crucially, the Advanced Peripheral Bus (APB) clock remains locked at 80 MHz. This guarantees that W5500 SPI transactions run at 100% full line-rate (up to 20 MHz SPI), hardware timers remain accurate, and cue response latency remains sub-millisecond (&lt;1ms). Dynamic core power drops by ~60%.
                  </p>
                </div>

                <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg space-y-2">
                  <div className="font-bold text-blue-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-950 text-blue-300 flex items-center justify-center text-[10px] font-mono border border-blue-800">2</span>
                    <span>Complete RF Radio Shutdown on PoE Link</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    When Ethernet link is verified, firmware executes <code>WiFi.mode(WIFI_OFF); esp_wifi_stop(); btStop(); esp_bt_controller_disable();</code>. Powering down the 2.4GHz RF synthesizer, PA, and baseband controllers saves ~90–110 mA of continuous current draw (~0.35W electrical load), preventing duplicate ARP conflicts and eliminating high RF heat dissipation.
                  </p>
                </div>

                <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg space-y-2">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-300 flex items-center justify-center text-[10px] font-mono border border-emerald-800">3</span>
                    <span>FreeRTOS IDLE Yielding (waiti Instruction)</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    In <code>loop()</code>, when no packets are pending and screen tickers are static, the loop executes <code>vTaskDelay(pdMS_TO_TICKS(2))</code>. This yields execution to the FreeRTOS idle task, which invokes the Xtensa <code>waiti 0</code> opcode. The CPU pipeline halts and gates core logic until the next hardware timer tick, reducing idle core power by &gt;70% while W5500 internal 32KB hardware FIFOs buffer incoming network frames.
                  </p>
                </div>

                <div className="p-4 bg-slate-800/50 border border-slate-700/60 rounded-lg space-y-2">
                  <div className="font-bold text-purple-400 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-purple-950 text-purple-300 flex items-center justify-center text-[10px] font-mono border border-purple-800">4</span>
                    <span>Display Auto-Dimming &amp; Instant Wake</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    The GC9107 LCD backlight draws ~40 mA at 100% brightness. When inactive in Standby / Off for longer than the configured timeout (default: 60s), backlight dims to 10% (brightness 25/255). The moment ANY cue or tally packet arrives (Program, Preview, Cue GO, OSC, MIDI) or the user touches the screen button or tilts the unit, display restores to 100% instantly with 0ms delay.
                  </p>
                </div>
              </div>
            </div>

            {/* Thermal Benchmark Table */}
            <div className="space-y-2">
              <h3 className="font-bold text-white text-sm">Thermal &amp; Power Benchmark Comparisons</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-800 text-slate-300">
                      <th className="p-2 border border-slate-700 text-left">Configuration Profile</th>
                      <th className="p-2 border border-slate-700 text-left">CPU Clock</th>
                      <th className="p-2 border border-slate-700 text-left">Current @ 5V</th>
                      <th className="p-2 border border-slate-700 text-left">PoE Draw</th>
                      <th className="p-2 border border-slate-700 text-left">Enclosure Temp</th>
                      <th className="p-2 border border-slate-700 text-left">Tally Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    <tr className="bg-red-950/20 text-red-300">
                      <td className="p-2 border border-slate-700 font-bold">Unoptimized (Default)</td>
                      <td className="p-2 border border-slate-700">240 MHz</td>
                      <td className="p-2 border border-slate-700">~360 mA</td>
                      <td className="p-2 border border-slate-700">~1.80 W</td>
                      <td className="p-2 border border-slate-700 font-bold text-red-400">~58°C (Hot)</td>
                      <td className="p-2 border border-slate-700">&lt;1 ms</td>
                    </tr>
                    <tr className="bg-amber-950/20 text-amber-300">
                      <td className="p-2 border border-slate-700 font-bold">Balanced Mode</td>
                      <td className="p-2 border border-slate-700">160 MHz</td>
                      <td className="p-2 border border-slate-700">~220 mA</td>
                      <td className="p-2 border border-slate-700">~1.10 W</td>
                      <td className="p-2 border border-slate-700 font-bold text-amber-400">~45°C (Warm)</td>
                      <td className="p-2 border border-slate-700">&lt;1 ms</td>
                    </tr>
                    <tr className="bg-emerald-950/30 text-emerald-300 font-bold">
                      <td className="p-2 border border-slate-700">Eco Profile (Recommended)</td>
                      <td className="p-2 border border-slate-700 text-sky-400">80 MHz</td>
                      <td className="p-2 border border-slate-700 text-emerald-400">~95–130 mA</td>
                      <td className="p-2 border border-slate-700 text-emerald-400">~0.48 W</td>
                      <td className="p-2 border border-slate-700 text-emerald-400">~35°C (Cool)</td>
                      <td className="p-2 border border-slate-700">&lt;1 ms</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* REST API Telemetry */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2 text-xs">
              <h3 className="font-bold text-white text-sm">Live REST API: GET /api/power</h3>
              <p className="text-slate-300">
                Remote engineering and monitoring software can query <code>GET /api/power</code> to verify real-time thermal and power performance:
              </p>
              <pre className="p-3 bg-slate-950 rounded border border-slate-800 text-sky-300 text-xs overflow-x-auto font-mono">
{`HTTP/1.1 200 OK
Content-Type: application/json

{
  "cpu_freq_mhz": 80,
  "apb_freq_hz": 80000000,
  "screen_dim_timeout_sec": 60,
  "screen_dimmed": false,
  "wifi_radio_off": true,
  "estimated_power_watts": 0.48,
  "estimated_poe_temp_c": 35.8
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
