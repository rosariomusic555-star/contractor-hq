import { HardHat } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SidebarUser } from "./SidebarUser";
import { navItems } from "./navItems";

export function Sidebar() {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-sidebar flex-col border-r border-sidebar-border">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <HardHat className="w-6 h-6 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-sidebar-foreground">ContractorPro</h1>
            <p className="text-xs text-sidebar-foreground/60">Business Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn("nav-item w-full", isActive && "active")}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <SidebarUser />
    </aside>
  );
}
