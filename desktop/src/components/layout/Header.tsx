import { useMetrics } from '../../context/MetricsContext';
import { ConnectionStatus } from '../../hooks/useWebSocketConnection';

export function Header() {
  const { status } = useMetrics();
  
  const getStatusDisplay = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return { text: 'Backend Active', color: 'bg-green-500', shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.6)]' };
      case ConnectionStatus.CONNECTING:
        return { text: 'Connecting...', color: 'bg-yellow-500', shadow: 'shadow-[0_0_8px_rgba(234,179,8,0.6)]' };
      default:
        return { text: 'Offline', color: 'bg-red-500', shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.6)]' };
    }
  };

  const display = getStatusDisplay();

  return (
    <header className="h-16 border-b border-border bg-bg-primary flex items-center justify-between px-6 shrink-0 z-10 relative">
      <div className="flex items-center space-x-4">
        <h2 className="text-sm font-medium text-text-secondary tracking-wide">SYSTEM INTELLIGENCE</h2>
      </div>
      
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 bg-bg-secondary px-3 py-1.5 rounded-md border border-border shadow-sm">
          <div className={`w-2 h-2 rounded-full ${display.color} ${display.shadow} ${status !== ConnectionStatus.DISCONNECTED ? 'animate-pulse' : ''}`}></div>
          <span className="text-xs font-medium text-text-primary tracking-wide">{display.text}</span>
        </div>
      </div>
    </header>
  );
}
