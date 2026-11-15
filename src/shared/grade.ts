/**
 * 入部年度から日本の大学年度（4月始まり）を基準に現在の回生を算出する
 */
export function getAcademicYear(now: Date = new Date()): number {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  return month >= 4 ? year : year - 1;
}

export function calculateGrade(enrollmentYear: number, now: Date = new Date()): number {
  const academicYear = getAcademicYear(now);
  return Math.max(1, academicYear - enrollmentYear + 1);
}

export function formatGradeLabel(enrollmentYear: number, now: Date = new Date()): string {
  const grade = calculateGrade(enrollmentYear, now);
  if (grade >= 5) {
    return `${grade}回生 / OB・OG`;
  }
  return `${grade}回生`;
}

