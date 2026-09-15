import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";

export function SidebarUser() {
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase() || "?";

  return (
    <div className="border-t border-hairline py-[14px] px-[18px] mt-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-[10px] px-2 py-2 w-full rounded-lg hover:bg-muted/50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-foreground">{initials}</span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-semibold text-foreground truncate">
                {email || "Signed in"}
              </p>
              <p className="text-[11px] text-muted-subtle truncate">Owner</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
