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

  async convertTsToMp4(tsData: Uint8Array): Promise<Uint8Array> {
    if (!this.ffmpeg || !this.isLoaded) {
      throw new Error("FFmpeg engine not loaded");
    }

    const inputName = 'input.ts';
    const outputName = 'output.mp4';

    // 1. Write file to MEMFS
    await this.ffmpeg.writeFile(inputName, tsData);

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

    // 3. Read output
    const data = await this.ffmpeg.readFile(outputName);
    
    // 4. Cleanup
    await this.ffmpeg.deleteFile(inputName);
    await this.ffmpeg.deleteFile(outputName);

    return new Uint8Array(data as ArrayBuffer);
  }
}