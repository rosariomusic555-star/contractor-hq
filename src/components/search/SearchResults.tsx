import { type ComponentType } from "react";
import { Briefcase, FileDiff, FileText, History, LayoutGrid, Plus, Receipt, Rows3, Settings, Sparkles, UserPlus, Users } from "lucide-react";
import { CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { StatusPill } from "@/components/common/StatusPill";
import {
  CLIENT_STATUS_META,
  OPPORTUNITY_STAGE_META,
  changeOrderStatusMeta,
  invoiceStatusMeta,
  projectStatusMeta,
  quoteStatusMeta,
  type StatusMeta,
} from "@/lib/statusMeta";
import { SEARCH_GROUPS, highlightParts, type SearchType } from "@/lib/globalSearch";
import { cn } from "@/lib/utils";
import type { SearchModel } from "./use-search-model";

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
 * The global search results list — grouped records (Clients … Change
 * orders), Pages, "See all N", the "No matches / Ask AI" row, and for an
 * empty box Recent (+ quick actions when `onNewOpportunity` is given and the
 * model's idle mode is "full"). Renders a cmdk CommandList, so it goes
 * inside the <Command> that owns the input; state comes from useSearchModel.
 */
export function SearchResults({ model: m, className, onNewOpportunity }: { model: SearchModel; className?: string; onNewOpportunity?: () => void }) {
  return (
    <CommandList className={cn("overscroll-contain pb-2", className)}>
      {m.showRecent && m.recent.length > 0 && (
        <CommandGroup heading="Recent" className={GROUP}>
          {m.recent.map((r) => (
            <CommandItem key={`${r.type}:${r.id}`} value={`recent:${r.type}:${r.id}`} className={ITEM} onSelect={() => m.go(r.href)}>
              <Row icon={TYPE_ICON[r.type] ?? History} title={r.title} subtitle={r.subtitle} q="" />
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {m.showActions && (
        <CommandGroup heading="Quick actions" className={GROUP}>
          <CommandItem
            value="action:opportunity"
            className={ITEM}
            onSelect={() => {
              m.done();
              onNewOpportunity?.();
            }}
          >
            <Row icon={Plus} title="New opportunity" q="" />
          </CommandItem>
          <CommandItem value="action:quote" className={ITEM} disabled={m.newQuote.isPending} onSelect={() => m.newQuote.mutate()}>
            <Row icon={FileText} title={m.newQuote.isPending ? "Creating quote…" : "New quote"} q="" />
          </CommandItem>
          <CommandItem value="action:invoice" className={ITEM} disabled={m.newInvoice.isPending} onSelect={() => m.newInvoice.mutate()}>
            <Row icon={Receipt} title={m.newInvoice.isPending ? "Creating invoice…" : "New invoice"} q="" />
          </CommandItem>
          <CommandItem value="action:client" className={ITEM} onSelect={() => m.go("/clients/new")}>
            <Row icon={UserPlus} title="New client" q="" />
          </CommandItem>
        </CommandGroup>
      )}

      {m.searching && m.loading && SEARCH_GROUPS.slice(0, 3).map((g) => <SkeletonGroup key={g.type} label={g.label} />)}

      {m.searching && m.missing && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Searching records needs a database update (migration 0171). Pages still work.</p>
      )}

      {m.searching &&
        !m.loading &&
        m.grouped.map((g) => (
          <CommandGroup key={g.type} heading={g.label} className={GROUP}>
            {g.rows.map((r) => (
              <CommandItem key={r.id} value={`${r.type}:${r.id}`} className={ITEM} onSelect={() => m.openResult(r)}>
                <Row icon={TYPE_ICON[r.type]} title={r.title} subtitle={r.subtitle} q={m.q} meta={statusMetaFor(r.type, r.status)} />
              </CommandItem>
            ))}
            {g.listPath && g.rows[0].total > g.rows.length && (
              <CommandItem value={`all:${g.type}`} className={cn(ITEM, "py-2 text-sm font-semibold text-muted-foreground")} onSelect={() => m.go(`${g.listPath}?q=${encodeURIComponent(m.q)}`)}>
                <span className="pl-11">
                  See all {g.rows[0].total} {g.label.toLowerCase()} →
                </span>
              </CommandItem>
            )}
          </CommandGroup>
        ))}

      {m.searching && m.pages.length > 0 && (
        <CommandGroup heading="Pages" className={GROUP}>
          {m.pages.map((p) => (
            <CommandItem key={p.to} value={`page:${p.to}`} className={ITEM} onSelect={() => m.go(p.to)}>
              <Row icon={p.section ? Settings : LayoutGrid} title={p.label} subtitle={p.section ?? null} q={m.typed} hint="Page" />
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {m.nothing && (
        <div className="px-1.5">
          <p className="px-3 pb-2 pt-5 text-sm text-muted-foreground">
            No matches for “<span className="font-semibold text-foreground">{m.typed}</span>”
          </p>
          <CommandItem value="ask-ai" className={ITEM} onSelect={m.askAi}>
            <Row icon={Sparkles} title={`Ask AI about “${m.typed}”`} q="" />
          </CommandItem>
        </div>
      )}
    </CommandList>
  );
}
