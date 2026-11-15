import { describe, expect, it } from 'vitest';
import {
  calculateAuditionResults,
  splitNormalizedScores,
  type AggregationBandInput,
  type AggregationScoreInput,
  type AggregationVoterInput,
} from '../aggregation.ts';

describe('splitNormalizedScores', () => {
  it('素点の技術点・魅力点の割合に応じて正規化合計点を按分する', () => {
    // 技術30, 魅力20 (合計50 -> 60% / 40%), 正規化合計が25.0の場合 -> 技術15.0, 魅力10.0
    const res = splitNormalizedScores(25, 30, 20);
    expect(res.normTech).toBeCloseTo(15, 6);
    expect(res.normCharm).toBeCloseTo(10, 6);
    expect(res.normTech + res.normCharm).toBeCloseTo(res.normTotal, 6);
  });

  it('素点合計が0の場合は均等割（50%ずつ）になる', () => {
    const res = splitNormalizedScores(50, 0, 0);
    expect(res.normTech).toBe(25);
    expect(res.normCharm).toBe(25);
  });
});

describe('calculateAuditionResults', () => {
  const baseBands: AggregationBandInput[] = [
    {
      id: 'b1',
      name: 'Band Alpha',
      performanceOrder: 1,
      penaltyDeduction: 0,
      memberUserIds: ['u1'], // u1 は Band Alpha に所属
      memberNames: ['User 1'],
    },
    {
      id: 'b2',
      name: 'Band Beta',
      performanceOrder: 2,
      penaltyDeduction: 0,
      memberUserIds: ['u1'], // u1 は Band Beta にも掛け持ち所属
      memberNames: ['User 1'],
    },
    {
      id: 'b3',
      name: 'Band Gamma',
      performanceOrder: 3,
      penaltyDeduction: 5,
      memberUserIds: [],
      memberNames: [],
    },
  ];

  const baseVoters: AggregationVoterInput[] = [
    {
      userId: 'u1',
      userName: 'User 1 (掛け持ち)',
      permissionType: 'SCORE_AND_COMMENT',
      isSubmitted: true,
    },
    {
      userId: 'u2',
      userName: 'User 2 (通常採点)',
      permissionType: 'SCORE_AND_COMMENT',
      isSubmitted: true,
    },
    {
      userId: 'u3',
      userName: 'User 3 (コメントのみ)',
      permissionType: 'COMMENT_ONLY',
      isSubmitted: true,
    },
  ];

  it('定数10による点差補正・自バンド掛け持ち除外・COMMENT_ONLY除外を正確に計算する', () => {
    const scores: AggregationScoreInput[] = [
      // u1 が自バンド b1, b2 に不正に点数を送っていた場合でも除外されること
      { bandId: 'b1', evaluatorUserId: 'u1', techScore: 50, charmScore: 50, comment: '自バンド1' },
      { bandId: 'b2', evaluatorUserId: 'u1', techScore: 50, charmScore: 50, comment: '自バンド2' },
      { bandId: 'b3', evaluatorUserId: 'u1', techScore: 40, charmScore: 40, comment: 'うまい' },
      // u2 は3バンド全てに採点: b1=60(30+30), b2=80(40+40), b3=70(42+28) -> MAX=80, MIN=60, Diff=20 -> 係数 = 10/20 = 0.5
      { bandId: 'b1', evaluatorUserId: 'u2', techScore: 30, charmScore: 30, comment: 'Alpha感想' },
      { bandId: 'b2', evaluatorUserId: 'u2', techScore: 40, charmScore: 40, comment: 'Beta感想' },
      { bandId: 'b3', evaluatorUserId: 'u2', techScore: 42, charmScore: 28, comment: 'Gamma感想' },
      // u3 (COMMENT_ONLY) は点数が混入していても集計から除外しコメントのみ残る
      { bandId: 'b1', evaluatorUserId: 'u3', techScore: 10, charmScore: 10, comment: 'コメントのみ枠' },
    ];

    const result = calculateAuditionResults(
      {
        id: 'a1',
        isPenaltyEnabled: false,
        aggregationMethod: 'DIFF_CORRECTION',
        standardDiff: 10,
      },
      baseBands,
      baseVoters,
      scores,
    );

    const u1Stats = result.evaluatorStats.find((e) => e.userId === 'u1')!;
    expect(u1Stats.validVoteCount).toBe(1); // b3 のみ有効
    expect(u1Stats.correctionFactor).toBe(1.0); // 有効採点1件のためフォールバック

    const u2Stats = result.evaluatorStats.find((e) => e.userId === 'u2')!;
    expect(u2Stats.validVoteCount).toBe(3);
    expect(u2Stats.maxScore).toBe(80);
    expect(u2Stats.minScore).toBe(60);
    expect(u2Stats.diff).toBe(20);
    expect(u2Stats.correctionFactor).toBeCloseTo(0.5, 6);

    const u3Stats = result.evaluatorStats.find((e) => e.userId === 'u3')!;
    expect(u3Stats.validVoteCount).toBe(0);

    // b1 の確認: u1(自バンド除外), u3(COMMENT_ONLY除外) -> u2(60 * 0.5 = 30) のみ有効
    const b1 = result.bandResults.find((b) => b.bandId === 'b1')!;
    expect(b1.validVoteCount).toBe(1);
    expect(b1.commentCount).toBe(2); // u2 と u3 のコメント（u1は自バンドのため除外）
    expect(b1.activeFinalScore).toBeCloseTo(30, 6);
    expect(b1.activeAvgNormTech).toBeCloseTo(15, 6);
    expect(b1.activeAvgNormCharm).toBeCloseTo(15, 6);

    // b3 の正規化按分確認: u2 の 70(42+28) * 0.5 = 35 -> tech 21, charm 14
    const u2b3 = result.voteRecords.find(
      (r) => r.bandId === 'b3' && r.evaluatorUserId === 'u2',
    )!;
    expect(u2b3.diffCorrected?.normTotal).toBeCloseTo(35, 6);
    expect(u2b3.diffCorrected?.normTech).toBeCloseTo(21, 6);
    expect(u2b3.diffCorrected?.normCharm).toBeCloseTo(14, 6);
  });

  it('全バンド同点（Diff = 0, stdDev = 0）でもゼロ除算せずフォールバックする', () => {
    const scores: AggregationScoreInput[] = [
      { bandId: 'b1', evaluatorUserId: 'u2', techScore: 35, charmScore: 35, comment: 'c1' },
      { bandId: 'b2', evaluatorUserId: 'u2', techScore: 35, charmScore: 35, comment: 'c2' },
      { bandId: 'b3', evaluatorUserId: 'u2', techScore: 35, charmScore: 35, comment: 'c3' },
    ];

    const diffRes = calculateAuditionResults(
      { id: 'a1', isPenaltyEnabled: false, aggregationMethod: 'DIFF_CORRECTION', standardDiff: 10 },
      baseBands,
      baseVoters,
      scores,
    );
    const u2Stats = diffRes.evaluatorStats.find((e) => e.userId === 'u2')!;
    expect(u2Stats.diff).toBe(0);
    expect(u2Stats.correctionFactor).toBe(1.0);
    expect(u2Stats.stdDev).toBe(0);

    const zRes = calculateAuditionResults(
      { id: 'a1', isPenaltyEnabled: false, aggregationMethod: 'Z_SCORE', standardDiff: 10 },
      baseBands,
      baseVoters,
      scores,
    );
    for (const band of zRes.bandResults) {
      expect(band.activeFinalScore).toBe(50);
      expect(band.zScoreMethod.avgZ).toBe(0);
    }
  });

  it('ペナルティの非破壊減点と同点時のタイブレーク順位が正しく動作する', () => {
    // b1(pen=0), b2(pen=0), b3(pen=10)
    // u2: b1=70(tech35,charm35), b2=70(tech40,charm30), b3=80(tech40,charm40)
    // diff = 80 - 70 = 10 -> factor = 10 / 10 = 1.0
    // isPenaltyEnabled = true の場合:
    // b3: pre=80, penalty=10 -> final=70
    // b2: pre=70, penalty=0 -> final=70 (技術平均40)
    // b1: pre=70, penalty=0 -> final=70 (技術平均35)
    // タイブレーク順: final同点(70) -> prePenaltyScore(b3が80で1位！) -> 素点技術平均(b2が40で2位、b1が35で3位)
    const bands: AggregationBandInput[] = [
      { id: 'b1', name: 'B1', performanceOrder: 1, penaltyDeduction: 0, memberUserIds: [] },
      { id: 'b2', name: 'B2', performanceOrder: 2, penaltyDeduction: 0, memberUserIds: [] },
      { id: 'b3', name: 'B3', performanceOrder: 3, penaltyDeduction: 10, memberUserIds: [] },
    ];
    const voters: AggregationVoterInput[] = [
      { userId: 'u2', userName: 'U2', permissionType: 'SCORE_AND_COMMENT', isSubmitted: true },
    ];
    const scores: AggregationScoreInput[] = [
      { bandId: 'b1', evaluatorUserId: 'u2', techScore: 35, charmScore: 35, comment: '1' },
      { bandId: 'b2', evaluatorUserId: 'u2', techScore: 40, charmScore: 30, comment: '2' },
      { bandId: 'b3', evaluatorUserId: 'u2', techScore: 40, charmScore: 40, comment: '3' },
    ];

    const withPenalty = calculateAuditionResults(
      { id: 'a1', isPenaltyEnabled: true, aggregationMethod: 'DIFF_CORRECTION', standardDiff: 10 },
      bands,
      voters,
      scores,
    );
    expect(withPenalty.bandResults.map((b) => b.bandId)).toEqual(['b3', 'b2', 'b1']);
    expect(withPenalty.bandResults[0].activePrePenaltyScore).toBe(80);
    expect(withPenalty.bandResults[0].activeFinalScore).toBe(70);

    // ペナルティOFF時は prePenaltyScore は変わらず finalScore だけ戻る
    const withoutPenalty = calculateAuditionResults(
      { id: 'a1', isPenaltyEnabled: false, aggregationMethod: 'DIFF_CORRECTION', standardDiff: 10 },
      bands,
      voters,
      scores,
    );
    expect(withoutPenalty.bandResults[0].activeFinalScore).toBe(80);
    expect(withoutPenalty.bandResults[0].activePrePenaltyScore).toBe(80);
  });
});

