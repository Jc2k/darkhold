import { describe, expect, it } from 'vitest';
import { getVersionReloadUrl, shouldReloadForVersion } from './useInvalidationSocket';

describe('shouldReloadForVersion', () => {
  it('reloads when the server version changes and has not already reloaded for it', () => {
    expect(shouldReloadForVersion('1.2.4', '1.2.3', null)).toBe(true);
  });

  it('does not reload when the app is already on the current server version', () => {
    expect(shouldReloadForVersion('1.2.3', '1.2.3', null)).toBe(false);
  });

  it('does not reload again for the same server version', () => {
    expect(shouldReloadForVersion('1.2.4', '1.2.3', '1.2.4')).toBe(false);
  });
});

describe('getVersionReloadUrl', () => {
  it('adds a cache-busting version parameter to the current URL', () => {
    expect(getVersionReloadUrl('https://darkhold.example.com/meal-plan', '1.2.4')).toBe(
      'https://darkhold.example.com/meal-plan?darkhold_reload_version=1.2.4',
    );
  });

  it('preserves existing query parameters and hash fragments', () => {
    expect(
      getVersionReloadUrl('https://darkhold.example.com/search?q=pasta#results', '1.2.4'),
    ).toBe('https://darkhold.example.com/search?q=pasta&darkhold_reload_version=1.2.4#results');
  });

  it('replaces any stale reload version parameter', () => {
    expect(
      getVersionReloadUrl(
        'https://darkhold.example.com/dashboard?darkhold_reload_version=1.2.3',
        '1.2.4',
      ),
    ).toBe('https://darkhold.example.com/dashboard?darkhold_reload_version=1.2.4');
  });
});
