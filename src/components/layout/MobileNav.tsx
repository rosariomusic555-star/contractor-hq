import { useState } from "react";
import { NavLink } from "react-router-dom";
import { HardHat, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SidebarUser } from "./SidebarUser";
import { navItems } from "./navItems";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-sidebar border-b border-sidebar-border z-50 flex items-center px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-sidebar-foreground">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
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
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn("nav-item w-full", isActive && "active")}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <SidebarUser />
        </SheetContent>
      </Sheet>

      {/* Logo in header */}
      <div className="flex items-center gap-2 ml-3">
        <HardHat className="w-6 h-6 text-sidebar-primary" />
        <span className="font-bold text-sidebar-foreground">ContractorPro</span>
      </div>
    </header>
  );
}
