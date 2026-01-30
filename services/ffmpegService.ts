import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;
  private onProgressCallback: ((percent: number) => void) | null = null;
  private isConverting = false;

  async load(onLog: (msg: string) => void) {
    if (this.isLoaded) return;

    this.ffmpeg = new FFmpeg();
    
    // Attach logger
    this.ffmpeg.on('log', ({ message }) => {
      onLog(message);
    });

    // Explicitly load the Single-Threaded core (v0.12.6)
    // This avoids the 'SharedArrayBuffer' error and works in all browsers
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    try {
        await this.ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        this.isLoaded = true;
    } catch (error) {
        console.error("FFmpeg load error:", error);
        throw new Error("Failed to load FFmpeg engine. Please check your internet connection.");
    }
  }

  setProgressCallback(callback: (percent: number) => void) {
    this.onProgressCallback = callback;
  }

  // Parse FFmpeg log output to extract progress
  private parseProgress(logMessage: string): number | null {
    // Look for time=HH:MM:SS.ms pattern
    const timeMatch = logMessage.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const seconds = parseInt(timeMatch[3]);
      const centiseconds = parseInt(timeMatch[4]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
      return totalSeconds;
    }
    return null;
  }

  async convertTsToMp4(tsData: Uint8Array, onProgress?: (percent: number) => void): Promise<Uint8Array> {
    if (!this.ffmpeg || !this.isLoaded) {
      throw new Error("FFmpeg engine not loaded");
    }

    this.isConverting = true;
    const inputName = 'input.ts';
    const outputName = 'output.mp4';
    let lastProgress = 0;
    let maxTime = 0;
    let frameCount = 0;

    // Set up progress tracking
    const progressHandler = ({ message }: { message: string }) => {
      if (!this.isConverting) return;

      // Try to parse frame number for better progress estimation
      const frameMatch = message.match(/frame=\s*(\d+)/);
      if (frameMatch) {
        frameCount = Math.max(frameCount, parseInt(frameMatch[1]));
      }

      const currentTime = this.parseProgress(message);
      if (currentTime !== null) {
        maxTime = Math.max(maxTime, currentTime);
      }

      // Estimate progress based on time and frames
      // Since we don't know total duration, use a heuristic that progresses gradually
      if (maxTime > 0 || frameCount > 0) {
        // Progress from 10% to 85% based on time/frames
        // Use a combination of time and frame count for better estimation
        const timeProgress = Math.min(70, 10 + (maxTime / 5) * 60); // Time-based: 10-70%
        const frameProgress = Math.min(70, 10 + (frameCount / 100) * 60); // Frame-based: 10-70%
        const progressPercent = Math.min(85, Math.max(timeProgress, frameProgress));
        
        if (progressPercent > lastProgress + 1) { // Update only if significant change
          lastProgress = progressPercent;
          if (onProgress && this.isConverting) {
            onProgress(progressPercent);
          }
          if (this.onProgressCallback && this.isConverting) {
            this.onProgressCallback(progressPercent);
          }
        }
      }
    };

    // Attach progress handler
    this.ffmpeg.on('log', progressHandler);

    try {
      // 1. Write file to MEMFS
      await this.ffmpeg.writeFile(inputName, tsData);
      if (onProgress && this.isConverting) onProgress(5);
      if (this.onProgressCallback && this.isConverting) this.onProgressCallback(5);

      // 2. Run Command
      // -avoid_negative_ts make_zero: Critical for fixing the "13 hours" timestamp issue
      // -c copy: Fast stream copy (no re-encoding)
      // -bsf:a aac_adtstoasc: Fixes audio stream for MP4 container
      await this.ffmpeg.exec([
        '-i', inputName,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-avoid_negative_ts', 'make_zero', 
        outputName
      ]);

      // Set to 90% when exec completes
      if (onProgress && this.isConverting) onProgress(90);
      if (this.onProgressCallback && this.isConverting) this.onProgressCallback(90);

      // 3. Read output
      const data = await this.ffmpeg.readFile(outputName);
      
      // 4. Cleanup
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);

      // Complete
      if (onProgress && this.isConverting) onProgress(100);
      if (this.onProgressCallback && this.isConverting) this.onProgressCallback(100);

      return new Uint8Array(data as ArrayBuffer);
    } finally {
      this.isConverting = false;
      // Note: FFmpeg.wasm doesn't support removing event listeners easily,
      // but the isConverting flag prevents unwanted callbacks
    }
  }
}