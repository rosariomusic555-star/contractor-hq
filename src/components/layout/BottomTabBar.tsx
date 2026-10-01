import { useNotifications } from "@/hooks/use-notifications";
import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Briefcase,
  Plus,
  Receipt,
  Settings as SettingsIcon,
  Sparkles,
  TrendingUp,
  Users,
  MoreHorizontal,
  Clock,
  Activity,
  Bell,
  LogOut,
  Kanban,
  Rows3,
  ListChecks,
  CalendarClock,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { createQuote, createInvoice, createProjectInvoice, listProjects } from "@/lib/api";
import { useAssistant } from "@/components/assistant/assistant-context";

function TabLink({ to, icon: Icon, label }: { to: string; icon: typeof FileText; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex flex-1 flex-col items-center gap-[3px] py-1.5 text-[10px] font-semibold transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "flex h-[30px] w-12 items-center justify-center rounded-full transition-colors",
              isActive && "bg-primary/[0.18]",
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

export function BottomTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { signOut } = useAuth();
  const { setOpen: setAssistantOpen } = useAssistant();
  const [createOpen, setCreateOpen] = useState(false);
  const [pickingProjectForCO, setPickingProjectForCO] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { unread } = useNotifications();

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: listProjects });

  const newQuoteMut = useMutation({
    mutationFn: () => createQuote(),
    onSuccess: (quote) => {
      setCreateOpen(false);
      navigate(`/quotes/${quote.id}`);
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't create quote", description: err.message, variant: "destructive" }),
  });

  // On a project's pages the project is already known — pre-link it and
  // pre-fill from its quote (createProjectInvoice) instead of creating a
  // blank invoice that then asks "which project?".
  const currentProjectId = location.pathname.match(/^\/projects\/([0-9a-f-]{36})(?:\/|$)/)?.[1] ?? null;
  const newInvoiceMut = useMutation({
    mutationFn: () => (currentProjectId ? createProjectInvoice(currentProjectId) : createInvoice()),
    onSuccess: (invoice) => {
      setCreateOpen(false);
      navigate(invoice.project_id ? `/projects/${invoice.project_id}/invoices/${invoice.id}` : `/invoices/${invoice.id}`);
    },
    onError: (err: Error) =>
      toast({ title: "Couldn't create invoice", description: err.message, variant: "destructive" }),
  });

  const go = (to: string, close: () => void) => {
    close();
    navigate(to);
  };

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex transform-gpu items-stretch border-t border-border bg-card/95 px-2 backdrop-blur will-change-transform md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        <TabLink to="/dashboard" icon={LayoutDashboard} label="Home" />
        <TabLink to="/projects" icon={Briefcase} label="Projects" />
        <TabLink to="/quotes" icon={FileText} label="Quotes" />
        <TabLink to="/revenue" icon={TrendingUp} label="Money" />
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-[3px] py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors"
        >
          <span className="relative flex h-[30px] w-12 items-center justify-center rounded-full">
            <MoreHorizontal className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-2 top-0.5 h-2 w-2 rounded-full bg-destructive" aria-label={`${unread} unread notifications`} />}
          </span>
          More
        </button>
      </nav>

      {/* Floating create button, above the tab bar — stacked above AssistantButton
          (also fixed bottom-right on mobile) rather than overlapping it. */}
      <button
        type="button"
        aria-label="Create"
        onClick={() => setCreateOpen(true)}
        className="fixed right-4 z-50 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden bottom-[calc(8.75rem+env(safe-area-inset-bottom))]"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Create action sheet */}
      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setPickingProjectForCO(false);
        }}
      >
        <SheetContent side="bottom" className="rounded-t-card border-border pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div className="mx-auto w-full max-w-sm space-y-2 pt-2">
            {pickingProjectForCO ? (
              <>
                <div className="flex items-center gap-2 pb-1">
                  <button
                    type="button"
                    onClick={() => setPickingProjectForCO(false)}
                    aria-label="Back"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-base font-bold text-foreground">Change order for…</h2>
                </div>
                <Select
                  onValueChange={(projectId) => {
                    setCreateOpen(false);
                    setPickingProjectForCO(false);
                    navigate(`/projects/${projectId}/change-orders`);
                  }}
                >
                  <SelectTrigger className="h-11" aria-label="Choose a project">
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <h2 className="px-1 pb-2 text-base font-bold text-foreground">Create</h2>
                <ActionRow icon={FileText} label="New quote" hint="Blank draft in the builder" disabled={newQuoteMut.isPending} onClick={() => newQuoteMut.mutate()} />
                <ActionRow icon={Receipt} label="New invoice" hint="Blank draft in the builder" disabled={newInvoiceMut.isPending} onClick={() => newInvoiceMut.mutate()} />
                <ActionRow icon={Briefcase} label="New project" hint="Start a job" onClick={() => go("/projects/new", () => setCreateOpen(false))} />
                <ActionRow icon={Users} label="Add client" hint="Create a contact" onClick={() => go("/clients/new", () => setCreateOpen(false))} />
                <ActionRow
                  icon={ClipboardList}
                  label="New change order"
                  hint="Pick a project to attach it to"
                  onClick={() => setPickingProjectForCO(true)}
                />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* More sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-card border-border pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div className="mx-auto w-full max-w-sm space-y-1 pt-2">
            <h2 className="px-1 pb-2 text-base font-bold text-foreground">More</h2>
            <ActionRow
              icon={Bell}
              label={unread > 0 ? `Notifications (${unread} new)` : "Notifications"}
              onClick={() => go("/notifications", () => setMoreOpen(false))}
            />
            <ActionRow icon={Kanban} label="Pipeline" onClick={() => go("/pipeline", () => setMoreOpen(false))} />
            <ActionRow icon={Rows3} label="Opportunities" onClick={() => go("/opportunities", () => setMoreOpen(false))} />
            <ActionRow icon={ListChecks} label="Tasks" onClick={() => go("/tasks", () => setMoreOpen(false))} />
            <ActionRow icon={CalendarClock} label="Appointments" onClick={() => go("/appointments", () => setMoreOpen(false))} />
            <ActionRow icon={MessagesSquare} label="Communications" onClick={() => go("/communications", () => setMoreOpen(false))} />
            <ActionRow icon={Receipt} label="Invoices" onClick={() => go("/invoices", () => setMoreOpen(false))} />
            <ActionRow icon={Clock} label="Timesheets" onClick={() => go("/timesheets", () => setMoreOpen(false))} />
            <ActionRow icon={Activity} label="Business health" onClick={() => go("/business-health", () => setMoreOpen(false))} />
            <ActionRow icon={Users} label="Clients" onClick={() => go("/clients", () => setMoreOpen(false))} />
            <ActionRow icon={SettingsIcon} label="Settings" onClick={() => go("/settings", () => setMoreOpen(false))} />
            <ActionRow
              icon={Sparkles}
              label="Ask AI"
              hint="Ask a question about your business"
              onClick={() => {
                setMoreOpen(false);
                setAssistantOpen(true);
              }}
            />
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
