import { useEffect, useRef } from 'react';

export function supportsScreenWakeLock(nav: Navigator): nav is Navigator & { wakeLock: WakeLock } {
  return 'wakeLock' in nav;
}

export async function requestScreenWakeLock(nav: Navigator): Promise<WakeLockSentinel | null> {
  if (!supportsScreenWakeLock(nav)) return null;

  try {
    return await nav.wakeLock.request('screen');
  } catch {
    return null;
  }
}

export function useKeepScreenAwake(enabled: boolean): void {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    let isCancelled = false;

    const requestWakeLock = async () => {
      if (wakeLockRef.current) return;
      const wakeLock = await requestScreenWakeLock(navigator);
      if (!wakeLock) return;
      if (isCancelled) {
        await wakeLock.release();
        return;
      }

      wakeLockRef.current = wakeLock;
      wakeLock.addEventListener('release', () => {
        if (wakeLockRef.current === wakeLock) {
          wakeLockRef.current = null;
        }
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      const wakeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (wakeLock) {
        void wakeLock.release();
      }
    };
  }, [enabled]);
}
