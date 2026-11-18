import { describe, expect, it } from 'vitest';
import {
  calculateGrade,
  getAcademicYear,
  getAcademicYearFromDateString,
  isActiveClubGrade,
} from '../grade.ts';

describe('grade (4月基準の回生計算・現役判定)', () => {
  it('JSTの3月31日と4月1日で年度が切り替わる', () => {
    const marchEnd = new Date('2026-03-31T23:59:59+09:00');
    const aprilStart = new Date('2026-04-01T00:00:00+09:00');

    expect(getAcademicYear(marchEnd)).toBe(2025);
    expect(getAcademicYear(aprilStart)).toBe(2026);
    expect(getAcademicYearFromDateString('2026-03-31')).toBe(2025);
    expect(getAcademicYearFromDateString('2026-04-01')).toBe(2026);
    expect(getAcademicYearFromDateString('2027-02-15')).toBe(2026);
    expect(getAcademicYearFromDateString('2027-04-15')).toBe(2027);

    // 2023年入部生: 2026年3月31日時点では3回生、4月1日時点で4回生になる
    expect(calculateGrade(2023, marchEnd)).toBe(3);
    expect(calculateGrade(2023, aprilStart)).toBe(4);
  });

  it('3回生までが現役対象 (isActiveClubGrade === true) で4回生以上は非対象になる', () => {
    const april2026 = new Date('2026-04-01T00:00:00+09:00');
    const march2026 = new Date('2026-03-31T23:59:59+09:00');

    // 2026年4月1日時点: 2026(1回), 2025(2回), 2024(3回) は表示対象 / 2023(4回) は非表示
    expect(isActiveClubGrade(2026, april2026)).toBe(true);
    expect(isActiveClubGrade(2025, april2026)).toBe(true);
    expect(isActiveClubGrade(2024, april2026)).toBe(true);
    expect(isActiveClubGrade(2023, april2026)).toBe(false);
    expect(isActiveClubGrade(2022, april2026)).toBe(false);

    // 2026年3月31日時点では 2023年入部生はまだ3回生なので表示対象
    expect(isActiveClubGrade(2023, march2026)).toBe(true);
  });
});
