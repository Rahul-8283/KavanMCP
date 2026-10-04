import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import type { View } from "./views";

interface MainLayoutProps {
  children: React.ReactNode;
  activeView: View;
  setActiveView: (view: View) => void;
}

export function MainLayout({ children, activeView, setActiveView }: MainLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-ink">
      <Sidebar activeView={activeView} setActiveView={setActiveView} />
      <div className="app-canvas flex min-w-0 flex-1 flex-col">
        <Header view={activeView} />
        <main className="min-h-0 flex-1 overflow-auto px-7 pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
