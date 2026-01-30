import muxjs from 'mux.js';

export class TransmuxerService {
  /**
   * Transmuxes MPEG-TS data (Uint8Array) into a fragmented MP4 (Uint8Array)
   * using pure JavaScript. This avoids SharedArrayBuffer/WASM security issues.
   * 
   * Fixes duration issues by enforcing timestamp zero-basing.
   */
  async convertTsToMp4(tsData: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      try {
        // Configure the transmuxer to ignore the massive original timestamps
        // often found in HLS streams (e.g. running for days) and start at 0.
        const transmuxer = new muxjs.mp4.Transmuxer({
            keepOriginalTimestamps: false, // Critical: shifts timeline to start at 0
        });

        const initSegments: Uint8Array[] = [];
        const dataSegments: Uint8Array[] = [];

        // Listen for data emission
        transmuxer.on('data', (segment: any) => {
           if (segment.initSegment) {
               initSegments.push(new Uint8Array(segment.initSegment));
           }
           if (segment.data) {
               dataSegments.push(new Uint8Array(segment.data));
           }
        });

        // Listen for completion
        transmuxer.on('done', () => {
           // Calculate total size
           const initSize = initSegments.reduce((a, b) => a + b.byteLength, 0);
           const dataSize = dataSegments.reduce((a, b) => a + b.byteLength, 0);
           
           if (initSize + dataSize === 0) {
               reject(new Error("Transmuxer produced no data. The TS file might be invalid or audio-only without video."));
               return;
           }

           const merged = new Uint8Array(initSize + dataSize);
           let offset = 0;

           // Append Init Segments (FTYP + MOOV)
           for(const s of initSegments) {
               merged.set(s, offset);
               offset += s.byteLength;
           }

           // Append Data Segments (MOOF + MDAT)
           for(const s of dataSegments) {
               merged.set(s, offset);
               offset += s.byteLength;
           }

           resolve(merged);
        });

        // Push the entire TS file into the transmuxer
        // mux.js handles splitting it into packets internally
        transmuxer.push(tsData);
        
        // Signal that we are done
        transmuxer.flush();
      } catch (err) {
        console.error("Transmux error:", err);
        reject(err);
      }
    });
  }
}