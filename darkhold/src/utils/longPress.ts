/** Keep touch long-press interactions consistent across tappable surfaces. */
export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export function hasLongPressMoved(deltaX: number, deltaY: number): boolean {
  return (
    Math.abs(deltaX) > LONG_PRESS_MOVE_TOLERANCE_PX ||
    Math.abs(deltaY) > LONG_PRESS_MOVE_TOLERANCE_PX
  );
}
