import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface MainLayoutProps {
  children: React.ReactNode;
  activeView: 'dashboard' | 'settings';
  setActiveView: (view: 'dashboard' | 'settings') => void;
}

export function MainLayout({ children, activeView, setActiveView }: MainLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-bg-primary overflow-hidden text-text-primary selection:bg-accent selection:text-white">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-6 relative z-0">
          {children}
        </main>
      </div>
    </div>
  );
}
