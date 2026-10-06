import type { AlertLevel } from '../../services/api';

const LEVEL_STYLE: Record<AlertLevel, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'border-transparent bg-crimson-wash text-crimson-ink' },
  warning: { label: 'Warning', className: 'border-transparent bg-warn-wash text-warn' },
};

export function LevelBadge({ level }: { level: AlertLevel }) {
  const { label, className } = LEVEL_STYLE[level];

  return (
    <span className={`inline-flex h-[1.375rem] items-center gap-1.5 rounded border px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.07em] ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
