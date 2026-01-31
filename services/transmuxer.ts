
import muxjs from 'mux.js';

export class TransmuxerService {
  /**
   * Transmuxes MPEG-TS data (Uint8Array) into a fragmented MP4 (Uint8Array)
   * using pure JavaScript (Mux.js).
   * 
   * Includes a robust 'Atom Patcher' to manually rewrite timestamps in the 
   * binary output, ensuring the video always starts at 00:00:00.
   */
  async convertTsToMp4(tsData: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      try {
        // We use keepOriginalTimestamps: false to attempt a reset, 
        // but we will also manually patch the output to be safe.
        const transmuxer = new muxjs.mp4.Transmuxer({
            keepOriginalTimestamps: false,
            baseMediaDecodeTime: 0
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

        transmuxer.on('done', () => {
           const initSize = initSegments.reduce((a, b) => a + b.byteLength, 0);
           const dataSize = dataSegments.reduce((a, b) => a + b.byteLength, 0);
           
           if (initSize + dataSize === 0) {
               reject(new Error("Transmuxer produced no data. The TS file might be invalid."));
               return;
           }

           // === BINARY PATCHING STEP ===
           // Optimize: Patch in-place to avoid doubling memory usage for the data segments.
           this.normalizeTimestampsInPlace(dataSegments);

           const merged = new Uint8Array(initSize + dataSize);
           let offset = 0;

           // Append Init Segments
           for(const s of initSegments) {
               merged.set(s, offset);
               offset += s.byteLength;
           }

           // Append Patched Data Segments
           for(const s of dataSegments) {
               merged.set(s, offset);
               offset += s.byteLength;
           }

           resolve(merged);
        });

        transmuxer.push(tsData);
        transmuxer.flush();
      } catch (err) {
        console.error("Transmux error:", err);
        reject(err);
      }
    });
  }

  /**
   * Scans MP4 fragments (MOOF atoms), finds the 'tfdt' (Track Fragment Decode Time) box,
   * and shifts all timestamps so the video starts at 0.
   * 
   * MODIFIES DATA IN-PLACE for memory efficiency.
   */
  private normalizeTimestampsInPlace(segments: Uint8Array[]): void {
    let baseTimeOffset: bigint | null = null;
    
    for (const seg of segments) {
        const view = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
        
        // Simple linear scan for the 'tfdt' box signature
        // Box Structure: [4: Size] [4: Type] [1: Version] [3: Flags] [4 or 8: Time]
        // Type 'tfdt' in hex is 0x74666474
        
        // We stop 16 bytes before end to prevent OOB reads
        for (let i = 0; i < seg.length - 16; i++) {
            // Check for 'tfdt'
            if (
                seg[i] === 0x74 && 
                seg[i+1] === 0x66 && 
                seg[i+2] === 0x64 && 
                seg[i+3] === 0x74
            ) {
                const version = seg[i+4]; // Version is the first byte after type
                
                // Position of the decode time
                const timePos = i + 8; // Skip Type(4) + Ver(1) + Flags(3) = 8 bytes from start of 'tfdt' string
                
                if (version === 1) {
                    // 64-bit time (BigInt)
                    const originalTime = view.getBigUint64(timePos); // Big Endian
                    
                    if (baseTimeOffset === null) {
                        baseTimeOffset = originalTime; // This is our zero point
                    }
                    
                    const newTime = originalTime - baseTimeOffset;
                    view.setBigUint64(timePos, newTime);
                    
                } else {
                    // 32-bit time
                    const originalTime = view.getUint32(timePos);
                    
                    if (baseTimeOffset === null) {
                        baseTimeOffset = BigInt(originalTime);
                    }
                    
                    // We cast back to Number for 32-bit write, hoping it fits (usually does for duration < 13h)
                    const newTime = Number(BigInt(originalTime) - baseTimeOffset);
                    view.setUint32(timePos, newTime);
                }
                
                // Found the atom for this segment, break inner loop to move to next segment
                break; 
            }
        }
    }
  }
}
