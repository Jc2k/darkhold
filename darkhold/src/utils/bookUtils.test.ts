import { describe, it, expect } from 'vitest';
import { getFilterId } from './bookUtils';

describe('getFilterId', () => {
  it('returns null for null input', () => {
    expect(getFilterId(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(getFilterId(undefined)).toBeNull();
  });

  it('returns the number directly when given a number', () => {
    expect(getFilterId(42)).toBe(42);
    expect(getFilterId(0)).toBe(0);
  });

  it('returns the id from a Keyword object', () => {
    expect(getFilterId({ id: 7, name: 'vegan', description: '' })).toBe(7);
  });
});
