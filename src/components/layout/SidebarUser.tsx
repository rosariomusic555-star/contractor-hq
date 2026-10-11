import { Link } from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/common/UserAvatar";
import { useMyName } from "@/hooks/use-my-name";
import { useAuth } from "@/lib/auth";

/** Bottom of the sidebar: who's signed in — their name and role (the email
 *  only when no name is set; it's always in the menu). */
export function SidebarUser() {
  const { signOut } = useAuth();
  const me = useMyName();

  return (
    <div className="border-t border-hairline py-[14px] px-[18px] mt-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-[10px] px-2 py-2 w-full rounded-lg hover:bg-muted/50 transition-colors" title={me.email || undefined}>
            <UserAvatar className="w-8 h-8" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[13px] font-semibold text-foreground truncate">{me.display || "Signed in"}</p>
              <p className="text-[11px] text-muted-subtle truncate">Owner</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            {me.fullName && <p className="truncate text-sm font-semibold text-foreground">{me.fullName}</p>}
            <p className="truncate text-xs text-muted-foreground">{me.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings/profile">
              <UserRound className="w-4 h-4 mr-2" />
              My profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
