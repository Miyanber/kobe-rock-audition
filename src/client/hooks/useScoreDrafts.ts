import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../api/client.ts';
import type { MyScoreDto } from '../types.ts';

export interface BandScoreDraft {
  bandId: string;
  techScore: number | null;
  charmScore: number | null;
  comment: string;
  locked: boolean;
  dirty: boolean;
  localUpdatedAt: number;
}

export interface GeneralFeedbackDraft {
  text: string;
  locked: boolean;
  dirty: boolean;
  localUpdatedAt: number;
}

interface StoredDraftMap {
  [bandId: string]: BandScoreDraft;
}

function getStorageKey(auditionId: string, userId: string): string {
  return `kra_score_drafts_v1:${auditionId}:${userId}`;
}

function getGeneralFeedbackStorageKey(auditionId: string, userId: string): string {
  return `kra_general_feedback_draft_v1:${auditionId}:${userId}`;
}

const EMPTY_GENERAL_FEEDBACK: GeneralFeedbackDraft = {
  text: '',
  locked: false,
  dirty: false,
  localUpdatedAt: 0,
};

export function useScoreDrafts(
  auditionId: string | undefined,
  userId: string | undefined,
  serverScores: MyScoreDto[],
  serverGeneralFeedback: string = '',
) {
  const [drafts, setDrafts] = useState<StoredDraftMap>({});
  const [generalFeedbackDraft, setGeneralFeedbackDraft] = useState<GeneralFeedbackDraft>(
    EMPTY_GENERAL_FEEDBACK,
  );
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // 初期ロード＆サーバーデータとlocalStorageのマージ
  useEffect(() => {
    if (!auditionId || !userId) {
      setDrafts({});
      setGeneralFeedbackDraft(EMPTY_GENERAL_FEEDBACK);
      return;
    }

    let localMap: StoredDraftMap = {};
    try {
      const raw = localStorage.getItem(getStorageKey(auditionId, userId));
      if (raw) {
        localMap = JSON.parse(raw) as StoredDraftMap;
      }
    } catch {
      localMap = {};
    }

    const merged: StoredDraftMap = { ...localMap };
    for (const sc of serverScores) {
      const existingLocal = merged[sc.bandId];
      // 未同期の下書きがローカルにあればローカルを優先維持し、それ以外はサーバー値を反映（既存のロック状態があれば保持、初回取得時は保存済みのため誤操作ロック）
      if (!existingLocal || (!existingLocal.dirty && sc.updatedAt >= existingLocal.localUpdatedAt)) {
        merged[sc.bandId] = {
          bandId: sc.bandId,
          techScore: sc.techScore,
          charmScore: sc.charmScore,
          comment: sc.comment,
          locked: existingLocal ? existingLocal.locked : true,
          dirty: false,
          localUpdatedAt: sc.updatedAt,
        };
      }
    }

    setDrafts(merged);

    let localGeneral: GeneralFeedbackDraft | null = null;
    try {
      const rawGeneral = localStorage.getItem(
        getGeneralFeedbackStorageKey(auditionId, userId),
      );
      if (rawGeneral) {
        localGeneral = JSON.parse(rawGeneral) as GeneralFeedbackDraft;
      }
    } catch {
      localGeneral = null;
    }

    if (localGeneral && localGeneral.dirty) {
      setGeneralFeedbackDraft(localGeneral);
    } else {
      const hasServerText = serverGeneralFeedback.trim().length > 0;
      const keepUnlock =
        localGeneral !== null &&
        localGeneral.text === serverGeneralFeedback &&
        !localGeneral.locked;
      setGeneralFeedbackDraft({
        text: serverGeneralFeedback,
        locked: hasServerText && !keepUnlock,
        dirty: false,
        localUpdatedAt: localGeneral?.localUpdatedAt ?? 0,
      });
    }
  }, [auditionId, userId, serverScores, serverGeneralFeedback]);

  const persistToStorage = useCallback(
    (next: StoredDraftMap) => {
      if (!auditionId || !userId) return;
      try {
        localStorage.setItem(getStorageKey(auditionId, userId), JSON.stringify(next));
      } catch {
        // ストレージ容量超過時は無視
      }
    },
    [auditionId, userId],
  );

  const persistGeneralFeedbackToStorage = useCallback(
    (next: GeneralFeedbackDraft) => {
      if (!auditionId || !userId) return;
      try {
        localStorage.setItem(
          getGeneralFeedbackStorageKey(auditionId, userId),
          JSON.stringify(next),
        );
      } catch {
        // ストレージ容量超過時は無視
      }
    },
    [auditionId, userId],
  );

  const updateDraft = useCallback(
    (
      bandId: string,
      patch: Partial<Pick<BandScoreDraft, 'techScore' | 'charmScore' | 'comment' | 'locked'>>,
      markDirty: boolean = true,
    ) => {
      setDrafts((prev) => {
        const current = prev[bandId] ?? {
          bandId,
          techScore: null,
          charmScore: null,
          comment: '',
          locked: false,
          dirty: false,
          localUpdatedAt: 0,
        };
        const updated: BandScoreDraft = {
          ...current,
          ...patch,
          dirty: markDirty ? true : current.dirty,
          localUpdatedAt: Date.now(),
        };
        const next = { ...prev, [bandId]: updated };
        persistToStorage(next);
        return next;
      });
    },
    [persistToStorage],
  );

  const updateGeneralFeedback = useCallback(
    (
      patch: Partial<Pick<GeneralFeedbackDraft, 'text' | 'locked'>>,
      markDirty: boolean = true,
    ) => {
      setGeneralFeedbackDraft((prev) => {
        const updated: GeneralFeedbackDraft = {
          ...prev,
          ...patch,
          dirty: markDirty ? true : prev.dirty,
          localUpdatedAt: Date.now(),
        };
        persistGeneralFeedbackToStorage(updated);
        return updated;
      });
    },
    [persistGeneralFeedbackToStorage],
  );

  const markSaved = useCallback(
    (bandIds: string[]) => {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const bid of bandIds) {
          if (next[bid]) {
            next[bid] = {
              ...next[bid],
              dirty: false,
              locked: true,
              localUpdatedAt: Date.now(),
            };
          }
        }
        persistToStorage(next);
        return next;
      });
    },
    [persistToStorage],
  );

  const markGeneralFeedbackSaved = useCallback(() => {
    setGeneralFeedbackDraft((prev) => {
      const next: GeneralFeedbackDraft = {
        ...prev,
        dirty: false,
        locked: true,
        localUpdatedAt: Date.now(),
      };
      persistGeneralFeedbackToStorage(next);
      return next;
    });
  }, [persistGeneralFeedbackToStorage]);

  const syncPendingDrafts = useCallback(async () => {
    if (!auditionId || !userId || !navigator.onLine) return;
    const dirtyList = Object.values(drafts).filter((d) => d.dirty);
    const generalDirty = generalFeedbackDraft.dirty;
    if (dirtyList.length === 0 && !generalDirty) return;

    setIsSyncing(true);
    try {
      const payload = {
        scores: dirtyList.map((d) => ({
          bandId: d.bandId,
          techScore: d.techScore,
          charmScore: d.charmScore,
          comment: d.comment,
        })),
        ...(generalDirty ? { generalFeedback: generalFeedbackDraft.text } : {}),
        markSubmitted: false,
      };
      await apiJson(`/api/auditions/${auditionId}/scores/submit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (dirtyList.length > 0) {
        markSaved(dirtyList.map((d) => d.bandId));
      }
      if (generalDirty) {
        markGeneralFeedbackSaved();
      }
      const syncedTotal = dirtyList.length + (generalDirty ? 1 : 0);
      setSyncMessage(`オフライン下書き（${syncedTotal}件）をサーバーへ自動同期しました`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch {
      // ネットワークエラー時は次回オンラインイベントで再試行
    } finally {
      setIsSyncing(false);
    }
  }, [
    auditionId,
    userId,
    drafts,
    generalFeedbackDraft,
    markSaved,
    markGeneralFeedbackSaved,
  ]);

  // オンライン・オフライン監視 & 復旧時の自動同期
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void syncPendingDrafts();
    };
    const onOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncPendingDrafts]);

  const dirtyCount =
    Object.values(drafts).filter((d) => d.dirty).length +
    (generalFeedbackDraft.dirty ? 1 : 0);

  return {
    drafts,
    generalFeedbackDraft,
    updateDraft,
    updateGeneralFeedback,
    markSaved,
    markGeneralFeedbackSaved,
    syncPendingDrafts,
    isOnline,
    isSyncing,
    dirtyCount,
    syncMessage,
  };
}

