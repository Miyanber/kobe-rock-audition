import { useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';
import type { AggregationMethod } from '../../shared/schema/index.ts';

interface AggregationAlgorithmHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMethod: AggregationMethod;
  standardDiff: number;
}

interface AlgorithmSpec {
  id: AggregationMethod;
  title: string;
  summary: string;
  formula: string;
  merits: string[];
  demerits: string[];
}

/**
 * 集計アルゴリズム3方式の計算式・メリット・デメリットを比較表示するヘルプモーダル。
 */
export function AggregationAlgorithmHelpModal({
  isOpen,
  onClose,
  activeMethod,
  standardDiff,
}: AggregationAlgorithmHelpModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const algorithms: AlgorithmSpec[] = [
    {
      id: 'DIFF_CORRECTION',
      title: `Min-Max正規化・定数${standardDiff}`,
      summary: `審査員ごとの最低点を 0、最高点を定数（${standardDiff}）に引き伸ばして揃える方式です。`,
      formula: `(素点合計 - 審査員の最低点) × (${standardDiff} ÷ (審査員の最高点 - 審査員の最低点))  ※有効採点2件未満または点差0のときは補正係数 1.0`,
      merits: [
        '審査員ごとの「点数の甘辛（最低点の高さ）」と「点差の付け幅（広さ・狭さ）」の両方を強制的に揃えられる。',
        '各審査員の「1番良いバンド〜1番良くないバンド」の重みが等しくなるため、採点幅が広い審査員だけが順位を左右するのを防げる。',
      ],
      demerits: [
        '審査員の「最高点」と「最低点」の2バンドだけで全体の倍率（補正係数）が決まるため、1バンドだけ極端な高得点／低得点が付くと、他のバンド間の点差が圧縮されてしまう（外れ値に弱い）。',
        '完全な相対評価になるため、その回全体の絶対的なレベル感は数値から消える。',
      ],
    },
    {
      id: 'Z_SCORE',
      title: 'Zスコア正規化（偏差値方式）',
      summary:
        '審査員ごとの平均点とばらつき（標準偏差）をもとに偏差値化する方式です。',
      formula:
        '50 + 10 × ((素点合計 - 審査員の平均点) ÷ 審査員の標準偏差)  ※標準偏差 0 のときは 50',
      merits: [
        '審査員の「甘辛（平均点）」と「点数のばらつき（標準偏差）」を統計的に平準化できる。',
        '最高点・最低点の2点だけでなく全バンドへの採点分布を基準にするため、Min-Max正規化と比べて「1バンドだけの極端な点数（外れ値）」に引きずられにくい。',
        '一般的な偏差値と同じ尺度（平均 50・標準偏差 10）で、平均よりどれだけ優れているか／劣っているかを把握しやすい。',
      ],
      demerits: [
        'バンド数（1人の審査員が採点する件数）が極端に少ない場合、平均・標準偏差が不安定になりやすい。',
        '「100点満点」ではなく平均50前後のスコアになるため、直感的な点数イメージと馴染みにくいことがある。',
      ],
    },
    {
      id: 'RAW_AVERAGE',
      title: '単純平均方式',
      summary:
        '審査員が入力した素点（技術点 + 魅力点）を補正せずそのまま平均する方式です。',
      formula: '素点合計（技術点 + 魅力点）の単純平均',
      merits: [
        '計算がもっともシンプルで透明性が高く、素点と順位の結びつきが直感的で分かりやすい。',
        '審査員全員の採点基準が揃っていれば、全体の演奏レベルの高さ・低さといった絶対評価がそのまま反映される。',
      ],
      demerits: [
        '審査員ごとの「甘め／辛め」や「点差を大きく付ける／小さく付ける」といった採点の癖が補正されない。',
        '点差を大きく付ける審査員や、極端な点数を付けた審査員の影響力が強くなりやすい。',
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aggregation-help-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-sm border border-zinc-300 bg-white shadow-lg">
        {/* ヘッダー */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="rounded-sm bg-slate-100 p-1.5 text-slate-700">
              <HelpCircle className="h-4 w-4" />
            </div>
            <h2
              id="aggregation-help-title"
              className="text-sm sm:text-base font-bold text-zinc-800"
            >
              3つの集計アルゴリズムの特性
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1 rounded-sm text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 本文 */}
        <div className="p-5 overflow-y-auto space-y-4">
          {algorithms.map((algo) => {
            const isActive = algo.id === activeMethod;
            return (
              <section
                key={algo.id}
                className={`rounded-sm border p-4 space-y-2.5 ${
                  isActive
                    ? 'border-slate-700 bg-slate-50/70'
                    : 'border-zinc-300 bg-zinc-50/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-zinc-900">
                    {algo.title}
                  </h3>
                  {isActive && (
                    <span className="px-2 py-0.5 rounded-sm bg-slate-700 text-white text-[11px] font-bold">
                      現在選択中
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-700">{algo.summary}</p>

                <div className="rounded-sm bg-white border border-zinc-200 px-3 py-2 text-[11px] font-mono text-zinc-700 break-words">
                  計算式: {algo.formula}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="rounded-sm bg-emerald-50/70 border border-emerald-200 p-3">
                    <div className="text-xs font-bold text-emerald-800 mb-1.5">
                      メリット
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-700 leading-relaxed">
                      {algo.merits.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-sm bg-amber-50/70 border border-amber-200 p-3">
                    <div className="text-xs font-bold text-amber-900 mb-1.5">
                      デメリット・注意点
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-700 leading-relaxed">
                      {algo.demerits.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            );
          })}

          {/* 共通仕様の補足 */}
          <div className="rounded-sm border border-zinc-300 bg-zinc-100 px-4 py-3 text-xs text-zinc-700 space-y-1">
            <div className="font-bold text-zinc-800">共通仕様の補足</div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                どの方式を選んでも、自バンド・コメントのみ権限・未入力は集計計算から自動除外され、ペナルティ減点は正規化計算の後に最終スコアからのみ非破壊で減点されます。
              </li>
              <li>
                「3方式比較列」をオンにすると、現在の設定以外の方式でのスコアも並べて確認できます。
              </li>
            </ul>
          </div>
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-zinc-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
