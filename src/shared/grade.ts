export const MAX_ACTIVE_GRADE = 3;

/**
 * 入部年度から日本の大学年度（4月始まり・JST基準）を基準に現在の回生を算出する
 */
export function getAcademicYear(now: Date = new Date()): number {
  // Cloudflare Workers (UTC) でも日本時間 (UTC+9) 基準の4月1日で切り替わるようにする
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth() + 1; // 1-12
  return month >= 4 ? year : year - 1;
}

export function calculateGrade(enrollmentYear: number, now: Date = new Date()): number {
  const academicYear = getAcademicYear(now);
  return Math.max(1, academicYear - enrollmentYear + 1);
}

export function isActiveClubGrade(
  enrollmentYear: number,
  now: Date = new Date(),
): boolean {
  return calculateGrade(enrollmentYear, now) <= MAX_ACTIVE_GRADE;
}

export function formatGradeLabel(enrollmentYear: number, now: Date = new Date()): string {
  const grade = calculateGrade(enrollmentYear, now);
  if (grade >= 5) {
    return `${grade}回生 / OB・OG`;
  }
  return `${grade}回生`;
}

