import { ReactNode, memo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface GaugeCardProps {
  title: string;
  value: number; // 0 to 100
  icon?: ReactNode;
  suffix?: string;
  isOffline?: boolean;
}

export const GaugeCard = memo(function GaugeCard({ title, value, icon, suffix = '%', isOffline = false }: GaugeCardProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.min(Math.max(value || 0, 0), 100);
  
  // Calculate remainder for the background of the pie
  const data = [
    { name: 'Value', value: isOffline ? 0 : clampedValue },
    { name: 'Remainder', value: isOffline ? 100 : 100 - clampedValue }
  ];

  const getColor = (val: number) => {
    if (isOffline) return 'rgba(255,255,255,0.1)'; // Grayed out state
    if (val < 70) return '#10b981'; // emerald-500
    if (val < 90) return '#f59e0b'; // amber-500
    return '#f43f5e'; // rose-500
  };

  const activeColor = getColor(clampedValue);
  const inactiveColor = 'rgba(255,255,255,0.05)';

  return (
    <div className={`bg-bg-secondary border border-border p-6 rounded-lg flex flex-col justify-between relative overflow-hidden h-48 transition-opacity duration-500 ${isOffline ? 'opacity-60' : 'opacity-100'}`}>
      <div className="flex items-center justify-between z-10 relative">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-widest">{title}</span>
        {icon && <div className="text-text-secondary opacity-50">{icon}</div>}
      </div>
      
      <div className="flex-1 w-full flex flex-col items-center justify-center relative mt-6">
        <div className="w-full h-full absolute inset-0 -top-8">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="100%"
                startAngle={180}
                endAngle={0}
                innerRadius="80%"
                outerRadius="100%"
                paddingAngle={0}
                dataKey="value"
                stroke="none"
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              >
                <Cell key="cell-0" fill={activeColor} />
                <Cell key="cell-1" fill={inactiveColor} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Value Overlay */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center z-10">
          <div className="flex items-baseline space-x-1">
            <span className="text-4xl font-light text-text-primary tracking-tight">
              {isOffline ? '--' : clampedValue.toFixed(1)}
            </span>
            <span className="text-sm text-text-secondary font-medium">{suffix}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
