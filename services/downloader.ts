import { resolveUrl } from '../utils/url';
import { Segment, StreamInfo, EncryptionData } from '../types';

// Helper: Parse HLS attributes (KEY=VALUE, or KEY="VALUE")
const parseAttributes = (line: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    result[match[1]] = match[3] || match[4];
  }
  return result;
};

// Helper: Convert Hex string (0x...) to Uint8Array
const hexToBytes = (hex: string): Uint8Array => {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
};

// Helper: Generate IV from Media Sequence Number (Big Endian, padded to 16 bytes)
const sequenceToIV = (seq: number): Uint8Array => {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  
  // Set the last 4 bytes (sufficient for most sequence numbers up to 4 billion)
  // For standard HLS compliance with large sequence numbers, BigInt is preferred.
  // We use BigInt to set the 64-bit integer at the end of the 128-bit block.
  try {
      const bigSeq = BigInt(seq);
      view.setBigUint64(8, bigSeq); 
  } catch (e) {
      // Fallback for older environments (unlikely in React 18+)
      view.setUint32(12, seq);
  }
  
  return new Uint8Array(buffer);
};

export class HLSDownloader {
  private abortController: AbortController | null = null;
  private keyCache: Map<string, CryptoKey> = new Map();

  constructor() {}

  async fetchManifest(url: string, useProxy = false): Promise<{ segments: Segment[], info: StreamInfo }> {
    const fetchUrl = useProxy ? `https://corsproxy.io/?${encodeURIComponent(url)}` : url;
    
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.statusText}`);
    }

    const text = await response.text();
    
    if (text.includes('#EXT-X-STREAM-INF')) {
        throw new Error("This is a Master Playlist. Please use a Variant Playlist URL (the one ending in .m3u8 inside this file).");
    }

    const lines = text.split('\n');
    const segments: Segment[] = [];
    let targetDuration = 0;
    let mediaSequence = 0;
    let currentKey: EncryptionData | undefined;
    let isEncrypted = false;
    let segmentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        targetDuration = parseFloat(line.split(':')[1]);
      }
      
      if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        mediaSequence = parseInt(line.split(':')[1]);
      }

      if (line.startsWith('#EXT-X-KEY:')) {
        const attrs = parseAttributes(line.substring(11));
        const method = attrs['METHOD'];
        if (method && method !== 'NONE') {
            isEncrypted = true;
            if (method !== 'AES-128') {
                console.warn(`Unsupported encryption method: ${method}. Only AES-128 is supported.`);
                // We keep parsing, but decryption might fail or be skipped.
            }
            currentKey = {
                method: method as any,
                uri: resolveUrl(url, attrs['URI']),
                iv: attrs['IV'] ? hexToBytes(attrs['IV']) : undefined
            };
        } else {
            currentKey = undefined;
        }
      }

      if (line.startsWith('#EXT-X-MAP:')) {
        // Init segment for fMP4
        const attrs = parseAttributes(line.substring(11));
        if (attrs['URI']) {
            segments.push({
                index: segmentIndex++, // Assign an index so it stays in order
                url: resolveUrl(url, attrs['URI']),
                isInitSegment: true,
                encryption: currentKey,
                seqId: mediaSequence + segments.length // Init segments share seq ID or irrelevant
            });
        }
      }
      
      if (!line.startsWith('#')) {
        segments.push({
          index: segmentIndex++,
          url: resolveUrl(url, line),
          encryption: currentKey,
          seqId: mediaSequence + (segments.length) // Simplistic seq tracking
        });
      }
    }

    if (segments.length === 0) {
      throw new Error("No segments found.");
    }

    return {
      segments,
      info: {
        segmentCount: segments.length,
        targetDuration,
        duration: segments.length * targetDuration,
        isEncrypted
      }
    };
  }

  async downloadSegments(
    segments: Segment[], 
    onProgress: (downloaded: number, total: number) => void,
    useProxy = false
  ): Promise<Uint8Array[]> {
    this.abortController = new AbortController();
    this.keyCache.clear();
    
    const signal = this.abortController.signal;
    const results: Uint8Array[] = new Array(segments.length);
    let downloadedCount = 0;

    // Batch download
    const BATCH_SIZE = 5;
    
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      if (signal.aborted) throw new Error("Download aborted");

      const batch = segments.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (seg) => {
        try {
          // 1. Fetch Data
          const fetchUrl = useProxy ? `https://corsproxy.io/?${encodeURIComponent(seg.url)}` : seg.url;
          const res = await fetch(fetchUrl, { signal });
          if (!res.ok) throw new Error(`Failed to fetch segment ${seg.index}`);
          const buffer = await res.arrayBuffer();
          let data = new Uint8Array(buffer);

          // 2. Decrypt if needed
          if (seg.encryption && seg.encryption.method === 'AES-128' && seg.encryption.uri) {
            data = await this.decryptSegment(data, seg.encryption, seg.seqId || seg.index, useProxy);
          }

          results[seg.index] = data;
          downloadedCount++;
          onProgress(downloadedCount, segments.length);
        } catch (error) {
           if (!signal.aborted) {
             console.error(`Error processing segment ${seg.index}:`, error);
             throw error;
           }
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  private async decryptSegment(
      data: Uint8Array, 
      encryption: EncryptionData, 
      seqId: number, 
      useProxy: boolean
  ): Promise<Uint8Array> {
    if (!encryption.uri) return data;

    // 1. Get Key
    let key = this.keyCache.get(encryption.uri);
    if (!key) {
        const keyUrl = useProxy ? `https://corsproxy.io/?${encodeURIComponent(encryption.uri)}` : encryption.uri;
        const keyRes = await fetch(keyUrl);
        if (!keyRes.ok) throw new Error(`Failed to fetch key from ${encryption.uri}`);
        const keyBuffer = await keyRes.arrayBuffer();
        
        key = await window.crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-CBC' },
            false,
            ['decrypt']
        );
        this.keyCache.set(encryption.uri, key);
    }

    // 2. Determine IV
    // If IV is provided in manifest, use it. Otherwise use Sequence Number.
    const iv = encryption.iv ? encryption.iv : sequenceToIV(seqId);

    // 3. Decrypt
    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-CBC', iv },
            key,
            data
        );
        return new Uint8Array(decrypted);
    } catch (e) {
        console.error("Decryption failed", e);
        throw new Error("Decryption failed. Check key validity or IV.");
    }
  }

  stitchSegments(buffers: Uint8Array[]): Uint8Array {
    // Filter out empty buffers (failed downloads)
    const validBuffers = buffers.filter(b => b && b.length > 0);
    const totalLength = validBuffers.reduce((acc, b) => acc + b.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of validBuffers) {
      merged.set(buffer, offset);
      offset += buffer.length;
    }
    return merged;
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}