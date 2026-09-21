import { useProcess } from '../../context/ProcessContext';
import { Loader2 } from 'lucide-react';
import { TierBadge } from './TierBadge';

export function ProcessTable() {
  const { processes, isLoading } = useProcess();

  if (isLoading && processes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary opacity-50 p-12">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="text-sm tracking-wide">Scanning system processes...</p>
      </div>
    );
  }

  if (processes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary opacity-50 p-12">
        <p className="text-sm tracking-wide">No processes found.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-left border-collapse whitespace-nowrap">
        <thead>
          <tr className="border-b border-border/50 text-xs uppercase tracking-widest text-text-secondary bg-black/20">
            <th className="px-6 py-4 font-medium">Process Name</th>
            <th className="px-6 py-4 font-medium">PID</th>
            <th className="px-6 py-4 font-medium">CPU (%)</th>
            <th className="px-6 py-4 font-medium">Memory (MB)</th>
            <th className="px-6 py-4 font-medium text-right">Security Tier</th>
          </tr>
        </thead>
        <tbody className="text-sm divide-y divide-border/50">
          {processes.map((proc) => (
            <tr key={`${proc.pid}-${proc.name}`} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-6 py-4 font-medium text-text-primary">{proc.name}</td>
              <td className="px-6 py-4 text-text-secondary font-mono text-xs">{proc.pid}</td>
              <td className="px-6 py-4 text-text-primary">{proc.cpu_percent.toFixed(1)}</td>
              <td className="px-6 py-4 text-text-primary">{proc.memory_mb.toFixed(1)}</td>
              <td className="px-6 py-4 text-right">
                <TierBadge tier={proc.tier} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
