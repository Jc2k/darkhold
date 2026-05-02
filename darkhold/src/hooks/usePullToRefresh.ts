import { useEffect, useRef, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  threshold?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const startY = useRef(0);
  const isPulling = useRef(false);

  const stableOnRefresh = useCallback(onRefresh, [onRefresh]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      } else {
        isPulling.current = false;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isPulling.current) return;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (dy > threshold) {
        stableOnRefresh();
      }
      isPulling.current = false;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [stableOnRefresh, threshold]);
}
