import { Outlet, Link } from "react-router-dom";
import { LogOut, KeyRound, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

/**
 * The employee shell — deliberately minimal, with no relation to the
 * owner's Sidebar/BottomTabBar/AssistantProvider. An employee only ever
 * has two real screens (their assigned-projects list and one project's
 * detail), so a single top bar is the whole nav surface — no financial or
 * pricing screens are even routable from here.
 */
export function EmployeeLayout() {
  const { employee, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3.5 md:px-8">
        <Link to="/employee" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-sidebar-primary text-xs font-extrabold text-sidebar-primary-foreground">
            CP
          </div>
          <span className="text-sm font-bold text-sidebar-foreground">ContractorPro</span>
        </Link>

        <div className="flex items-center gap-1">
        {/* Timesheets (0131) — clock in / out and the week. */}
        <Link to="/employee/time" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-sidebar-foreground hover:bg-sidebar-accent/50">
          <Clock className="h-4 w-4" /> My time
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/50"
            >
              <span className="text-sm font-semibold">{employee?.name ?? "Account"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to="/employee/account">
                <KeyRound className="mr-2 h-4 w-4" />
                Change password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>

      <main className="p-4 md:p-8">
        <div className="mx-auto w-full max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
