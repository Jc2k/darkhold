import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  requestScreenWakeLock,
  supportsScreenWakeLock,
  useKeepScreenAwake,
} from './useKeepScreenAwake';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createWakeLockSentinel() {
  let releaseHandler: (() => void) | undefined;

  const sentinel = {
    release: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((event: string, handler: () => void) => {
      if (event === 'release') releaseHandler = handler;
    }),
  } as unknown as WakeLockSentinel;

  return { sentinel, emitRelease: () => releaseHandler?.() };
}

function HookHarness({ enabled }: { enabled: boolean }) {
  useKeepScreenAwake(enabled);
  return null;
}

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

describe('useKeepScreenAwake', () => {
  it('requests wake lock on mount and releases it on unmount', async () => {
    const { sentinel } = createWakeLockSentinel();
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(window.navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(HookHarness, { enabled: true }));
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));

    await act(async () => {
      root.unmount();
    });

    expect(sentinel.release).toHaveBeenCalledTimes(1);
    container.remove();
  });

  it('reacquires wake lock when released and page becomes visible', async () => {
    const first = createWakeLockSentinel();
    const second = createWakeLockSentinel();
    const request = vi
      .fn()
      .mockResolvedValueOnce(first.sentinel)
      .mockResolvedValueOnce(second.sentinel);
    Object.defineProperty(window.navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(HookHarness, { enabled: true }));
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    first.emitRelease();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
