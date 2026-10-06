import { useState } from "react";
import { Bell, ChartLine, LayoutDashboard, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useAlertHistory } from "../../context/AlertHistoryContext";
import type { View } from "./views";

interface SidebarProps {
  activeView: View;
  setActiveView: (view: View) => void;
}

const NAV_ITEMS: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'alerts', label: 'Alerts', icon: Bell },
  { view: 'trends', label: 'Trends', icon: ChartLine },
  { view: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

export function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { ongoingCount } = useAlertHistory();
  const ToggleIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={`${isCollapsed ? 'w-[3.75rem]' : 'w-[13.5rem]'} flex h-full shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200`}
    >
      <div className={`flex h-[4.75rem] shrink-0 items-center gap-3 ${isCollapsed ? 'justify-center' : 'px-5'}`}>
        <img src="/kavan_logo.svg" alt="" className="h-8 w-8 shrink-0" draggable={false} />
        {!isCollapsed && (
          <span className="font-display text-[0.9375rem] font-semibold uppercase tracking-[0.2em] text-ink">
            Kavan
          </span>
        )}
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1 px-2.5 pt-2">
        {NAV_ITEMS.map(({ view, label, icon: Icon }) => {
          const isActive = activeView === view;
          const hasOngoing = view === 'alerts' && ongoingCount > 0;
          return (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              aria-current={isActive ? 'page' : undefined}
              title={isCollapsed ? label : undefined}
              className={`relative flex h-9 items-center gap-3 rounded-md text-[0.8125rem] font-medium transition-colors ${isCollapsed ? 'justify-center' : 'px-3'} ${isActive ? 'bg-active text-ink' : 'text-ink-soft hover:bg-hover hover:text-ink'}`}
            >
              {/* The stem of the K marks the current page */}
              {isActive && <span className="absolute -left-2.5 top-1.5 bottom-1.5 w-[3px] rounded-r-sm bg-crimson" />}
              <Icon size={16} strokeWidth={1.75} className="shrink-0" />
              {!isCollapsed && <span className="truncate">{label}</span>}
              {hasOngoing && (
                <span
                  role="img"
                  aria-label={`${ongoingCount} ongoing`}
                  title={`${ongoingCount} ongoing`}
                  className={`h-1.5 w-1.5 rounded-full bg-crimson ${isCollapsed ? 'absolute right-2 top-2' : 'ml-auto'}`}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line-faint p-2.5">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex h-9 w-full items-center gap-3 rounded-md text-[0.8125rem] text-ink-faint transition-colors hover:bg-hover hover:text-ink ${isCollapsed ? 'justify-center' : 'px-3'}`}
        >
          <ToggleIcon size={16} strokeWidth={1.75} className="shrink-0" />
          {!isCollapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
