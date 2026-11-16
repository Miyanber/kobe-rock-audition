import { useEffect, useMemo, useState } from 'react';
import {
  FilePlus2,
  Play,
  Plus,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { AdminAuditionHeader } from '../components/AdminAuditionHeader.tsx';
import { ToastNotification } from '../components/ToastNotification.tsx';
import type {
  AdminVoterMonitorDto,
  AuditionDto,
  BandWithMembersDto,
  SelectableUserDto,
} from '../types.ts';
import type { AuditionStatus, PermissionType } from '../../shared/schema/index.ts';
import {
  AUDITION_STATUS_LIST,
  getAuditionStatusLabel,
} from '../../shared/audition-status.ts';
import { calculateGrade, isActiveClubGrade } from '../../shared/grade.ts';

interface AdminSetupPageProps {
  auditions: AuditionDto[];
  selectedAuditionId: string;
  onSelectAudition: (id: string) => void;
  onAuditionsChanged: () => Promise<void>;
}

type SetupSectionId = 'setup-status' | 'setup-voters' | 'setup-bands';

const SAMPLE_BANDS_CSV = `1,Opening Session,六甲 健太 / 三宮 翔
2,Harbor Blues,灘 花子`;

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function AdminSetupPage({
  auditions,
  selectedAuditionId,
  onSelectAudition,
  onAuditionsChanged,
}: AdminSetupPageProps) {
  // 新規オーディション作成モーダル
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState(getTodayDateString);
  const [creating, setCreating] = useState(false);

  // 目次アクティブ状態
  const [activeSection, setActiveSection] =
    useState<SetupSectionId>('setup-status');

  // バンド一括登録
  const [bandsCsv, setBandsCsv] = useState('');
  const [replaceBands, setReplaceBands] = useState(false);
  const [bandUploadResult, setBandUploadResult] = useState<{
    insertedCount: number;
    warnings: string[];
  } | null>(null);

  // 採点・コメント義務設定
  const [allUsers, setAllUsers] = useState<SelectableUserDto[]>([]);
  const [currentVoters, setCurrentVoters] = useState<AdminVoterMonitorDto[]>([]);
  const [auditionBands, setAuditionBands] = useState<BandWithMembersDto[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [performerFilter, setPerformerFilter] = useState<
    'ALL' | 'PERFORMERS_ONLY' | 'NON_PERFORMERS_ONLY'
  >('ALL');
  const [bulkPermType, setBulkPermType] =
    useState<PermissionType>('SCORE_AND_COMMENT');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // オーディション削除確認モーダル
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deletingAudition, setDeletingAudition] = useState(false);

  const selectedAudition = auditions.find((a) => a.id === selectedAuditionId);

  const loadContext = async () => {
    const usersRes = await apiJson<{ users: SelectableUserDto[] }>(
      '/api/admin/users',
    );
    setAllUsers(usersRes.users);
    if (selectedAuditionId) {
      const [votersRes, bandsRes] = await Promise.all([
        apiJson<{ voters: AdminVoterMonitorDto[] }>(
          `/api/admin/auditions/${selectedAuditionId}/voters`,
        ),
        apiJson<{ bands: BandWithMembersDto[] }>(
          `/api/auditions/${selectedAuditionId}/bands`,
        ),
      ]);
      setCurrentVoters(votersRes.voters);
      setAuditionBands(bandsRes.bands);
    } else {
      setCurrentVoters([]);
      setAuditionBands([]);
    }
  };

  useEffect(() => {
    setShowDeleteModal(false);
    setDeleteConfirmInput('');
    setActiveSection('setup-status');
    void loadContext();
  }, [selectedAuditionId]);

  useEffect(() => {
    if (!selectedAudition) return;
    const sectionIds: SetupSectionId[] = [
      'setup-status',
      'setup-voters',
      'setup-bands',
    ];
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id as SetupSectionId);
        }
      },
      {
        rootMargin: '-120px 0px -55% 0px',
        threshold: 0,
      },
    );

    for (const el of elements) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, [selectedAudition?.id]);

  const scrollToSection = (id: SetupSectionId) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  // 4月基準で1〜3回生のみ表示（4回生以上は自動非表示）
  const visibleUsers = useMemo(
    () => allUsers.filter((u) => isActiveClubGrade(u.enrollmentYear)),
    [allUsers],
  );

  const availableGrades = useMemo(() => {
    const set = new Set(
      visibleUsers.map((u) => calculateGrade(u.enrollmentYear)),
    );
    return Array.from(set).sort((a, b) => a - b);
  }, [visibleUsers]);

  const performerBandsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const band of auditionBands) {
      for (const member of band.members) {
        const list = map.get(member.userId) ?? [];
        list.push(band.name);
        map.set(member.userId, list);
      }
    }
    return map;
  }, [auditionBands]);

  const bulkMatchedUsers = useMemo(() => {
    const targetGrades =
      selectedGrades.length > 0 ? selectedGrades : availableGrades;
    return visibleUsers.filter((u) => {
      const grade = calculateGrade(u.enrollmentYear);
      if (!targetGrades.includes(grade)) return false;
      const isPerformer = (performerBandsMap.get(u.id)?.length ?? 0) > 0;
      if (performerFilter === 'PERFORMERS_ONLY') return isPerformer;
      if (performerFilter === 'NON_PERFORMERS_ONLY') return !isPerformer;
      return true;
    });
  }, [
    visibleUsers,
    selectedGrades,
    availableGrades,
    performerBandsMap,
    performerFilter,
  ]);

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage((prev) => (prev === msg ? null : prev)), 5000);
  };

  const openCreateModal = () => {
    setNewTitle('');
    setNewEventDate(getTodayDateString());
    setShowCreateModal(true);
  };

  const handleCreateAudition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await apiJson<{ audition: AuditionDto }>('/api/admin/auditions', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          eventDate: newEventDate,
          deadline: null,
        }),
      });
      setShowCreateModal(false);
      setNewTitle('');
      await onAuditionsChanged();
      onSelectAudition(res.audition.id);
      showToast(
        `新規オーディション「${res.audition.title}」を「${getAuditionStatusLabel(res.audition.status)}」で作成しました`,
      );
    } finally {
      setCreating(false);
    }
  };

  const handleChangeStatus = async (status: AuditionStatus) => {
    if (!selectedAudition) return;
    if (
      status === 'ACTIVE' &&
      !window.confirm(
        `「${selectedAudition.title}」を「採点受付中」に切り替えますか？\n※現在「採点受付中」になっている他のオーディションは自動的に「採点終了・集計」に変更され、一般部員によるバンド登録・編集はロックされます。`,
      )
    ) {
      return;
    }
    await apiJson(`/api/admin/auditions/${selectedAudition.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    await onAuditionsChanged();
    showToast(`進行ステータスを「${getAuditionStatusLabel(status)}」に切り替えました`);
  };

  const handleDeleteAudition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAudition || deleteConfirmInput !== selectedAudition.title) {
      return;
    }
    setDeletingAudition(true);
    const deletedTitle = selectedAudition.title;
    try {
      await apiJson(`/api/admin/auditions/${selectedAudition.id}`, {
        method: 'DELETE',
      });
      setShowDeleteModal(false);
      setDeleteConfirmInput('');
      await onAuditionsChanged();
      showToast(`オーディション「${deletedTitle}」を削除しました`);
    } finally {
      setDeletingAudition(false);
    }
  };

  const handleBulkBands = async () => {
    if (!selectedAudition || !bandsCsv.trim()) return;
    const res = await apiJson<{
      insertedCount: number;
      warnings: string[];
      bands: BandWithMembersDto[];
    }>(`/api/admin/auditions/${selectedAudition.id}/bands/bulk`, {
      method: 'POST',
      body: JSON.stringify({ csvText: bandsCsv, replaceExisting: replaceBands }),
    });
    setBandUploadResult({
      insertedCount: res.insertedCount,
      warnings: res.warnings,
    });
    setAuditionBands(res.bands);
    showToast(`${res.insertedCount}件のバンドを一括登録しました`);
  };

  const handleBulkVotersByCondition = async (action: 'ASSIGN' | 'REMOVE') => {
    if (!selectedAudition) return;
    const targetGrades =
      selectedGrades.length > 0 ? selectedGrades : availableGrades;
    const targetEnrollmentYears = Array.from(
      new Set(
        visibleUsers
          .filter((u) =>
            targetGrades.includes(calculateGrade(u.enrollmentYear)),
          )
          .map((u) => u.enrollmentYear),
      ),
    );
    if (targetEnrollmentYears.length === 0) {
      showToast('対象となる部員（1〜3回生）がいません');
      return;
    }
    const res = await apiJson<{ affectedCount: number }>(
      `/api/admin/auditions/${selectedAudition.id}/voters/bulk`,
      {
        method: 'POST',
        body: JSON.stringify({
          mode: 'BY_CONDITION',
          enrollmentYears: targetEnrollmentYears,
          performerFilter,
          permissionType: bulkPermType,
          action,
        }),
      },
    );
    await loadContext();
    const permLabel =
      bulkPermType === 'SCORE_AND_COMMENT' ? '採点＋コメント' : 'コメントのみ';
    showToast(
      action === 'ASSIGN'
        ? `${res.affectedCount}名に採点・コメント義務（${permLabel}）を一括設定しました`
        : `${res.affectedCount}名の採点・コメント義務を一括解除しました`,
    );
  };

  const handleSingleVoterAssign = async (
    userId: string,
    permissionType: PermissionType | 'REMOVE',
  ) => {
    if (!selectedAudition) return;
    await apiJson(`/api/admin/auditions/${selectedAudition.id}/voters/bulk`, {
      method: 'POST',
      body: JSON.stringify({
        mode: 'BY_IDS',
        userIds: [userId],
        permissionType: permissionType === 'REMOVE' ? undefined : permissionType,
        action: permissionType === 'REMOVE' ? 'REMOVE' : 'ASSIGN',
      }),
    });
    await loadContext();
  };

  const voterMap = useMemo(
    () => new Map(currentVoters.map((v) => [v.userId, v])),
    [currentVoters],
  );

  const tocItems: Array<{
    id: SetupSectionId;
    step: number;
    label: string;
    icon: typeof Play;
    badge?: string;
  }> = [
    { id: 'setup-status', step: 1, label: '進行ステータス', icon: Play },
    {
      id: 'setup-voters',
      step: 2,
      label: '採点・コメント義務設定',
      icon: UserCheck,
      badge: `${currentVoters.length}名`,
    },
    { id: 'setup-bands', step: 3, label: 'バンド一括登録', icon: Upload },
  ];

  return (
    <div className="space-y-6">
      <AdminAuditionHeader
        auditions={auditions}
        selectedAuditionId={selectedAuditionId}
        onSelectAudition={onSelectAudition}
        actionSlot={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold shrink-0 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>新規作成</span>
          </button>
        }
      />

      <ToastNotification
        message={statusMessage ? { text: statusMessage, type: 'success' } : null}
        onClose={() => setStatusMessage(null)}
      />

      {!selectedAudition ? (
        <section className="bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center space-y-3">
          <p className="text-sm font-bold text-zinc-700">
            まだオーディションが作成されていません
          </p>
          <p className="text-xs text-zinc-500">
            まずは新しい開催回を作成して、バンド募集や参加権限の設定を始めましょう。
          </p>
          <div>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              新規オーディションを作成
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* モバイル・タブレット用ジャンプバー */}
          <nav
            aria-label="設定セクション目次"
            className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            {tocItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'location' : undefined}
                  onClick={() => scrollToSection(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-bold border whitespace-nowrap transition cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {item.step}. {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 rounded-sm text-[10px] font-semibold ${
                        isActive
                          ? 'bg-slate-600 text-slate-100'
                          : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6 items-start">
            {/* デスクトップ用 左目次 */}
            <aside className="hidden lg:block lg:sticky lg:top-28">
              <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-2 space-y-1">
                <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  設定目次
                </div>
                <nav aria-label="設定セクション目次" className="space-y-1">
                  {tocItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={isActive ? 'location' : undefined}
                        onClick={() => scrollToSection(item.id)}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-sm text-xs font-bold text-left transition cursor-pointer ${
                          isActive
                            ? 'bg-slate-700 text-white'
                            : 'text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {item.step}. {item.label}
                          </span>
                        </span>
                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.5 rounded-sm text-[10px] font-semibold shrink-0 ${
                              isActive
                                ? 'bg-slate-600 text-slate-100'
                                : 'bg-zinc-200 text-zinc-600'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </aside>

            <div className="space-y-6 min-w-0">
              {/* 1. ステータス切替 */}
              <section
                id="setup-status"
                className="scroll-mt-28 bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-3"
              >
                <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
                  <Play className="h-5 w-5 text-emerald-600" />
                  進行ステータス切替（対象: {selectedAudition.title}）
                </h2>
                <p className="text-xs text-zinc-500">
                  ① バンド募集中 → ② 募集締切・調整中 → ③ 採点受付中 → ④ 採点終了・集計 の順に進めてください
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {AUDITION_STATUS_LIST.map((meta) => {
                    const isSelected = selectedAudition.status === meta.status;
                    return (
                      <button
                        key={meta.status}
                        type="button"
                        onClick={() => handleChangeStatus(meta.status)}
                        className={`p-3 rounded-sm text-left border transition cursor-pointer flex flex-col gap-1 ${
                          isSelected
                            ? 'bg-slate-700 text-white border-slate-900'
                            : 'bg-zinc-100 hover:bg-zinc-200/70 text-zinc-800 border-zinc-300'
                        }`}
                      >
                        <span className="text-sm font-bold">
                          {meta.step}. {meta.label}
                        </span>
                        <span
                          className={`text-[11px] leading-snug ${
                            isSelected ? 'text-slate-200' : 'text-zinc-500'
                          }`}
                        >
                          {meta.shortDescription}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 2. 採点・コメント義務設定 */}
              <section
                id="setup-voters"
                className="scroll-mt-28 bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-4"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-slate-700" />
                    採点・コメント義務設定
                  </h2>
                  <span className="text-xs text-zinc-500">
                    ※4月基準で1〜3回生のみ表示（4回生以上は自動非表示）
                  </span>
                </div>

                <div className="bg-zinc-100 border border-zinc-300 rounded-sm p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs font-bold text-zinc-700 mb-1.5">
                        回生で絞り込み（未選択時は全回生）
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableGrades.map((grade) => {
                          const active = selectedGrades.includes(grade);
                          return (
                            <button
                              key={grade}
                              type="button"
                              onClick={() =>
                                setSelectedGrades((prev) =>
                                  prev.includes(grade)
                                    ? prev.filter((g) => g !== grade)
                                    : [...prev, grade],
                                )
                              }
                              className={`px-2.5 py-1 rounded-sm text-xs font-semibold border cursor-pointer ${
                                active
                                  ? 'bg-slate-700 text-white border-slate-700'
                                  : 'bg-zinc-50 text-zinc-700 border-zinc-300'
                              }`}
                            >
                              {grade}回生
                            </button>
                          );
                        })}
                        {availableGrades.length === 0 && (
                          <span className="text-xs text-zinc-400">
                            対象の現役部員がいません
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-zinc-700 mb-1.5">
                        出演有無フィルタ
                      </div>
                      <select
                        value={performerFilter}
                        onChange={(e) =>
                          setPerformerFilter(
                            e.target.value as
                              | 'ALL'
                              | 'PERFORMERS_ONLY'
                              | 'NON_PERFORMERS_ONLY',
                          )
                        }
                        className="w-full rounded-sm border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold"
                      >
                        <option value="ALL">全部員（出演・非出演すべて）</option>
                        <option value="PERFORMERS_ONLY">出演バンドメンバーのみ</option>
                        <option value="NON_PERFORMERS_ONLY">非出演者のみ</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-zinc-700 mb-1.5">
                        設定する義務区分
                      </div>
                      <select
                        value={bulkPermType}
                        onChange={(e) =>
                          setBulkPermType(e.target.value as PermissionType)
                        }
                        className="w-full rounded-sm border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold"
                      >
                        <option value="SCORE_AND_COMMENT">
                          SCORE_AND_COMMENT（採点＋コメント）
                        </option>
                        <option value="COMMENT_ONLY">
                          COMMENT_ONLY（コメントのみ）
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                    <span className="text-xs font-semibold text-zinc-600">
                      条件に一致する部員: {bulkMatchedUsers.length}名
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleBulkVotersByCondition('REMOVE')}
                        className="px-3.5 py-2 rounded-sm border border-rose-300 text-rose-700 bg-zinc-50 hover:bg-rose-50 text-xs font-bold cursor-pointer"
                      >
                        条件に合う部員の義務を解除
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkVotersByCondition('ASSIGN')}
                        className="px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                      >
                        条件に合う部員へ一括設定
                      </button>
                    </div>
                  </div>
                </div>

                {/* 個別確認・変更テーブル */}
                <div className="overflow-x-auto border border-zinc-300 rounded-sm">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-zinc-100 border-b border-zinc-300 font-bold text-zinc-700">
                        <th className="px-3 py-2.5">氏名</th>
                        <th className="px-3 py-2.5">回生</th>
                        <th className="px-3 py-2.5">出演・非出演</th>
                        <th className="px-3 py-2.5">現在の設定</th>
                        <th className="px-3 py-2.5 text-right">個別変更</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleUsers.map((u) => {
                        const entry = voterMap.get(u.id);
                        const grade = calculateGrade(u.enrollmentYear);
                        const performingBands = performerBandsMap.get(u.id) ?? [];
                        const isPerformer = performingBands.length > 0;
                        return (
                          <tr key={u.id}>
                            <td className="px-3 py-2.5 font-medium text-zinc-800">
                              {u.name}
                              <div className="text-[11px] text-zinc-400 font-mono">
                                {u.email}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-600 whitespace-nowrap">
                              {grade}回生
                            </td>
                            <td className="px-3 py-2.5">
                              {isPerformer ? (
                                <div className="space-y-0.5">
                                  <span className="inline-block px-2 py-0.5 rounded-sm text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                                    出演
                                    {performingBands.length > 1
                                      ? ` (${performingBands.length}バンド)`
                                      : ''}
                                  </span>
                                  <div
                                    className="text-[11px] text-zinc-500 max-w-[180px] truncate"
                                    title={performingBands.join(' / ')}
                                  >
                                    {performingBands.join(' / ')}
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-sm text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                                  非出演
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {entry ? (
                                <span
                                  className={`px-2 py-0.5 rounded-sm text-xs font-semibold ${
                                    entry.permissionType === 'SCORE_AND_COMMENT'
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {entry.permissionType === 'SCORE_AND_COMMENT'
                                    ? '採点＋コメント'
                                    : 'コメントのみ'}
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400">
                                  未設定（対象外）
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="inline-flex gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSingleVoterAssign(u.id, 'SCORE_AND_COMMENT')
                                  }
                                  className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
                                >
                                  採点+コメ
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSingleVoterAssign(u.id, 'COMMENT_ONLY')
                                  }
                                  className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold cursor-pointer"
                                >
                                  コメのみ
                                </button>
                                {entry && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSingleVoterAssign(u.id, 'REMOVE')
                                    }
                                    className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                                  >
                                    解除
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {visibleUsers.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-6 text-center text-xs text-zinc-500"
                          >
                            表示対象の部員（1〜3回生）がいません
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 3. バンド・出演順・メンバー CSV一括登録 */}
              <section
                id="setup-bands"
                className="scroll-mt-28 bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-3"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
                    <Upload className="h-5 w-5 text-slate-700" />
                    参加バンド・出演順・メンバー 一括登録（CSV / TSV）
                  </h2>
                  <button
                    type="button"
                    onClick={() => setBandsCsv(SAMPLE_BANDS_CSV)}
                    className="text-xs font-semibold text-slate-700 hover:underline cursor-pointer"
                  >
                    サンプル形式を挿入
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  書式:{' '}
                  <code className="bg-zinc-100 px-1.5 py-0.5 rounded">
                    出演順,バンド名,メンバー1 / メンバー2
                  </code>
                  （氏名またはメールアドレスで部員マスタと自動紐付け）
                </p>
                <textarea
                  rows={5}
                  value={bandsCsv}
                  onChange={(e) => setBandsCsv(e.target.value)}
                  placeholder={`1,The Rokko Distortion,六甲 健太 / 三宮 翔\n2,Portliner Echo,灘 花子`}
                  className="w-full rounded-sm border border-zinc-300 px-3.5 py-2.5 text-sm font-mono"
                />
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replaceBands}
                      onChange={(e) => setReplaceBands(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-rose-600"
                    />
                    既存のバンド一覧をすべて置き換える（チェックしない場合は追記）
                  </label>

                  <button
                    type="button"
                    onClick={handleBulkBands}
                    className="px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold cursor-pointer"
                  >
                    バンド一括登録を実行
                  </button>
                </div>

                {bandUploadResult && bandUploadResult.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 text-xs text-amber-900 space-y-1">
                    <p className="font-bold">メンバー紐付けの警告:</p>
                    <ul className="list-disc pl-5">
                      {bandUploadResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* 危険な操作: オーディション削除 */}
              <section className="bg-rose-50/40 border border-rose-200 rounded-sm p-5 flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-bold text-rose-800">
                    オーディションの削除
                  </h2>
                  <p className="text-xs text-rose-700/90">
                    対象「{selectedAudition.title}」に紐づくバンド・参加権限・採点データもすべて削除されます。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmInput('');
                    setShowDeleteModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm text-xs font-bold border border-rose-300 bg-white hover:bg-rose-100 text-rose-700 transition cursor-pointer shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  このオーディションを削除
                </button>
              </section>
            </div>
          </div>
        </>
      )}

      {/* 新規オーディション作成モーダル */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-audition-modal-title"
        >
          <div className="w-full max-w-md rounded-sm border border-zinc-300 bg-white p-5 shadow-lg space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <h3
                  id="create-audition-modal-title"
                  className="text-base font-bold text-zinc-800 flex items-center gap-2"
                >
                  <FilePlus2 className="h-4 w-4 text-slate-700 shrink-0" />
                  新規オーディションの作成
                </h3>
                <p className="text-xs text-zinc-500">
                  作成直後は「1. バンド募集中」ステータスで開始されます。
                </p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowCreateModal(false)}
                aria-label="閉じる"
                className="p-1 rounded-sm text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAudition} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700">
                  開催回名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例: 2027 春ライブオーディション"
                  className="w-full rounded-sm border border-zinc-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-700">
                  開催日（目安でOK） <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full rounded-sm border border-zinc-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none"
                />
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  ※作成時点で確定していない場合は目安の日付で構いません（主に開催回の並び順に使用されます）。
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 rounded-sm border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-xs font-bold text-zinc-700 cursor-pointer disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {creating ? '作成中...' : '作成して募集開始'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && selectedAudition && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-audition-modal-title"
        >
          <div className="w-full max-w-md rounded-sm border border-zinc-300 bg-white p-5 shadow-lg space-y-4">
            <div className="space-y-1.5">
              <h3
                id="delete-audition-modal-title"
                className="text-base font-bold text-rose-700 flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                オーディションの完全削除
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                この操作は元に戻せません。対象オーディションに紐づくバンド、参加権限、採点データもすべて完全に削除されます。
              </p>
            </div>

            <form onSubmit={handleDeleteAudition} className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs text-zinc-700">
                  削除を確定するには、以下のオーディション名を手入力してください：
                </label>
                <div className="rounded-sm bg-zinc-100 border border-zinc-200 px-3 py-2 text-xs font-mono font-bold text-zinc-800 break-all">
                  {selectedAudition.title}
                </div>
                <input
                  type="text"
                  autoFocus
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  placeholder={selectedAudition.title}
                  className="w-full rounded-sm border border-zinc-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={deletingAudition}
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmInput('');
                  }}
                  className="px-3.5 py-2 rounded-sm border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-xs font-bold text-zinc-700 cursor-pointer disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={
                    deleteConfirmInput !== selectedAudition.title ||
                    deletingAudition
                  }
                  className="px-3.5 py-2 rounded-sm bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deletingAudition ? '削除中...' : '完全に削除する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

