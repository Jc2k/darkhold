import { describe, it, expect, beforeEach } from 'vitest';
import { proxyMediaUrl } from './mediaUrl';

describe('proxyMediaUrl', () => {
  beforeEach(() => {
    // jsdom sets window.location.origin to 'http://localhost' by default
  });

  it('returns undefined for null', () => {
    expect(proxyMediaUrl(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(proxyMediaUrl(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(proxyMediaUrl('')).toBeUndefined();
  });

  it('rewrites an absolute URL from a different origin to a root-relative path', () => {
    expect(proxyMediaUrl('http://tandoor:8080/media/recipes/foo.jpg')).toBe(
      '/media/recipes/foo.jpg',
    );
  });

  it('preserves query string and hash when rewriting', () => {
    expect(proxyMediaUrl('http://tandoor:8080/media/img.png?v=1#anchor')).toBe(
      '/media/img.png?v=1#anchor',
    );
  });

  it('returns a plain relative path unchanged', () => {
    expect(proxyMediaUrl('/media/recipes/foo.jpg')).toBe('/media/recipes/foo.jpg');
  });

  it('returns a URL at the current origin unchanged', () => {
    // jsdom origin is 'http://localhost'
    expect(proxyMediaUrl('http://localhost/media/recipes/foo.jpg')).toBe(
      'http://localhost/media/recipes/foo.jpg',
    );
  });
});
