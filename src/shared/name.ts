/**
 * 氏名文字列の前後空白を除去し、全角スペースや連続空白を単一の半角スペースへ統一する。
 */
export function normalizeMemberName(input: string): string {
  return input.trim().replace(/[\s\u3000]+/g, ' ');
}

/**
 * 「苗字<半角スペース>名前」の形式（正規化後に半角スペース区切りで2語以上、各語が空でない）かを検証する。
 */
export function isValidMemberName(input: string): boolean {
  const normalized = normalizeMemberName(input);
  if (!normalized) return false;
  const parts = normalized.split(' ');
  return parts.length >= 2 && parts.every((part) => part.length > 0);
}
