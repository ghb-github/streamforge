
export interface LogMessage {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  timestamp: number;
}

export interface DownloadProgress {
  totalSegments: number;
  downloadedSegments: number;
  percent: number;
  phase: 'idle' | 'fetching_manifest' | 'downloading' | 'stitching' | 'converting' | 'done' | 'error';
}

export interface EncryptionData {
  method: 'NONE' | 'AES-128' | 'SAMPLE-AES';
  uri?: string;
  iv?: Uint8Array;
}

export interface Segment {
  url: string;
  index: number;
  data?: Uint8Array;
  encryption?: EncryptionData;
  seqId?: number; // Media Sequence Number (needed for IV generation)
  isInitSegment?: boolean; // For EXT-X-MAP (fMP4)
}

export interface StreamInfo {
  duration?: number;
  segmentCount: number;
  targetDuration?: number;
  isEncrypted: boolean;
}

export enum LogType {
  INFO = 'info',
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning'
}
