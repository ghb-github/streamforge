
/**
 * Resolves a relative URL against a base URL.
 */
export const resolveUrl = (baseUrl: string, relativeUrl: string): string => {
  if (!relativeUrl) return '';

  // 1. Already absolute HTTP/HTTPS
  if (/^https?:\/\//i.test(relativeUrl)) {
    return relativeUrl;
  }
  
  try {
    const base = new URL(baseUrl);
    
    // 2. Protocol-relative URLs (e.g. //cdn.example.com/file.m3u8)
    if (relativeUrl.startsWith('//')) {
        return `${base.protocol}${relativeUrl}`;
    }

    // 3. Root-relative or Path-relative
    // URL constructor handles:
    // - "/path" against "http://site.com/sub/" -> "http://site.com/path"
    // - "file" against "http://site.com/sub/" -> "http://site.com/sub/file"
    return new URL(relativeUrl, base.href).toString();
  } catch (e) {
    console.warn('Error resolving URL:', e);
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
