export type TierTone = 'sealed' | 'warn' | 'muted' | 'crimson';

export interface TierInfo {
  label: string;
  tooltip: string;
  tone: TierTone;
}

// One source for tier wording, shared by the badge, the filter and the confirm dialog
const TIERS: Record<number, TierInfo> = {
  1: {
    label: 'System',
    tooltip: 'Critical OS process. Terminating this may cause system instability or a blue screen.',
    tone: 'sealed',
  },
  2: {
    label: 'Essential',
    tooltip: 'Essential application. Terminating this might disrupt your workflow.',
    tone: 'warn',
  },
  3: {
    label: 'Optional',
    tooltip: 'User background process. Safe to terminate if resources are needed.',
    tone: 'muted',
  },
  4: {
    label: 'Unverified',
    tooltip: 'Unknown or suspicious process. Proceed with caution.',
    tone: 'crimson',
  },
};

export const TIER_NUMBERS = [1, 2, 3, 4] as const;

// Unknown tiers are treated as the most cautious one
export function tierInfo(tier: number): TierInfo {
  return TIERS[tier] ?? TIERS[4];
}
