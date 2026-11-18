import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FilePlus2,
  GripVertical,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
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
  onAuditionsChanged: () => Promise<AuditionDto[]>;
  onAuditionDeleted: (remaining: AuditionDto[]) => void;
  showCreateModal: boolean;
  onOpenCreateModal: () => void;
  onCloseCreateModal: () => void;
}

type SetupSectionId =
  | 'setup-status'
  | 'setup-voters'
  | 'setup-band-order'
  | 'setup-bands';
type PerformerFilter = 'ALL' | 'PERFORMERS_ONLY' | 'NON_PERFORMERS_ONLY';
type PermissionFilter = 'ALL' | 'UNSET' | PermissionType;

const PERMISSION_LABELS: Record<PermissionType, string> = {
  SCORE_AND_COMMENT: '採点＋コメント',
  COMMENT_ONLY: 'コメントのみ',
};

const PERFORMER_FILTER_OPTIONS: Array<{
  value: PerformerFilter;
  label: string;
}> = [
  { value: 'ALL', label: 'すべて' },
  { value: 'PERFORMERS_ONLY', label: '出演者のみ' },
  { value: 'NON_PERFORMERS_ONLY', label: '非出演者のみ' },
];

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
  onAuditionDeleted,
  showCreateModal,
  onOpenCreateModal,
  onCloseCreateModal,
}: AdminSetupPageProps) {
  // 新規オーディション作成モーダル
  const [newTitle, setNewTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState(getTodayDateString);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (showCreateModal) {
      setNewTitle('');
      setNewEventDate(getTodayDateString());
    }
  }, [showCreateModal]);

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
  const [orderedBandIds, setOrderedBandIds] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [draggingBandId, setDraggingBandId] = useState<string | null>(null);
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [performerFilter, setPerformerFilter] = useState<PerformerFilter>('ALL');
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilter>('ALL');
  const [voterSearchQuery, setVoterSearchQuery] = useState('');
  const [bulkSetting, setBulkSetting] =
    useState<PermissionType | 'REMOVE'>('COMMENT_ONLY');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [updatingUserIds, setUpdatingUserIds] = useState<Record<string, boolean>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [standardDiffDraft, setStandardDiffDraft] = useState('100');
  const [savingStandardDiff, setSavingStandardDiff] = useState(false);

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
      setOrderedBandIds(bandsRes.bands.map((b) => b.id));
    } else {
      setCurrentVoters([]);
      setAuditionBands([]);
      setOrderedBandIds([]);
    }
  };

  useEffect(() => {
    setStandardDiffDraft(String(selectedAudition?.standardDiff ?? 100));
  }, [selectedAudition?.id, selectedAudition?.standardDiff]);

  const handleUpdateStandardDiff = async () => {
    if (!selectedAudition) return;
    const num = Number(standardDiffDraft);
    if (!Number.isFinite(num) || num <= 0 || num > 100) {
      setStatusMessage('点差補正定数は 1〜100 の数値で入力してください。');
      return;
    }
    setSavingStandardDiff(true);
    try {
      await apiJson(`/api/admin/auditions/${selectedAudition.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ standardDiff: num }),
      });
      await onAuditionsChanged();
      setStatusMessage(`点差補正定数を ${num} に更新しました。`);
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : '定数の更新に失敗しました',
      );
    } finally {
      setSavingStandardDiff(false);
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
      'setup-band-order',
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

  const voterMap = useMemo(
    () => new Map(currentVoters.map((v) => [v.userId, v])),
    [currentVoters],
  );

  const voterSummary = useMemo(() => {
    let scoreAndComment = 0;
    let commentOnly = 0;
    let unset = 0;
    for (const u of visibleUsers) {
      const entry = voterMap.get(u.id);
      if (!entry) {
        unset++;
      } else if (entry.permissionType === 'SCORE_AND_COMMENT') {
        scoreAndComment++;
      } else {
        commentOnly++;
      }
    }
    return {
      total: visibleUsers.length,
      scoreAndComment,
      commentOnly,
      unset,
    };
  }, [visibleUsers, voterMap]);

  const filteredUsers = useMemo(() => {
    const targetGrades =
      selectedGrades.length > 0 ? selectedGrades : availableGrades;
    const normalizedQuery = voterSearchQuery.trim().toLowerCase();

    return visibleUsers.filter((u) => {
      const grade = calculateGrade(u.enrollmentYear);
      if (!targetGrades.includes(grade)) return false;

      const isPerformer = (performerBandsMap.get(u.id)?.length ?? 0) > 0;
      if (performerFilter === 'PERFORMERS_ONLY' && !isPerformer) return false;
      if (performerFilter === 'NON_PERFORMERS_ONLY' && isPerformer) return false;

      const entry = voterMap.get(u.id);
      if (permissionFilter === 'UNSET' && entry) return false;
      if (
        permissionFilter === 'SCORE_AND_COMMENT' &&
        entry?.permissionType !== 'SCORE_AND_COMMENT'
      ) {
        return false;
      }
      if (
        permissionFilter === 'COMMENT_ONLY' &&
        entry?.permissionType !== 'COMMENT_ONLY'
      ) {
        return false;
      }

      if (normalizedQuery) {
        const matchesName = u.name.toLowerCase().includes(normalizedQuery);
        const matchesEmail = u.email.toLowerCase().includes(normalizedQuery);
        if (!matchesName && !matchesEmail) return false;
      }

      return true;
    });
  }, [
    visibleUsers,
    selectedGrades,
    availableGrades,
    performerBandsMap,
    performerFilter,
    voterMap,
    permissionFilter,
    voterSearchQuery,
  ]);

  const hasActiveVoterFilter =
    selectedGrades.length > 0 ||
    performerFilter !== 'ALL' ||
    permissionFilter !== 'ALL' ||
    voterSearchQuery.trim() !== '';

  const resetVoterFilters = () => {
    setSelectedGrades([]);
    setPerformerFilter('ALL');
    setPermissionFilter('ALL');
    setVoterSearchQuery('');
  };

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage((prev) => (prev === msg ? null : prev)), 5000);
  };

  const openCreateModal = () => {
    onOpenCreateModal();
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
      onCloseCreateModal();
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
      const remaining = await onAuditionsChanged();
      onAuditionDeleted(remaining);
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
    setOrderedBandIds(res.bands.map((b) => b.id));
    showToast(`${res.insertedCount}件のバンドを一括登録しました`);
  };

  const orderedBands = useMemo(() => {
    const bandMap = new Map(auditionBands.map((b) => [b.id, b]));
    return orderedBandIds
      .map((id) => bandMap.get(id))
      .filter((b): b is BandWithMembersDto => b !== undefined);
  }, [auditionBands, orderedBandIds]);

  const isOrderDirty = useMemo(() => {
    if (orderedBandIds.length !== auditionBands.length) return false;
    return orderedBandIds.some((id, idx) => auditionBands[idx]?.id !== id);
  }, [orderedBandIds, auditionBands]);

  const moveBand = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= orderedBandIds.length) return;
    setOrderedBandIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  // Pointer Events ベースのドラッグ（マウス・タッチ両対応）。
  // ハンドル上でポインタを動かすと、下にある行の位置へリアルタイムに入れ替える。
  const handleGripPointerDown = (e: React.PointerEvent<HTMLElement>, bandId: string) => {
    if (savingOrder) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingBandId(bandId);
  };

  const handleGripPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!draggingBandId) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetBandId = el?.closest<HTMLElement>('[data-band-id]')?.dataset.bandId;
    if (!targetBandId || targetBandId === draggingBandId) return;
    setOrderedBandIds((prev) => {
      const fromIndex = prev.indexOf(draggingBandId);
      const toIndex = prev.indexOf(targetBandId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleGripPointerEnd = () => setDraggingBandId(null);

  const resetBandOrder = () => {
    setOrderedBandIds(auditionBands.map((b) => b.id));
  };

  const handleSaveBandOrder = async () => {
    if (!selectedAudition || orderedBandIds.length === 0 || savingOrder) return;
    setSavingOrder(true);
    try {
      const res = await apiJson<{ bands: BandWithMembersDto[] }>(
        `/api/admin/auditions/${selectedAudition.id}/bands/order`,
        {
          method: 'PUT',
          body: JSON.stringify({ bandIds: orderedBandIds }),
        },
      );
      setAuditionBands(res.bands);
      setOrderedBandIds(res.bands.map((b) => b.id));
      showToast('バンドの出演順を保存しました');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : '出演順の保存に失敗しました',
      );
    } finally {
      setSavingOrder(false);
    }
  };

  const handleBulkVoters = async () => {
    if (!selectedAudition || bulkProcessing) return;
    if (filteredUsers.length === 0) {
      showToast('表示中の対象部員がいません');
      return;
    }

    const action: 'ASSIGN' | 'REMOVE' =
      bulkSetting === 'REMOVE' ? 'REMOVE' : 'ASSIGN';
    const permLabel =
      bulkSetting === 'REMOVE' ? '不参加' : PERMISSION_LABELS[bulkSetting];

    if (action === 'REMOVE' || filteredUsers.length >= 2) {
      const confirmMsg =
        action === 'ASSIGN'
          ? `表示中の ${filteredUsers.length}名 を「${permLabel}」に設定しますか？`
          : `表示中の ${filteredUsers.length}名 を「不参加」（採点・コメントなし）にしますか？`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    setBulkProcessing(true);
    try {
      const res = await apiJson<{ affectedCount: number }>(
        `/api/admin/auditions/${selectedAudition.id}/voters/bulk`,
        {
          method: 'POST',
          body: JSON.stringify({
            mode: 'BY_IDS',
            userIds: filteredUsers.map((u) => u.id),
            permissionType: action === 'ASSIGN' ? bulkSetting : undefined,
            action,
          }),
        },
      );
      await loadContext();
      showToast(
        action === 'ASSIGN'
          ? `${res.affectedCount}名に採点・コメント義務（${permLabel}）を設定しました`
          : `${res.affectedCount}名を「不参加」（採点・コメントなし）にしました`,
      );
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleSingleVoterAssign = async (
    user: SelectableUserDto,
    nextSetting: PermissionType | 'REMOVE',
  ) => {
    if (!selectedAudition || updatingUserIds[user.id]) return;
    const currentSetting = voterMap.get(user.id)?.permissionType ?? 'REMOVE';
    if (currentSetting === nextSetting) return;

    setUpdatingUserIds((prev) => ({ ...prev, [user.id]: true }));
    try {
      await apiJson(`/api/admin/auditions/${selectedAudition.id}/voters/bulk`, {
        method: 'POST',
        body: JSON.stringify({
          mode: 'BY_IDS',
          userIds: [user.id],
          permissionType: nextSetting === 'REMOVE' ? undefined : nextSetting,
          action: nextSetting === 'REMOVE' ? 'REMOVE' : 'ASSIGN',
        }),
      });
      await loadContext();
      const label =
        nextSetting === 'REMOVE' ? '不参加' : PERMISSION_LABELS[nextSetting];
      showToast(`${user.name} を「${label}」に変更しました`);
    } finally {
      setUpdatingUserIds((prev) => {
        const next = { ...prev };
        delete next[user.id];
        return next;
      });
    }
  };

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
    {
      id: 'setup-band-order',
      step: 3,
      label: 'バンド出演順の並び替え',
      icon: ArrowUpDown,
      badge: `${auditionBands.length}組`,
    },
    { id: 'setup-bands', step: 4, label: 'バンド一括登録', icon: Upload },
  ];

  return (
    <div className="space-y-6">
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

                {/* 設定状況サマリー（クリックで下の表を絞り込み） */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-zinc-600 mr-1">
                    現在の設定状況:
                  </span>
                  {(
                    [
                      {
                        value: 'ALL',
                        label: `すべて (${voterSummary.total}名)`,
                        activeClass: 'bg-slate-700 text-white border-slate-700',
                        idleClass:
                          'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100',
                      },
                      {
                        value: 'SCORE_AND_COMMENT',
                        label: `採点＋コメント (${voterSummary.scoreAndComment}名)`,
                        activeClass:
                          'bg-emerald-700 text-white border-emerald-700',
                        idleClass:
                          'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
                      },
                      {
                        value: 'COMMENT_ONLY',
                        label: `コメントのみ (${voterSummary.commentOnly}名)`,
                        activeClass: 'bg-amber-600 text-white border-amber-600',
                        idleClass:
                          'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
                      },
                      {
                        value: 'UNSET',
                        label: `不参加 (${voterSummary.unset}名)`,
                        activeClass: 'bg-zinc-700 text-white border-zinc-700',
                        idleClass:
                          voterSummary.unset > 0
                            ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                            : 'bg-zinc-100 text-zinc-600 border-zinc-300 hover:bg-zinc-200',
                      },
                    ] as const
                  ).map((item) => {
                    const active = permissionFilter === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPermissionFilter(item.value)}
                        className={`px-2.5 py-1 rounded-sm text-xs font-bold border transition cursor-pointer ${
                          active ? item.activeClass : item.idleClass
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* 絞り込み条件バー（下の表にリアルタイム反映） */}
                <div className="bg-zinc-100 border border-zinc-300 rounded-sm p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-zinc-700">
                      絞り込み条件（下の表と一括操作に連動）
                    </span>
                    {hasActiveVoterFilter && (
                      <button
                        type="button"
                        onClick={resetVoterFilters}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-900 hover:underline cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        絞り込みをリセット
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs font-bold text-zinc-700 mb-1.5">
                        回生
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          aria-pressed={selectedGrades.length === 0}
                          onClick={() => setSelectedGrades([])}
                          className={`px-2.5 py-1 rounded-sm text-xs font-semibold border transition cursor-pointer ${
                            selectedGrades.length === 0
                              ? 'bg-slate-700 text-white border-slate-700'
                              : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                          }`}
                        >
                          全回生
                        </button>
                        {availableGrades.map((grade) => {
                          const active = selectedGrades.includes(grade);
                          return (
                            <button
                              key={grade}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                setSelectedGrades((prev) =>
                                  prev.includes(grade)
                                    ? prev.filter((g) => g !== grade)
                                    : [...prev, grade],
                                )
                              }
                              className={`px-2.5 py-1 rounded-sm text-xs font-semibold border transition cursor-pointer ${
                                active
                                  ? 'bg-slate-700 text-white border-slate-700'
                                  : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
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
                        出演状況
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {PERFORMER_FILTER_OPTIONS.map((opt) => {
                          const active = performerFilter === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setPerformerFilter(opt.value)}
                              className={`px-2.5 py-1 rounded-sm text-xs font-semibold border transition cursor-pointer ${
                                active
                                  ? 'bg-slate-700 text-white border-slate-700'
                                  : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="voter-search-input"
                        className="block text-xs font-bold text-zinc-700 mb-1.5"
                      >
                        氏名・メール検索
                      </label>
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="voter-search-input"
                          type="text"
                          value={voterSearchQuery}
                          onChange={(e) => setVoterSearchQuery(e.target.value)}
                          placeholder="氏名またはメールアドレスで検索"
                          className="w-full rounded-sm border border-zinc-300 bg-white pl-8 pr-8 py-1.5 text-xs focus:border-slate-700 focus:outline-none"
                        />
                        {voterSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setVoterSearchQuery('')}
                            aria-label="検索をクリア"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 一括操作バー */}
                  <div className="border-t border-zinc-300 pt-3 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-zinc-700">
                        表示中の {filteredUsers.length}名
                        {hasActiveVoterFilter &&
                          `（全${visibleUsers.length}名中）`}
                        をまとめて変更:
                      </span>
                      <select
                        aria-label="一括設定する区分"
                        value={bulkSetting}
                        onChange={(e) =>
                          setBulkSetting(
                            e.target.value as PermissionType | 'REMOVE',
                          )
                        }
                        className="rounded-sm border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800"
                      >
                        <option value="COMMENT_ONLY">コメントのみ</option>
                        <option value="SCORE_AND_COMMENT">採点＋コメント</option>
                        <option value="REMOVE">不参加（採点・コメントなし）</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      disabled={filteredUsers.length === 0 || bulkProcessing}
                      onClick={handleBulkVoters}
                      className={`px-3.5 py-1.5 rounded-sm text-white text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        bulkSetting === 'REMOVE'
                          ? 'bg-rose-600 hover:bg-rose-700'
                          : 'bg-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {bulkProcessing
                        ? '反映中...'
                        : `表示中の ${filteredUsers.length}名 に適用`}
                    </button>
                  </div>
                </div>

                {/* 個別確認・変更テーブル */}
                <div className="overflow-x-auto border border-zinc-300 rounded-sm bg-white">
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
                      {filteredUsers.map((u) => {
                        const entry = voterMap.get(u.id);
                        const currentSetting: PermissionType | 'REMOVE' =
                          entry ? entry.permissionType : 'REMOVE';
                        const isUpdating = Boolean(updatingUserIds[u.id]);
                        const grade = calculateGrade(u.enrollmentYear);
                        const performingBands = performerBandsMap.get(u.id) ?? [];
                        const isPerformer = performingBands.length > 0;
                        return (
                          <tr key={u.id} className="hover:bg-zinc-50/70">
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
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {entry ? (
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-sm text-xs font-semibold border ${
                                    entry.permissionType === 'SCORE_AND_COMMENT'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                >
                                  {PERMISSION_LABELS[entry.permissionType]}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-sm text-xs font-semibold bg-zinc-100 text-zinc-500 border border-zinc-200">
                                  不参加
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <div
                                role="group"
                                aria-label={`${u.name}の採点・コメント義務設定`}
                                className="inline-flex rounded-sm border border-zinc-300 overflow-hidden divide-x divide-zinc-300"
                              >
                                {(
                                  [
                                    {
                                      value: 'SCORE_AND_COMMENT',
                                      label: '採点＋コメント',
                                      activeClass:
                                        'bg-emerald-700 text-white font-bold',
                                      idleClass:
                                        'bg-white text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800',
                                    },
                                    {
                                      value: 'COMMENT_ONLY',
                                      label: 'コメントのみ',
                                      activeClass:
                                        'bg-amber-600 text-white font-bold',
                                      idleClass:
                                        'bg-white text-zinc-700 hover:bg-amber-50 hover:text-amber-800',
                                    },
                                    {
                                      value: 'REMOVE',
                                      label: '不参加',
                                      activeClass:
                                        'bg-zinc-600 text-white font-bold',
                                      idleClass:
                                        'bg-white text-zinc-600 hover:bg-rose-50 hover:text-rose-700',
                                    },
                                  ] as const
                                ).map((opt) => {
                                  const isActive = currentSetting === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      aria-pressed={isActive}
                                      disabled={isActive || isUpdating || bulkProcessing}
                                      onClick={() =>
                                        handleSingleVoterAssign(u, opt.value)
                                      }
                                      className={`px-2.5 py-1 text-[11px] font-semibold transition ${
                                        isActive
                                          ? `${opt.activeClass} cursor-default`
                                          : `${opt.idleClass} cursor-pointer`
                                      } disabled:opacity-75`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-8 text-center text-xs text-zinc-500 space-y-2"
                          >
                            <div>
                              {visibleUsers.length === 0
                                ? '表示対象の部員（1〜3回生）がいません'
                                : '条件に一致する部員がいません'}
                            </div>
                            {visibleUsers.length > 0 && hasActiveVoterFilter && (
                              <button
                                type="button"
                                onClick={resetVoterFilters}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-sm border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-xs font-bold text-slate-700 cursor-pointer"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                絞り込みをリセット
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 3. バンド出演順（動画順）の並び替え */}
              <section
                id="setup-band-order"
                className="scroll-mt-28 bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-4"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
                      <ArrowUpDown className="h-5 w-5 text-slate-700" />
                      バンド出演順（動画順）の並び替え
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      ↑↓ボタンまたはドラッグ＆ドロップでオーディション動画の再生順に並び替え、保存してください（1から連番で反映されます）。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isOrderDirty && (
                      <button
                        type="button"
                        disabled={savingOrder}
                        onClick={resetBandOrder}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-sm border border-zinc-300 bg-white hover:bg-zinc-100 text-xs font-bold text-zinc-700 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        元に戻す
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!isOrderDirty || savingOrder || orderedBands.length === 0}
                      onClick={() => void handleSaveBandOrder()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Save className="h-4 w-4" />
                      {savingOrder ? '保存中...' : '出演順を保存'}
                    </button>
                  </div>
                </div>

                {(selectedAudition.status === 'ACTIVE' ||
                  selectedAudition.status === 'CLOSED') && (
                  <div className="bg-amber-50 border border-amber-200 rounded-sm px-3.5 py-2.5 text-xs text-amber-900">
                    現在「{getAuditionStatusLabel(selectedAudition.status)}」のオーディションです。出演順を変更すると、採点画面の表示順や同点時のタイブレーク順位に影響します。
                  </div>
                )}

                {isOrderDirty && (
                  <div className="bg-sky-50 border border-sky-200 rounded-sm px-3.5 py-2 text-xs font-semibold text-sky-900">
                    未保存の並び替え変更があります。「出演順を保存」を押すと確定します。
                  </div>
                )}

                {orderedBands.length === 0 ? (
                  <div className="rounded-sm border border-dashed border-zinc-300 bg-white p-6 text-center text-xs text-zinc-500">
                    このオーディションにはまだバンドが登録されていません。
                  </div>
                ) : (
                  <div className="border border-zinc-300 rounded-sm bg-white divide-y divide-zinc-200">
                    {orderedBands.map((band, index) => {
                      const newOrder = index + 1;
                      const orderChanged = band.performanceOrder !== newOrder;
                      const isDragging = draggingBandId === band.id;
                      return (
                        <div
                          key={band.id}
                          data-band-id={band.id}
                          className={`flex items-center justify-between gap-3 px-3.5 py-2.5 transition ${
                            isDragging
                              ? 'bg-slate-100 opacity-60'
                              : 'hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              title="ドラッグして並び替え"
                              onPointerDown={(e) => handleGripPointerDown(e, band.id)}
                              onPointerMove={handleGripPointerMove}
                              onPointerUp={handleGripPointerEnd}
                              onPointerCancel={handleGripPointerEnd}
                              style={{ touchAction: 'none' }}
                              className="inline-flex items-center self-stretch px-1 -ml-1 text-zinc-400 cursor-grab active:cursor-grabbing shrink-0 select-none"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-sm text-xs font-bold ${
                                  orderChanged
                                    ? 'bg-sky-100 text-sky-900 border border-sky-300'
                                    : 'bg-slate-100 text-slate-800 border border-slate-200'
                                }`}
                              >
                                {newOrder}
                              </span>
                              {orderChanged && (
                                <span className="text-[11px] text-zinc-400 font-mono">
                                  (元:{band.performanceOrder})
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-zinc-800 truncate">
                                {band.name}
                              </p>
                              <p className="text-xs text-zinc-500 truncate">
                                {band.members.length > 0
                                  ? band.members.map((m) => m.name).join(' / ')
                                  : 'メンバー未設定'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={index === 0 || savingOrder}
                              onClick={() => moveBand(index, -1)}
                              aria-label={`${band.name} を1つ上へ`}
                              className="p-1.5 rounded-sm border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === orderedBands.length - 1 || savingOrder}
                              onClick={() => moveBand(index, 1)}
                              aria-label={`${band.name} を1つ下へ`}
                              className="p-1.5 rounded-sm border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 4. バンド・出演順・メンバー CSV一括登録 */}
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

              {/* 詳細設定: 点差補正定数 */}
              <section className="bg-zinc-50 border border-zinc-300 rounded-sm p-5 flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-bold text-zinc-800">
                    詳細設定：点差補正定数（既定値 100）
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Min-Max 点差補正の換算満点（通常は 100 点満点換算の 100 固定を推奨）。過去Excel（10点満点）と比較する場合のみ 10 等に変更してください。
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={standardDiffDraft}
                    onChange={(e) => setStandardDiffDraft(e.target.value)}
                    className="w-20 rounded-sm border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-bold text-right"
                  />
                  <button
                    type="button"
                    disabled={savingStandardDiff}
                    onClick={handleUpdateStandardDiff}
                    className="px-3 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {savingStandardDiff ? '保存中...' : '定数変更'}
                  </button>
                </div>
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
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-sm border border-zinc-300 bg-white p-5 shadow-lg space-y-4">
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
                onClick={onCloseCreateModal}
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
                  onClick={onCloseCreateModal}
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
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-sm border border-zinc-300 bg-white p-5 shadow-lg space-y-4">
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

