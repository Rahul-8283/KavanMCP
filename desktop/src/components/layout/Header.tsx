export function Header() {
  return (
    <header className="h-16 border-b border-border bg-bg-primary flex items-center justify-between px-6 shrink-0 z-10 relative">
      <div className="flex items-center space-x-4">
        <h2 className="text-sm font-medium text-text-secondary tracking-wide">SYSTEM INTELLIGENCE</h2>
      </div>
      
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 bg-bg-secondary px-3 py-1.5 rounded-md border border-border shadow-sm">
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
          <span className="text-xs font-medium text-text-primary tracking-wide">Backend Active</span>
        </div>
      </div>
    </header>
  );
}
