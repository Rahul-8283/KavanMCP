import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SidebarProps {
  activeView: 'dashboard' | 'settings';
  setActiveView: (view: 'dashboard' | 'settings') => void;
}

export function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} border-r border-border bg-bg-secondary flex flex-col h-full shrink-0 transition-all duration-300 relative`}>
      <div className={`h-24 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between pl-6 pr-3'}`}>
        {!isCollapsed && (
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            Kavan
          </h1>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-hover-bg rounded-md transition-colors cursor-pointer flex items-center justify-center"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 flex flex-col items-center w-full">
        <button 
          onClick={() => setActiveView('dashboard')}
          className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'w-full px-3 py-2'} rounded-md border transition-all duration-200 cursor-pointer ${activeView === 'dashboard' ? 'bg-active-bg text-text-primary border-border font-medium' : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary border-transparent'}`} 
          title="Dashboard"
        >
          <span className="font-medium whitespace-nowrap overflow-hidden">{isCollapsed ? 'D' : 'Dashboard'}</span>
        </button>
        <button 
          className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'w-full px-3 py-2'} rounded-md text-text-secondary hover:bg-hover-bg hover:text-text-primary border border-transparent transition-all duration-200 cursor-pointer`} 
          title="Alerts"
        >
          <span className="font-medium whitespace-nowrap overflow-hidden">{isCollapsed ? 'A' : 'Alerts'}</span>
        </button>
      </nav>

      <div className="p-4 flex flex-col items-center w-full">
        <button 
          onClick={() => setActiveView('settings')}
          className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'w-full px-3 py-2'} rounded-md border transition-all duration-200 cursor-pointer ${activeView === 'settings' ? 'bg-active-bg text-text-primary border-border font-medium' : 'text-text-secondary hover:bg-hover-bg hover:text-text-primary border-transparent'}`} 
          title="Settings"
        >
          <span className="font-medium whitespace-nowrap overflow-hidden">{isCollapsed ? 'S' : 'Settings'}</span>
        </button>
      </div>
    </aside>
  );
}
