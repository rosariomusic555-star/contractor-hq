import { ChevronRight, FileText, Receipt, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { createQuote } from "@/lib/api";

export function QuickActions() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Blank draft — no client, no project, default deposit — straight into
  // the quote builder, which is where all quote configuration now happens.
  const newQuoteMut = useMutation({
    mutationFn: () => createQuote(),
    onSuccess: (quote) => navigate(`/quotes/${quote.id}`),
    onError: (err: Error) =>
      toast({ title: "Couldn't create quote", description: err.message, variant: "destructive" }),
  });

  const actions = [
    {
      key: "quote",
      label: "New Quote",
      hint: "Start a blank draft",
      icon: FileText,
      primary: true,
      disabled: newQuoteMut.isPending,
      onClick: () => newQuoteMut.mutate(),
    },
    {
      key: "invoice",
      label: "New Invoice",
      hint: "Bill a project",
      icon: Receipt,
      primary: false,
      disabled: false,
      onClick: () => navigate("/invoices/new"),
    },
    {
      key: "client",
      label: "Add Client",
      hint: "Create a contact",
      icon: UserPlus,
      primary: false,
      disabled: false,
      onClick: () => navigate("/clients?new=1"),
    },
  ];

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_3px_0_hsl(215_25%_15%/0.06)]">
      <h3 className="mb-4 text-base font-semibold text-foreground">Quick Actions</h3>
      <div className="space-y-2">
        {actions.map(({ key, label, hint, icon: Icon, primary, disabled, onClick }) => (
          <button
            key={key}
            onClick={onClick}
            disabled={disabled}
            className={cn(
              "group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60",
              primary
                ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md"
                : "border-border/70 bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                primary ? "bg-primary-foreground/15" : "bg-muted text-[#687B85] group-hover:bg-primary/15 group-hover:text-primary",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{label}</span>
              <span
                className={cn(
                  "block text-xs",
                  primary ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {hint}
              </span>
            </span>
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5",
                primary ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
