import { useEffect, useRef } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  threshold?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const startY = useRef(0);
  const isPulling = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      } else {
        isPulling.current = false;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isPulling.current) return;
      if (e.changedTouches.length > 0) {
        const dy = e.changedTouches[0].clientY - startY.current;
        if (dy > threshold) {
          onRefreshRef.current();
        }
      }
      isPulling.current = false;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [threshold]);
}
