import React, { useState, useEffect } from 'react';
import { 
  Network, 
  Zap, 
  Radio, 
  Sun, 
  Layers, 
  ArrowRightLeft, 
  Info, 
  Server, 
  Sliders, 
  Theater, 
  Tv, 
  Music, 
  Volume2, 
  RotateCw,
  Compass,
  MessageSquare
} from 'lucide-react';

export interface SimulatorState {
  tallyState: 'program' | 'preview' | 'aux' | 'standby';
  deviceName: string;
  deviceId: string;
  isCueActive: boolean;
  currentScreen: 0 | 1; // 0 = Tally, 1 = Diagnostics
  networkMode: 'ETH' | 'WIFI';
  ethernetCableConnected: boolean;
  brightnessLevel: number; // 0..3
  doubleBufferEnabled: boolean;
  taHost: string;
  taPort: string;
  tslPort: string;
  flashActive: boolean;
  operatingMode: 'TP' | 'Presenter' | 'TP_P2P' | 'Presenter_P2P' | 'ETC_CueSystem' | 'NMOS_IS07' | 'RTP_MIDI' | 'OSC';
  pairingGroup: string;
  pairedTargetIP: string;
  pairedTargetName: string;
  presenterCueActive: boolean;
  // Network IP Configuration (DHCP vs Static IP)
  useDHCP: boolean;
  staticIP: string;
  staticMask: string;
  staticGW: string;
  staticDNS: string;
  // ETC CueSystem configuration & state
  cueHost: string;
  cuePort: number;
  cueChannel: number;
  cueAckActive: boolean;
  cueState: 'standby' | 'go' | 'off';
  // AMWA NMOS IS-07 Event & Tally configuration & state (Program, Preview, Aux)
  nmosHost: string;
  nmosPort: number;
  nmosSource: string;
  nmosTopic: string;
  nmosProgramTopic: string;
  nmosPreviewTopic: string;
  nmosAuxTopic: string;
  nmosOnAir: boolean; // Program (Red)
  nmosPreview: boolean; // Preview (Green)
  nmosAux: boolean; // Aux (Amber)
  // rtpMIDI / AppleMIDI Configuration & State
  rtpMidiPort: number;
  rtpMidiChannel: number; // 0 = Omni, 1-16
  rtpMidiTriggerType: number; // 0 = Note On/Off, 1 = CC, 2 = PC
  rtpMidiNumRed: number;
  rtpMidiNumFlashRed: number;
  rtpMidiNumGreen: number;
  rtpMidiNumYellow: number;
  rtpMidiNumBlue: number;
  rtpMidiNumWhite: number;
  rtpMidiState: {
    red: boolean;
    flashRed: boolean;
    green: boolean;
    yellow: boolean;
    blue: boolean;
    white: boolean;
  };
  // OSC (Open Sound Control) Configuration & State
  oscPort: number;
  oscPrefix: string;
  oscCustomMessage: string;
  oscState: {
    red: boolean;
    flashRed: boolean;
    green: boolean;
    yellow: boolean;
    blue: boolean;
    white: boolean;
  };
  // IMU 6-Axis Screen Auto-Rotation
  imuRotation: 0 | 90 | 180 | 270;
}

interface AtomSimulatorProps {
  state: SimulatorState;
  setState: React.Dispatch<React.SetStateAction<SimulatorState>>;
  onSendTslPacket: (channel: number, live: boolean) => void;
  lastTslPacket: {
    hex: string;
    decoded: string;
    timestamp: string;
    channel: number;
    live: boolean;
  } | null;
}

export const AtomSimulator: React.FC<AtomSimulatorProps> = ({
  state,
  setState,
  onSendTslPacket,
  lastTslPacket
}) => {
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const [pressStartTime, setPressStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('10:42:15');
  const [flashTick, setFlashTick] = useState(false);

  // Live clock displaying seconds, updating every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${h}:${m}:${s}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // 400ms periodic tick for flashing states (ETC unacknowledged Standby & rtpMIDI/OSC Flash Red)
  useEffect(() => {
    const flashInterval = setInterval(() => {
      setFlashTick(prev => !prev);
    }, 400);
    return () => clearInterval(flashInterval);
  }, []);

  const brightnessPercents = [15, 35, 65, 100];

  // Helper to resolve the active color & label based on mode and priorities
  const resolveActiveColor = () => {
    if (state.flashActive) {
      return { bg: 'bg-white', text: 'text-black', isDark: false, label: 'FLASH' };
    }

    // 1. ETC CueSystem Mode:
    // Standby = flashing red until acknowledged (solid red)
    if (state.operatingMode === 'ETC_CueSystem') {
      if (state.cueState === 'standby') {
        if (!state.cueAckActive) {
          // Unacknowledged: Flashing Red!
          return flashTick
            ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'STANDBY' }
            : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'STANDBY' };
        } else {
          // Acknowledged: Solid Red!
          return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'ACKNOWLEDGED' };
        }
      }
      if (state.cueState === 'go') {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GO!' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'STANDBY' };
    }

    // 2. NMOS IS-07 Mode: Program (Red) > Preview (Green) > Aux (Amber)
    if (state.operatingMode === 'NMOS_IS07') {
      if (state.nmosOnAir) {
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'ON AIR (PRG)' };
      }
      if (state.nmosPreview) {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'PREVIEW' };
      }
      if (state.nmosAux) {
        return { bg: 'bg-amber-500', text: 'text-black', isDark: false, label: 'AUX' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF AIR' };
    }

    // 3. rtpMIDI Mode: Red > Flashing Red > Green > Yellow > Blue > White > Off
    if (state.operatingMode === 'RTP_MIDI') {
      const s = state.rtpMidiState;
      if (s.red) {
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'RED' };
      }
      if (s.flashRed) {
        return flashTick
          ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'FLASH RED' }
          : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'FLASH RED' };
      }
      if (s.green) {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GREEN' };
      }
      if (s.yellow) {
        return { bg: 'bg-yellow-400', text: 'text-black', isDark: false, label: 'YELLOW' };
      }
      if (s.blue) {
        return { bg: 'bg-blue-600', text: 'text-white', isDark: true, label: 'BLUE' };
      }
      if (s.white) {
        return { bg: 'bg-white', text: 'text-black', isDark: false, label: 'WHITE' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF' };
    }

    // 4. OSC Mode: Red > Flashing Red > Green > Yellow > Blue > White > Off
    if (state.operatingMode === 'OSC') {
      const s = state.oscState;
      if (s.red) {
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'RED' };
      }
      if (s.flashRed) {
        return flashTick
          ? { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'FLASH RED' }
          : { bg: 'bg-neutral-950', text: 'text-red-500', isDark: true, label: 'FLASH RED' };
      }
      if (s.green) {
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'GREEN' };
      }
      if (s.yellow) {
        return { bg: 'bg-yellow-400', text: 'text-black', isDark: false, label: 'YELLOW' };
      }
      if (s.blue) {
        return { bg: 'bg-blue-600', text: 'text-white', isDark: true, label: 'BLUE' };
      }
      if (s.white) {
        return { bg: 'bg-white', text: 'text-black', isDark: false, label: 'WHITE' };
      }
      return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'OFF' };
    }

    // 5. Standard TSL / Tally Arbiter / P2P Modes
    switch (state.tallyState) {
      case 'program':
        return { bg: 'bg-red-600', text: 'text-white', isDark: true, label: 'PROGRAM' };
      case 'preview':
        return { bg: 'bg-emerald-500', text: 'text-black', isDark: false, label: 'PREVIEW' };
      case 'aux':
        return { bg: 'bg-amber-500', text: 'text-black', isDark: false, label: 'AUX' };
      case 'standby':
      default:
        return { bg: 'bg-neutral-950', text: 'text-white', isDark: true, label: 'STANDBY' };
    }
  };

  const activeColor = resolveActiveColor();

  // Screen background color (Screen 1 Diagnostics ALSO follows tally state background per request #2!)
  const getScreenBgColor = () => {
    return `${activeColor.bg} ${activeColor.text}`;
  };

  const getStatusLabel = () => activeColor.label;

  // Handle front screen button interactions
  const handleButtonMouseDown = () => {
    setIsPressing(true);
    setPressStartTime(Date.now());
  };

  const handleButtonMouseUp = () => {
    setIsPressing(false);
    if (!pressStartTime) return;
    const duration = Date.now() - pressStartTime;
    setPressStartTime(null);

    // Hold gesture (>1.2s): Cycle Brightness
    if (duration > 1200) {
      setState(prev => ({
        ...prev,
        brightnessLevel: (prev.brightnessLevel + 1) % 4
      }));
      return;
    }

    // Single vs Double click detection
    if (clickTimer) {
      clearTimeout(clickTimer);
      setClickTimer(null);
      // Double click: Toggle Screen
      setState(prev => ({
        ...prev,
        currentScreen: prev.currentScreen === 0 ? 1 : 0
      }));
      setClickCount(0);
    } else {
      setClickCount(1);
      const timer = setTimeout(() => {
        // Single click: Mode-aware action
        setState(prev => {
          if (prev.operatingMode === 'ETC_CueSystem') {
            const nextAck = !prev.cueAckActive;
            return { ...prev, cueAckActive: nextAck };
          }
          if (prev.operatingMode === 'NMOS_IS07') {
            const nextLive = !prev.nmosOnAir;
            return { ...prev, nmosOnAir: nextLive };
          }
          const nextCue = !prev.isCueActive;
          onSendTslPacket(1, nextCue);
          return { ...prev, isCueActive: nextCue };
        });
        setClickTimer(null);
        setClickCount(0);
      }, 260);
      setClickTimer(timer);
    }
  };

  // Flash animation trigger
  const triggerFlash = () => {
    let count = 0;
    const interval = setInterval(() => {
      setState(prev => ({ ...prev, flashActive: !prev.flashActive }));
      count++;
      if (count >= 6) {
        clearInterval(interval);
        setState(prev => ({ ...prev, flashActive: false }));
      }
    }, 180);
  };

  const displayedIP = state.useDHCP 
    ? (state.networkMode === 'ETH' ? '192.168.1.185' : '192.168.1.92') 
    : state.staticIP;

  // Determine displayed name on screen
  const getDisplayName = () => {
    if (state.operatingMode === 'OSC' && state.oscCustomMessage.trim().length > 0) {
      return state.oscCustomMessage.trim();
    }
    if (state.operatingMode === 'ETC_CueSystem') {
      return `CUE CH ${state.cueChannel}`;
    }
    if (state.operatingMode === 'RTP_MIDI') {
      return `MIDI CH ${state.rtpMidiChannel === 0 ? 'OMNI' : state.rtpMidiChannel}`;
    }
    if (state.operatingMode === 'NMOS_IS07') {
      return state.nmosSource.slice(-12).toUpperCase();
    }
    return state.deviceName || 'UNASSIGNED';
  };

  const displayName = getDisplayName();
  const isTextLong = displayName.length > 9;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Visual Hardware Unit */}
      <div className="lg:col-span-5 flex flex-col items-center">
        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          {/* Subtle glow behind device based on active tally color */}
          <div 
            className={`absolute -top-12 -left-12 w-48 h-48 rounded-full blur-3xl opacity-35 pointer-events-none transition-colors duration-500 ${
              activeColor.bg === 'bg-red-600' ? 'bg-red-500' :
              activeColor.bg === 'bg-emerald-500' ? 'bg-emerald-500' :
              activeColor.bg === 'bg-yellow-400' || activeColor.bg === 'bg-amber-500' ? 'bg-yellow-500' :
              activeColor.bg === 'bg-blue-600' ? 'bg-blue-500' :
              activeColor.bg === 'bg-white' ? 'bg-neutral-200' : 'bg-neutral-800'
            }`}
          />

          <div className="flex items-center justify-between mb-4 border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-medium text-neutral-300">M5AtomS3R + AtomPoE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-cyan-400 border border-neutral-700 flex items-center gap-1">
                <Compass className="w-3 h-3" />
                <span>IMU: {state.imuRotation}°</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                128×128
              </span>
            </div>
          </div>

          {/* Physical AtomS3R Body with IMU Tilt Simulation */}
          <div className="flex flex-col items-center my-3">
            <div 
              className="relative transition-transform duration-300 ease-out select-none"
              style={{
                transform: `rotate(${state.imuRotation}deg)`
              }}
            >
              {/* Outer Atom Enclosure (Dark Textured Slate) */}
              <div 
                className="w-56 h-56 rounded-2xl bg-neutral-800 border-4 border-neutral-700 shadow-2xl p-3 flex flex-col items-center justify-center relative select-none"
                style={{
                  boxShadow: '0 20px 30px -10px rgba(0,0,0,0.8), inset 0 1px 2px rgba(255,255,255,0.1)'
                }}
              >
                {/* Atom Brand Header */}
                <div className="absolute top-2 left-0 right-0 flex justify-between px-4 text-[9px] font-mono tracking-widest text-neutral-400 uppercase">
                  <span>ATOM S3R</span>
                  <span>M5STACK</span>
                </div>

                {/* 128x128 LCD Screen (Clickable as Button A) */}
                <button
                  type="button"
                  onMouseDown={handleButtonMouseDown}
                  onMouseUp={handleButtonMouseUp}
                  className={`w-40 h-40 rounded-lg overflow-hidden border-2 border-neutral-900 shadow-inner flex flex-col cursor-pointer transition-all duration-150 transform ${
                    isPressing ? 'scale-[0.97]' : 'scale-100 hover:scale-[1.01]'
                  } ${getScreenBgColor()}`}
                  style={{
                    opacity: (brightnessPercents[state.brightnessLevel] / 100) * 0.4 + 0.6
                  }}
                  title="Click screen: Single=Action/Ack, Double=Screen, Hold=Brightness"
                >
                  {state.currentScreen === 0 ? (
                    // Screen 0: Tally & Cue
                    <div className="w-full h-full p-2 flex flex-col justify-between text-left font-mono">
                      {/* Clock: Larger font with seconds in black box with white text, ABOVE Device Name */}
                      <div className="w-full bg-black text-white border border-neutral-700/80 rounded py-1 px-1 text-center shadow-md">
                        <div className="text-xs sm:text-sm font-mono font-bold tracking-widest leading-none text-white">
                          {currentTime}
                        </div>
                      </div>

                      {/* Main Device Name / OSC Message / Channel directly below clock */}
                      <div className="text-center py-0.5 my-auto w-full overflow-hidden">
                        {isTextLong ? (
                          // Ticker horizontal scroll animation for long text
                          <div className="w-full overflow-hidden whitespace-nowrap py-0.5">
                            <div className="inline-block animate-marquee font-black text-sm uppercase tracking-wider drop-shadow-sm px-1">
                              {displayName} &nbsp; &bull; &nbsp; {displayName}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm font-black tracking-wider uppercase leading-tight truncate px-1 drop-shadow-sm">
                            {displayName}
                          </div>
                        )}
                        <div className="inline-block mt-0.5 px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-current/40 bg-current/15 shadow-sm">
                          {getStatusLabel()}
                        </div>
                        {state.operatingMode === 'ETC_CueSystem' && state.cueAckActive && (
                          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-wider bg-black text-emerald-400 border border-emerald-500 rounded px-1 py-0.2 animate-pulse">
                            [ACKNOWLEDGED]
                          </div>
                        )}
                      </div>

                      {/* Bottom Status: Mode Badge, Cue & Peer / TA */}
                      <div className="border-t border-current/30 pt-1 text-[8.5px] flex flex-col gap-0.5">
                        <div className="flex justify-between items-center font-bold">
                          <span>
                            {state.operatingMode === 'TP' && '[TP (TA)]'}
                            {state.operatingMode === 'Presenter' && '[PRES (TA)]'}
                            {state.operatingMode === 'TP_P2P' && '[P2P TP]'}
                            {state.operatingMode === 'Presenter_P2P' && '[P2P PRES]'}
                            {state.operatingMode === 'ETC_CueSystem' && '[ETC CUE]'}
                            {state.operatingMode === 'NMOS_IS07' && '[NMOS-07]'}
                            {state.operatingMode === 'RTP_MIDI' && '[rtpMIDI]'}
                            {state.operatingMode === 'OSC' && '[OSC UDP]'}
                          </span>
                          <span className="opacity-90 font-normal">
                            {state.operatingMode === 'ETC_CueSystem'
                              ? `CH ${state.cueChannel}`
                              : state.operatingMode === 'NMOS_IS07'
                              ? `Port ${state.nmosPort}`
                              : state.operatingMode === 'RTP_MIDI'
                              ? `Port ${state.rtpMidiPort}`
                              : state.operatingMode === 'OSC'
                              ? `Port ${state.oscPort}`
                              : state.operatingMode.includes('P2P')
                              ? `Grp: ${state.pairingGroup.slice(0, 6)}`
                              : (state.networkMode === 'ETH' ? 'TA: ONLINE' : 'TA: OFFLINE')}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="opacity-80">
                            {state.operatingMode === 'ETC_CueSystem'
                              ? 'Stage Ack:'
                              : state.operatingMode === 'NMOS_IS07'
                              ? 'IS-07 Bus:'
                              : state.operatingMode === 'RTP_MIDI'
                              ? 'MIDI Trig:'
                              : state.operatingMode === 'OSC'
                              ? 'OSC Prefix:'
                              : (state.operatingMode === 'Presenter' || state.operatingMode === 'Presenter_P2P')
                              ? 'Cue(PVW):'
                              : 'Return(PRG):'}
                          </span>
                          <span className={`font-bold px-1 rounded text-[8px] ${
                            state.operatingMode === 'ETC_CueSystem'
                              ? (state.cueAckActive ? 'bg-emerald-950 text-emerald-300 border border-emerald-500' : 'opacity-70')
                              : state.operatingMode === 'NMOS_IS07'
                              ? (state.nmosOnAir ? 'bg-red-950 text-red-200 border border-red-500' : state.nmosPreview ? 'bg-emerald-950 text-emerald-200 border border-emerald-500' : 'opacity-70')
                              : (state.isCueActive 
                                  ? (state.operatingMode === 'Presenter' || state.operatingMode === 'Presenter_P2P'
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500' 
                                      : 'bg-red-950 text-red-200 border border-red-500')
                                  : 'opacity-70')
                          }`}>
                            {state.operatingMode === 'ETC_CueSystem'
                              ? (state.cueAckActive ? '● ACKED' : 'READY')
                              : state.operatingMode === 'NMOS_IS07'
                              ? (state.nmosOnAir ? '● PRG' : state.nmosPreview ? '● PVW' : state.nmosAux ? '● AUX' : 'OFF')
                              : state.operatingMode === 'RTP_MIDI'
                              ? (state.rtpMidiTriggerType === 0 ? 'NOTE ON' : state.rtpMidiTriggerType === 1 ? 'CC TRIG' : 'PC TRIG')
                              : state.operatingMode === 'OSC'
                              ? state.oscPrefix
                              : (state.isCueActive ? '● ACTIVE' : 'OFF')}
                          </span>
                        </div>

                        {/* Presenter Cue Alert on TP unit OR Network IP */}
                        {(state.operatingMode === 'TP' || state.operatingMode === 'TP_P2P') && state.presenterCueActive ? (
                          <div className="bg-red-600 text-yellow-300 text-[8px] font-black tracking-tighter px-0.5 text-center animate-pulse rounded">
                            &gt;&gt;&gt; PRESENTER CUE! &lt;&lt;&lt;
                          </div>
                        ) : (
                          <div className="opacity-80 text-[8px] truncate">
                            IP: {displayedIP} ({state.useDHCP ? 'D' : 'S'})
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Screen 1: Network & Diagnostics (Follows Tally State Background per user request #2!)
                    <div className="w-full h-full p-2 text-left font-mono text-[9px] leading-tight flex flex-col justify-between">
                      <div>
                        {/* High-contrast header banner */}
                        <div className={`font-black border-b pb-0.5 text-[9px] flex items-center justify-between ${
                          activeColor.isDark ? 'text-cyan-300 border-white/30' : 'text-neutral-900 border-black/30'
                        }`}>
                          <span>ATOM S3R DIAG</span>
                          <span className="text-[7.5px] px-1 py-0.2 rounded bg-black/40 text-white font-mono">
                            {getStatusLabel()}
                          </span>
                        </div>

                        <div className={`mt-1 space-y-0.5 text-[8px] font-medium ${
                          activeColor.isDark ? 'text-neutral-100' : 'text-neutral-900 font-semibold'
                        }`}>
                          <div>Mode: <span className="font-bold underline">{state.operatingMode}</span></div>
                          <div>IP: <span className="font-bold">{displayedIP}</span> ({state.useDHCP ? 'DHCP' : 'Static'})</div>
                          <div>IMU Rot: <span className="font-bold">{state.imuRotation}°</span></div>

                          {state.operatingMode === 'ETC_CueSystem' ? (
                            <>
                              <div>Cue Hub: <span>{state.cueHost}:{state.cuePort}</span></div>
                              <div>Ch: <span>{state.cueChannel}</span> | State: <span>{state.cueState.toUpperCase()}</span></div>
                              <div>Ack: <span>{state.cueAckActive ? 'ACKNOWLEDGED' : 'WAITING ACK'}</span></div>
                            </>
                          ) : state.operatingMode === 'NMOS_IS07' ? (
                            <>
                              <div>Registry: <span>{state.nmosHost}:{state.nmosPort}</span></div>
                              <div>PRG: <span>{state.nmosOnAir ? 'ON' : 'off'}</span> | PVW: <span>{state.nmosPreview ? 'ON' : 'off'}</span></div>
                              <div>AUX: <span>{state.nmosAux ? 'ON' : 'off'}</span></div>
                            </>
                          ) : state.operatingMode === 'RTP_MIDI' ? (
                            <>
                              <div>rtpMIDI: <span>Port {state.rtpMidiPort}</span></div>
                              <div>Ch: <span>{state.rtpMidiChannel === 0 ? 'OMNI' : state.rtpMidiChannel}</span> | Trig: <span>{state.rtpMidiTriggerType === 0 ? 'Note' : state.rtpMidiTriggerType === 1 ? 'CC' : 'PC'}</span></div>
                              <div>State: <span>{getStatusLabel()}</span></div>
                            </>
                          ) : state.operatingMode === 'OSC' ? (
                            <>
                              <div>OSC Port: <span>{state.oscPort}</span></div>
                              <div>Prefix: <span>{state.oscPrefix}</span></div>
                              <div>Msg: <span className="truncate">{state.oscCustomMessage || 'None'}</span></div>
                            </>
                          ) : (
                            <>
                              <div>Grp: <span>{state.pairingGroup}</span></div>
                              <div>TSL Port: <span>{state.tslPort}</span></div>
                              <div>TA: <span>{state.operatingMode.includes('P2P') ? 'P2P Direct' : 'Connected'}</span></div>
                            </>
                          )}
                          <div>D-Buffer: <span>32KB M5Canvas (OK)</span></div>
                        </div>
                      </div>

                      <div className={`border-t pt-0.5 flex justify-between text-[8px] ${
                        activeColor.isDark ? 'border-white/20 text-neutral-300' : 'border-black/20 text-neutral-800'
                      }`}>
                        <span>Bright: {brightnessPercents[state.brightnessLevel]}%</span>
                        <span className="font-bold">Double-Click ↻</span>
                      </div>
                    </div>
                  )}
                </button>

                {/* Bottom Screen Label */}
                <div className="absolute bottom-1 text-[9px] font-mono text-neutral-500 tracking-wider">
                  PRESS SCREEN FOR INPUT
                </div>
              </div>

              {/* AtomPoE Base Attachment (Bottom Module with RJ45) */}
              <div className="w-56 bg-neutral-850 border-x-4 border-b-4 border-neutral-700 rounded-b-2xl p-3 flex flex-col items-center mt-[-8px] shadow-lg">
                <div className="flex items-center justify-between w-full px-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-neutral-300">AtomPoE Base</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-blue-900/60 text-blue-300 rounded border border-blue-700/50">W5500</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${state.ethernetCableConnected ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
                    <span className="text-[9px] font-mono text-neutral-400">PoE 48V</span>
                  </div>
                </div>

                {/* RJ45 Ethernet Jack Simulation */}
                <div className="w-24 h-9 bg-neutral-950 border-2 border-neutral-600 rounded-t-sm rounded-b-md flex items-center justify-between px-2 relative">
                  <div className="flex flex-col gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${state.ethernetCableConnected ? 'bg-amber-400 animate-ping' : 'bg-neutral-700'}`} />
                    <span className="text-[7px] font-mono text-neutral-500">ACT</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-neutral-500">RJ-45</span>
                  <div className="flex flex-col gap-1 items-end">
                    <span className={`w-1.5 h-1.5 rounded-full ${state.ethernetCableConnected ? 'bg-emerald-400' : 'bg-neutral-700'}`} />
                    <span className="text-[7px] font-mono text-neutral-500">LINK</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* IMU Orientation Test Controller */}
          <div className="mt-2 bg-neutral-950 rounded-xl p-3 border border-neutral-800 text-xs font-mono">
            <div className="flex items-center justify-between mb-2">
              <span className="text-neutral-300 font-semibold flex items-center gap-1.5">
                <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                <span>Simulate IMU 6-Axis Tilt:</span>
              </span>
              <span className="text-cyan-400 font-bold">{state.imuRotation}°</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {([0, 90, 180, 270] as const).map(deg => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, imuRotation: deg }))}
                  className={`py-1 px-1.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                    state.imuRotation === deg
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-600'
                  }`}
                >
                  {deg === 0 ? '0° (Up)' : deg === 90 ? '90° (R)' : deg === 180 ? '180° (Inv)' : '270° (L)'}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Hardware Action Tips */}
          <div className="mt-3 bg-neutral-950/60 rounded-xl p-3 border border-neutral-800 text-xs font-mono text-neutral-400 space-y-1">
            <div className="text-neutral-300 font-semibold mb-1 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span>Screen Gestures:</span>
            </div>
            <div className="flex justify-between">
              <span>• Single Click:</span>
              <span className="text-white">
                {state.operatingMode === 'ETC_CueSystem' ? 'Send Performer ACK' :
                 state.operatingMode === 'NMOS_IS07' ? 'Toggle IS-07 PRG' : 'Toggle Cue Ch1'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>• Double Click:</span>
              <span className="text-white">Switch Screen (Tally / Diag)</span>
            </div>
            <div className="flex justify-between">
              <span>• Long Hold (&gt;1.2s):</span>
              <span className="text-white">Brightness ({brightnessPercents[state.brightnessLevel]}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Simulator Control Board */}
      <div className="lg:col-span-7 space-y-6">
        {/* Operating Mode Selector */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
              <span>Operating Mode Selection</span>
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">
              {state.operatingMode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'TP', presenterCueActive: false }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'TP'
                  ? 'bg-blue-950/60 text-white border-blue-500 shadow-md shadow-blue-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-blue-400">TP (TA)</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Tally Arbiter Program return</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'Presenter', presenterCueActive: false }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'Presenter'
                  ? 'bg-emerald-950/60 text-white border-emerald-500 shadow-md shadow-emerald-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-emerald-400">Presenter (TA)</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Tally Arbiter Preview cue</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'TP_P2P' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'TP_P2P'
                  ? 'bg-purple-950/60 text-white border-purple-500 shadow-md shadow-purple-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-purple-400">P2P TP Master</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Zero-server standalone</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'Presenter_P2P' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'Presenter_P2P'
                  ? 'bg-amber-950/60 text-white border-amber-500 shadow-md shadow-amber-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-amber-400">P2P Presenter</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Zero-server slave</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'ETC_CueSystem' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'ETC_CueSystem'
                  ? 'bg-red-950/60 text-white border-red-500 shadow-md shadow-red-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-red-400">ETC CueSystem</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Flash Standby &amp; Solid Ack</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'NMOS_IS07' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'NMOS_IS07'
                  ? 'bg-cyan-950/60 text-white border-cyan-500 shadow-md shadow-cyan-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-cyan-400">NMOS IS-07</div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">PRG, PVW &amp; AUX Endpoints</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'RTP_MIDI' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'RTP_MIDI'
                  ? 'bg-indigo-950/60 text-white border-indigo-500 shadow-md shadow-indigo-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-indigo-400 flex items-center gap-1">
                <Music className="w-3.5 h-3.5" />
                <span>rtpMIDI</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">6 Colors with Priority</p>
            </button>

            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, operatingMode: 'OSC' }))}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                state.operatingMode === 'OSC'
                  ? 'bg-teal-950/60 text-white border-teal-500 shadow-md shadow-teal-950/50'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="font-bold text-xs font-mono text-teal-400 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" />
                <span>OSC Mode</span>
              </div>
              <p className="text-[10.5px] text-neutral-400 mt-0.5">Scrolling Text Ticker</p>
            </button>
          </div>

          {/* Mode-Specific Interactive Controls */}
          {state.operatingMode === 'ETC_CueSystem' ? (
            <div className="p-4 bg-neutral-950 rounded-xl border border-red-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Theater className="w-4 h-4" />
                  <span>ETC CueSystem Stage Control Hub (Port {state.cuePort})</span>
                </span>
                <span className="text-[11px] font-mono text-neutral-400">Channel: {state.cueChannel}</span>
              </div>
              <p className="text-xs text-neutral-400">
                <strong>New Feature:</strong> Standby flashes red until performer clicks screen or hub receives ACK to turn solid red.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, cueState: 'standby', cueAckActive: false }))}
                  className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    state.cueState === 'standby' && !state.cueAckActive
                      ? 'bg-red-600 text-white border-red-400 font-bold animate-pulse'
                      : 'bg-neutral-800 text-red-300 border-neutral-700 hover:border-red-500'
                  }`}
                >
                  Trigger STANDBY (Flashing Red)
                </button>
                <button
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, cueAckActive: true }))}
                  className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    state.cueAckActive
                      ? 'bg-red-600 text-white border-red-400 font-bold'
                      : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-red-500'
                  }`}
                >
                  Performer ACK (Solid Red)
                </button>
                <button
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, cueState: 'go' }))}
                  className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    state.cueState === 'go'
                      ? 'bg-emerald-600 text-black border-emerald-400 font-bold'
                      : 'bg-neutral-800 text-emerald-300 border-neutral-700 hover:border-emerald-500'
                  }`}
                >
                  Trigger GO! (Green)
                </button>
                <button
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, cueState: 'off', cueAckActive: false }))}
                  className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-mono border border-neutral-700 cursor-pointer"
                >
                  Clear / OFF
                </button>
              </div>
            </div>
          ) : state.operatingMode === 'NMOS_IS07' ? (
            <div className="p-4 bg-neutral-950 rounded-xl border border-cyan-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Tv className="w-4 h-4" />
                  <span>NMOS IS-07 Event &amp; Tally Endpoints (SMPTE ST 2110)</span>
                </span>
                <span className="text-[11px] font-mono text-neutral-400">Registry: {state.nmosHost}:{state.nmosPort}</span>
              </div>
              <p className="text-xs text-neutral-400">
                <strong>New Feature:</strong> Independent endpoints for <strong>Program</strong> (Red), <strong>Preview</strong> (Green), and <strong>Aux</strong> (Amber) with priority:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, nmosOnAir: !prev.nmosOnAir }))}
                  className={`p-2.5 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    state.nmosOnAir
                      ? 'bg-red-600 text-white border-red-400 font-bold'
                      : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-red-500'
                  }`}
                >
                  <div className="font-bold text-red-400">Program Endpoint</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">{state.nmosProgramTopic}</div>
                  <div className="mt-1 font-bold">{state.nmosOnAir ? '● ACTIVE (Red)' : 'Inactive'}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, nmosPreview: !prev.nmosPreview }))}
                  className={`p-2.5 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    state.nmosPreview
                      ? 'bg-emerald-600 text-black border-emerald-400 font-bold'
                      : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-emerald-500'
                  }`}
                >
                  <div className="font-bold text-emerald-400">Preview Endpoint</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">{state.nmosPreviewTopic}</div>
                  <div className="mt-1 font-bold">{state.nmosPreview ? '● ACTIVE (Green)' : 'Inactive'}</div>
                </button>

                <button
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, nmosAux: !prev.nmosAux }))}
                  className={`p-2.5 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer ${
                    state.nmosAux
                      ? 'bg-amber-600 text-black border-amber-400 font-bold'
                      : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:border-amber-500'
                  }`}
                >
                  <div className="font-bold text-amber-400">Aux Endpoint</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">{state.nmosAuxTopic}</div>
                  <div className="mt-1 font-bold">{state.nmosAux ? '● ACTIVE (Amber)' : 'Inactive'}</div>
                </button>
              </div>
            </div>
          ) : state.operatingMode === 'RTP_MIDI' ? (
            <div className="p-4 bg-neutral-950 rounded-xl border border-indigo-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Music className="w-4 h-4" />
                  <span>rtpMIDI / AppleMIDI Trigger Engine (UDP Port {state.rtpMidiPort})</span>
                </span>
                <span className="text-[11px] font-mono text-neutral-400">
                  Channel: {state.rtpMidiChannel === 0 ? 'Omni' : state.rtpMidiChannel} | {state.rtpMidiTriggerType === 0 ? 'Note On/Off' : state.rtpMidiTriggerType === 1 ? 'CC' : 'PC'}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Strict Priority Evaluation: <strong>Red &gt; Flashing Red &gt; Green &gt; Yellow &gt; Blue &gt; White</strong>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {(['red', 'flashRed', 'green', 'yellow', 'blue', 'white'] as const).map((colorKey, idx) => {
                  const isActive = state.rtpMidiState[colorKey];
                  const labels = ['Red (P1)', 'Flash Red (P2)', 'Green (P3)', 'Yellow (P4)', 'Blue (P5)', 'White (P6)'];
                  return (
                    <button
                      key={colorKey}
                      type="button"
                      onClick={() => setState(prev => ({
                        ...prev,
                        rtpMidiState: {
                          ...prev.rtpMidiState,
                          [colorKey]: !isActive
                        }
                      }))}
                      className={`p-2 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer text-center ${
                        isActive
                          ? 'bg-neutral-800 text-white border-current ring-1 ring-white/50 font-bold'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                      }`}
                    >
                      <div className="text-[10px]">{labels[idx]}</div>
                      <div className="text-xs font-bold mt-1">
                        {isActive ? '● ON' : 'OFF'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : state.operatingMode === 'OSC' ? (
            <div className="p-4 bg-neutral-950 rounded-xl border border-teal-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4" />
                  <span>OSC (Open Sound Control) UDP Port {state.oscPort}</span>
                </span>
                <span className="text-[11px] font-mono text-neutral-400">Prefix: {state.oscPrefix}</span>
              </div>

              {/* Custom Message / Text Ticker Input */}
              <div>
                <label className="block text-[11px] font-mono text-teal-300 font-semibold mb-1 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Display Message / Text Ticker (Replaces Tally Arbiter Name):</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={state.oscCustomMessage}
                    onChange={(e) => setState(prev => ({ ...prev, oscCustomMessage: e.target.value }))}
                    placeholder="e.g. RECORDING - STUDIO 1 (Scrolls if > 9 characters)"
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => setState(prev => ({ ...prev, oscCustomMessage: 'QUIET ON SET - RECORDING' }))}
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] font-mono border border-neutral-700 cursor-pointer"
                  >
                    Preset Long
                  </button>
                  <button
                    type="button"
                    onClick={() => setState(prev => ({ ...prev, oscCustomMessage: '' }))}
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] font-mono border border-neutral-700 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-neutral-800">
                {(['red', 'flashRed', 'green', 'yellow', 'blue', 'white'] as const).map((colorKey, idx) => {
                  const isActive = state.oscState[colorKey];
                  const labels = ['/red (P1)', '/flashred (P2)', '/green (P3)', '/yellow (P4)', '/blue (P5)', '/white (P6)'];
                  return (
                    <button
                      key={colorKey}
                      type="button"
                      onClick={() => setState(prev => ({
                        ...prev,
                        oscState: {
                          ...prev.oscState,
                          [colorKey]: !isActive
                        }
                      }))}
                      className={`p-2 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer text-center ${
                        isActive
                          ? 'bg-neutral-800 text-white border-teal-400 ring-1 ring-teal-400/50 font-bold'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-700 hover:border-neutral-500'
                      }`}
                    >
                      <div className="text-[10px]">{labels[idx]}</div>
                      <div className="text-xs font-bold mt-1">
                        {isActive ? '● ON' : 'OFF'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-neutral-950 rounded-xl border border-neutral-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <span className="text-neutral-500 block text-[10px]">PAIRING GROUP (ISOLATION):</span>
                <input 
                  type="text" 
                  value={state.pairingGroup}
                  onChange={(e) => setState(prev => ({ ...prev, pairingGroup: e.target.value }))}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white font-bold mt-1 text-xs"
                />
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">PAIRED PEER TARGET:</span>
                <span className="text-cyan-400 font-bold block mt-2 truncate">
                  {state.pairedTargetName} ({state.pairedTargetIP})
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px]">TSL 3.1 CUE BYTE:</span>
                <span className="text-emerald-400 font-bold block mt-2">
                  {state.operatingMode.includes('Presenter') ? '0x31 (Preview Return)' : '0x32 (Program Return)'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Network IP Configuration Card (DHCP vs Static IP) */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
              <Network className="w-4 h-4 text-emerald-400" />
              <span>Network IP Configuration (W5500 SPI Ethernet / Wi-Fi)</span>
            </h3>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border ${
              state.useDHCP 
                ? 'bg-blue-950 text-blue-300 border-blue-800' 
                : 'bg-amber-950 text-amber-300 border-amber-800'
            }`}>
              {state.useDHCP ? 'DHCP (Auto)' : 'Static IP (Manual)'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1">
                IP Assignment Mode
              </label>
              <select
                value={state.useDHCP ? '1' : '0'}
                onChange={(e) => setState(prev => ({ ...prev, useDHCP: e.target.value === '1' }))}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="1">DHCP (Automatic Router Assignment)</option>
                <option value="0">Static IP (Manual Fixed Studio Address)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1">
                Active IP Address
              </label>
              <div className="px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-xs font-mono font-bold text-emerald-400">
                {displayedIP}
              </div>
            </div>
          </div>

          {!state.useDHCP && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-neutral-800 text-xs font-mono">
              <div>
                <label className="block text-[10px] text-neutral-500 mb-1">STATIC IP:</label>
                <input
                  type="text"
                  value={state.staticIP}
                  onChange={(e) => setState(prev => ({ ...prev, staticIP: e.target.value }))}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-500 mb-1">SUBNET MASK:</label>
                <input
                  type="text"
                  value={state.staticMask}
                  onChange={(e) => setState(prev => ({ ...prev, staticMask: e.target.value }))}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-500 mb-1">DEFAULT GATEWAY:</label>
                <input
                  type="text"
                  value={state.staticGW}
                  onChange={(e) => setState(prev => ({ ...prev, staticGW: e.target.value }))}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-500 mb-1">DNS SERVER:</label>
                <input
                  type="text"
                  value={state.staticDNS}
                  onChange={(e) => setState(prev => ({ ...prev, staticDNS: e.target.value }))}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-white text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Standard Tally State Injection (When using broadcast modes) */}
        {(state.operatingMode === 'TP' || state.operatingMode === 'Presenter' || state.operatingMode.includes('P2P')) && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-400" />
              <span>Tally State Injection</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, tallyState: 'program' }))}
                className={`p-3 rounded-xl border font-mono font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                  state.tallyState === 'program'
                    ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-900/50'
                    : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-red-900 hover:text-white'
                }`}
              >
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span>PROGRAM</span>
                <span className="text-[10px] opacity-75 font-normal">Live On Air</span>
              </button>

              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, tallyState: 'preview' }))}
                className={`p-3 rounded-xl border font-mono font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                  state.tallyState === 'preview'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/50'
                    : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-emerald-900 hover:text-white'
                }`}
              >
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <span>PREVIEW</span>
                <span className="text-[10px] opacity-75 font-normal">Next Up</span>
              </button>

              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, tallyState: 'aux' }))}
                className={`p-3 rounded-xl border font-mono font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                  state.tallyState === 'aux'
                    ? 'bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-900/50'
                    : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-amber-900 hover:text-white'
                }`}
              >
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span>AUX BUS</span>
                <span className="text-[10px] opacity-75 font-normal">Routing Aux</span>
              </button>

              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, tallyState: 'standby' }))}
                className={`p-3 rounded-xl border font-mono font-bold text-xs flex flex-col items-center gap-1 transition-all ${
                  state.tallyState === 'standby'
                    ? 'bg-neutral-800 text-white border-neutral-600'
                    : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-700 hover:text-white'
                }`}
              >
                <span className="w-3 h-3 rounded-full bg-neutral-600" />
                <span>STANDBY</span>
                <span className="text-[10px] opacity-75 font-normal">Idle</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={triggerFlash}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-mono font-semibold flex items-center gap-2 border border-neutral-700 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span>Test Tally Flash (Strobe)</span>
              </button>

              {(state.operatingMode === 'TP' || state.operatingMode === 'TP_P2P') && (
                <button
                  type="button"
                  onClick={() => setState(prev => ({ ...prev, presenterCueActive: !prev.presenterCueActive }))}
                  className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                    state.presenterCueActive
                      ? 'bg-red-600 text-yellow-300 border-yellow-400 animate-pulse'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5 text-yellow-400" />
                  <span>{state.presenterCueActive ? 'Dismiss Presenter Cue' : 'Simulate Incoming Presenter Cue (0x31)'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
