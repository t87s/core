/**
 * Duration can be a number (milliseconds) or human-readable string.
 * Examples: 1000, '1s', '5m', '1h', '1d'
 */
export type Duration = number | string;

const UNITS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse a duration value to milliseconds.
 */
export function parseDuration(value: Duration): number {
  if (typeof value === 'number') {
    return value;
  }

  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: "${value}". Use number or string like "30s", "5m", "1h", "1d".`);
  }

  const [, amount, unit] = match;
  return parseInt(amount, 10) * UNITS[unit];
}
