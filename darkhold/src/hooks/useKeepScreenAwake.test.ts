import { describe, expect, it, vi } from 'vitest';
import { requestScreenWakeLock, supportsScreenWakeLock } from './useKeepScreenAwake';

describe('supportsScreenWakeLock', () => {
  it('returns true when wakeLock API exists', () => {
    expect(supportsScreenWakeLock({ wakeLock: {} } as Navigator)).toBe(true);
  });

  it('returns false when wakeLock API is missing', () => {
    expect(supportsScreenWakeLock({} as Navigator)).toBe(false);
  });
});

describe('requestScreenWakeLock', () => {
  it('requests a screen wake lock when supported', async () => {
    const sentinel = {} as WakeLockSentinel;
    const request = vi.fn().mockResolvedValue(sentinel);
    const result = await requestScreenWakeLock({ wakeLock: { request } } as unknown as Navigator);

    expect(request).toHaveBeenCalledWith('screen');
    expect(result).toBe(sentinel);
  });

  it('returns null when unsupported', async () => {
    await expect(requestScreenWakeLock({} as Navigator)).resolves.toBeNull();
  });

  it('returns null when request throws', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    const result = await requestScreenWakeLock({ wakeLock: { request } } as unknown as Navigator);

    expect(result).toBeNull();
  });
});
