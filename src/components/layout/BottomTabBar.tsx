import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  FileText,
  LayoutDashboard,
  Briefcase,
  Plus,
  Receipt,
  Settings as SettingsIcon,
  TrendingUp,
  Users,
  MoreHorizontal,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { createQuote } from "@/lib/api";

const tab = "flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold";

export function BottomTabBar() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signOut } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const newQuoteMut = useMutation({
    mutationFn: () => createQuote(),
    onSuccess: (quote) => {
      setCreateOpen(false);
      navigate(`/quotes/${quote.id}`);
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't create quote", description: err.message, variant: "destructive" }),
  });

  const go = (to: string, close: () => void) => {
    close();
    navigate(to);
  };

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(tab, isActive ? "text-primary" : "text-muted-foreground");

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-border bg-card/95 px-2 backdrop-blur md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        <NavLink to="/dashboard" className={tabClass}>
          <LayoutDashboard className="h-5 w-5" />
          Home
        </NavLink>
        <NavLink to="/projects" className={tabClass}>
          <Briefcase className="h-5 w-5" />
          Projects
        </NavLink>

        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Create"
            onClick={() => setCreateOpen(true)}
            className="-mt-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        <NavLink to="/revenue" className={tabClass}>
          <TrendingUp className="h-5 w-5" />
          Money
        </NavLink>
        <button type="button" onClick={() => setMoreOpen(true)} className={cn(tab, "text-muted-foreground")}>
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* Create action sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="rounded-t-card border-border pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div className="mx-auto w-full max-w-sm space-y-2 pt-2">
            <h2 className="px-1 pb-2 text-base font-bold text-foreground">Create</h2>
            <ActionRow icon={FileText} label="New quote" hint="Blank draft in the builder" disabled={newQuoteMut.isPending} onClick={() => newQuoteMut.mutate()} />
            <ActionRow icon={Receipt} label="New invoice" hint="Bill a project" onClick={() => go("/invoices/new", () => setCreateOpen(false))} />
            <ActionRow icon={Briefcase} label="New project" hint="Start a job" onClick={() => go("/projects?new=1", () => setCreateOpen(false))} />
            <ActionRow icon={Users} label="Add client" hint="Create a contact" onClick={() => go("/clients?new=1", () => setCreateOpen(false))} />
          </div>
        </SheetContent>
      </Sheet>

      {/* More sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-card border-border pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div className="mx-auto w-full max-w-sm space-y-1 pt-2">
            <h2 className="px-1 pb-2 text-base font-bold text-foreground">More</h2>
            <ActionRow icon={FileText} label="Quotes" onClick={() => go("/quotes", () => setMoreOpen(false))} />
            <ActionRow icon={Receipt} label="Invoices" onClick={() => go("/invoices", () => setMoreOpen(false))} />
            <ActionRow icon={Users} label="Clients" onClick={() => go("/clients", () => setMoreOpen(false))} />
            <ActionRow icon={SettingsIcon} label="Settings" onClick={() => go("/settings", () => setMoreOpen(false))} />
            <div className="my-1 h-px bg-hairline" />
            <ActionRow icon={LogOut} label="Sign out" onClick={() => { setMoreOpen(false); signOut(); }} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ActionRow({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: typeof FileText;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}
