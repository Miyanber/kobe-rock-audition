import { describe, expect, it } from 'vitest';
import {
  formatDeadlineDisplay,
  isDeadlineExpired,
  parseJstDeadlineMs,
} from '../deadline.ts';

describe('deadline (締切判定ユーティリティ)', () => {
  it('JST基準の締切文字列を正しくパースし超過判定できる', () => {
    expect(parseJstDeadlineMs(null)).toBeNull();
    expect(parseJstDeadlineMs('')).toBeNull();
    expect(parseJstDeadlineMs('   ')).toBeNull();

    const beforeMinute = Date.parse('2026-12-10T23:59:30+09:00');
    const afterMinute = Date.parse('2026-12-11T00:00:00+09:00');

    expect(isDeadlineExpired('2026-12-10T23:59', beforeMinute)).toBe(false);
    expect(isDeadlineExpired('2026-12-10T23:59', afterMinute)).toBe(true);

    expect(isDeadlineExpired('2026-12-10', beforeMinute)).toBe(false);
    expect(isDeadlineExpired('2026-12-10', afterMinute)).toBe(true);

    expect(isDeadlineExpired(null, afterMinute)).toBe(false);
    expect(formatDeadlineDisplay('2026-12-10T23:59')).toBe('2026-12-10 23:59');
    expect(formatDeadlineDisplay(null)).toBe('未設定');
  });
});
