import { describe, it, expect } from 'vitest';
import { parseDuration } from './duration.js';

describe('parseDuration', () => {
  it('should return number as-is (milliseconds)', () => {
    expect(parseDuration(1000)).toBe(1000);
    expect(parseDuration(0)).toBe(0);
  });

  it('should parse seconds', () => {
    expect(parseDuration('1s')).toBe(1000);
    expect(parseDuration('30s')).toBe(30000);
  });

  it('should parse minutes', () => {
    expect(parseDuration('1m')).toBe(60000);
    expect(parseDuration('5m')).toBe(300000);
  });

  it('should parse hours', () => {
    expect(parseDuration('1h')).toBe(3600000);
    expect(parseDuration('24h')).toBe(86400000);
  });

  it('should parse days', () => {
    expect(parseDuration('1d')).toBe(86400000);
    expect(parseDuration('7d')).toBe(604800000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseDuration('invalid')).toThrow();
    expect(() => parseDuration('10x')).toThrow();
    expect(() => parseDuration('')).toThrow();
  });
});
