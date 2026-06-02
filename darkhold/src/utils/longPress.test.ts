import { describe, expect, it } from 'vitest';
import { hasLongPressMoved, LONG_PRESS_DELAY_MS, LONG_PRESS_MOVE_TOLERANCE_PX } from './longPress';

describe('long press helpers', () => {
  it('uses a deliberate half-second touch hold', () => {
    expect(LONG_PRESS_DELAY_MS).toBe(500);
  });

  it('allows small pointer movement within the tolerance', () => {
    expect(hasLongPressMoved(LONG_PRESS_MOVE_TOLERANCE_PX, -LONG_PRESS_MOVE_TOLERANCE_PX)).toBe(
      false,
    );
  });

  it('cancels once either axis moves beyond the tolerance', () => {
    expect(hasLongPressMoved(LONG_PRESS_MOVE_TOLERANCE_PX + 1, 0)).toBe(true);
    expect(hasLongPressMoved(0, -LONG_PRESS_MOVE_TOLERANCE_PX - 1)).toBe(true);
  });
});
