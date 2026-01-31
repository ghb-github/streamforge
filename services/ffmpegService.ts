import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

export class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;

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

  async convertTsToMp4(tsData: Uint8Array, onProgress?: (progress: number) => void): Promise<Uint8Array> {
    if (!this.ffmpeg || !this.isLoaded) {
      throw new Error("FFmpeg engine not loaded");
    }

    const inputName = 'input.ts';
    const outputName = 'output.mp4';

    // Set up progress tracking with monotonic (only-increasing) progress
    let progressHandler: ((event: any) => void) | null = null;
    let maxProgress = 0; // Track maximum progress to prevent backward movement
    
    if (onProgress) {
      // Start with 5% to show activity
      maxProgress = 5;
      onProgress(5);
      
      progressHandler = (event: any) => {
        // FFmpeg.wasm progress event has a 'progress' property (0-1)
        const ratio = event.progress ?? 0;
        // Convert 0-1 to 5-90% (leaving room for completion steps)
        const percent = 5 + (ratio * 85);
        const clampedPercent = Math.min(90, Math.max(5, percent));
        
        // Only update if progress has increased (monotonic)
        if (clampedPercent > maxProgress) {
          maxProgress = clampedPercent;
          onProgress(maxProgress);
        }
      };
      this.ffmpeg.on('progress', progressHandler);
    }

    try {
      // 1. Write file to MEMFS
      await this.ffmpeg.writeFile(inputName, tsData);
      if (onProgress) {
        maxProgress = Math.max(maxProgress, 10);
        onProgress(maxProgress);
      }

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

      // Remove progress handler before manual updates to prevent conflicts
      if (progressHandler) {
        try {
          (this.ffmpeg as any).off?.('progress', progressHandler);
        } catch (e) {
          // If off() doesn't exist, that's okay
        }
        progressHandler = null;
      }

      if (onProgress) {
        maxProgress = Math.max(maxProgress, 95);
        onProgress(maxProgress);
      }

      // 3. Read output
      const data = await this.ffmpeg.readFile(outputName);
      if (onProgress) {
        onProgress(100);
      }
      
      // 4. Cleanup
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);

      return new Uint8Array(data as ArrayBuffer);
    } finally {
      // Clean up progress listener if it was set
      if (progressHandler) {
        // FFmpeg.wasm uses EventEmitter pattern, try to remove listener
        try {
          (this.ffmpeg as any).off?.('progress', progressHandler);
        } catch (e) {
          // If off() doesn't exist, that's okay - the handler won't cause issues
        }
      }
    }
  }
}