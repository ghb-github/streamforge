
import { resolveUrl, isValidUrl } from '../utils/url';

/**
 * Scans a website URL for embedded HLS (.m3u8) streams.
 * Uses a CORS proxy to fetch the HTML content and robust Regex to find links.
 */
export const scanForStreams = async (url: string): Promise<string[]> => {
  // Use corsproxy.io to bypass CORS restrictions on the target website.
  // Note: Some websites may block this proxy or require headers (User-Agent) that we can't fully control from the browser.
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    
    const candidates = new Set<string>();

    // Helper to clean and validate found strings
    const processCandidate = (raw: string) => {
        if (!raw) return;
        
        let clean = raw;
        
        // 1. Handle JSON escaped slashes: http:\/\/example.com
        if (clean.includes('\\/')) {
            clean = clean.replace(/\\\//g, '/');
        }

        // 2. Handle URL Encoding: http%3A%2F%2F...
        if (clean.includes('%3A') || clean.includes('%2F')) {
            try { clean = decodeURIComponent(clean); } catch (e) {}
        }

        // 3. Cleanup surrounding quotes or whitespace if regex leaked
        clean = clean.replace(/^["']|["']$/g, '').trim();

        // 4. Validate existence of .m3u8 extension
        if (!clean.includes('.m3u8')) return;

        // 5. Add to set
        if (isValidUrl(clean)) {
            candidates.add(clean);
        } else {
            // Try resolving relative URL against the original page URL
            try {
                const resolved = resolveUrl(url, clean);
                if (isValidUrl(resolved)) candidates.add(resolved);
            } catch (e) {
                // Ignore invalid
            }
        }
    };

    // === Scanning Strategy ===

    // 1. Absolute URLs (http://... .m3u8 ...)
    // Catches standard links in HTML and JS
    const absRegex = /https?:\/\/[a-zA-Z0-9\-\._~:\/?#\[\]@!$&'()*+,;=%]+\.m3u8[^"'\s<>]*?([?#][^"'\s<>]*)?/gi;
    let match;
    while ((match = absRegex.exec(text)) !== null) processCandidate(match[0]);

    // 2. Quoted strings ( "path/to.m3u8" or 'path/to.m3u8' )
    // Catches relative paths in JS configs or JSON attributes
    const quoteRegex = /["']([^"'\r\n\\]*?\.m3u8[^"'\r\n\\]*?)["']/gi;
    while ((match = quoteRegex.exec(text)) !== null) processCandidate(match[1]);

    // 3. Protocol-relative URLs ( //cdn.site.com/vid.m3u8 )
    const protoRegex = /["'](\/\/[a-zA-Z0-9\-\._~:\/?#\[\]@!$&'()*+,;=%]+\.m3u8[^"']*)?["']/gi;
    while ((match = protoRegex.exec(text)) !== null) processCandidate(match[1]);

    return Array.from(candidates);

  } catch (error: any) {
    console.error("Scanner Error:", error);
    throw new Error(`Scan failed: ${error.message}. The site might be blocking the proxy.`);
  }
};
