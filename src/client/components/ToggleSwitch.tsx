import type { ReactNode } from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md';
  id?: string;
  className?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
  id,
  className = '',
}: ToggleSwitchProps) {
  const isSm = size === 'sm';
  const trackClasses = isSm ? 'w-8 h-4.5' : 'w-9 h-5';
  const thumbClasses = isSm ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const translateClass = isSm
    ? checked
      ? 'translate-x-4'
      : 'translate-x-0.5'
    : checked
      ? 'translate-x-4.5'
      : 'translate-x-0.5';

  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-2 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <span className="relative inline-flex items-center shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <span
          className={`${trackClasses} rounded-full transition-colors duration-200 ease-in-out ${
            checked ? 'bg-slate-700' : 'bg-zinc-300'
          }`}
        />
        <span
          className={`absolute ${thumbClasses} rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out pointer-events-none ${translateClass}`}
        />
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && (
            <span className="text-xs font-bold text-zinc-800 leading-tight">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-zinc-500 leading-tight">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
