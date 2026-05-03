import { useEffect, useRef } from 'react';

interface UseSwipeUpSearchOptions {
  onOpen: () => void;
  threshold?: number;
  startZone?: number;
}

export function useSwipeUpSearch({ onOpen, threshold = 60, startZone = 80 }: UseSwipeUpSearchOptions) {
  const startY = useRef(0);
  const isTracking = useRef(false);
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      if (touch.clientY >= window.innerHeight - startZone) {
        startY.current = touch.clientY;
        isTracking.current = true;
      } else {
        isTracking.current = false;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isTracking.current) return;
      isTracking.current = false;
      if (e.changedTouches.length === 0) return;
      const dy = e.changedTouches[0].clientY - startY.current;
      if (dy < -threshold) {
        onOpenRef.current();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [threshold, startZone]);
}
