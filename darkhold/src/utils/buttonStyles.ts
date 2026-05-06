import type { CSSProperties } from 'react';

export const addToMealPlanButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  padding: 0,
  borderRadius: '50%',
  lineHeight: 1,
  fontSize: '1.25rem',
};

/** Shared style for small circular icon buttons in card rows. */
export const smallCircleButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: '50%',
  lineHeight: 1,
  fontSize: '1rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
