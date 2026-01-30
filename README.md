# StreamForge

A modern, client-side web application for downloading and converting HLS (HTTP Live Streaming) streams. StreamForge allows you to download `.m3u8` playlists, stitch all segments together, and convert them to MP4 format—all entirely in your browser.

## Features

- 🎬 **HLS Stream Download**: Download complete HLS streams from `.m3u8` playlist URLs
- 🔒 **Encryption Support**: Automatic decryption of AES-128 encrypted streams
- 📦 **Segment Stitching**: Automatically downloads and combines all video segments
- 🎥 **Format Conversion**: Convert downloaded streams to MP4 using browser-based FFmpeg
- 🔄 **CORS Proxy Support**: Optional CORS proxy to handle cross-origin restrictions
- 💾 **Client-Side Processing**: All processing happens in your browser—your data never leaves your device
- 📊 **Real-Time Progress**: Track download and conversion progress with detailed logs
- 🎨 **Modern UI**: Clean, dark-themed interface built with React and Tailwind CSS

## Prerequisites

- **Node.js** (v16 or higher recommended)
- A modern web browser with support for:
  - Web Crypto API (for decryption)
  - WebAssembly (for FFmpeg)
  - ES6+ features

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd streamforge
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

1. **Enter HLS URL**: Paste a `.m3u8` playlist URL into the input field
2. **Optional Settings**: Enable "Use CORS Proxy" if you encounter CORS errors
3. **Download**: Click "Fetch & Download" to start the process
4. **Save or Convert**:
   - **Save as .TS**: Download the raw MPEG-TS stream file
   - **Convert to .MP4**: Use the built-in FFmpeg engine to convert to MP4 format

### Manual Conversion (Backup Method)

If the automatic conversion fails, you can use the provided FFmpeg command:

1. Save the file as `.TS` first
2. Install FFmpeg on your system:
   - **Windows**: `winget install Gyan.FFmpeg`
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt update && sudo apt install ffmpeg`
3. Run the command in your terminal (copied from the app)

## How It Works

1. **Manifest Parsing**: Fetches and parses the `.m3u8` playlist file
2. **Segment Discovery**: Identifies all video segments and their URLs
3. **Encryption Detection**: Detects if the stream is encrypted and fetches decryption keys
4. **Parallel Download**: Downloads segments in batches for optimal performance
5. **Decryption**: Automatically decrypts AES-128 encrypted segments using Web Crypto API
6. **Stitching**: Combines all segments into a single continuous stream
7. **Conversion**: Uses FFmpeg.wasm to convert the stream to MP4 format

## Technical Details

### Built With

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **FFmpeg.wasm** - Browser-based video conversion
- **Web Crypto API** - Stream decryption
- **Tailwind CSS** - Styling (via inline classes)

### Architecture

- `services/downloader.ts` - HLS manifest parsing and segment downloading
- `services/ffmpegService.ts` - FFmpeg.wasm integration for video conversion
- `components/` - React UI components (Header, Terminal, ProgressBar)
- `utils/url.ts` - URL validation and filename extraction

## Limitations

- **Memory Usage**: Large video files require significant RAM as all processing happens in the browser
- **Browser Performance**: Conversion speed depends on your device's processing power
- **Stream Types**: Currently optimized for standard HLS streams (AES-128 encryption supported)
- **Master Playlists**: The app requires variant playlist URLs, not master playlists

## Development

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## License

This project is private and not licensed for public use.

## Disclaimer

This tool is for educational and personal use only. Ensure you have the right to download and convert any streams you process. Respect content creators' rights and terms of service.
