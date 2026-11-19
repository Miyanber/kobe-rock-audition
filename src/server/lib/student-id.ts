const textEncoder = new TextEncoder();

/**
 * メールアドレス（local@domain）または学籍番号文字列から、
 * 照合用の正規化済み学籍番号（@以前・小文字・前後空白除去）を抽出する。
 */
export function normalizeStudentId(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');
  return (atIndex >= 0 ? trimmed.slice(0, atIndex) : trimmed).trim();
}

/**
 * 正規化済み学籍番号が半角英数字（およびメールローカル部で一般的な . _ -）のみで構成されているか検証する。
 * 全角文字や空白の混入を防ぐために使用する。
 */
export function isValidHalfWidthStudentId(studentId: string): boolean {
  return /^[a-z0-9._-]+$/.test(studentId);
}

/**
 * 学籍番号の先頭2桁（例: 2512345t -> 2025）から入部年度を仮推定する。
 * 妥当な範囲（2000年〜fallbackYear+1）に収まらない場合は fallbackYear を返す。
 */
export function inferEnrollmentYearFromStudentId(
  studentId: string,
  fallbackYear: number,
): number {
  const match = /^(\d{2})/.exec(studentId.trim());
  if (!match) return fallbackYear;
  const yy = Number(match[1]);
  const inferred = 2000 + yy;
  if (inferred >= 2000 && inferred <= fallbackYear + 1) {
    return inferred;
  }
  return fallbackYear;
}

/**
 * 正規化済み学籍番号を HMAC-SHA256 で不可逆ハッシュ化する。
 * 秘密鍵（STUDENT_ID_HASH_SECRET）と分離することで、DB漏洩時の総当たり照合を防止する。
 */
export async function hashStudentId(
  input: string,
  secret: string,
): Promise<string> {
  const normalized = normalizeStudentId(input);
  if (!normalized) {
    throw new Error('学籍番号が空です。');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(normalized),
  );
  const bytes = new Uint8Array(signature);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
