import { describe, expect, it } from 'vitest';
import {
  formatDeadlineDisplay,
  formatRemainingDeadline,
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

  it('締切までの残り時間を日数・時間・分でフォーマットできる', () => {
    const deadline = '2026-12-10T23:59';
    // 2026-12-08T10:59:59+09:00 -> 2日と13時間前 -> あと2日
    expect(
      formatRemainingDeadline(
        deadline,
        Date.parse('2026-12-08T10:59:59+09:00'),
      ),
    ).toBe('あと2日');
    // 2026-12-10T20:29:59+09:00 -> 3時間30分前 -> あと3時間
    expect(
      formatRemainingDeadline(
        deadline,
        Date.parse('2026-12-10T20:29:59+09:00'),
      ),
    ).toBe('あと3時間');
    // 2026-12-10T23:59:30+09:00 -> 1分未満は「あと1分」
    expect(
      formatRemainingDeadline(
        deadline,
        Date.parse('2026-12-10T23:59:30+09:00'),
      ),
    ).toBe('あと1分');
    // 超過・未設定は null
    expect(
      formatRemainingDeadline(
        deadline,
        Date.parse('2026-12-11T00:00:00+09:00'),
      ),
    ).toBeNull();
    expect(formatRemainingDeadline(null)).toBeNull();
  });
});
