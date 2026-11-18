import type {
  AggregationMethod,
  AuditionStatus,
  PermissionType,
  Role,
} from '../shared/schema/index.ts';
import type { AuditionAggregationOutput } from '../shared/aggregation.ts';

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  enrollmentYear: number;
  grade: number;
}

export interface AuthMeResponse {
  user: AuthUserDto | null;
  devLoginEnabled: boolean;
  googleOAuthConfigured: boolean;
  allowedDomains: string[];
}

export interface AuditionDto {
  id: string;
  title: string;
  eventDate: string;
  deadline: string | null;
  status: AuditionStatus;
  isPenaltyEnabled: boolean;
  aggregationMethod: AggregationMethod;
  standardDiff: number;
  createdAt: number;
  updatedAt: number;
}

export interface BandMemberDto {
  userId: string;
  name: string;
  email: string;
  enrollmentYear: number;
  grade: number;
  instrument: string | null;
}

export interface BandWithMembersDto {
  id: string;
  auditionId: string;
  name: string;
  performanceOrder: number;
  penaltyDeduction: number;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: number;
  updatedAt: number;
  members: BandMemberDto[];
}

export interface VoterEntryDto {
  id: string;
  auditionId: string;
  userId: string;
  permissionType: PermissionType;
  isSubmitted: boolean;
  submittedAt: number | null;
}

export interface MyScoreDto {
  id: string;
  bandId: string;
  techScore: number | null;
  charmScore: number | null;
  comment: string;
  updatedAt: number;
}

export interface CurrentAuditionPayload {
  activeAudition: AuditionDto | null;
  draftAudition: AuditionDto | null;
  preparingAudition: AuditionDto | null;
  latestClosedAudition?: AuditionDto | null;
  voterEntry: VoterEntryDto | null;
  bands: BandWithMembersDto[];
  ownBandIds: string[];
  myScores: MyScoreDto[];
}

export interface AuditionScoringPayload extends CurrentAuditionPayload {
  audition: AuditionDto;
}

export interface VoterBandRankingDto {
  rank: number;
  isTied: boolean;
  bandId: string;
  bandName: string;
  performanceOrder: number;
  memberNames: string[];
  validVoteCount: number;
  commentCount: number;
  avgRawTech: number;
  avgRawCharm: number;
  avgRawTotal: number;
  activeAvgNormTech: number;
  activeAvgNormCharm: number;
  activePrePenaltyScore: number;
  appliedPenalty: number;
  activeFinalScore: number;
}

export interface VoterResultsResponse {
  audition: AuditionDto;
  rankings: VoterBandRankingDto[];
}

export interface AdminVoterMonitorDto {
  id: string;
  userId: string;
  permissionType: PermissionType;
  isSubmitted: boolean;
  submittedAt: number | null;
  name: string;
  email: string;
  enrollmentYear: number;
  role: Role;
  grade: number;
  ownBandCount: number;
  targetBandCount: number;
  completedBandCount: number;
}

export interface AdminResultsResponse {
  audition: AuditionDto;
  bands: BandWithMembersDto[];
  aggregation: AuditionAggregationOutput;
}

export interface SelectableUserDto {
  id: string;
  name: string;
  email: string;
  enrollmentYear: number;
  grade: number;
  role?: Role;
}
