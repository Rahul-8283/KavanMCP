import { Lock } from 'lucide-react';
import { tierInfo, type TierTone } from './tiers';

const TONE_CLASS: Record<TierTone, string> = {
  sealed: 'border-line-strong bg-sunken text-ink',
  warn: 'border-transparent bg-warn-wash text-warn',
  muted: 'border-line text-ink-soft',
  crimson: 'border-transparent bg-crimson-wash text-crimson-ink',
};

export function TierBadge({ tier }: { tier: number }) {
  const { label, tooltip, tone } = tierInfo(tier);

  return (
    <span
      title={tooltip}
      className={`inline-flex h-[1.375rem] cursor-help items-center gap-1.5 rounded border px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.07em] ${TONE_CLASS[tone]}`}
    >
      {tone === 'sealed'
        ? <Lock size={10} strokeWidth={2.25} />
        : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
