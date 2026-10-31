import { Lock } from "lucide-react";

export type Tier = 1 | 2 | 3 | 4;

/** The wording and colours are the app's own (desktop/src/components/dashboard/tiers.ts and TierBadge.tsx). */
const TIERS: Record<Tier, { label: string; tone: string }> = {
  1: { label: "System", tone: "border-line-strong bg-sunken text-ink" },
  2: { label: "Essential", tone: "border-transparent bg-warn-wash text-warn" },
  3: { label: "Optional", tone: "border-line text-ink-soft" },
  4: { label: "Unverified", tone: "border-transparent bg-crimson-wash text-crimson-ink" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const { label, tone } = TIERS[tier];
  return (
    <span
      className={`inline-flex h-7 items-center gap-2 rounded border px-2.5 text-xs font-semibold uppercase tracking-[0.07em] ${tone}`}
    >
      {tier === 1 ? (
        <Lock aria-hidden="true" size={12} strokeWidth={2.25} />
      ) : (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      )}
      <span className="sr-only">Tier {tier}: </span>
      {label}
    </span>
  );
}
