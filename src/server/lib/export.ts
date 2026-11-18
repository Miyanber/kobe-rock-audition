import * as XLSX from 'xlsx';
import {
  round2,
  type AuditionAggregationOutput,
} from '../../shared/aggregation.ts';
import { calculateGrade } from '../../shared/grade.ts';
import type { AggregationMethod } from '../../shared/schema/index.ts';

function methodLabel(method: AggregationMethod): string {
  switch (method) {
    case 'DIFF_CORRECTION':
      return '点差補正方式';
    case 'Z_SCORE':
      return 'Zスコア（偏差値）方式';
    case 'RAW_AVERAGE':
      return '単純平均方式';
  }
}

export function sanitizeExcelSheetName(
  rawName: string,
  usedNames: Set<string>,
): string {
  // Excel禁止文字 \ / ? * [ ] : をアンダースコアに置換し、先頭末尾のシングルクォートを除去
  let cleaned = rawName
    .replace(/[\\/?*[\]:]/g, '_')
    .replace(/^'+|'+$/g, '')
    .trim();
  if (!cleaned) cleaned = 'Band';

  let candidate = cleaned.slice(0, 31);
  let counter = 2;
  while (usedNames.has(candidate)) {
    const suffix = `_${counter}`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    counter++;
  }
  usedNames.add(candidate);
  return candidate;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function aoaToUtf8BomCsv(rows: (string | number | null | undefined)[][]): Uint8Array {
  const csvBody = rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\r\n');
  const bom = '\uFEFF';
  return new TextEncoder().encode(bom + csvBody);
}

/**
 * ファイル1（集計結果＆生データブック）用のシートA/Bデータ配列を構築
 */
export function buildSummaryAndRawSheets(
  auditionTitle: string,
  eventDate: string,
  result: AuditionAggregationOutput,
) {
  const activeMethod = result.audition.aggregationMethod;
  const methodText = methodLabel(activeMethod);

  // シート1: 総合ランキング集計シート
  const summaryRows: (string | number)[][] = [
    [
      `開催回: ${auditionTitle}`,
      `開催日: ${eventDate}`,
      `採用集計方式: ${methodText}`,
      `基準点差定数: ${result.audition.standardDiff}`,
      `ペナルティ制度: ${result.audition.isPenaltyEnabled ? '有効' : '無効'}`,
    ],
    [],
    [
      '順位',
      '出演順',
      'バンド名',
      '所属メンバー',
      '有効投票数',
      'コメント数',
      '素点平均(魅力)',
      '素点平均(技術)',
      '素点平均(合計)',
      '正規化平均(魅力)',
      '正規化平均(技術)',
      '正規化平均(合計)',
      'ペナルティ設定値',
      '適用ペナルティ減点',
      '最終スコア(控除後)',
      '参考_点差補正最終',
      '参考_Zスコア偏差値最終',
      '参考_単純平均最終',
    ],
  ];

  for (const b of result.bandResults) {
    summaryRows.push([
      b.isTied ? `${b.rank} (同率)` : b.rank,
      b.performanceOrder,
      b.bandName,
      b.memberNames.join(', '),
      b.validVoteCount,
      b.commentCount,
      round2(b.avgRawCharm),
      round2(b.avgRawTech),
      round2(b.avgRawTotal),
      round2(b.activeAvgNormCharm),
      round2(b.activeAvgNormTech),
      round2(b.activePrePenaltyScore),
      round2(b.penaltyDeduction),
      round2(b.appliedPenalty),
      round2(b.activeFinalScore),
      round2(b.diffMethod.finalScore),
      round2(b.zScoreMethod.finalScore),
      round2(b.rawMethod.finalScore),
    ]);
  }

  // シート2: 全採点Rawデータ＆補正計算過程シート
  const rawRows: (string | number)[][] = [
    ['【審査員別 基準値・補正係数一覧】'],
    [
      '審査員名',
      '権限区分',
      '有効採点数',
      '最高点(MAX)',
      '最低点(MIN)',
      '点差(Diff)',
      '基準点差定数',
      '補正係数(定数/Diff)',
      '素点平均',
      '素点標準偏差',
    ],
  ];

  for (const e of result.evaluatorStats) {
    rawRows.push([
      e.userName,
      e.permissionType === 'SCORE_AND_COMMENT' ? '採点＋コメント' : 'コメントのみ',
      e.validVoteCount,
      e.maxScore !== null ? round2(e.maxScore) : '-',
      e.minScore !== null ? round2(e.minScore) : '-',
      e.diff !== null ? round2(e.diff) : '-',
      result.audition.standardDiff,
      round2(e.correctionFactor),
      e.meanScore !== null ? round2(e.meanScore) : '-',
      e.stdDev !== null ? round2(e.stdDev) : '-',
    ]);
  }

  rawRows.push([]);
  rawRows.push(['【全投票 Rawデータ ＆ 正規化計算結果（魅力・技術按分含む）】']);
  rawRows.push([
    '出演順',
    'バンド名',
    '採点者名',
    '権限区分',
    '自バンド除外',
    '数値集計対象',
    '素点_魅力',
    '素点_技術',
    '素点_合計',
    '点差補正_魅力',
    '点差補正_技術',
    '点差補正_合計',
    'Zスコア_魅力',
    'Zスコア_技術',
    'Zスコア_合計(偏差値)',
    'Z値',
    'コメント',
  ]);

  for (const v of result.voteRecords) {
    rawRows.push([
      v.performanceOrder,
      v.bandName,
      v.evaluatorName,
      v.permissionType === 'SCORE_AND_COMMENT' ? '採点＋コメント' : 'コメントのみ',
      v.isOwnBand ? 'はい(除外)' : 'いいえ',
      v.isValidNumericVote ? '対象' : '除外',
      v.rawCharm !== null ? round2(v.rawCharm) : '-',
      v.rawTech !== null ? round2(v.rawTech) : '-',
      v.rawTotal !== null ? round2(v.rawTotal) : '-',
      v.diffCorrected ? round2(v.diffCorrected.normCharm) : '-',
      v.diffCorrected ? round2(v.diffCorrected.normTech) : '-',
      v.diffCorrected ? round2(v.diffCorrected.normTotal) : '-',
      v.zScored ? round2(v.zScored.normCharm) : '-',
      v.zScored ? round2(v.zScored.normTech) : '-',
      v.zScored ? round2(v.zScored.normTotal) : '-',
      v.zScored ? round2(v.zScored.zValue) : '-',
      v.comment,
    ]);
  }

  return { summaryRows, rawRows };
}

/**
 * 全体講評（総括）シートのデータ配列と列幅設定を構築
 */
export function buildGeneralFeedbackRows(
  auditionTitle: string,
  result: AuditionAggregationOutput,
): (string | number)[][] {
  const feedbacks = result.generalFeedbacks ?? [];
  const entered = feedbacks.filter((g) => g.generalFeedback.trim().length > 0);

  const rows: (string | number)[][] = [
    [
      `開催回: ${auditionTitle}`,
      `全体講評入力数: ${entered.length} / ${feedbacks.length}名`,
    ],
    [],
    ['採点者名', '回生', '権限区分', '提出状況', '提出日時', '全体講評'],
  ];

  if (entered.length === 0) {
    rows.push(['（全体講評データはまだありません）', '-', '-', '-', '-', '']);
    return rows;
  }

  for (const g of entered) {
    rows.push([
      g.userName,
      g.enrollmentYear !== undefined ? `${calculateGrade(g.enrollmentYear)}回生` : '-',
      g.permissionType === 'SCORE_AND_COMMENT' ? '採点＋コメント' : 'コメントのみ',
      g.isSubmitted ? '提出済' : '下書き保存',
      g.submittedAt
        ? new Date(g.submittedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
        : '-',
      g.generalFeedback,
    ]);
  }

  return rows;
}

const GENERAL_FEEDBACK_COL_WIDTHS = [
  { wch: 24 },
  { wch: 10 },
  { wch: 16 },
  { wch: 12 },
  { wch: 20 },
  { wch: 72 },
];

/**
 * ファイル1: 集計結果＆生データブック（Excel 3シート構成 or CSV）を生成
 */
export function generateSummaryAndRawExport(
  auditionTitle: string,
  eventDate: string,
  result: AuditionAggregationOutput,
  format: 'xlsx' | 'csv',
): { data: Uint8Array; contentType: string; filename: string } {
  const { summaryRows, rawRows } = buildSummaryAndRawSheets(
    auditionTitle,
    eventDate,
    result,
  );
  const generalFeedbackRows = buildGeneralFeedbackRows(auditionTitle, result);
  const safeTitle = auditionTitle.replace(/[\\/:*?"<>|]/g, '_');

  if (format === 'csv') {
    const combined: (string | number)[][] = [
      ['=== シート1: 総合ランキング集計 ==='],
      ...summaryRows,
      [],
      ['=== シート2: 全採点Rawデータ＆補正計算過程 ==='],
      ...rawRows,
      [],
      ['=== シート3: 全体講評 ==='],
      ...generalFeedbackRows,
    ];
    return {
      data: aoaToUtf8BomCsv(combined),
      contentType: 'text/csv; charset=utf-8',
      filename: `${safeTitle}_集計結果_生データ.csv`,
    };
  }

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  const wsRaw = XLSX.utils.aoa_to_sheet(rawRows);
  const wsGeneralFeedback = XLSX.utils.aoa_to_sheet(generalFeedbackRows);

  wsSummary['!cols'] = [
    { wch: 10 },
    { wch: 8 },
    { wch: 24 },
    { wch: 26 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
  ];
  wsRaw['!cols'] = [
    { wch: 10 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 48 },
  ];
  wsGeneralFeedback['!cols'] = GENERAL_FEEDBACK_COL_WIDTHS;

  XLSX.utils.book_append_sheet(wb, wsSummary, '総合ランキング集計');
  XLSX.utils.book_append_sheet(wb, wsRaw, '全採点Rawデータ_補正過程');
  XLSX.utils.book_append_sheet(wb, wsGeneralFeedback, '全体講評');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    data: new Uint8Array(out),
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${safeTitle}_集計結果_生データ.xlsx`,
  };
}

/**
 * ファイル2: バンド別講評コメントブック（各バンドごと1シート＋全体講評シート構成 or CSV）を生成
 * 各シートには採点者の対象バンドに対する正規化後点数（魅力点, 技術点, 合計点）とコメントを掲載する。
 */
export function generateBandCommentsExport(
  auditionTitle: string,
  result: AuditionAggregationOutput,
  format: 'xlsx' | 'csv',
): { data: Uint8Array; contentType: string; filename: string } {
  const safeTitle = auditionTitle.replace(/[\\/:*?"<>|]/g, '_');
  const orderedBands = [...result.bandResults].sort(
    (a, b) => a.performanceOrder - b.performanceOrder,
  );
  const generalFeedbackRows = buildGeneralFeedbackRows(auditionTitle, result);

  if (format === 'csv') {
    const csvRows: (string | number)[][] = [
      [
        '出演順',
        'バンド名',
        '順位',
        '採点者名',
        '権限区分',
        '正規化後_魅力点',
        '正規化後_技術点',
        '正規化後_合計点',
        'コメント',
      ],
    ];
    for (const band of orderedBands) {
      const bandVotes = result.voteRecords.filter(
        (v) => v.bandId === band.bandId && !v.isOwnBand,
      );
      for (const v of bandVotes) {
        if (!v.isValidNumericVote && !v.comment.trim()) continue;
        csvRows.push([
          band.performanceOrder,
          band.bandName,
          band.rank,
          v.evaluatorName,
          v.permissionType === 'SCORE_AND_COMMENT' ? '採点＋コメント' : 'コメントのみ',
          v.activeNormalized ? round2(v.activeNormalized.normCharm) : '-',
          v.activeNormalized ? round2(v.activeNormalized.normTech) : '-',
          v.activeNormalized ? round2(v.activeNormalized.normTotal) : '-',
          v.comment,
        ]);
      }
    }
    csvRows.push([]);
    csvRows.push(['=== 全体講評 ===']);
    csvRows.push(...generalFeedbackRows);
    return {
      data: aoaToUtf8BomCsv(csvRows),
      contentType: 'text/csv; charset=utf-8',
      filename: `${safeTitle}_バンド別講評シート.csv`,
    };
  }

  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();
  const activeMethodText = methodLabel(result.audition.aggregationMethod);

  if (orderedBands.length === 0) {
    const emptySheet = XLSX.utils.aoa_to_sheet([['登録されているバンドがありません']]);
    const emptyName = sanitizeExcelSheetName('バンドなし', usedSheetNames);
    XLSX.utils.book_append_sheet(wb, emptySheet, emptyName);
  }

  for (const band of orderedBands) {
    const sheetName = sanitizeExcelSheetName(
      `${String(band.performanceOrder).padStart(2, '0')}_${band.bandName}`,
      usedSheetNames,
    );

    const rows: (string | number)[][] = [
      [`バンド名: ${band.bandName}`, `出演順: ${band.performanceOrder}`, `総合順位: ${band.rank}位${band.isTied ? ' (同率)' : ''}`],
      [`メンバー: ${band.memberNames.join(', ') || '未設定'}`, `採用集計方式: ${activeMethodText}`, `有効採点者数: ${band.validVoteCount}`],
      [
        `正規化後平均(魅力): ${round2(band.activeAvgNormCharm)}`,
        `正規化後平均(技術): ${round2(band.activeAvgNormTech)}`,
        `正規化後平均(合計): ${round2(band.activePrePenaltyScore)}`,
        `ペナルティ減点: -${round2(band.appliedPenalty)}`,
        `最終スコア: ${round2(band.activeFinalScore)}`,
      ],
      [],
      [
        '採点者名',
        '権限区分',
        '正規化後_魅力点',
        '正規化後_技術点',
        '正規化後_合計点',
        'コメント',
      ],
    ];

    const bandVotes = result.voteRecords.filter(
      (v) => v.bandId === band.bandId && !v.isOwnBand,
    );

    let addedRows = 0;
    for (const v of bandVotes) {
      if (!v.isValidNumericVote && !v.comment.trim()) continue;
      rows.push([
        v.evaluatorName,
        v.permissionType === 'SCORE_AND_COMMENT' ? '採点＋コメント' : 'コメントのみ',
        v.activeNormalized ? round2(v.activeNormalized.normCharm) : '-',
        v.activeNormalized ? round2(v.activeNormalized.normTech) : '-',
        v.activeNormalized ? round2(v.activeNormalized.normTotal) : '-',
        v.comment,
      ]);
      addedRows++;
    }

    if (addedRows === 0) {
      rows.push(['（採点・コメントデータはまだありません）', '', '-', '-', '-', '']);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 64 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const wsGeneralFeedback = XLSX.utils.aoa_to_sheet(generalFeedbackRows);
  wsGeneralFeedback['!cols'] = GENERAL_FEEDBACK_COL_WIDTHS;
  const generalSheetName = sanitizeExcelSheetName('全体講評', usedSheetNames);
  XLSX.utils.book_append_sheet(wb, wsGeneralFeedback, generalSheetName);

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    data: new Uint8Array(out),
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${safeTitle}_バンド別講評シート.xlsx`,
  };
}

