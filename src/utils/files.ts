const invalidFileUrls = new Set(['', '#', 'about:blank']);

export function hasFile(url?: string): boolean {
  const value = url?.trim() ?? '';
  return !invalidFileUrls.has(value.toLowerCase());
}

export function isDataUrl(url: string): boolean {
  return /^data:/i.test(url.trim());
}

export function isBlobUrl(url: string): boolean {
  return /^blob:/i.test(url.trim());
}

export function isPdf(url: string): boolean {
  const value = url.trim();
  return /^data:application\/pdf/i.test(value) || /\.pdf(?:[?#].*)?$/i.test(value);
}

export function isImage(url: string): boolean {
  const value = url.trim();
  return /^data:image\//i.test(value) || /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(value);
}

function isSameOriginUrl(url: string): boolean {
  if (isDataUrl(url) || isBlobUrl(url)) return true;
  if (typeof window === 'undefined') return url.startsWith('/');

  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function getSafeDownloadAttribute(url?: string, filename?: string): string | boolean | undefined {
  if (!hasFile(url)) return undefined;
  const value = url!.trim();
  return isSameOriginUrl(value) ? filename || true : undefined;
}
