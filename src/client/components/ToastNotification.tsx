import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export interface ToastMessage {
  text: string;
  type?: 'success' | 'error';
}

interface ToastNotificationProps {
  message: ToastMessage | null;
  onClose?: () => void;
}

/**
 * 画面上部に position: fixed でオーバーレイ表示される通知トースト。
 * レイアウトのガタつきを防ぎ、CSS transition で滑らかに表示・非表示を切り替える。
 */
export function ToastNotification({
  message,
  onClose,
}: ToastNotificationProps) {
  const [rendered, setRendered] = useState<ToastMessage | null>(message);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setRendered(message);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    setVisible(false);
    const timer = setTimeout(() => {
      setRendered(null);
    }, 220);
    return () => clearTimeout(timer);
  }, [message]);

  if (!rendered) return null;

  const isError = rendered.type === 'error';

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-md pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex items-start gap-2.5 rounded-sm border px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 ease-out ${
          visible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 -translate-y-2 scale-95'
        } ${
          isError
            ? 'bg-rose-50 border-rose-300 text-rose-800'
            : 'bg-emerald-50 border-emerald-300 text-emerald-800'
        }`}
      >
        {isError ? (
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
        )}
        <span className="flex-1 leading-snug">{rendered.text}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
