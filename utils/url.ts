/**
 * Resolves a relative URL against a base URL.
 */
export const resolveUrl = (baseUrl: string, relativeUrl: string): string => {
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  
  try {
    const base = new URL(baseUrl);
    // Handle cases where base URL is a file path (e.g., .../playlist.m3u8)
    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
    
    // Construct absolute URL
    return new URL(relativeUrl, base.origin + basePath).toString();
  } catch (e) {
    console.error('Error resolving URL:', e);
    return relativeUrl;
  }
};

/**
 * Validates if a string is a valid URL.
 */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Generates a safe filename from the URL or defaults.
 * Sanitizes characters to be safe for command line usage.
 */
export const getFilenameFromUrl = (url: string, ext: string): string => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const name = pathname.substring(pathname.lastIndexOf('/') + 1);
    
    let nameWithoutExt = name.split('.')[0];
    
    // Sanitize: allow alphanumeric, underscores, hyphens. Replace others with underscore.
    nameWithoutExt = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    if (!nameWithoutExt) nameWithoutExt = 'video';
    
    // Prevent timestamp collisions if multiple downloads
    if (nameWithoutExt === 'video') {
         nameWithoutExt = `video_${Math.floor(Date.now() / 1000)}`;
    }

    return `${nameWithoutExt}.${ext}`;
  } catch {
    return `video_${Math.floor(Date.now() / 1000)}.${ext}`;
  }
};