import { NavLink } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarUser } from "./SidebarUser";
import { navGroups } from "./navItems";
import { useAssistant } from "@/components/assistant/assistant-context";

const navRow =
  "flex w-full items-center gap-[10px] rounded-[10px] px-[11px] py-[9px] text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/50";
const navRowActive =
  "bg-primary/[0.18] font-semibold text-foreground shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/[0.18]";

export function Sidebar() {
  const { setOpen: setAssistantOpen } = useAssistant();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-[276px] flex-col bg-card border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-[11px] px-[18px] py-5">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-foreground text-[13px] font-extrabold text-background">
          CP
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold leading-tight text-foreground">ContractorPro</h1>
          <p className="text-[11px] text-muted-subtle">Business Manager</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-[11px] pb-1 pt-3.5 text-[10px] font-bold uppercase tracking-wide text-muted-subtle">
              {group.label}
            </p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn(navRow, isActive && navRowActive)}
              >
                <item.icon className="h-[18px] w-[18px] flex-none" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
        <button type="button" onClick={() => setAssistantOpen(true)} className={cn(navRow, "mt-3.5")}>
          <Sparkles className="h-[18px] w-[18px] flex-none" />
          <span>Ask AI</span>
        </button>
      </nav>

      {/* User section */}
      <SidebarUser />
    </aside>
  );
}
