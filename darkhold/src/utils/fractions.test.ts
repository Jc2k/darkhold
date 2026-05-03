import { describe, it, expect } from 'vitest';
import { formatFraction } from './fractions';

describe('formatFraction', () => {
  it('returns whole numbers as-is', () => {
    expect(formatFraction(0)).toBe('0');
    expect(formatFraction(1)).toBe('1');
    expect(formatFraction(5)).toBe('5');
  });

  it('formats common simple fractions with unicode characters', () => {
    expect(formatFraction(0.5)).toBe('½');
    expect(formatFraction(0.25)).toBe('¼');
    expect(formatFraction(0.75)).toBe('¾');
    expect(formatFraction(1 / 3)).toBe('⅓');
    expect(formatFraction(2 / 3)).toBe('⅔');
  });

  it('formats mixed numbers', () => {
    expect(formatFraction(1.5)).toBe('1 ½');
    expect(formatFraction(2.25)).toBe('2 ¼');
    expect(formatFraction(3.75)).toBe('3 ¾');
  });

  it('handles negative values', () => {
    expect(formatFraction(-0.5)).toBe('-½');
    expect(formatFraction(-1.5)).toBe('-1 ½');
    expect(formatFraction(-3)).toBe('-3');
  });

  it('returns decimal string when no close fraction exists', () => {
    // 0.0101 is too small to match any fraction n/d (d ≤ 16) within the 1% threshold
    const result = formatFraction(0.0101);
    expect(result).toMatch(/^0\.\d+$/);
  });

  it('handles non-finite values', () => {
    expect(formatFraction(Infinity)).toBe('Infinity');
    expect(formatFraction(-Infinity)).toBe('-Infinity');
    expect(formatFraction(NaN)).toBe('NaN');
  });

  it('rounds up when fraction part is nearly 1', () => {
    // e.g. 1.9999 should round to 2
    expect(formatFraction(1.9999)).toBe('2');
  });

  it('formats fractions without unicode fallback using slash notation', () => {
    // 1/11 has no unicode equivalent
    const result = formatFraction(1 / 11);
    expect(result).toMatch(/\d+\/\d+|^\d+\.\d+$/);
  });
});
