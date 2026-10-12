import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useAssistant } from "@/components/assistant/assistant-context";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { createInvoice, createQuote, globalSearch } from "@/lib/api";
import { MIN_QUERY, SEARCH_GROUPS, matchPages, pushRecent, readRecent, resultHref, type RecentItem, type SearchResult } from "@/lib/globalSearch";

/** What an empty box shows: nothing, the Recent list, or Recent + quick actions. */
export type SearchIdle = "none" | "recent" | "full";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Everything behind a search box's results (the sidebar dropdown, the phone
 * search page, the old dialog): the debounced global_search() query, local
 * page matches, Recent, the highlighted row (for cmdk's controlled `value`)
 * and what picking a row does. `onDone` runs before navigating — clear /
 * close the box there.
 */
export function useSearchModel({ input, active, idle, onDone }: { input: string; active: boolean; idle: SearchIdle; onDone: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session } = useAuth();
  const uid = session?.user.id ?? "anon";
  const { setOpen: setAssistantOpen, setDraft } = useAssistant();
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const typed = input.trim();
  const q = useDebounced(typed, 200);
  const searching = typed.length >= MIN_QUERY;

  useEffect(() => {
    if (active) setRecent(readRecent(uid));
  }, [active, uid]);

  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => globalSearch(q),
    enabled: active && q.length >= MIN_QUERY,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const missing = data === "missing";
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const pages = useMemo(() => matchPages(typed), [typed]);
  const grouped = useMemo(
    () => SEARCH_GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.type === g.type) })).filter((g) => g.rows.length > 0),
    [rows],
  );
  // First load for this text (no earlier results to keep showing): skeletons.
  const loading = searching && !missing && (q.length < MIN_QUERY || data === undefined || (isFetching && isPlaceholderData && rows.length === 0));
  const settled = searching && q === typed && !isFetching && !isPlaceholderData;
  const nothing = settled && grouped.length === 0 && pages.length === 0;
  const showRecent = !searching && idle !== "none";
  const showActions = !searching && idle === "full";

  // Which row is highlighted. cmdk doesn't re-pick when rows arrive after
  // typing stops (pages show instantly, records a moment later), so go back
  // to the first row whenever the list changes.
  const itemValues = useMemo(() => {
    if (!searching) {
      const v = showRecent ? recent.map((r) => `recent:${r.type}:${r.id}`) : [];
      if (showActions) v.push("action:opportunity", "action:quote", "action:invoice", "action:client");
      return v;
    }
    const v: string[] = [];
    if (!loading)
      for (const g of grouped) {
        v.push(...g.rows.map((r) => `${r.type}:${r.id}`));
        if (g.listPath && g.rows[0].total > g.rows.length) v.push(`all:${g.type}`);
      }
    v.push(...pages.map((p) => `page:${p.to}`));
    if (nothing) v.push("ask-ai");
    return v;
  }, [searching, showRecent, showActions, recent, loading, grouped, pages, nothing]);
  const [selected, setSelected] = useState("");
  const listKey = itemValues.join("|");
  useEffect(() => {
    setSelected(itemValues[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  const go = (href: string) => {
    onDone();
    navigate(href);
  };
  const openResult = (r: SearchResult) => {
    const href = resultHref(r);
    setRecent(pushRecent(uid, { type: r.type, id: r.id, title: r.title, subtitle: r.subtitle, href }));
    go(href);
  };
  const askAi = () => {
    onDone();
    setDraft(typed);
    setAssistantOpen(true);
  };

  const onError = (title: string) => (err: Error) => toast({ title, description: err.message, variant: "destructive" });
  const newQuote = useMutation({ mutationFn: () => createQuote(), onSuccess: (x) => go(`/quotes/${x.id}`), onError: onError("Couldn't create quote") });
  const newInvoice = useMutation({ mutationFn: () => createInvoice(), onSuccess: (x) => go(`/invoices/${x.id}`), onError: onError("Couldn't create invoice") });

  return {
    q,
    typed,
    searching,
    loading,
    missing,
    grouped,
    pages,
    nothing,
    recent,
    showRecent,
    showActions,
    itemValues,
    /** Anything to show in the results list right now. */
    hasContent: itemValues.length > 0 || loading || (searching && missing),
    selected,
    setSelected,
    /** Close / clear the box (what onDone does), without navigating. */
    done: onDone,
    go,
    openResult,
    askAi,
    newQuote,
    newInvoice,
  };
}

export type SearchModel = ReturnType<typeof useSearchModel>;
