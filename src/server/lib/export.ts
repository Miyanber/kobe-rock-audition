import * as XLSX from 'xlsx';
import {
  round2,
  round4,
  type AuditionAggregationOutput,
} from '../../shared/aggregation.ts';
import { calculateGrade } from '../../shared/grade.ts';
import type { AggregationMethod } from '../../shared/schema/index.ts';

function methodLabel(method: AggregationMethod): string {
  switch (method) {
    case 'DIFF_CORRECTION':
      return 'Min-Max正規化';
    case 'Z_SCORE':
      return 'Zスコア正規化';
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

type CellValue = string | number | XLSX.CellObject;

function formulaNum(
  formula: string,
  cachedValue: number,
  numFmt?: string,
): XLSX.CellObject {
  const safeVal = Number.isFinite(cachedValue) ? cachedValue : 0;
  return numFmt
    ? { t: 'n', f: formula, v: safeVal, z: numFmt }
    : { t: 'n', f: formula, v: safeVal };
}

function formulaText(formula: string, cachedValue: string): XLSX.CellObject {
  return { t: 's', f: formula, v: cachedValue };
}

function formulaOrDash(
  formula: string,
  cachedValue: number | null | undefined,
  numFmt = '0.00',
): XLSX.CellObject {
  if (
    cachedValue !== null &&
    cachedValue !== undefined &&
    Number.isFinite(cachedValue)
  ) {
    return { t: 'n', f: formula, v: cachedValue, z: numFmt };
  }
  return { t: 's', f: formula, v: '-' };
}

const SHEET_SUMMARY = '総合ランキング集計';
const SHEET_RAW = '全採点データ_補正過程';
const SHEET_EVALUATORS = '審査員別_補正係数';
const SHEET_MATRIX = '採点者別_補正後スコア表';

/**
 * ファイル1（集計結果＆生データブック）用の4シート（数式版）およびCSV用配列を構築
 * フロー: [2: 全採点データ_補正過程] -> [3: 審査員別_補正係数] -> [4: 採点者別_補正後スコア表] -> [1: 総合ランキング集計]
 */
export function buildSummaryAndRawSheets(
  auditionTitle: string,
  eventDate: string,
  result: AuditionAggregationOutput,
) {
  const activeMethod = result.audition.aggregationMethod;
  const methodText = methodLabel(activeMethod);
  const standardDiff =
    result.audition.standardDiff > 0 ? result.audition.standardDiff : 100;
  const penaltyStatus = result.audition.isPenaltyEnabled ? '有効' : '無効';

  const orderedBands = [...result.bandResults].sort(
    (a, b) => a.performanceOrder - b.performanceOrder,
  );
  const evaluators = result.evaluatorStats;
  const votes = result.voteRecords;

  const hasVotes = votes.length > 0;
  const hasEvaluators = evaluators.length > 0;

  // Excel 1-indexed row boundaries (at least row 2 / row 3 so ranges remain syntactically valid)
  const voteStartRow = 2;
  const voteEndRow = hasVotes ? 1 + votes.length : 2;
  const evalStartRow = 2;
  const evalEndRow = hasEvaluators ? 1 + evaluators.length : 2;
  const matrixStartRow = 3;
  const matrixEndRow = hasEvaluators ? 2 + evaluators.length : 3;

  const rawRef = `'${SHEET_RAW}'`;
  const evalRef = `'${SHEET_EVALUATORS}'`;
  const matrixRef = `'${SHEET_MATRIX}'`;
  const summaryRef = `'${SHEET_SUMMARY}'`;

  const evalNameRange = `${evalRef}!$A$${evalStartRow}:$A$${evalEndRow}`;
  const evalMinRange = `${evalRef}!$E$${evalStartRow}:$E$${evalEndRow}`;
  const evalFactorRange = `${evalRef}!$H$${evalStartRow}:$H$${evalEndRow}`;
  const evalMeanRange = `${evalRef}!$I$${evalStartRow}:$I$${evalEndRow}`;
  const evalStdRange = `${evalRef}!$J$${evalStartRow}:$J$${evalEndRow}`;

  const rawBandRange = `${rawRef}!$B$${voteStartRow}:$B$${voteEndRow}`;
  const rawEvalRange = `${rawRef}!$C$${voteStartRow}:$C$${voteEndRow}`;
  const rawOwnRange = `${rawRef}!$E$${voteStartRow}:$E$${voteEndRow}`;
  const rawValidRange = `${rawRef}!$F$${voteStartRow}:$F$${voteEndRow}`;
  const rawCharmRange = `${rawRef}!$G$${voteStartRow}:$G$${voteEndRow}`;
  const rawTechRange = `${rawRef}!$H$${voteStartRow}:$H$${voteEndRow}`;
  const rawTotalRange = `${rawRef}!$I$${voteStartRow}:$I$${voteEndRow}`;
  const rawDiffCharmRange = `${rawRef}!$J$${voteStartRow}:$J$${voteEndRow}`;
  const rawDiffTechRange = `${rawRef}!$K$${voteStartRow}:$K$${voteEndRow}`;
  const rawDiffTotalRange = `${rawRef}!$L$${voteStartRow}:$L$${voteEndRow}`;
  const rawZCharmRange = `${rawRef}!$M$${voteStartRow}:$M$${voteEndRow}`;
  const rawZTechRange = `${rawRef}!$N$${voteStartRow}:$N$${voteEndRow}`;
  const rawZTotalRange = `${rawRef}!$O$${voteStartRow}:$O$${voteEndRow}`;
  const rawCommentRange = `${rawRef}!$Q$${voteStartRow}:$Q$${voteEndRow}`;
  const rawSqDiffRange = `${rawRef}!$R$${voteStartRow}:$R$${voteEndRow}`;

  // =========================================================================
  // シート2: 全採点データ_補正過程 (scores レコード全件のみ + 行単位数式)
  // =========================================================================
  const rawHeader = [
    '出演順',
    'バンド名',
    '採点者名',
    '権限区分',
    '自バンド除外',
    '数値集計対象',
    '素点_魅力',
    '素点_技術',
    '素点_合計',
    'Min-Max正規化_魅力',
    'Min-Max正規化_技術',
    'Min-Max正規化_合計',
    'Zスコア正規化_魅力',
    'Zスコア正規化_技術',
    'Zスコア正規化_合計(偏差値)',
    'Z値',
    'コメント',
    '偏差2乗(Zスコア補助)',
  ];
  const rawRows: CellValue[][] = [rawHeader];
  const rawCsvRows: (string | number)[][] = [rawHeader.slice(0, 17)];

  if (!hasVotes) {
    rawRows.push(new Array(rawHeader.length).fill(''));
  } else {
    const evaluatorStatsMap = new Map(evaluators.map((e) => [e.userId, e]));

    votes.forEach((v, idx) => {
      const r = voteStartRow + idx;
      const permLabel =
        v.permissionType === 'SCORE_AND_COMMENT'
          ? '採点＋コメント'
          : 'コメントのみ';
      const ownLabel = v.isOwnBand ? 'はい(除外)' : 'いいえ';
      const validLabel = v.isValidNumericVote ? '対象' : '除外';
      const trimmedComment = v.comment.trim();

      const validFormula = `IF(AND(E${r}="いいえ",D${r}="採点＋コメント",ISNUMBER(G${r}),ISNUMBER(H${r})),"対象","除外")`;
      const rawTotalFormula = `IF(F${r}="対象",G${r}+H${r},"-")`;

      const matchExpr = `MATCH(C${r},${evalNameRange},0)`;
      const minExpr = `INDEX(${evalMinRange},${matchExpr})`;
      const factorExpr = `INDEX(${evalFactorRange},${matchExpr})`;
      const meanExpr = `INDEX(${evalMeanRange},${matchExpr})`;
      const stdExpr = `INDEX(${evalStdRange},${matchExpr})`;

      const diffTotalFormula = `IF(F${r}="対象",(I${r}-${minExpr})*${factorExpr},"-")`;
      const diffCharmFormula = `IF(F${r}="対象",IF(I${r}>0,L${r}*(G${r}/I${r}),L${r}/2),"-")`;
      const diffTechFormula = `IF(F${r}="対象",IF(I${r}>0,L${r}*(H${r}/I${r}),L${r}/2),"-")`;

      const zValFormula = `IF(F${r}="対象",IF(AND(ISNUMBER(${stdExpr}),${stdExpr}>0),(I${r}-${meanExpr})/${stdExpr},0),"-")`;
      const zTotalFormula = `IF(F${r}="対象",50+10*P${r},"-")`;
      const zCharmFormula = `IF(F${r}="対象",IF(I${r}>0,O${r}*(G${r}/I${r}),O${r}/2),"-")`;
      const zTechFormula = `IF(F${r}="対象",IF(I${r}>0,O${r}*(H${r}/I${r}),O${r}/2),"-")`;
      const sqDiffFormula = `IF(F${r}="対象",(I${r}-${meanExpr})^2,"-")`;

      const evalStat = evaluatorStatsMap.get(v.evaluatorUserId);
      const sqDiffCached =
        v.isValidNumericVote &&
        v.rawTotal !== null &&
        evalStat &&
        evalStat.meanScore !== null
          ? (v.rawTotal - evalStat.meanScore) ** 2
          : null;

      rawRows.push([
        v.performanceOrder,
        v.bandName,
        v.evaluatorName,
        permLabel,
        ownLabel,
        formulaText(validFormula, validLabel),
        v.rawCharm !== null ? v.rawCharm : '-',
        v.rawTech !== null ? v.rawTech : '-',
        formulaOrDash(rawTotalFormula, v.rawTotal, '0'),
        formulaOrDash(diffCharmFormula, v.diffCorrected?.normCharm),
        formulaOrDash(diffTechFormula, v.diffCorrected?.normTech),
        formulaOrDash(diffTotalFormula, v.diffCorrected?.normTotal),
        formulaOrDash(zCharmFormula, v.zScored?.normCharm),
        formulaOrDash(zTechFormula, v.zScored?.normTech),
        formulaOrDash(zTotalFormula, v.zScored?.normTotal),
        formulaOrDash(zValFormula, v.zScored?.zValue),
        trimmedComment,
        formulaOrDash(sqDiffFormula, sqDiffCached, '0.0000'),
      ]);

      rawCsvRows.push([
        v.performanceOrder,
        v.bandName,
        v.evaluatorName,
        permLabel,
        ownLabel,
        validLabel,
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
        trimmedComment,
      ]);
    });
  }

  // =========================================================================
  // シート3: 審査員別_補正係数 (シート2から数式計算)
  // =========================================================================
  const evalHeader = [
    '審査員名',
    '権限区分',
    '有効採点数',
    '最高点',
    '最低点',
    '点差',
    '基準点差定数',
    '補正係数(基準点差/点差)',
    '素点平均',
    '素点標準偏差',
  ];
  const evalRows: CellValue[][] = [evalHeader];
  const evalCsvRows: (string | number)[][] = [evalHeader];

  if (!hasEvaluators) {
    evalRows.push(new Array(evalHeader.length).fill(''));
  } else {
    evaluators.forEach((e, idx) => {
      const r = evalStartRow + idx;
      const permLabel =
        e.permissionType === 'SCORE_AND_COMMENT'
          ? '採点＋コメント'
          : 'コメントのみ';

      const countFormula = `COUNTIFS(${rawEvalRange},A${r},${rawValidRange},"対象")`;
      const maxFormula = `IF(C${r}>0,_xlfn.MAXIFS(${rawTotalRange},${rawEvalRange},A${r},${rawValidRange},"対象"),"-")`;
      const minFormula = `IF(C${r}>0,_xlfn.MINIFS(${rawTotalRange},${rawEvalRange},A${r},${rawValidRange},"対象"),"-")`;
      const diffFormula = `IF(C${r}>0,D${r}-E${r},"-")`;
      const stdDiffFormula = `${summaryRef}!$D$2`;
      const factorFormula = `IF(AND(C${r}>=2,ISNUMBER(F${r}),F${r}>0),G${r}/F${r},1)`;
      const meanFormula = `IF(C${r}>0,AVERAGEIFS(${rawTotalRange},${rawEvalRange},A${r},${rawValidRange},"対象"),"-")`;
      const stdDevFormula = `IF(C${r}>0,SQRT(SUMIFS(${rawSqDiffRange},${rawEvalRange},A${r},${rawValidRange},"対象")/C${r}),"-")`;

      evalRows.push([
        e.userName,
        permLabel,
        formulaNum(countFormula, e.validVoteCount, '0'),
        formulaOrDash(maxFormula, e.maxScore, '0'),
        formulaOrDash(minFormula, e.minScore, '0'),
        formulaOrDash(diffFormula, e.diff, '0'),
        formulaNum(stdDiffFormula, standardDiff, '0'),
        formulaNum(factorFormula, e.correctionFactor, '0.0000'),
        formulaOrDash(meanFormula, e.meanScore),
        formulaOrDash(stdDevFormula, e.stdDev),
      ]);

      evalCsvRows.push([
        e.userName,
        permLabel,
        e.validVoteCount,
        e.maxScore !== null ? round2(e.maxScore) : '-',
        e.minScore !== null ? round2(e.minScore) : '-',
        e.diff !== null ? round2(e.diff) : '-',
        standardDiff,
        round2(e.correctionFactor),
        e.meanScore !== null ? round2(e.meanScore) : '-',
        e.stdDev !== null ? round2(e.stdDev) : '-',
      ]);
    });
  }

  // =========================================================================
  // シート4: 採点者別_補正後スコア表 (行=採点者, 列=全バンド(出演順), シート2・3から数式計算)
  // =========================================================================
  const matrixOrderRow: CellValue[] = [
    '出演順',
    '',
    ...orderedBands.map((b) => b.performanceOrder),
  ];
  const matrixHeaderRow: CellValue[] = [
    '採点者名',
    '権限区分',
    ...orderedBands.map((b) => b.bandName),
  ];
  const matrixRows: CellValue[][] = [matrixOrderRow, matrixHeaderRow];
  const matrixCsvRows: (string | number)[][] = [
    ['出演順', '', ...orderedBands.map((b) => b.performanceOrder)],
    ['採点者名', '権限区分', ...orderedBands.map((b) => b.bandName)],
  ];

  // Lookup cached activeNormalized total for (evaluatorUserId, bandId)
  const voteActiveMap = new Map<string, number>();
  for (const v of votes) {
    if (v.isValidNumericVote && v.activeNormalized) {
      voteActiveMap.set(
        `${v.evaluatorUserId}::${v.bandId}`,
        v.activeNormalized.normTotal,
      );
    }
  }

  if (!hasEvaluators) {
    matrixRows.push(new Array(2 + orderedBands.length).fill(''));
  } else {
    evaluators.forEach((e, idx) => {
      const r = matrixStartRow + idx;
      const permLabel =
        e.permissionType === 'SCORE_AND_COMMENT'
          ? '採点＋コメント'
          : 'コメントのみ';
      const row: CellValue[] = [e.userName, permLabel];
      const csvRow: (string | number)[] = [e.userName, permLabel];

      const evalMatch = `MATCH($A${r},${evalNameRange},0)`;
      const minExpr = `INDEX(${evalMinRange},${evalMatch})`;
      const factorExpr = `INDEX(${evalFactorRange},${evalMatch})`;
      const meanExpr = `INDEX(${evalMeanRange},${evalMatch})`;
      const stdExpr = `INDEX(${evalStdRange},${evalMatch})`;

      orderedBands.forEach((b, bIdx) => {
        const colIdx = 2 + bIdx;
        const colLetter = XLSX.utils.encode_col(colIdx);
        const countExpr = `COUNTIFS(${rawEvalRange},$A${r},${rawBandRange},${colLetter}$2,${rawValidRange},"対象")`;
        const rawExpr = `SUMIFS(${rawTotalRange},${rawEvalRange},$A${r},${rawBandRange},${colLetter}$2,${rawValidRange},"対象")`;

        const cellFormula =
          `IF(${countExpr}>0,` +
          `IF(${summaryRef}!$B$2="Min-Max正規化",(${rawExpr}-${minExpr})*${factorExpr},` +
          `IF(${summaryRef}!$B$2="Zスコア正規化",IF(AND(ISNUMBER(${stdExpr}),${stdExpr}>0),50+10*(${rawExpr}-${meanExpr})/${stdExpr},50),` +
          `${rawExpr})),` +
          `"-")`;

        const cached = voteActiveMap.get(`${e.userId}::${b.bandId}`) ?? null;
        row.push(formulaOrDash(cellFormula, cached));
        csvRow.push(cached !== null ? round2(cached) : '-');
      });

      matrixRows.push(row);
      matrixCsvRows.push(csvRow);
    });
  }

  // =========================================================================
  // シート1: 総合ランキング集計 (出演順固定 + シート4/シート2参照 + 5段階タイブレーク順位)
  // =========================================================================
  const summaryRows: CellValue[][] = [
    ['開催回', auditionTitle, '開催日', eventDate],
    [
      '採用集計方式',
      methodText,
      '基準点差定数',
      standardDiff,
      'ペナルティ制度',
      penaltyStatus,
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
      '参考_Min-Max正規化最終',
      '参考_Zスコア正規化最終',
      '参考_単純平均最終',
    ],
  ];

  const summaryCsvRows: (string | number)[][] = [
    ['開催回', auditionTitle, '開催日', eventDate],
    [
      '採用集計方式',
      methodText,
      '基準点差定数',
      standardDiff,
      'ペナルティ制度',
      penaltyStatus,
    ],
    [],
    summaryRows[3] as string[],
  ];

  const summaryStartRow = 5;
  const summaryEndRow = 4 + orderedBands.length;
  const sumValidRange = `$E$${summaryStartRow}:$E$${summaryEndRow}`;
  const sumFinalRange = `$O$${summaryStartRow}:$O$${summaryEndRow}`;
  const sumPreRange = `$L$${summaryStartRow}:$L$${summaryEndRow}`;
  const sumRawTotalRange = `$I$${summaryStartRow}:$I$${summaryEndRow}`;
  const sumRawTechRange = `$H$${summaryStartRow}:$H$${summaryEndRow}`;

  orderedBands.forEach((b, bIdx) => {
    const r = summaryStartRow + bIdx;
    const matrixColLetter = XLSX.utils.encode_col(2 + bIdx);
    const matrixColRange = `${matrixRef}!${matrixColLetter}$${matrixStartRow}:${matrixColLetter}$${matrixEndRow}`;

    const voteCountFormula = `COUNT(${matrixColRange})`;
    const commentCountFormula = `COUNTIFS(${rawBandRange},C${r},${rawOwnRange},"いいえ",${rawCommentRange},"<>")`;

    const avgRawCharmFormula = `ROUND(IF(E${r}>0,AVERAGEIFS(${rawCharmRange},${rawBandRange},C${r},${rawValidRange},"対象"),0),4)`;
    const avgRawTechFormula = `ROUND(IF(E${r}>0,AVERAGEIFS(${rawTechRange},${rawBandRange},C${r},${rawValidRange},"対象"),0),4)`;
    const avgRawTotalFormula = `ROUND(IF(E${r}>0,AVERAGEIFS(${rawTotalRange},${rawBandRange},C${r},${rawValidRange},"対象"),0),4)`;

    const avgNormCharmFormula = `ROUND(IF(E${r}>0,IF($B$2="Min-Max正規化",AVERAGEIFS(${rawDiffCharmRange},${rawBandRange},C${r},${rawValidRange},"対象"),IF($B$2="Zスコア正規化",AVERAGEIFS(${rawZCharmRange},${rawBandRange},C${r},${rawValidRange},"対象"),G${r})),0),4)`;
    const avgNormTechFormula = `ROUND(IF(E${r}>0,IF($B$2="Min-Max正規化",AVERAGEIFS(${rawDiffTechRange},${rawBandRange},C${r},${rawValidRange},"対象"),IF($B$2="Zスコア正規化",AVERAGEIFS(${rawZTechRange},${rawBandRange},C${r},${rawValidRange},"対象"),H${r})),0),4)`;
    const avgNormTotalFormula = `ROUND(IF(E${r}>0,AVERAGE(${matrixColRange}),0),4)`;

    const appliedPenaltyFormula = `IF($F$2="有効",M${r},0)`;
    const finalScoreFormula = `ROUND(IF(E${r}>0,L${r}-N${r},-N${r}),4)`;

    const refDiffFinalFormula = `ROUND(IF(E${r}>0,AVERAGEIFS(${rawDiffTotalRange},${rawBandRange},C${r},${rawValidRange},"対象")-N${r},-N${r}),4)`;
    const refZFinalFormula = `ROUND(IF(E${r}>0,AVERAGEIFS(${rawZTotalRange},${rawBandRange},C${r},${rawValidRange},"対象")-N${r},-N${r}),4)`;
    const refRawFinalFormula = `ROUND(I${r}-N${r},4)`;

    // 5段階タイブレーク順位（Web画面と同一: 有効投票数>0 -> 最終スコア -> 控除前スコア -> 素点平均合計 -> 素点平均技術）
    const rankFormula =
      `1+IF(E${r}>0,` +
      `COUNTIFS(${sumValidRange},">0",${sumFinalRange},">"&O${r})` +
      `+COUNTIFS(${sumValidRange},">0",${sumFinalRange},O${r},${sumPreRange},">"&L${r})` +
      `+COUNTIFS(${sumValidRange},">0",${sumFinalRange},O${r},${sumPreRange},L${r},${sumRawTotalRange},">"&I${r})` +
      `+COUNTIFS(${sumValidRange},">0",${sumFinalRange},O${r},${sumPreRange},L${r},${sumRawTotalRange},I${r},${sumRawTechRange},">"&H${r}),` +
      `COUNTIF(${sumValidRange},">0")` +
      `+COUNTIFS(${sumValidRange},0,${sumFinalRange},">"&O${r})` +
      `+COUNTIFS(${sumValidRange},0,${sumFinalRange},O${r},${sumPreRange},">"&L${r})` +
      `+COUNTIFS(${sumValidRange},0,${sumFinalRange},O${r},${sumPreRange},L${r},${sumRawTotalRange},">"&I${r})` +
      `+COUNTIFS(${sumValidRange},0,${sumFinalRange},O${r},${sumPreRange},L${r},${sumRawTotalRange},I${r},${sumRawTechRange},">"&H${r}))`;

    summaryRows.push([
      formulaNum(rankFormula, b.rank, '0'),
      b.performanceOrder,
      b.bandName,
      b.memberNames.join(', '),
      formulaNum(voteCountFormula, b.validVoteCount, '0'),
      formulaNum(commentCountFormula, b.commentCount, '0'),
      formulaNum(avgRawCharmFormula, round4(b.avgRawCharm), '0.00'),
      formulaNum(avgRawTechFormula, round4(b.avgRawTech), '0.00'),
      formulaNum(avgRawTotalFormula, round4(b.avgRawTotal), '0.00'),
      formulaNum(avgNormCharmFormula, round4(b.activeAvgNormCharm), '0.00'),
      formulaNum(avgNormTechFormula, round4(b.activeAvgNormTech), '0.00'),
      formulaNum(avgNormTotalFormula, round4(b.activePrePenaltyScore), '0.00'),
      b.penaltyDeduction,
      formulaNum(appliedPenaltyFormula, round2(b.appliedPenalty), '0.00'),
      formulaNum(finalScoreFormula, round4(b.activeFinalScore), '0.00'),
      formulaNum(refDiffFinalFormula, round4(b.diffMethod.finalScore), '0.00'),
      formulaNum(refZFinalFormula, round4(b.zScoreMethod.finalScore), '0.00'),
      formulaNum(refRawFinalFormula, round4(b.rawMethod.finalScore), '0.00'),
    ]);

    summaryCsvRows.push([
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
  });

  return {
    summaryRows,
    rawRows,
    evalRows,
    matrixRows,
    summaryCsvRows,
    rawCsvRows,
    evalCsvRows,
    matrixCsvRows,
    bandCount: orderedBands.length,
  };
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
 * ファイル1: 集計結果＆生データブック（Excel 4シート数式連動構成 or CSV）を生成
 */
export function generateSummaryAndRawExport(
  auditionTitle: string,
  eventDate: string,
  result: AuditionAggregationOutput,
  format: 'xlsx' | 'csv',
): { data: Uint8Array; contentType: string; filename: string } {
  const {
    summaryRows,
    rawRows,
    evalRows,
    matrixRows,
    summaryCsvRows,
    rawCsvRows,
    evalCsvRows,
    matrixCsvRows,
    bandCount,
  } = buildSummaryAndRawSheets(auditionTitle, eventDate, result);
  const safeTitle = auditionTitle.replace(/[\\/:*?"<>|]/g, '_');

  if (format === 'csv') {
    const combined: (string | number)[][] = [
      [`=== シート1: ${SHEET_SUMMARY} ===`],
      ...summaryCsvRows,
      [],
      [`=== シート2: ${SHEET_RAW} ===`],
      ...rawCsvRows,
      [],
      [`=== シート3: ${SHEET_EVALUATORS} ===`],
      ...evalCsvRows,
      [],
      [`=== シート4: ${SHEET_MATRIX} ===`],
      ...matrixCsvRows,
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
  const wsEvaluators = XLSX.utils.aoa_to_sheet(evalRows);
  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);

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
    { wch: 16 },
  ];
  wsEvaluators['!cols'] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 20 },
    { wch: 12 },
    { wch: 14 },
  ];
  wsMatrix['!cols'] = [
    { wch: 22 },
    { wch: 16 },
    ...new Array(bandCount).fill({ wch: 18 }),
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, SHEET_SUMMARY);
  XLSX.utils.book_append_sheet(wb, wsRaw, SHEET_RAW);
  XLSX.utils.book_append_sheet(wb, wsEvaluators, SHEET_EVALUATORS);
  XLSX.utils.book_append_sheet(wb, wsMatrix, SHEET_MATRIX);

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

