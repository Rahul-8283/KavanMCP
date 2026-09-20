import { LayoutDashboard, AlertCircle, Settings } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="w-64 border-r border-border bg-bg-secondary flex flex-col h-full shrink-0">
      <div className="p-6">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">
          Kavan<span className="text-accent">MCP</span>
        </h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-2">
        <a href="#" className="flex items-center space-x-3 px-3 py-2 rounded-md bg-white/5 text-text-primary border border-white/5 transition-all duration-200">
          <LayoutDashboard className="w-5 h-5" />
          <span className="font-medium">Dashboard</span>
        </a>
        <a href="#" className="flex items-center space-x-3 px-3 py-2 rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-200">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Alerts</span>
        </a>
      </nav>

      <div className="p-4">
        <a href="#" className="flex items-center space-x-3 px-3 py-2 rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-200">
          <Settings className="w-5 h-5" />
          <span className="font-medium">Settings</span>
        </a>
      </div>
    </aside>
  );
}
