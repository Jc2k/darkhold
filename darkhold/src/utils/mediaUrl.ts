/**
 * Converts an absolute Tandoor media URL to a root-relative path so that
 * the nginx proxy (which handles /media/ at the same origin as the app) can
 * serve it in production.
 *
 * e.g. "http://tandoor:8080/media/recipes/foo.jpg"
 *   -> "/media/recipes/foo.jpg"
 *
 * Relative URLs and plain paths are returned unchanged.
 */
export function proxyMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    // Only rewrite URLs that are not already on the current browser origin
    if (parsed.origin !== window.location.origin) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // Not an absolute URL – fall through and return as-is
  }
  return url;
}
