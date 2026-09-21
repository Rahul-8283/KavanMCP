import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Sidebar() {
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
          className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded-md transition-colors cursor-pointer flex items-center justify-center"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 flex flex-col items-center w-full">
        <a href="#" className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'w-full px-3 py-2'} rounded-md bg-white/5 text-text-primary border border-white/5 transition-all duration-200`} title="Dashboard">
          <span className="font-medium whitespace-nowrap overflow-hidden">{isCollapsed ? 'D' : 'Dashboard'}</span>
        </a>
        <a href="#" className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'w-full px-3 py-2'} rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-200`} title="Alerts">
          <span className="font-medium whitespace-nowrap overflow-hidden">{isCollapsed ? 'A' : 'Alerts'}</span>
        </a>
      </nav>

      <div className="p-4 flex flex-col items-center w-full">
        <a href="#" className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'w-full px-3 py-2'} rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-200`} title="Settings">
          <span className="font-medium whitespace-nowrap overflow-hidden">{isCollapsed ? 'S' : 'Settings'}</span>
        </a>
      </div>
    </aside>
  );
}
