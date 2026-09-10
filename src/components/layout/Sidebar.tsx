import { NavLink } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarUser } from "./SidebarUser";
import { navItems } from "./navItems";
import { useAssistant } from "@/components/assistant/assistant-context";

export function Sidebar() {
  const { setOpen: setAssistantOpen } = useAssistant();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-sidebar-border px-[18px] py-5">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-sidebar-primary text-sm font-extrabold text-sidebar-primary-foreground">
          CP
        </div>
        <div className="min-w-0">
          <h1 className="text-[15px] font-bold leading-tight text-sidebar-foreground">ContractorPro</h1>
          <p className="text-[11px] text-sidebar-foreground/60">Business Manager</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn("nav-item w-full", isActive && "active")}
          >
            <item.icon className="h-[18px] w-[18px]" />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setAssistantOpen(true)} className="nav-item w-full">
          <Sparkles className="h-[18px] w-[18px]" />
          <span>Ask AI</span>
        </button>
      </nav>

      {/* User section */}
      <SidebarUser />
    </aside>
  );
}
