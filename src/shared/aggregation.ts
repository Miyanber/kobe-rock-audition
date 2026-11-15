import type { AggregationMethod, PermissionType } from './schema/index.ts';

export interface AggregationAuditionInput {
  id: string;
  isPenaltyEnabled: boolean;
  aggregationMethod: AggregationMethod;
  standardDiff: number; // デフォルト 10
}

export interface AggregationBandInput {
  id: string;
  name: string;
  performanceOrder: number;
  penaltyDeduction: number;
  memberUserIds: string[];
  memberNames?: string[];
}

export interface AggregationVoterInput {
  userId: string;
  userName: string;
  email?: string;
  enrollmentYear?: number;
  permissionType: PermissionType;
  isSubmitted: boolean;
}

export interface AggregationScoreInput {
  id?: string;
  bandId: string;
  evaluatorUserId: string;
  techScore: number | null;
  charmScore: number | null;
  comment: string;
  updatedAt?: number;
}

export interface MethodNormalizedValues {
  normTech: number;
  normCharm: number;
  normTotal: number;
}

export interface EvaluatorStats {
  userId: string;
  userName: string;
  enrollmentYear?: number;
  permissionType: PermissionType;
  validVoteCount: number;
  maxScore: number | null;
  minScore: number | null;
  diff: number | null;
  correctionFactor: number;
  meanScore: number | null;
  stdDev: number | null;
}

export interface NormalizedVoteRecord {
  bandId: string;
  bandName: string;
  performanceOrder: number;
  evaluatorUserId: string;
  evaluatorName: string;
  permissionType: PermissionType;
  isOwnBand: boolean;
  isValidNumericVote: boolean;
  rawTech: number | null;
  rawCharm: number | null;
  rawTotal: number | null;
  diffCorrected: MethodNormalizedValues | null;
  zScored: (MethodNormalizedValues & { zValue: number }) | null;
  rawAverage: MethodNormalizedValues | null;
  activeNormalized: MethodNormalizedValues | null;
  comment: string;
  updatedAt?: number;
}

export interface BandMethodSummary {
  avgNormTech: number;
  avgNormCharm: number;
  avgNormTotal: number;
  prePenaltyScore: number;
  finalScore: number;
}

export interface BandAggregationResult {
  rank: number;
  isTied: boolean;
  bandId: string;
  bandName: string;
  performanceOrder: number;
  memberUserIds: string[];
  memberNames: string[];
  validVoteCount: number;
  commentCount: number;
  avgRawTech: number;
  avgRawCharm: number;
  avgRawTotal: number;
  penaltyDeduction: number;
  appliedPenalty: number;
  diffMethod: BandMethodSummary;
  zScoreMethod: BandMethodSummary & { avgZ: number };
  rawMethod: BandMethodSummary;
  activeAvgNormTech: number;
  activeAvgNormCharm: number;
  activePrePenaltyScore: number;
  activeFinalScore: number;
}

export interface AuditionAggregationOutput {
  audition: AggregationAuditionInput;
  bandResults: BandAggregationResult[];
  evaluatorStats: EvaluatorStats[];
  voteRecords: NormalizedVoteRecord[];
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 元の素点における技術点・魅力点の割合をもとに、合計点の正規化後点数から按分算出する。
 * 素点合計が0の場合は均等割（各50%）とする。
 */
export function splitNormalizedScores(
  normTotal: number,
  rawTech: number,
  rawCharm: number,
): MethodNormalizedValues {
  const rawTotal = rawTech + rawCharm;
  if (rawTotal <= 0) {
    const half = normTotal / 2;
    return {
      normTech: half,
      normCharm: half,
      normTotal,
    };
  }
  const techRatio = rawTech / rawTotal;
  const charmRatio = rawCharm / rawTotal;
  return {
    normTech: normTotal * techRatio,
    normCharm: normTotal * charmRatio,
    normTotal,
  };
}

/**
 * オーディション採点集計・正規化エンジン（純粋関数）
 * 生データ (Scores) を変更せず、自バンド除外・NULL除外・点差補正・Zスコア・ペナルティ非破壊適用・タイブレークを一括実行する。
 */
export function calculateAuditionResults(
  audition: AggregationAuditionInput,
  bands: AggregationBandInput[],
  voters: AggregationVoterInput[],
  scores: AggregationScoreInput[],
): AuditionAggregationOutput {
  const standardDiff = audition.standardDiff > 0 ? audition.standardDiff : 10;

  const bandMap = new Map<string, AggregationBandInput>();
  for (const band of bands) {
    bandMap.set(band.id, band);
  }

  const voterMap = new Map<string, AggregationVoterInput>();
  for (const voter of voters) {
    voterMap.set(voter.userId, voter);
  }

  // 1. 審査員ごとに有効数値投票を収集する
  const evaluatorValidTotals = new Map<string, number[]>();

  interface PreVote {
    score: AggregationScoreInput;
    band: AggregationBandInput;
    voter?: AggregationVoterInput;
    permissionType: PermissionType;
    isOwnBand: boolean;
    isValidNumericVote: boolean;
    rawTotal: number | null;
  }

  const preVotes: PreVote[] = [];

  for (const score of scores) {
    const band = bandMap.get(score.bandId);
    if (!band) continue;

    const voter = voterMap.get(score.evaluatorUserId);
    const permissionType: PermissionType = voter?.permissionType ?? 'SCORE_AND_COMMENT';
    const isOwnBand = band.memberUserIds.includes(score.evaluatorUserId);

    const hasNumericScores =
      score.techScore !== null &&
      score.techScore !== undefined &&
      score.charmScore !== null &&
      score.charmScore !== undefined &&
      !Number.isNaN(score.techScore) &&
      !Number.isNaN(score.charmScore);

    const isValidNumericVote =
      !isOwnBand && permissionType === 'SCORE_AND_COMMENT' && hasNumericScores;

    const rawTotal = isValidNumericVote
      ? Number(score.techScore) + Number(score.charmScore)
      : null;

    if (isValidNumericVote && rawTotal !== null) {
      const list = evaluatorValidTotals.get(score.evaluatorUserId) ?? [];
      list.push(rawTotal);
      evaluatorValidTotals.set(score.evaluatorUserId, list);
    }

    preVotes.push({
      score,
      band,
      voter,
      permissionType,
      isOwnBand,
      isValidNumericVote,
      rawTotal,
    });
  }

  // 2. 審査員ごとの基準値（MAX, MIN, Diff, 補正係数, 平均, 母標準偏差）を算出
  const evaluatorStatsMap = new Map<string, EvaluatorStats>();

  // votersマスタにいる全採点者と、scoresに存在する採点者を統合
  const allEvaluatorIds = new Set<string>([
    ...voters.map((v) => v.userId),
    ...preVotes.map((pv) => pv.score.evaluatorUserId),
  ]);

  for (const userId of allEvaluatorIds) {
    const voter = voterMap.get(userId);
    const totals = evaluatorValidTotals.get(userId) ?? [];
    const validCount = totals.length;

    if (validCount === 0) {
      evaluatorStatsMap.set(userId, {
        userId,
        userName: voter?.userName ?? userId,
        enrollmentYear: voter?.enrollmentYear,
        permissionType: voter?.permissionType ?? 'SCORE_AND_COMMENT',
        validVoteCount: 0,
        maxScore: null,
        minScore: null,
        diff: null,
        correctionFactor: 1.0,
        meanScore: null,
        stdDev: null,
      });
      continue;
    }

    const maxScore = Math.max(...totals);
    const minScore = Math.min(...totals);
    const diff = maxScore - minScore;
    const correctionFactor = validCount >= 2 && diff > 0 ? standardDiff / diff : 1.0;

    const meanScore = totals.reduce((acc, v) => acc + v, 0) / validCount;
    const variance =
      totals.reduce((acc, v) => acc + (v - meanScore) ** 2, 0) / validCount;
    const stdDev = Math.sqrt(variance);

    evaluatorStatsMap.set(userId, {
      userId,
      userName: voter?.userName ?? userId,
      enrollmentYear: voter?.enrollmentYear,
      permissionType: voter?.permissionType ?? 'SCORE_AND_COMMENT',
      validVoteCount: validCount,
      maxScore,
      minScore,
      diff,
      correctionFactor,
      meanScore,
      stdDev,
    });
  }

  // 3. 個別投票レコードの正規化＆技術・魅力按分計算
  const voteRecords: NormalizedVoteRecord[] = [];
  const bandVotesBucket = new Map<string, NormalizedVoteRecord[]>();
  const bandCommentCountMap = new Map<string, number>();

  for (const band of bands) {
    bandVotesBucket.set(band.id, []);
    bandCommentCountMap.set(band.id, 0);
  }

  for (const pv of preVotes) {
    const stats = evaluatorStatsMap.get(pv.score.evaluatorUserId)!;

    if (!pv.isOwnBand && pv.score.comment.trim().length > 0) {
      bandCommentCountMap.set(
        pv.band.id,
        (bandCommentCountMap.get(pv.band.id) ?? 0) + 1,
      );
    }

    let diffCorrected: MethodNormalizedValues | null = null;
    let zScored: (MethodNormalizedValues & { zValue: number }) | null = null;
    let rawAverage: MethodNormalizedValues | null = null;
    let activeNormalized: MethodNormalizedValues | null = null;

    if (pv.isValidNumericVote && pv.rawTotal !== null) {
      const rawTech = Number(pv.score.techScore);
      const rawCharm = Number(pv.score.charmScore);
      const rawTotal = pv.rawTotal;

      // 点差補正方式: rawTotal * (standardDiff / Diff)
      const diffNormTotal = rawTotal * stats.correctionFactor;
      diffCorrected = splitNormalizedScores(diffNormTotal, rawTech, rawCharm);

      // Zスコア方式: 50 + 10 * ((rawTotal - mean) / stdDev)
      const stdDev = stats.stdDev ?? 0;
      const mean = stats.meanScore ?? rawTotal;
      const zValue = stdDev > 0 ? (rawTotal - mean) / stdDev : 0;
      const zNormTotal = 50 + 10 * zValue;
      zScored = {
        ...splitNormalizedScores(zNormTotal, rawTech, rawCharm),
        zValue,
      };

      // 単純平均方式: 素点そのまま
      rawAverage = {
        normTech: rawTech,
        normCharm: rawCharm,
        normTotal: rawTotal,
      };

      if (audition.aggregationMethod === 'DIFF_CORRECTION') {
        activeNormalized = diffCorrected;
      } else if (audition.aggregationMethod === 'Z_SCORE') {
        activeNormalized = {
          normTech: zScored.normTech,
          normCharm: zScored.normCharm,
          normTotal: zScored.normTotal,
        };
      } else {
        activeNormalized = rawAverage;
      }
    }

    const record: NormalizedVoteRecord = {
      bandId: pv.band.id,
      bandName: pv.band.name,
      performanceOrder: pv.band.performanceOrder,
      evaluatorUserId: pv.score.evaluatorUserId,
      evaluatorName: stats.userName,
      permissionType: pv.permissionType,
      isOwnBand: pv.isOwnBand,
      isValidNumericVote: pv.isValidNumericVote,
      rawTech: pv.isValidNumericVote ? Number(pv.score.techScore) : null,
      rawCharm: pv.isValidNumericVote ? Number(pv.score.charmScore) : null,
      rawTotal: pv.rawTotal,
      diffCorrected,
      zScored,
      rawAverage,
      activeNormalized,
      comment: pv.score.comment,
      updatedAt: pv.score.updatedAt,
    };

    voteRecords.push(record);
    if (record.isValidNumericVote) {
      bandVotesBucket.get(pv.band.id)?.push(record);
    }
  }

  // 4. バンドごとの集計とペナルティの非破壊減点
  const unsortedResults: BandAggregationResult[] = bands.map((band) => {
    const validVotes = bandVotesBucket.get(band.id) ?? [];
    const n = validVotes.length;
    const appliedPenalty = audition.isPenaltyEnabled ? band.penaltyDeduction : 0;

    const avg = (getter: (v: NormalizedVoteRecord) => number): number => {
      if (n === 0) return 0;
      return validVotes.reduce((sum, v) => sum + getter(v), 0) / n;
    };

    const avgRawTech = avg((v) => v.rawTech ?? 0);
    const avgRawCharm = avg((v) => v.rawCharm ?? 0);
    const avgRawTotal = avg((v) => v.rawTotal ?? 0);

    const diffPre = avg((v) => v.diffCorrected?.normTotal ?? 0);
    const diffMethod: BandMethodSummary = {
      avgNormTech: avg((v) => v.diffCorrected?.normTech ?? 0),
      avgNormCharm: avg((v) => v.diffCorrected?.normCharm ?? 0),
      avgNormTotal: diffPre,
      prePenaltyScore: diffPre,
      finalScore: n > 0 ? diffPre - appliedPenalty : -appliedPenalty,
    };

    const zPre = avg((v) => v.zScored?.normTotal ?? 0);
    const zScoreMethod: BandMethodSummary & { avgZ: number } = {
      avgZ: avg((v) => v.zScored?.zValue ?? 0),
      avgNormTech: avg((v) => v.zScored?.normTech ?? 0),
      avgNormCharm: avg((v) => v.zScored?.normCharm ?? 0),
      avgNormTotal: zPre,
      prePenaltyScore: zPre,
      finalScore: n > 0 ? zPre - appliedPenalty : -appliedPenalty,
    };

    const rawMethod: BandMethodSummary = {
      avgNormTech: avgRawTech,
      avgNormCharm: avgRawCharm,
      avgNormTotal: avgRawTotal,
      prePenaltyScore: avgRawTotal,
      finalScore: n > 0 ? avgRawTotal - appliedPenalty : -appliedPenalty,
    };

    let activeSummary = diffMethod;
    if (audition.aggregationMethod === 'Z_SCORE') {
      activeSummary = zScoreMethod;
    } else if (audition.aggregationMethod === 'RAW_AVERAGE') {
      activeSummary = rawMethod;
    }

    return {
      rank: 0,
      isTied: false,
      bandId: band.id,
      bandName: band.name,
      performanceOrder: band.performanceOrder,
      memberUserIds: band.memberUserIds,
      memberNames: band.memberNames ?? [],
      validVoteCount: n,
      commentCount: bandCommentCountMap.get(band.id) ?? 0,
      avgRawTech,
      avgRawCharm,
      avgRawTotal,
      penaltyDeduction: band.penaltyDeduction,
      appliedPenalty,
      diffMethod,
      zScoreMethod,
      rawMethod,
      activeAvgNormTech: activeSummary.avgNormTech,
      activeAvgNormCharm: activeSummary.avgNormCharm,
      activePrePenaltyScore: activeSummary.prePenaltyScore,
      activeFinalScore: activeSummary.finalScore,
    };
  });

  // 5. ソートおよびタイブレーク（同点判定）
  unsortedResults.sort((a, b) => {
    // 投票数が0のバンドは最下位グループへ
    if ((a.validVoteCount === 0) !== (b.validVoteCount === 0)) {
      return a.validVoteCount === 0 ? 1 : -1;
    }
    const diffFinal = round4(b.activeFinalScore) - round4(a.activeFinalScore);
    if (diffFinal !== 0) return diffFinal;

    const diffPre = round4(b.activePrePenaltyScore) - round4(a.activePrePenaltyScore);
    if (diffPre !== 0) return diffPre;

    const diffRawTotal = round4(b.avgRawTotal) - round4(a.avgRawTotal);
    if (diffRawTotal !== 0) return diffRawTotal;

    const diffRawTech = round4(b.avgRawTech) - round4(a.avgRawTech);
    if (diffRawTech !== 0) return diffRawTech;

    return a.performanceOrder - b.performanceOrder;
  });

  // 順位付けと同点フラグ設定
  for (let i = 0; i < unsortedResults.length; i++) {
    const curr = unsortedResults[i];
    if (i === 0) {
      curr.rank = 1;
      continue;
    }
    const prev = unsortedResults[i - 1];
    const sameStats =
      curr.validVoteCount === prev.validVoteCount &&
      round4(curr.activeFinalScore) === round4(prev.activeFinalScore) &&
      round4(curr.activePrePenaltyScore) === round4(prev.activePrePenaltyScore) &&
      round4(curr.avgRawTotal) === round4(prev.avgRawTotal) &&
      round4(curr.avgRawTech) === round4(prev.avgRawTech);

    if (sameStats) {
      curr.rank = prev.rank;
      curr.isTied = true;
      prev.isTied = true;
    } else {
      curr.rank = i + 1;
    }
  }

  // 投票レコードを出演順・採点者名順に整列
  voteRecords.sort((a, b) => {
    if (a.performanceOrder !== b.performanceOrder) {
      return a.performanceOrder - b.performanceOrder;
    }
    return a.evaluatorName.localeCompare(b.evaluatorName, 'ja');
  });

  const evaluatorStats = Array.from(evaluatorStatsMap.values()).sort((a, b) =>
    a.userName.localeCompare(b.userName, 'ja'),
  );

  return {
    audition,
    bandResults: unsortedResults,
    evaluatorStats,
    voteRecords,
  };
}

