export const AUDITION_STATUS_VALUES = [
  'DRAFT',
  'ENTRY_CLOSED',
  'ACTIVE',
  'CLOSED',
] as const;

export type AuditionStatus = (typeof AUDITION_STATUS_VALUES)[number];

export interface AuditionStatusMeta {
  status: AuditionStatus;
  step: number;
  label: string;
  shortDescription: string;
  badgeClassName: string;
}

export const AUDITION_STATUS_META: Record<AuditionStatus, AuditionStatusMeta> = {
  DRAFT: {
    status: 'DRAFT',
    step: 1,
    label: 'バンド募集中',
    shortDescription: '部員誰でもバンド登録・編集ができます（採点は非公開）',
    badgeClassName: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  ENTRY_CLOSED: {
    status: 'ENTRY_CLOSED',
    step: 2,
    label: '募集締切・調整中',
    shortDescription: '部員のバンド登録を締め切り、開催可否や出演順を調整します（閲覧のみ可）',
    badgeClassName: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  ACTIVE: {
    status: 'ACTIVE',
    step: 3,
    label: '採点受付中',
    shortDescription: '部員の採点画面が公開され、バンド登録は自動ロックされます',
    badgeClassName: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  CLOSED: {
    status: 'CLOSED',
    step: 4,
    label: '採点終了・集計',
    shortDescription: '採点を締め切り、集計・Excel出力を行います',
    badgeClassName: 'bg-zinc-200 text-zinc-700 border-zinc-300',
  },
};

export const AUDITION_STATUS_LIST: AuditionStatusMeta[] =
  AUDITION_STATUS_VALUES.map((status) => AUDITION_STATUS_META[status]);

export function getAuditionStatusLabel(status: AuditionStatus): string {
  return AUDITION_STATUS_META[status].label;
}
