import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Megaphone, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SpendFormDialog } from "@/components/marketing/SpendDialogs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import {
  listLeadSources,
  createLeadSource,
  updateLeadSource,
  deleteLeadSource,
  getMarketingSettings,
  listLeadSourceSpend,
  saveMarketingSettings,
  type LeadSource,
  type MarketingSettings,
} from "@/lib/api";
import { BackLink } from "@/components/common/BackLink";

/**
 * Real, persisted CRUD list (lead_sources table, 0077) — same shape and
 * save-immediately pattern as Settings > Categories. Backs the "Lead
 * source" dropdown on the opportunity page; opportunities.lead_source
 * stays a plain text column (same denormalized-not-FK shape as
 * Suppliers), so deleting a lead source here never touches existing
 * opportunities — they keep whatever value they were saved with.
 */
export function SettingsLeadSourcesView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: leadSources = [], isLoading } = useQuery({
    queryKey: ["lead-sources"],
    queryFn: listLeadSources,
  });

  const { data: spend = [] } = useQuery({ queryKey: ["lead-source-spend"], queryFn: listLeadSourceSpend });
  const [spendFor, setSpendFor] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lead-sources"] });
    // A rename carries its spend along (0128 trigger).
    qc.invalidateQueries({ queryKey: ["lead-source-spend"] });
  };
  const onError = (err: Error) => toast({ title: err.message, variant: "destructive" });

  const createMut = useMutation({
    mutationFn: (name: string) => createLeadSource({ name, sort_order: leadSources.length }),
    onSuccess: invalidate,
    onError,
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateLeadSource(id, { name }),
    onSuccess: invalidate,
    onError,
  });

  const paidMut = useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) => updateLeadSource(id, { paid }),
    onSuccess: invalidate,
    onError,
  });

  const reorderMut = useMutation({
    mutationFn: (updates: { id: string; sort_order: number }[]) =>
      Promise.all(updates.map((u) => updateLeadSource(u.id, { sort_order: u.sort_order }))),
    onSuccess: invalidate,
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteLeadSource(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Lead source deleted" });
    },
    onError,
  });

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= leadSources.length) return;
    const a = leadSources[index];
    const b = leadSources[target];
    reorderMut.mutate([
      { id: a.id, sort_order: b.sort_order },
      { id: b.id, sort_order: a.sort_order },
    ]);
  };

  const addLeadSource = () => {
    if (createMut.isPending) return;
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    createMut.mutate(name);
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Lead sources" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <BackLink
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >Settings</BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Lead sources</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Megaphone className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Where your leads come from</span>
        </div>

        <div className="bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Powers the "Lead source" dropdown on a pipeline lead and the "By source" pipeline
            report. Deleting one here never changes an existing lead — it keeps whatever it was
            saved with. Mark a source Paid to track its monthly ad spend and ROI; free ones
            (referrals, walk-ins, past clients) show "—" for spend.
          </p>

          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : leadSources.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No lead sources yet — add one below.</p>
          ) : (
            <div className="mt-4 divide-y divide-hairline">
              {leadSources.map((s, i) => (
                <LeadSourceRow
                  key={s.id}
                  leadSource={s}
                  isFirst={i === 0}
                  isLast={i === leadSources.length - 1}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onRename={(name) => renameMut.mutate({ id: s.id, name })}
                  onPaid={(paid) => paidMut.mutate({ id: s.id, paid })}
                  onSpend={() => setSpendFor(s.name)}
                  onDelete={() => deleteMut.mutate(s.id)}
                />
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLeadSource()}
              placeholder="New lead source"
              className="h-11"
            />
            <Button
              onClick={addLeadSource}
              disabled={!newName.trim() || createMut.isPending}
              className="h-11 shrink-0 rounded-xl font-bold"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </div>

      <RoiThresholds />

      <SpendFormDialog
        open={!!spendFor}
        onOpenChange={(o) => !o && setSpendFor(null)}
        sources={spendFor ? [spendFor] : []}
        fixedSource={spendFor}
        spend={spend}
      />
    </div>
  );
}

/** ROAS / profit-per-dollar colours on Pipeline › By source (0128). */
function RoiThresholds() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["marketing-settings"], queryFn: getMarketingSettings });
  const [draft, setDraft] = useState<Record<keyof MarketingSettings, string> | null>(null);
  useEffect(() => {
    if (data) setDraft({ roas_good: String(data.roas_good), roas_min: String(data.roas_min), profit_good: String(data.profit_good), profit_min: String(data.profit_min) });
  }, [data]);
  const save = useMutation({
    mutationFn: saveMarketingSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-settings"] });
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  if (!draft || !data) return null;
  const parsed: MarketingSettings = {
    roas_good: Number(draft.roas_good),
    roas_min: Number(draft.roas_min),
    profit_good: Number(draft.profit_good),
    profit_min: Number(draft.profit_min),
  };
  const valid =
    Object.values(parsed).every((v) => isFinite(v) && v >= 0) && parsed.roas_good > parsed.roas_min && parsed.profit_good > parsed.profit_min;
  const dirty = JSON.stringify(parsed) !== JSON.stringify(data);
  const field = (k: keyof MarketingSettings, label: string, suffix: string) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <Input inputMode="decimal" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="h-9 w-20 text-right" />
        <span className="w-4 text-xs text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
  return (
    <section className="card-surface space-y-3 p-5">
      <h2 className="text-[17px] font-bold tracking-tight text-foreground">ROI colours</h2>
      <p className="text-xs text-muted-foreground">
        On Pipeline › By source: green at or above “strong”, amber down to “weak”, red below it. Profit per $1 under $1 means the ads cost more than the profit they brought in.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {field("roas_good", "ROAS strong at", "×")}
        {field("roas_min", "ROAS weak at", "×")}
        {field("profit_good", "Profit per $1 strong at", "$")}
        {field("profit_min", "Profit per $1 weak at", "$")}
      </div>
      {!valid && <p className="text-xs text-destructive">“Strong” has to be higher than “weak”.</p>}
      <div className="flex justify-end">
        <Button disabled={!valid || !dirty || save.isPending} onClick={() => save.mutate(parsed)}>
          Save
        </Button>
      </div>
    </section>
  );
}

function LeadSourceRow({
  leadSource,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRename,
  onPaid,
  onSpend,
  onDelete,
}: {
  leadSource: LeadSource;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (name: string) => void;
  onPaid: (paid: boolean) => void;
  onSpend: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(leadSource.name);

  return (
    <div className="flex items-center gap-2 py-2.5">
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="Move up"
          className="text-muted-subtle transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Move down"
          className="text-muted-subtle transition-colors hover:text-foreground disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== leadSource.name) onRename(trimmed);
          else setName(leadSource.name);
        }}
        className="h-10 min-w-0 flex-1 border-transparent bg-transparent px-2 font-semibold hover:border-input hover:bg-muted focus-visible:border-primary focus-visible:bg-background"
      />

      {(leadSource.paid ?? true) && (
        <button type="button" onClick={onSpend} className="shrink-0 text-xs font-semibold text-primary hover:text-primary/80">
          Monthly spend
        </button>
      )}
      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Switch checked={leadSource.paid ?? true} onCheckedChange={onPaid} aria-label={`${leadSource.name} is paid`} />
        Paid
      </label>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-muted-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${leadSource.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{leadSource.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing leads keep this value — deleting it here only removes it from the dropdown
              for future leads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
