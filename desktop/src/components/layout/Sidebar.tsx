import { useState } from "react";
import { LayoutDashboard, AlertCircle, Settings, ChevronLeft, ChevronRight } from "lucide-react";

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} border-r border-border bg-bg-secondary flex flex-col h-full shrink-0 transition-all duration-300 relative`}>
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-6 bg-bg-secondary border border-border rounded-full p-1 text-text-secondary hover:text-text-primary z-10 shadow-md cursor-pointer"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className={`p-6 ${isCollapsed ? 'items-center px-0 flex justify-center' : ''}`}>
        <h1 className={`text-xl font-semibold tracking-tight text-text-primary ${isCollapsed ? 'text-sm' : ''}`}>
          {isCollapsed ? <span>K<span className="text-accent">M</span></span> : <span>Kavan<span className="text-accent">MCP</span></span>}
        </h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 flex flex-col items-center w-full">
        <a href="#" className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'space-x-3 w-full px-3 py-2'} rounded-md bg-white/5 text-text-primary border border-white/5 transition-all duration-200`} title="Dashboard">
          <LayoutDashboard className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="font-medium whitespace-nowrap overflow-hidden">Dashboard</span>}
        </a>
        <a href="#" className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'space-x-3 w-full px-3 py-2'} rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-200`} title="Alerts">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="font-medium whitespace-nowrap overflow-hidden">Alerts</span>}
        </a>
      </nav>

      <div className="p-4 flex flex-col items-center w-full">
        <a href="#" className={`flex items-center ${isCollapsed ? 'justify-center w-12 h-12' : 'space-x-3 w-full px-3 py-2'} rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-200`} title="Settings">
          <Settings className="w-5 h-5 shrink-0" />
          {!isCollapsed && <span className="font-medium whitespace-nowrap overflow-hidden">Settings</span>}
        </a>
      </div>
    </aside>
  );
}
