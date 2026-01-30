import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { Terminal } from './components/Terminal';
import { ProgressBar } from './components/ProgressBar';
import { LogMessage, LogType, DownloadProgress, Segment } from './types';
import { HLSDownloader } from './services/downloader';
import { FFmpegService } from './services/ffmpegService'; // Switched back to FFmpeg
import { isValidUrl, getFilenameFromUrl } from './utils/url';
import { Download, FileVideo, Video, AlertCircle, Settings2, Play, RefreshCw, StopCircle, Terminal as TerminalIcon, Copy, Check, Info, Lock, Unlock, HelpCircle, X, TerminalSquare, Laptop, Command, Zap } from 'lucide-react';

// Use the robust FFmpeg service instead of mux.js
const ffmpegService = new FFmpegService();

export default function App() {
  const [url, setUrl] = useState('');
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [progress, setProgress] = useState<DownloadProgress>({
    totalSegments: 0,
    downloadedSegments: 0,
    percent: 0,
    phase: 'idle'
  });
  const [useProxy, setUseProxy] = useState(false);
  const [stitchedData, setStitchedData] = useState<Uint8Array | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [conversionFailed, setConversionFailed] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  
  const downloaderRef = useRef<HLSDownloader>(new HLSDownloader());

  const addLog = useCallback((message: string, type: LogType = LogType.INFO) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      type,
      message
    }]);
  }, []);

  const handleDownload = async () => {
    if (!isValidUrl(url)) {
      addLog('Please enter a valid URL', LogType.ERROR);
      return;
    }

    setStitchedData(null);
    setConversionFailed(false);
    setProgress({ phase: 'fetching_manifest', percent: 0, totalSegments: 0, downloadedSegments: 0 });
    addLog(`Fetching manifest from: ${url}`, LogType.INFO);

    try {
      const { segments, info } = await downloaderRef.current.fetchManifest(url, useProxy);
      
      addLog(`Manifest parsed. Found ${segments.length} segments. Duration: ~${(info.duration || 0).toFixed(1)}s`, LogType.SUCCESS);
      if (info.isEncrypted) {
        addLog('Stream is encrypted (AES-128). Decrypting on the fly...', LogType.WARNING);
      }
      setProgress(p => ({ ...p, phase: 'downloading', totalSegments: segments.length }));

      const buffers = await downloaderRef.current.downloadSegments(
        segments,
        (downloaded, total) => {
          const percent = (downloaded / total) * 100;
          setProgress(p => ({ ...p, downloadedSegments: downloaded, percent }));
        },
        useProxy
      );

      addLog('All segments downloaded. Stitching...', LogType.INFO);
      setProgress(p => ({ ...p, phase: 'stitching', percent: 100 }));
      
      // Slight delay to allow UI update
      await new Promise(r => setTimeout(r, 100));

      const stitched = downloaderRef.current.stitchSegments(buffers);
      setStitchedData(stitched);
      
      addLog(`Stitching complete. Total size: ${(stitched.length / 1024 / 1024).toFixed(2)} MB`, LogType.SUCCESS);
      setProgress(p => ({ ...p, phase: 'done' }));

    } catch (error: any) {
      if (error.message === 'Download aborted') {
        addLog('Download aborted by user.', LogType.WARNING);
        setProgress(p => ({ ...p, phase: 'idle', percent: 0 }));
      } else {
        addLog(error.message || 'Unknown error occurred', LogType.ERROR);
        setProgress(p => ({ ...p, phase: 'error' }));
      }
    }
  };

  const handleSaveTS = () => {
    if (!stitchedData) return;
    const blob = new Blob([stitchedData], { type: 'video/mp2t' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = getFilenameFromUrl(url, 'ts');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    addLog('File saved as .ts', LogType.SUCCESS);
  };

  const handleConvertToMP4 = async () => {
    if (!stitchedData) return;
    
    setProgress(p => ({ ...p, phase: 'converting', percent: 0 }));
    setConversionFailed(false);
    addLog('Initializing FFmpeg Engine (Single-Threaded)...', LogType.INFO);

    try {
      await ffmpegService.load((msg) => {
         // Filter out verbose logs if needed
         if (msg.includes('frame=') || msg.includes('size=')) return;
         addLog(`[FFmpeg] ${msg}`, LogType.INFO);
      });

      addLog('Starting conversion with timestamp correction...', LogType.INFO);
      
      const mp4Data = await ffmpegService.convertTsToMp4(stitchedData, (percent) => {
        setProgress(p => ({ ...p, percent }));
      });
      
      addLog('Conversion complete! Timeline corrected.', LogType.SUCCESS);
      
      const blob = new Blob([mp4Data], { type: 'video/mp4' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = getFilenameFromUrl(url, 'mp4');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      
      setProgress(p => ({ ...p, phase: 'done', percent: 100 }));

    } catch (error: any) {
      setConversionFailed(true);
      addLog(`Conversion failed: ${error.message}`, LogType.ERROR);
      setProgress(p => ({ ...p, phase: 'error' }));
    }
  };

  const handleAbort = () => {
    downloaderRef.current.abort();
  };

  const copyCommand = () => {
    const filename = getFilenameFromUrl(url, 'ts');
    const outputName = filename.replace('.ts', '.mp4');
    const cmd = `ffmpeg -i "${filename}" -c copy -bsf:a aac_adtstoasc -avoid_negative_ts make_zero "${outputName}"`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
    addLog('Command copied to clipboard', LogType.INFO);
  };

  const isBusy = progress.phase === 'downloading' || progress.phase === 'converting' || progress.phase === 'stitching';
  const filename = getFilenameFromUrl(url, 'ts');
  const outputName = filename.replace('.ts', '.mp4');
  const ffmpegCommand = `ffmpeg -i "${filename}" -c copy -bsf:a aac_adtstoasc -avoid_negative_ts make_zero "${outputName}"`;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <Header />
      
      {/* Installation Guide Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <button onClick={() => setShowInstallModal(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                </button>
                
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-800">
                    <div className="w-10 h-10 bg-purple-900/30 rounded-lg flex items-center justify-center border border-purple-500/20">
                        <TerminalSquare className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Installing FFmpeg (Manual Method)</h2>
                        <p className="text-sm text-zinc-400">If the automatic conversion fails, use this method.</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    {/* Windows */}
                    <div className="space-y-3">
                        <h3 className="text-zinc-200 font-semibold flex items-center gap-2">
                            <Laptop className="w-4 h-4 text-blue-400" /> Windows
                        </h3>
                        <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/50">
                            <p className="text-sm text-zinc-400 mb-2">1. Open <b>PowerShell</b> or <b>Command Prompt</b>.</p>
                            <p className="text-sm text-zinc-400 mb-2">2. Type the following command and press Enter:</p>
                            <code className="block bg-black p-3 rounded border border-zinc-800 text-green-400 font-mono text-sm mb-2 select-all">
                                winget install Gyan.FFmpeg
                            </code>
                            <p className="text-xs text-zinc-500">Note: You may need to restart your terminal after installation.</p>
                        </div>
                    </div>

                    {/* macOS */}
                    <div className="space-y-3">
                        <h3 className="text-zinc-200 font-semibold flex items-center gap-2">
                            <Command className="w-4 h-4 text-zinc-200" /> macOS
                        </h3>
                        <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/50">
                            <p className="text-sm text-zinc-400 mb-2">1. Open <b>Terminal</b>.</p>
                            <p className="text-sm text-zinc-400 mb-2">2. If you have Homebrew, run:</p>
                            <code className="block bg-black p-3 rounded border border-zinc-800 text-green-400 font-mono text-sm select-all">
                                brew install ffmpeg
                            </code>
                        </div>
                    </div>

                    {/* Linux */}
                    <div className="space-y-3">
                        <h3 className="text-zinc-200 font-semibold flex items-center gap-2">
                            <TerminalIcon className="w-4 h-4 text-yellow-600" /> Linux (Ubuntu/Debian)
                        </h3>
                        <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/50">
                            <code className="block bg-black p-3 rounded border border-zinc-800 text-green-400 font-mono text-sm select-all">
                                sudo apt update && sudo apt install ffmpeg
                            </code>
                        </div>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
                    <button 
                        onClick={() => setShowInstallModal(false)}
                        className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
      )}

      <main className="flex-1 max-w-5xl mx-auto w-full p-6 space-y-8">
        
        {/* Input Section */}
        <section className="space-y-4">
          <div className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 shadow-xl relative overflow-hidden">
            <label className="block text-sm font-medium text-zinc-300 mb-2">HLS Stream URL (.m3u8)</label>
            <div className="flex gap-4">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/playlist.m3u8"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
                disabled={isBusy}
              />
              {isBusy ? (
                <button
                  onClick={handleAbort}
                  className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50 px-6 rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  <StopCircle className="w-5 h-5" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleDownload}
                  disabled={!url}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-blue-900/20"
                >
                  <Download className="w-5 h-5" />
                  Fetch & Download
                </button>
              )}
            </div>
            
            {/* Options */}
            <div className="mt-4 flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                        <input 
                            type="checkbox" 
                            className="peer sr-only" 
                            checked={useProxy} 
                            onChange={(e) => setUseProxy(e.target.checked)} 
                        />
                        <div className="w-10 h-6 bg-zinc-700 rounded-full peer-checked:bg-blue-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                    </div>
                    <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">Use CORS Proxy</span>
                </label>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <AlertCircle className="w-4 h-4" />
                    <span>Enable proxy if the download fails immediately due to CORS errors.</span>
                </div>
            </div>
          </div>
        </section>

        {/* Progress & Actions Section */}
        {(progress.phase !== 'idle' || stitchedData) && (
            <section className="bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* Status Bar */}
                {progress.phase !== 'done' && progress.phase !== 'error' && (
                    <ProgressBar 
                        progress={progress.percent} 
                        label={
                            progress.phase === 'downloading' ? 'Downloading Segments...' :
                            progress.phase === 'stitching' ? 'Stitching Segments...' :
                            progress.phase === 'converting' ? 'Correcting Timestamps & Converting...' : 'Processing...'
                        }
                        subLabel={
                            progress.phase === 'downloading' 
                            ? `${progress.downloadedSegments} / ${progress.totalSegments} segments`
                            : undefined
                        }
                        color={progress.phase === 'converting' ? 'bg-purple-600' : 'bg-blue-600'}
                    />
                )}

                {/* Download Actions */}
                {stitchedData && progress.phase !== 'converting' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <button
                                onClick={handleSaveTS}
                                className="flex items-center justify-center gap-3 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 transition-all hover:border-zinc-600 group"
                            >
                                <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <FileVideo className="w-5 h-5 text-zinc-300" />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-semibold text-zinc-200">Save as .TS</div>
                                    <div className="text-xs text-zinc-500">Raw MPEG-TS Stream</div>
                                </div>
                            </button>

                            <button
                                onClick={handleConvertToMP4}
                                disabled={conversionFailed}
                                className={`flex items-center justify-center gap-3 p-4 rounded-xl border transition-all group relative overflow-hidden
                                    ${conversionFailed 
                                        ? 'border-red-900/30 bg-red-900/10 cursor-not-allowed opacity-80' 
                                        : 'border-purple-900/30 bg-purple-900/10 hover:bg-purple-900/20 hover:border-purple-500/50'
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg 
                                    ${conversionFailed ? 'bg-red-800/50' : 'bg-purple-600 shadow-purple-900/30'}`}>
                                    {conversionFailed ? <AlertCircle className="w-5 h-5 text-red-200" /> : <Video className="w-5 h-5 text-white" />}
                                </div>
                                <div className="text-left">
                                    <div className={`text-sm font-semibold ${conversionFailed ? 'text-red-300' : 'text-purple-200'}`}>
                                        {conversionFailed ? 'Conversion Failed' : 'Convert to .MP4'}
                                    </div>
                                    <div className={`text-xs ${conversionFailed ? 'text-red-400' : 'text-purple-400'}`}>
                                        {conversionFailed ? 'Use manual command below' : 'Robust FFmpeg Engine'}
                                    </div>
                                </div>
                            </button>
                        </div>
                        
                        {/* Local FFmpeg Helper */}
                        <div className={`rounded-xl border p-5 flex flex-col gap-3 transition-colors duration-500
                            ${conversionFailed ? 'bg-red-950/20 border-red-500/30' : 'bg-zinc-950 border-zinc-800'}
                        `}>
                            <div className="flex items-start gap-3">
                                <TerminalIcon className={`w-5 h-5 mt-0.5 ${conversionFailed ? 'text-red-400' : 'text-zinc-400'}`} />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm font-semibold block ${conversionFailed ? 'text-red-200' : 'text-zinc-200'}`}>
                                            Manual Conversion Command (Backup)
                                        </span>
                                        <button 
                                            onClick={() => setShowInstallModal(true)}
                                            className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
                                        >
                                            <HelpCircle className="w-3 h-3" />
                                            Don't have FFmpeg?
                                        </button>
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Use this only if the "Convert to .MP4" button above fails.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-stretch gap-2 mt-1">
                                <code className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-3 font-mono text-sm text-green-400 overflow-x-auto whitespace-nowrap">
                                    {ffmpegCommand}
                                </code>
                                <button 
                                    onClick={copyCommand}
                                    className="px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors text-zinc-300 flex items-center justify-center"
                                    title="Copy to clipboard"
                                >
                                    {copiedCmd ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                                </button>
                            </div>
                            
                            <div className="flex gap-2 text-[10px] text-zinc-500 bg-zinc-900/50 p-2 rounded border border-zinc-800/50">
                                <Info className="w-3 h-3 mt-0.5" />
                                <ol className="list-decimal list-inside space-y-0.5">
                                    <li>Click <b>Save as .TS</b> above.</li>
                                    <li>Open your terminal/command prompt in the <b>Downloads</b> folder.</li>
                                    <li>Paste and run the command above.</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        )}

        {/* Console/Logs */}
        <section>
            <Terminal logs={logs} />
        </section>

        {/* Info Footer */}
        <footer className="text-center text-xs text-zinc-600 pt-8 pb-4">
            <p>
                Client-side processing only. Your video data never leaves your browser. 
                <br />
                Large files may require significant memory (RAM).
            </p>
        </footer>

      </main>
    </div>
  );
}