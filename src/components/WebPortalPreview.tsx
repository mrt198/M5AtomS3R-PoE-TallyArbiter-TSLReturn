import React, { useState } from 'react';
import { 
  Globe, 
  Save, 
  CheckCircle2, 
  Radio, 
  Network, 
  Search, 
  Link2, 
  ShieldCheck,
  Server,
  Sliders,
  Theater,
  Tv
} from 'lucide-react';
import { SimulatorState } from './AtomSimulator';

interface WebPortalPreviewProps {
  state: SimulatorState;
  setState: React.Dispatch<React.SetStateAction<SimulatorState>>;
}

interface DiscoveredPeer {
  name: string;
  role: 'presenter' | 'tp' | 'cue' | 'nmos';
  ip: string;
  port: number;
  group: string;
  mode: string;
}

export const WebPortalPreview: React.FC<WebPortalPreviewProps> = ({ state, setState }) => {
  const [formMode, setFormMode] = useState(state.operatingMode);
  const [formDHCP, setFormDHCP] = useState(state.useDHCP);
  const [formStaticIP, setFormStaticIP] = useState(state.staticIP);
  const [formStaticMask, setFormStaticMask] = useState(state.staticMask);
  const [formStaticGW, setFormStaticGW] = useState(state.staticGW);
  const [formStaticDNS, setFormStaticDNS] = useState(state.staticDNS);

  // Tally Arbiter & P2P
  const [formGroup, setFormGroup] = useState(state.pairingGroup);
  const [formPeerIp, setFormPeerIp] = useState(state.pairedTargetIP);
  const [formPeerName, setFormPeerName] = useState(state.pairedTargetName);
  const [formHost, setFormHost] = useState(state.taHost);
  const [formPort, setFormPort] = useState(state.taPort);
  const [formTslPort, setFormTslPort] = useState(state.tslPort);
  const [formDeviceName, setFormDeviceName] = useState(state.deviceName);

  // ETC CueSystem
  const [formCueHost, setFormCueHost] = useState(state.cueHost);
  const [formCuePort, setFormCuePort] = useState(state.cuePort);
  const [formCueChannel, setFormCueChannel] = useState(state.cueChannel);

  // NMOS IS-07
  const [formNmosHost, setFormNmosHost] = useState(state.nmosHost);
  const [formNmosPort, setFormNmosPort] = useState(state.nmosPort);
  const [formNmosSource, setFormNmosSource] = useState(state.nmosSource);
  const [formNmosTopic, setFormNmosTopic] = useState(state.nmosTopic);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredPeers, setDiscoveredPeers] = useState<DiscoveredPeer[] | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setState(prev => ({
      ...prev,
      operatingMode: formMode,
      useDHCP: formDHCP,
      staticIP: formStaticIP,
      staticMask: formStaticMask,
      staticGW: formStaticGW,
      staticDNS: formStaticDNS,
      pairingGroup: formGroup,
      pairedTargetIP: formPeerIp,
      pairedTargetName: formPeerName,
      taHost: formHost,
      taPort: formPort,
      tslPort: formTslPort,
      deviceName: formDeviceName,
      cueHost: formCueHost,
      cuePort: formCuePort,
      cueChannel: formCueChannel,
      nmosHost: formNmosHost,
      nmosPort: formNmosPort,
      nmosSource: formNmosSource,
      nmosTopic: formNmosTopic
    }));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleScanPeers = () => {
    setIsScanning(true);
    setDiscoveredPeers(null);
    setTimeout(() => {
      setIsScanning(false);
      setDiscoveredPeers([
        {
          name: 'M5AtomS3R-Presenter-01',
          role: 'presenter',
          ip: '192.168.1.120',
          port: 8910,
          group: 'Studio-1',
          mode: 'p2p'
        },
        {
          name: 'M5AtomS3R-TP-Console',
          role: 'tp',
          ip: '192.168.1.105',
          port: 8910,
          group: 'Studio-1',
          mode: 'p2p'
        },
        {
          name: 'Stage-Presenter-Cam2',
          role: 'presenter',
          ip: '192.168.1.144',
          port: 8910,
          group: 'Studio-2',
          mode: 'p2p'
        }
      ]);
    }, 700);
  };

  const handlePairPeer = (peer: DiscoveredPeer) => {
    setFormPeerIp(peer.ip);
    setFormPeerName(peer.name);
    setFormGroup(peer.group);
    setState(prev => ({
      ...prev,
      pairedTargetIP: peer.ip,
      pairedTargetName: peer.name,
      pairingGroup: peer.group
    }));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const currentIP = state.useDHCP 
    ? (state.networkMode === 'ETH' ? '192.168.1.185' : '192.168.1.92') 
    : state.staticIP;

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Browser Top Chrome Header */}
        <div className="bg-neutral-950 p-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 ml-1">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <div className="ml-4 flex items-center gap-2 px-3 py-1 bg-neutral-900 rounded-lg border border-neutral-800 text-xs font-mono text-neutral-300 w-64 sm:w-96">
              <Globe className="w-3.5 h-3.5 text-neutral-500" />
              <span>http://{currentIP}/ (or AtomS3R-CueLX.local)</span>
            </div>
          </div>

          <div className="text-xs font-mono text-neutral-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Port 80 (AsyncWebServer)</span>
          </div>
        </div>

        {/* Embedded Portal Webpage Mockup */}
        <div className="p-6 max-w-2xl mx-auto space-y-6">
          {/* Status Card */}
          <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-5 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-lg font-bold text-sky-400">M5AtomS3R PoE Tally & Cue</h1>
                <p className="text-xs text-neutral-400">TSL 3.1 UDP, ETC CueSystem, NMOS IS-07 & P2P Controller</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                Firmware v2.4-MultiMode
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">CURRENT MODE:</span>
                <span className="text-amber-400 font-bold text-sm block">{state.operatingMode}</span>
                <span className="text-neutral-400 text-[10px] block">
                  {state.operatingMode === 'ETC_CueSystem' && 'Stage Outstation'}
                  {state.operatingMode === 'NMOS_IS07' && 'SMPTE ST 2110 Tally'}
                  {state.operatingMode === 'Presenter' && 'Preview Return (0x31)'}
                  {state.operatingMode === 'TP' && 'Program Return (0x32)'}
                  {state.operatingMode === 'Presenter_P2P' && 'P2P Preview Return'}
                  {state.operatingMode === 'TP_P2P' && 'P2P Program Return'}
                </span>
              </div>

              <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">NETWORK ADDRESSING:</span>
                <span className="text-white font-bold text-sm block">
                  {state.useDHCP ? 'DHCP (Auto)' : 'Static IP (Manual)'}
                </span>
                <span className="text-neutral-400 text-[10px] block truncate">IP: {currentIP}</span>
              </div>

              <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">INTERFACE & POWER:</span>
                <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5" />
                  {state.networkMode === 'ETH' ? 'PoE Ethernet' : 'Wi-Fi (STA)'}
                </span>
                <span className="text-neutral-400 text-[10px] block">802.3af PoE (48V)</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-neutral-700/50">
              <span>Double Buffering: <strong className="text-purple-400">Enabled (32KB Canvas)</strong></span>
              <span>Hardware: <strong className="text-neutral-200">ESP32-S3 + W5500 SPI</strong></span>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-5 shadow-md">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <span>Operating Mode & Routing Parameters</span>
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Device Mode Select */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Device Operating Mode
                </label>
                <select
                  value={formMode}
                  onChange={(e) => setFormMode(e.target.value as any)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="TP">TP (Technical Producer with Tally Arbiter)</option>
                  <option value="Presenter">Presenter (with Tally Arbiter)</option>
                  <option value="TP_P2P">TP no Tally Arbiter (P2P Master)</option>
                  <option value="Presenter_P2P">Presenter no Tally Arbiter (P2P Slave)</option>
                  <option value="ETC_CueSystem">ETC CueSystem (Stage Cue Light Outstation)</option>
                  <option value="NMOS_IS07">NMOS IS-07 Event & Tally (SMPTE ST 2110)</option>
                </select>
                <p className="text-[11px] text-neutral-400 mt-1">
                  {formMode === 'Presenter' && 'Button click transmits Green TSL Preview cue (0x31) back to Tally Arbiter.'}
                  {formMode === 'TP' && 'Button click transmits Red TSL Program tally (0x32) back to Tally Arbiter.'}
                  {formMode === 'TP_P2P' && 'Direct P2P Master: Toggles Program to paired Presenter; receives cue calls from Presenter.'}
                  {formMode === 'Presenter_P2P' && 'Direct P2P Slave: Displays TP Program/Preview tally; button press cues paired TP.'}
                  {formMode === 'ETC_CueSystem' && 'Stage cue light outstation: Listens for Standby (Amber) and Go (Green); button sends ACK.'}
                  {formMode === 'NMOS_IS07' && 'AMWA NMOS IS-07: Emits state events to NMOS IS-04 Registration Server over ST 2110.'}
                </p>
              </div>

              {/* Network IP Configuration Section */}
              <div className="p-4 bg-neutral-900/90 rounded-xl border border-neutral-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Network IP Configuration</span>
                  </h3>
                  <span className="text-[11px] font-mono text-neutral-400">
                    {formDHCP ? 'Dynamic DHCP' : 'Manual Static'}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    IP Assignment Mode
                  </label>
                  <select
                    value={formDHCP ? '1' : '0'}
                    onChange={(e) => setFormDHCP(e.target.value === '1')}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="1">DHCP (Automatic Router Assignment)</option>
                    <option value="0">Static IP (Manual Fixed Studio Address)</option>
                  </select>
                </div>

                {!formDHCP && (
                  <div className="space-y-3 pt-2 border-t border-neutral-800">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                          Static IP Address
                        </label>
                        <input
                          type="text"
                          value={formStaticIP}
                          onChange={(e) => setFormStaticIP(e.target.value)}
                          placeholder="192.168.1.150"
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                          Subnet Mask
                        </label>
                        <input
                          type="text"
                          value={formStaticMask}
                          onChange={(e) => setFormStaticMask(e.target.value)}
                          placeholder="255.255.255.0"
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                          Default Gateway
                        </label>
                        <input
                          type="text"
                          value={formStaticGW}
                          onChange={(e) => setFormStaticGW(e.target.value)}
                          placeholder="192.168.1.1"
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                          Primary DNS Server
                        </label>
                        <input
                          type="text"
                          value={formStaticDNS}
                          onChange={(e) => setFormStaticDNS(e.target.value)}
                          placeholder="8.8.8.8"
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* MODE AWARE SECTION: Tally Arbiter */}
              {(formMode === 'TP' || formMode === 'Presenter') && (
                <div className="p-4 bg-neutral-900/90 rounded-xl border border-neutral-700/80 space-y-3">
                  <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    <span>Tally Arbiter Server Settings</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        Tally Arbiter Host / IP
                      </label>
                      <input
                        type="text"
                        value={formHost}
                        onChange={(e) => setFormHost(e.target.value)}
                        placeholder="192.168.1.105"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        Socket.IO Port
                      </label>
                      <input
                        type="text"
                        value={formPort}
                        onChange={(e) => setFormPort(e.target.value)}
                        placeholder="4455"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                      Listener Device Name
                    </label>
                    <input
                      type="text"
                      value={formDeviceName}
                      onChange={(e) => setFormDeviceName(e.target.value)}
                      placeholder="AtomS3R-Tally-A4"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              {/* MODE AWARE SECTION: Standalone P2P */}
              {(formMode === 'TP_P2P' || formMode === 'Presenter_P2P') && (
                <div className="p-4 bg-neutral-900/90 rounded-xl border border-neutral-700/80 space-y-3">
                  <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Standalone P2P Settings (No Tally Arbiter)</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        Pairing Group (Multi-Pair Studio Isolation)
                      </label>
                      <input
                        type="text"
                        value={formGroup}
                        onChange={(e) => setFormGroup(e.target.value)}
                        placeholder="Studio-1"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        TSL 3.1 UDP Port
                      </label>
                      <input
                        type="text"
                        value={formTslPort}
                        onChange={(e) => setFormTslPort(e.target.value)}
                        placeholder="8910"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        Paired Peer IP
                      </label>
                      <input
                        type="text"
                        value={formPeerIp}
                        onChange={(e) => setFormPeerIp(e.target.value)}
                        placeholder="192.168.1.120"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        Paired Peer Name
                      </label>
                      <input
                        type="text"
                        value={formPeerName}
                        onChange={(e) => setFormPeerName(e.target.value)}
                        placeholder="Presenter-Cam1"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* MODE AWARE SECTION: ETC CueSystem */}
              {formMode === 'ETC_CueSystem' && (
                <div className="p-4 bg-neutral-900/90 rounded-xl border border-red-900/50 space-y-3">
                  <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Theater className="w-3.5 h-3.5" />
                    <span>ETC CueSystem Configuration</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        CueSystem Hub Host / IP
                      </label>
                      <input
                        type="text"
                        value={formCueHost}
                        onChange={(e) => setFormCueHost(e.target.value)}
                        placeholder="192.168.1.50"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        CueSystem UDP Port
                      </label>
                      <input
                        type="number"
                        value={formCuePort}
                        onChange={(e) => setFormCuePort(parseInt(e.target.value) || 4000)}
                        placeholder="4000"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                      Cue Channel Number (1 - 32)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={formCueChannel}
                      onChange={(e) => setFormCueChannel(parseInt(e.target.value) || 1)}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              {/* MODE AWARE SECTION: NMOS IS-07 */}
              {formMode === 'NMOS_IS07' && (
                <div className="p-4 bg-neutral-900/90 rounded-xl border border-cyan-900/50 space-y-3">
                  <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Tv className="w-3.5 h-3.5" />
                    <span>AMWA NMOS IS-07 Event & Tally Configuration</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        NMOS Registration Server Host / IP
                      </label>
                      <input
                        type="text"
                        value={formNmosHost}
                        onChange={(e) => setFormNmosHost(e.target.value)}
                        placeholder="192.168.1.200"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        IS-04 Registry Port
                      </label>
                      <input
                        type="number"
                        value={formNmosPort}
                        onChange={(e) => setFormNmosPort(parseInt(e.target.value) || 8235)}
                        placeholder="8235"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        Source / Device UUID
                      </label>
                      <input
                        type="text"
                        value={formNmosSource}
                        onChange={(e) => setFormNmosSource(e.target.value)}
                        placeholder="m5atoms3r-tally-source-01"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                        IS-07 Event Topic
                      </label>
                      <input
                        type="text"
                        value={formNmosTopic}
                        onChange={(e) => setFormNmosTopic(e.target.value)}
                        placeholder="device/tally/state"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/40 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Settings & Apply to Firmware</span>
              </button>

              {savedSuccess && (
                <div className="p-3 bg-emerald-950 border border-emerald-600/50 rounded-lg flex items-center gap-2 text-xs font-mono text-emerald-300 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Configuration saved to NVS and applied dynamically!</span>
                </div>
              )}
            </form>
          </div>

          {/* Zero-Conf P2P Discovery Scanner Card (Visible in P2P modes) */}
          {(formMode === 'TP_P2P' || formMode === 'Presenter_P2P') && (
            <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-5 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Search className="w-4 h-4 text-purple-400" />
                    <span>Zero-Conf P2P Discovery (mDNS / DNS-SD)</span>
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Search local network for other active CueLX TSL units advertising on <code className="text-purple-300">_cuelx-tally._udp</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleScanPeers}
                  disabled={isScanning}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Search className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>{isScanning ? 'Scanning...' : 'Scan Subnet'}</span>
                </button>
              </div>

              {discoveredPeers && (
                <div className="space-y-2 mt-4 pt-3 border-t border-neutral-700/60 font-mono text-xs">
                  {discoveredPeers.map((peer, idx) => (
                    <div 
                      key={idx}
                      className="p-3 bg-neutral-900 border border-neutral-700/80 rounded-lg flex items-center justify-between hover:border-neutral-600 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">{peer.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            peer.role === 'presenter' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-purple-950 text-purple-300 border border-purple-800'
                          }`}>
                            {peer.role}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5">
                          IP: <span className="text-neutral-300">{peer.ip}</span> | Port: {peer.port} | Group: <span className="text-sky-300">{peer.group}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePairPeer(peer)}
                        className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Pair Target</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
