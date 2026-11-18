/**
 * JST基準の締切文字列（YYYY-MM-DD / YYYY-MM-DDTHH:mm / ISO文字列）をミリ秒エポックへ変換する。
 */
export function parseJstDeadlineMs(
  deadline: string | null | undefined,
): number | null {
  if (!deadline) return null;
  const trimmed = deadline.trim();
  if (!trimmed) return null;

  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}T23:59:59+09:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}:59+09:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}+09:00`;
  }

  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * 指定時刻時点で締切を超過しているか判定する。未設定(null/空)の場合は false。
 */
export function isDeadlineExpired(
  deadline: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const ms = parseJstDeadlineMs(deadline);
  return ms !== null && nowMs > ms;
}

/**
 * 画面表示用の締切文字列を整形する。
 */
export function formatDeadlineDisplay(
  deadline: string | null | undefined,
): string {
  const trimmed = deadline?.trim();
  return trimmed ? trimmed.replace('T', ' ') : '未設定';
}
