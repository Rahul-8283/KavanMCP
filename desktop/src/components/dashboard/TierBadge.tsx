interface TierBadgeProps {
  tier: number;
}

export function TierBadge({ tier }: TierBadgeProps) {
  let uiClass = '';
  let text = '';
  let tooltip = '';

  switch (tier) {
    case 1:
      uiClass = 'bg-red-600 text-white';
      text = 'SYSTEM';
      tooltip = 'Critical OS process. Terminating this may cause system instability or a blue screen.';
      break;
    case 2:
      uiClass = 'bg-amber-500 text-white';
      text = 'ESSENTIAL';
      tooltip = 'Essential application. Terminating this might disrupt your workflow.';
      break;
    case 3:
      uiClass = 'bg-yellow-400 text-gray-900';
      text = 'OPTIONAL';
      tooltip = 'User background process. Safe to terminate if resources are needed.';
      break;
    case 4:
    default:
      uiClass = 'bg-transparent border border-red-500 text-red-500';
      text = 'UNVERIFIED';
      tooltip = 'Unknown or suspicious process. Proceed with caution.';
      break;
  }

  return (
    <span 
      title={tooltip}
      className={`inline-flex items-center justify-center px-2 py-1 rounded-sm text-[10px] font-bold tracking-widest uppercase cursor-help min-w-[90px] ${uiClass}`}
    >
      {text}
    </span>
  );
}
