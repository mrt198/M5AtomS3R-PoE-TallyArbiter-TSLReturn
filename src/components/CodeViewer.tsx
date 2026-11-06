import React, { useState } from 'react';
import { Copy, Check, Download, Search, FileCode, Terminal } from 'lucide-react';
import { CPP_FIRMWARE_SOURCE, PLATFORMIO_INI } from '../data/firmwareSources';

export const CodeViewer: React.FC = () => {
  const [activeFile, setActiveFile] = useState<'cpp' | 'ini'>('cpp');
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);

  const currentCode = activeFile === 'cpp' ? CPP_FIRMWARE_SOURCE : PLATFORMIO_INI;
  const currentFileName = activeFile === 'cpp' ? 'm5atoms3r_atompoe_tally_tsl.cpp' : 'platformio.ini';

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filter or highlight lines
  const lines = currentCode.split('\n');

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* File Navigation & Action Header */}
      <div className="flex flex-wrap items-center justify-between p-4 bg-neutral-950 border-b border-neutral-800 gap-3">
        {/* File Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFile('cpp')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 transition-colors ${
              activeFile === 'cpp'
                ? 'bg-neutral-800 text-cyan-300 border border-neutral-700 shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <FileCode className="w-4 h-4 text-cyan-400" />
            <span>m5atoms3r_atompoe_tally_tsl.cpp</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFile('ini')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-2 transition-colors ${
              activeFile === 'ini'
                ? 'bg-neutral-800 text-yellow-300 border border-neutral-700 shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Terminal className="w-4 h-4 text-yellow-400" />
            <span>platformio.ini</span>
          </button>
        </div>

        {/* Search & Utility Buttons */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-neutral-900 border border-neutral-700 text-xs font-mono pl-8 pr-3 py-1.5 rounded-lg text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 w-40 sm:w-56"
            />
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 border border-neutral-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors shadow-sm shadow-cyan-950"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Code Editor Frame with Line Numbers */}
      <div className="p-4 bg-neutral-950 overflow-x-auto max-h-[640px] font-mono text-xs leading-relaxed text-neutral-300">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, index) => {
              const lineNum = index + 1;
              const isMatch = searchTerm && line.toLowerCase().includes(searchTerm.toLowerCase());
              
              return (
                <tr 
                  key={lineNum}
                  className={`hover:bg-neutral-900/60 transition-colors ${
                    isMatch ? 'bg-amber-950/40 border-l-2 border-amber-400' : ''
                  }`}
                >
                  <td className="w-12 text-right pr-4 select-none text-neutral-600 text-[11px] align-top">
                    {lineNum}
                  </td>
                  <td className="whitespace-pre pl-2 font-mono">
                    {formatSyntax(line, activeFile)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Lightweight syntax colorizer for C++ & INI
function formatSyntax(line: string, type: 'cpp' | 'ini') {
  if (type === 'ini') {
    if (line.trim().startsWith(';')) {
      return <span className="text-neutral-500 italic">{line}</span>;
    }
    if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
      return <span className="text-purple-400 font-bold">{line}</span>;
    }
    if (line.includes('=')) {
      const [key, ...rest] = line.split('=');
      return (
        <span>
          <span className="text-cyan-300">{key}</span>=
          <span className="text-amber-300">{rest.join('=')}</span>
        </span>
      );
    }
    return line;
  }

  // C++ syntax formatting
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
    return <span className="text-neutral-500 italic">{line}</span>;
  }
  if (trimmed.startsWith('#include') || trimmed.startsWith('#define') || trimmed.startsWith('#ifndef') || trimmed.startsWith('#endif')) {
    return <span className="text-pink-400 font-semibold">{line}</span>;
  }
  if (line.includes('void ') || line.includes('bool ') || line.includes('int ') || line.includes('String ') || line.includes('char ')) {
    return <span className="text-cyan-200">{line}</span>;
  }
  if (line.includes('M5Canvas') || line.includes('M5.Display') || line.includes('espConnect') || line.includes('socket')) {
    return <span className="text-emerald-300">{line}</span>;
  }

  return line;
}
