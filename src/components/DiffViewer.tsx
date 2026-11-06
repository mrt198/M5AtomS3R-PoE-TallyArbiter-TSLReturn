import React from 'react';
import { MIGRATION_DIFFS, MigrationDiff } from '../data/firmwareSources';
import { ArrowRight, CheckCircle2, AlertTriangle, Layers, Cpu, Radio, Zap } from 'lucide-react';

export const DiffViewer: React.FC = () => {
  const getIcon = (category: string) => {
    switch (category) {
      case 'Display & Double Buffering':
        return <Layers className="w-4 h-4 text-purple-400" />;
      case 'Network Management & Ethernet':
        return <Radio className="w-4 h-4 text-blue-400" />;
      case 'Button Controls & Navigation':
        return <Cpu className="w-4 h-4 text-emerald-400" />;
      case 'Power & Brightness Management':
      default:
        return <Zap className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* High-Level Migration Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-400 mb-2">
            <Layers className="w-4 h-4" />
            <span>Zero-Flicker Screen</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">Double-Buffered</div>
          <p className="text-xs text-neutral-400 mt-1">
            Allocates a 32KB <code className="text-purple-300 font-mono">M5Canvas</code> in PSRAM to prevent screen flicker during redraws.
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2">
            <Radio className="w-4 h-4" />
            <span>Ethernet Manager</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">MycilaESPConnect</div>
          <p className="text-xs text-neutral-400 mt-1">
            Native W5500 SPI Ethernet with automatic PoE prioritization and Wi-Fi / captive portal fallback.
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
            <Cpu className="w-4 h-4" />
            <span>Single Button</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">Gesture Mapped</div>
          <p className="text-xs text-neutral-400 mt-1">
            Replaced 2 physical buttons with 1 front screen button: click (Cue), double-click (Screen), hold (Brightness).
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">
            <Zap className="w-4 h-4" />
            <span>PoE 802.3af</span>
          </div>
          <div className="text-xl font-bold text-white font-mono">Continuous Power</div>
          <p className="text-xs text-neutral-400 mt-1">
            Powered through the Ethernet cable via AtomPoE base, eliminating dead battery issues during live production.
          </p>
        </div>
      </div>

      {/* Side-by-Side Detailed Code Comparisons */}
      <div className="space-y-6">
        {MIGRATION_DIFFS.map((diff: MigrationDiff) => (
          <div 
            key={diff.category}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl"
          >
            {/* Header */}
            <div className="p-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getIcon(diff.category)}
                <h3 className="text-sm font-bold text-white tracking-wide">
                  {diff.category}
                </h3>
              </div>
              <span className="text-xs text-neutral-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Fully Adapted</span>
              </span>
            </div>

            {/* Side-by-side blocks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-neutral-800">
              {/* Original Code */}
              <div className="p-4 bg-red-950/10">
                <div className="flex items-center justify-between text-xs font-mono font-semibold text-red-400 mb-2 pb-1 border-b border-red-900/40">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>ORIGINAL: M5StickC / StickC-Plus</span>
                  </span>
                  <span className="text-[10px] text-neutral-500">WiFi Only / Direct LCD</span>
                </div>
                <pre className="font-mono text-xs text-neutral-300 bg-neutral-950 p-3 rounded-lg overflow-x-auto leading-relaxed border border-neutral-800">
                  {diff.original}
                </pre>
              </div>

              {/* Adapted Code */}
              <div className="p-4 bg-emerald-950/10">
                <div className="flex items-center justify-between text-xs font-mono font-semibold text-emerald-400 mb-2 pb-1 border-b border-emerald-900/40">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>ADAPTED: M5AtomS3R + AtomPoE</span>
                  </span>
                  <span className="text-[10px] text-emerald-500 font-bold">PoE W5500 + Double-Buffered</span>
                </div>
                <pre className="font-mono text-xs text-emerald-200 bg-neutral-950 p-3 rounded-lg overflow-x-auto leading-relaxed border border-neutral-800">
                  {diff.adapted}
                </pre>
              </div>
            </div>

            {/* Explanation Note */}
            <div className="p-3 bg-neutral-950/70 border-t border-neutral-800 text-xs text-neutral-300 font-sans flex items-start gap-2">
              <span className="font-bold text-neutral-400 shrink-0 font-mono text-[11px] uppercase bg-neutral-800 px-1.5 py-0.5 rounded">
                Design Decision
              </span>
              <span>{diff.explanation}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
