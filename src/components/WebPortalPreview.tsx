import React, { useState } from 'react';
import { Globe, Save, CheckCircle2, RotateCw, RefreshCw, Radio, Network } from 'lucide-react';
import { SimulatorState } from './AtomSimulator';

interface WebPortalPreviewProps {
  state: SimulatorState;
  setState: React.Dispatch<React.SetStateAction<SimulatorState>>;
}

export const WebPortalPreview: React.FC<WebPortalPreviewProps> = ({ state, setState }) => {
  const [formHost, setFormHost] = useState(state.taHost);
  const [formPort, setFormPort] = useState(state.taPort);
  const [formTslPort, setFormTslPort] = useState(state.tslPort);
  const [formDeviceName, setFormDeviceName] = useState(state.deviceName);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setState(prev => ({
      ...prev,
      taHost: formHost,
      taPort: formPort,
      tslPort: formTslPort,
      deviceName: formDeviceName
    }));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
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
        <div className="p-6 max-w-2xl mx-auto">
          {/* Status Card */}
          <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-5 mb-6 shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-lg font-bold text-blue-400">M5AtomS3R AtomPoE Tally</h1>
                <p className="text-xs text-neutral-400">TSL 3.1 UDP & Tally Arbiter Listener Client</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                Firmware v2.0-AtomS3R
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">CURRENT ASSIGNED DEVICE:</span>
                <span className="text-white font-bold text-sm">{state.deviceName || 'Camera 1'}</span>
                <span className="text-neutral-500 text-[10px] block">ID: {state.deviceId}</span>
              </div>

              <div className="p-2.5 bg-neutral-900 rounded-lg border border-neutral-800">
                <span className="text-neutral-500 block text-[10px]">NETWORK INTERFACE:</span>
                <span className="text-emerald-400 font-bold text-sm flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5" />
                  {state.networkMode === 'ETH' ? 'PoE Ethernet (W5500)' : 'Wi-Fi (STA)'}
                </span>
                <span className="text-neutral-400 text-[10px] block">IP: {currentIP}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-neutral-700/50">
              <span>Double Buffering: <strong className="text-purple-400">Enabled (32KB Canvas)</strong></span>
              <span>Hardware: <strong className="text-neutral-200">ESP32-S3 + W5500</strong></span>
            </div>
          </div>

          {/* Configuration Form */}
          <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-5 shadow-md">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <span>Network & Server Parameters</span>
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  Tally Arbiter Server IP / Hostname
                </label>
                <input
                  type="text"
                  value={formHost}
                  onChange={(e) => setFormHost(e.target.value)}
                  placeholder="192.168.1.105"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Socket.IO Port (Tally Arbiter)
                  </label>
                  <input
                    type="text"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    placeholder="4455"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
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
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
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
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/40 cursor-pointer"
              >
                {savedSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Saved! Reconnecting Socket.IO...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save to NVS Preferences & Apply</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
