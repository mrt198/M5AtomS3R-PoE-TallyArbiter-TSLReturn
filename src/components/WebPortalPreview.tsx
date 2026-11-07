import React, { useState } from 'react';
import { Globe, Save, CheckCircle2, RotateCw, RefreshCw, Radio, Network, Search, Link2, ShieldCheck } from 'lucide-react';
import { SimulatorState } from './AtomSimulator';

interface WebPortalPreviewProps {
  state: SimulatorState;
  setState: React.Dispatch<React.SetStateAction<SimulatorState>>;
}

interface DiscoveredPeer {
  name: string;
  role: 'presenter' | 'tp';
  ip: string;
  port: number;
  group: string;
  mode: string;
}

export const WebPortalPreview: React.FC<WebPortalPreviewProps> = ({ state, setState }) => {
  const [formMode, setFormMode] = useState(state.operatingMode);
  const [formGroup, setFormGroup] = useState(state.pairingGroup);
  const [formPeerIp, setFormPeerIp] = useState(state.pairedTargetIP);
  const [formPeerName, setFormPeerName] = useState(state.pairedTargetName);
  const [formHost, setFormHost] = useState(state.taHost);
  const [formPort, setFormPort] = useState(state.taPort);
  const [formTslPort, setFormTslPort] = useState(state.tslPort);
  const [formDeviceName, setFormDeviceName] = useState(state.deviceName);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredPeers, setDiscoveredPeers] = useState<DiscoveredPeer[] | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setState(prev => ({
      ...prev,
      operatingMode: formMode,
      pairingGroup: formGroup,
      pairedTargetIP: formPeerIp,
      pairedTargetName: formPeerName,
      taHost: formHost,
      taPort: formPort,
      tslPort: formTslPort,
      deviceName: formDeviceName
    }));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleScanPeers = () => {
    setIsScanning(true);
    setDiscoveredPeers(null);
    setTimeout(() => {
      setIsScanning(false);
      // Simulated mDNS query results for _cuelx-tally._udp on local subnet
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

  const currentIP = state.networkMode === 'ETH' ? '192.168.1.185' : '192.168.1.92';

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
                <h1 className="text-lg font-bold text-sky-400">M5AtomS3R PoE Tally</h1>
                <p className="text-xs text-neutral-400">TSL 3.1 UDP, Tally Arbiter & Zero-Conf P2P Controller</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                Firmware v2.2-P2P
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">CURRENT MODE:</span>
                <span className="text-amber-400 font-bold text-sm block">{state.operatingMode}</span>
                <span className="text-neutral-400 text-[10px] block">
                  {state.operatingMode.includes('Presenter') ? 'Preview Return (0x31)' : 'Program Return (0x32)'}
                </span>
              </div>

              <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">PAIRING GROUP:</span>
                <span className="text-white font-bold text-sm block">{state.pairingGroup || 'None'}</span>
                <span className="text-neutral-500 text-[10px] block">Peer: {state.pairedTargetName || 'Broadcast'}</span>
              </div>

              <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">NETWORK INTERFACE:</span>
                <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5" />
                  {state.networkMode === 'ETH' ? 'PoE Ethernet' : 'Wi-Fi (STA)'}
                </span>
                <span className="text-neutral-400 text-[10px] block">IP: {currentIP}</span>
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
              <span>Operating Mode & Routing Parameters</span>
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                </select>
                <p className="text-[11px] text-neutral-400 mt-1">
                  {formMode === 'Presenter' && 'Button click transmits Green TSL Preview cue (0x31) back to Tally Arbiter.'}
                  {formMode === 'TP' && 'Button click transmits Red TSL Program tally (0x32) back to Tally Arbiter.'}
                  {formMode === 'TP_P2P' && 'Direct P2P Master: Toggles Program to paired Presenter; receives cue calls from Presenter.'}
                  {formMode === 'Presenter_P2P' && 'Direct P2P Slave: Displays TP Program/Preview tally; button press cues paired TP.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Pairing Group (Multi-Pair Studio Isolation)
                  </label>
                  <input
                    type="text"
                    value={formGroup}
                    onChange={(e) => setFormGroup(e.target.value)}
                    placeholder="Studio-1"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    TSL 3.1 UDP Port
                  </label>
                  <input
                    type="text"
                    value={formTslPort}
                    onChange={(e) => setFormTslPort(e.target.value)}
                    placeholder="8910"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Paired Peer IP (P2P Mode)
                  </label>
                  <input
                    type="text"
                    value={formPeerIp}
                    onChange={(e) => setFormPeerIp(e.target.value)}
                    placeholder="e.g. 192.168.1.120"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Paired Peer Name
                  </label>
                  <input
                    type="text"
                    value={formPeerName}
                    onChange={(e) => setFormPeerName(e.target.value)}
                    placeholder="e.g. Presenter-Cam1"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-700/60">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
                  Tally Arbiter Server (If using TA modes)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">
                      Tally Arbiter Host / IP
                    </label>
                    <input
                      type="text"
                      value={formHost}
                      onChange={(e) => setFormHost(e.target.value)}
                      placeholder="192.168.1.105"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">
                      Socket.IO Port
                    </label>
                    <input
                      type="text"
                      value={formPort}
                      onChange={(e) => setFormPort(e.target.value)}
                      placeholder="4455"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Listener Device Name
                  </label>
                  <input
                    type="text"
                    value={formDeviceName}
                    onChange={(e) => setFormDeviceName(e.target.value)}
                    placeholder="AtomS3R-Tally-A4"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/40 cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Configuration Saved & Applied!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Settings to NVS Preferences</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Zero-Conf P2P Discovery Card */}
          <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-5 shadow-md">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <span>Zero-Conf P2P Discovery (mDNS / DNS-SD)</span>
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                _cuelx-tally._udp
              </span>
            </div>
            <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
              Scan the local subnet to automatically discover other M5AtomS3R Presenter and TP units. Clicking <strong>Pair</strong> connects them directly without needing a central Tally Arbiter server.
            </p>

            <button
              type="button"
              onClick={handleScanPeers}
              disabled={isScanning}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-950/50 cursor-pointer disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Querying mDNS DNS-SD Services...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Scan for Local CueLX / TSL Peers</span>
                </>
              )}
            </button>

            {discoveredPeers && (
              <div className="mt-4 space-y-2 font-mono">
                {discoveredPeers.map((peer, idx) => (
                  <div key={idx} className="p-3 bg-neutral-900 border border-neutral-700 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-xs">{peer.name}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                          peer.role === 'presenter' ? 'bg-emerald-900 text-emerald-200' : 'bg-purple-900 text-purple-200'
                        }`}>
                          {peer.role}
                        </span>
                        <span className="px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 text-[9px]">
                          {peer.group}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        IP: <strong className="text-neutral-200">{peer.ip}</strong> | Port: {peer.port}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePairPeer(peer)}
                      className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>Pair</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

