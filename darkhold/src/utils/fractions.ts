// Unicode vulgar fraction characters for common fractions
const UNICODE_FRACTIONS: Record<string, string> = {
  '1/2': '½',
  '1/3': '⅓',
  '2/3': '⅔',
  '1/4': '¼',
  '3/4': '¾',
  '1/5': '⅕',
  '2/5': '⅖',
  '3/5': '⅗',
  '4/5': '⅘',
  '1/6': '⅙',
  '5/6': '⅚',
  '1/7': '⅐',
  '1/8': '⅛',
  '3/8': '⅜',
  '5/8': '⅝',
  '7/8': '⅞',
  '1/9': '⅑',
  '1/10': '⅒',
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function fractionString(num: number, den: number): string {
  return UNICODE_FRACTIONS[`${num}/${den}`] ?? `${num}/${den}`;
}

/**
 * Formats a number as a mixed-number fraction string where possible,
 * using Unicode vulgar fraction characters (e.g. 1.333... → "1 ⅓", 0.5 → "½").
 * Falls back to a trimmed decimal string if no close fraction is found.
 */
export function formatFraction(value: number): string {
  if (!isFinite(value)) return String(value);

  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const wholePart = Math.floor(absValue);
  const decimalPart = absValue - wholePart;

  const formatWhole = (n: number) => (isNegative ? `-${n}` : String(n));

  if (decimalPart < 0.001) {
    return formatWhole(wholePart);
  }

  // Find closest fraction with denominator up to 16
  let bestNum = 1;
  let bestDen = 1;
  let bestError = Infinity;

  for (let d = 1; d <= 16; d++) {
    const n = Math.round(decimalPart * d);
    const error = Math.abs(decimalPart - n / d);
    if (error < bestError) {
      bestError = error;
      bestNum = n;
      bestDen = d;
    }
  }

  // Only use fraction if it's close enough (within ~1%)
  if (bestError > 0.01) {
    const trimmed = parseFloat(absValue.toPrecision(4));
    return isNegative ? `-${trimmed}` : String(trimmed);
  }

  // Reduce fraction
  const g = gcd(bestNum, bestDen);
  const num = bestNum / g;
  const den = bestDen / g;

  // Fraction part rounds up to 1 whole
  if (num === den) {
    return formatWhole(wholePart + 1);
  }

  const frac = fractionString(num, den);
  const prefix = isNegative ? '-' : '';
  if (wholePart === 0) {
    return `${prefix}${frac}`;
  }
  return `${prefix}${wholePart} ${frac}`;
}
