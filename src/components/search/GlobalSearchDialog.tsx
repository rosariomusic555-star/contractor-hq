import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CornerDownLeft,
  FileDiff,
  FileText,
  History,
  LayoutGrid,
  Plus,
  Receipt,
  Rows3,
  Settings,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/common/StatusPill";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";
import { useAssistant } from "@/components/assistant/assistant-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { createInvoice, createQuote, globalSearch } from "@/lib/api";
import {
  CLIENT_STATUS_META,
  OPPORTUNITY_STAGE_META,
  changeOrderStatusMeta,
  invoiceStatusMeta,
  projectStatusMeta,
  quoteStatusMeta,
  type StatusMeta,
} from "@/lib/statusMeta";
import {
  MIN_QUERY,
  SEARCH_GROUPS,
  highlightParts,
  matchPages,
  pushRecent,
  readRecent,
  resultHref,
  type RecentItem,
  type SearchResult,
  type SearchType,
} from "@/lib/globalSearch";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<SearchType, ComponentType<{ className?: string }>> = {
  client: Users,
  project: Briefcase,
  opportunity: Rows3,
  quote: FileText,
  invoice: Receipt,
  change_order: FileDiff,
};

function statusMetaFor(type: SearchType, status: string | null): StatusMeta | null {
  if (!status) return null;
  switch (type) {
    case "client":
      return CLIENT_STATUS_META[status as keyof typeof CLIENT_STATUS_META] ?? null;
    case "project":
      return projectStatusMeta(status);
    case "opportunity":
      return OPPORTUNITY_STAGE_META[status as keyof typeof OPPORTUNITY_STAGE_META] ?? null;
    case "quote":
      return quoteStatusMeta(status);
    case "invoice":
      return invoiceStatusMeta(status);
    case "change_order":
      return changeOrderStatusMeta(status);
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The matched part of the text, highlighted. */
function Marked({ text, q }: { text: string; q: string }) {
  return (
    <>
      {highlightParts(text, q).map((p, n) =>
        p.match ? (
          <mark key={n} className="rounded-sm bg-primary/30 px-px text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={n}>{p.text}</span>
        ),
      )}
    </>
  );
}

// Selected row: the light brand green, dark slate text (no new colors).
const ITEM = "gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-primary/[0.18] data-[selected=true]:text-foreground";
const GROUP =
  "px-1.5 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-sidebar";

function Row({ icon: Icon, title, subtitle, q, meta, hint }: { icon: ComponentType<{ className?: string }>; title: string; subtitle?: string | null; q: string; meta?: StatusMeta | null; hint?: string }) {
  return (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-foreground">
          <Marked text={title} q={q} />
        </span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">
            <Marked text={subtitle} q={q} />
          </span>
        )}
      </span>
      {meta && <StatusPill meta={meta} className="shrink-0" />}
      {hint && <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>}
    </>
  );
}

function SkeletonGroup({ label }: { label: string }) {
  return (
    <div className="px-1.5" aria-hidden>
      <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-sidebar">{label}</p>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
        <span className="flex-1 space-y-1.5">
          <span className="block h-3.5 w-2/5 animate-pulse rounded bg-muted" />
          <span className="block h-3 w-3/5 animate-pulse rounded bg-muted" />
        </span>
      </div>
    </div>
  );
}

/**
 * Global search — clients, projects, opportunities, quotes, invoices, change
 * orders and pages, from anywhere (sidebar box, ⌘K / Ctrl+K, "/", or the
 * phone header's search button). Records come from global_search() (0171)
 * in one round trip; pages are matched locally.
 */
function GlobalSearchDialogInner({ open, onOpenChange, onNewOpportunity }: { open: boolean; onOpenChange: (open: boolean) => void; onNewOpportunity: () => void }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { session } = useAuth();
  const uid = session?.user.id ?? "anon";
  const { setOpen: setAssistantOpen, setDraft } = useAssistant();
  const [input, setInput] = useState("");
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const q = useDebounced(input.trim(), 200);
  const searching = q.length >= MIN_QUERY;

  useEffect(() => {
    if (open) setRecent(readRecent(uid));
    else setInput("");
  }, [open, uid]);

  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => globalSearch(q),
    enabled: open && searching,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const missing = data === "missing";
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const pages = useMemo(() => matchPages(q), [q]);
  const grouped = SEARCH_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.type === g.type) })).filter((g) => g.rows.length > 0);
  // First load for this text (no earlier results to keep showing): skeletons.
  const loading = searching && isFetching && !missing && (data === undefined || (isPlaceholderData && rows.length === 0));
  const settled = searching && !isFetching && !isPlaceholderData;
  const nothing = settled && grouped.length === 0 && pages.length === 0;

  // Which row is highlighted. cmdk doesn't re-pick when rows arrive after
  // typing stops, so keep it on a row that exists (the first, by default).
  const itemValues = useMemo(() => {
    if (!searching) return [...recent.map((r) => `recent:${r.type}:${r.id}`), "action:opportunity", "action:quote", "action:invoice", "action:client"];
    const v: string[] = [];
    if (!loading)
      for (const g of grouped) {
        v.push(...g.rows.map((r) => `${r.type}:${r.id}`));
        if (g.listPath && g.rows[0].total > g.rows.length) v.push(`all:${g.type}`);
      }
    v.push(...pages.map((p) => `page:${p.to}`));
    if (nothing) v.push("ask-ai");
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, recent, loading, rows, pages, nothing]);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!itemValues.includes(selected)) setSelected(itemValues[0] ?? "");
  }, [itemValues, selected]);

  const close = () => onOpenChange(false);
  const go = (href: string) => {
    close();
    navigate(href);
  };
  const openResult = (r: SearchResult) => {
    const href = resultHref(r);
    setRecent(pushRecent(uid, { type: r.type, id: r.id, title: r.title, subtitle: r.subtitle, href }));
    go(href);
  };

  const onError = (title: string) => (err: Error) => toast({ title, description: err.message, variant: "destructive" });
  const newQuote = useMutation({ mutationFn: () => createQuote(), onSuccess: (x) => go(`/quotes/${x.id}`), onError: onError("Couldn't create quote") });
  const newInvoice = useMutation({ mutationFn: () => createInvoice(), onSuccess: (x) => go(`/invoices/${x.id}`), onError: onError("Couldn't create invoice") });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "gap-0 overflow-hidden p-0",
          isMobile
            ? "left-0 top-0 h-[100dvh] max-w-none translate-x-0 translate-y-0 rounded-none border-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0"
            : "top-[15vh] max-w-[640px] translate-y-0 rounded-card data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0",
        )}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Find clients, projects, opportunities, quotes, invoices, change orders and pages.</DialogDescription>
        <Command shouldFilter={false} loop value={selected} onValueChange={setSelected} className="rounded-none bg-card">
          <CommandInput
            value={input}
            onValueChange={setInput}
            autoFocus
            placeholder={isMobile ? "Search…" : "Search clients, projects, quotes, invoices…"}
            className="h-14 pr-8 text-base"
          />
          <CommandList className={cn("overscroll-contain pb-2", isMobile ? "max-h-none flex-1" : "max-h-[min(60vh,520px)]")}>
            {!searching && (
              <>
                {recent.length > 0 && (
                  <CommandGroup heading="Recent" className={GROUP}>
                    {recent.map((r) => (
                      <CommandItem key={`${r.type}:${r.id}`} value={`recent:${r.type}:${r.id}`} className={ITEM} onSelect={() => go(r.href)}>
                        <Row icon={TYPE_ICON[r.type] ?? History} title={r.title} subtitle={r.subtitle} q="" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandGroup heading="Quick actions" className={GROUP}>
                  <CommandItem value="action:opportunity" className={ITEM} onSelect={() => { close(); onNewOpportunity(); }}>
                    <Row icon={Plus} title="New opportunity" q="" />
                  </CommandItem>
                  <CommandItem value="action:quote" className={ITEM} disabled={newQuote.isPending} onSelect={() => newQuote.mutate()}>
                    <Row icon={FileText} title={newQuote.isPending ? "Creating quote…" : "New quote"} q="" />
                  </CommandItem>
                  <CommandItem value="action:invoice" className={ITEM} disabled={newInvoice.isPending} onSelect={() => newInvoice.mutate()}>
                    <Row icon={Receipt} title={newInvoice.isPending ? "Creating invoice…" : "New invoice"} q="" />
                  </CommandItem>
                  <CommandItem value="action:client" className={ITEM} onSelect={() => go("/clients/new")}>
                    <Row icon={UserPlus} title="New client" q="" />
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {searching && loading && SEARCH_GROUPS.slice(0, 3).map((g) => <SkeletonGroup key={g.type} label={g.label} />)}

            {searching && missing && (
              <p className="px-4 py-3 text-sm text-muted-foreground">Searching records needs a database update (migration 0171). Pages still work.</p>
            )}

            {searching &&
              !loading &&
              grouped.map((g) => (
                <CommandGroup key={g.type} heading={g.label} className={GROUP}>
                  {g.rows.map((r) => (
                    <CommandItem key={r.id} value={`${r.type}:${r.id}`} className={ITEM} onSelect={() => openResult(r)}>
                      <Row icon={TYPE_ICON[r.type]} title={r.title} subtitle={r.subtitle} q={q} meta={statusMetaFor(r.type, r.status)} />
                    </CommandItem>
                  ))}
                  {g.listPath && g.rows[0].total > g.rows.length && (
                    <CommandItem value={`all:${g.type}`} className={cn(ITEM, "py-2 text-sm font-semibold text-muted-foreground")} onSelect={() => go(`${g.listPath}?q=${encodeURIComponent(q)}`)}>
                      <span className="pl-11">See all {g.rows[0].total} {g.label.toLowerCase()} →</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              ))}

            {searching && pages.length > 0 && (
              <CommandGroup heading="Pages" className={GROUP}>
                {pages.map((p) => (
                  <CommandItem key={p.to} value={`page:${p.to}`} className={ITEM} onSelect={() => go(p.to)}>
                    <Row icon={p.section ? Settings : LayoutGrid} title={p.label} subtitle={p.section ?? null} q={q} hint="Page" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {nothing && (
              <div className="px-1.5">
                <p className="px-3 pb-2 pt-5 text-sm text-muted-foreground">
                  No matches for “<span className="font-semibold text-foreground">{q}</span>”
                </p>
                <CommandItem
                  value="ask-ai"
                  className={ITEM}
                  onSelect={() => {
                    close();
                    setDraft(q);
                    setAssistantOpen(true);
                  }}
                >
                  <Row icon={Sparkles} title={`Ask AI about “${q}”`} q="" />
                </CommandItem>
              </div>
            )}
          </CommandList>
          {!isMobile && (
            <div className="flex items-center gap-4 border-t border-hairline px-4 py-2 text-[11px] text-muted-foreground">
              <span>↑↓ to move</span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" aria-hidden /> to open
              </span>
              <span>Esc to close</span>
            </div>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export const GlobalSearchDialog = withErrorBoundary(GlobalSearchDialogInner, "GlobalSearchDialog");
