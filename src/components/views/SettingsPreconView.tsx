import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import {
  getPreconSettings,
  listPreconTemplate,
  removePreconTemplateItem,
  savePreconSettings,
  savePreconTemplateItem,
  type PreconSettings,
  type PreconTemplateItem,
} from "@/lib/api";
import { AUTO_KINDS } from "@/lib/precon";

/**
 * Settings › Pre-construction checklist (0124) — the template every new job
 * starts from (add, rename, reorder, required/optional, remove), the
 * reminder lead time, and the state's 811 rules (working days).
 */
export function SettingsPreconView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: items = [] } = useQuery({ queryKey: ["precon-template"], queryFn: listPreconTemplate });
  const { data: settings } = useQuery({ queryKey: ["precon-settings"], queryFn: getPreconSettings });
  const [draft, setDraft] = useState<PreconSettings | null>(null);
  const [newLabel, setNewLabel] = useState("");
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["precon-template"] });
    qc.invalidateQueries({ queryKey: ["precon"] });
  };
  const onError = (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
  const saveItem = useMutation({ mutationFn: savePreconTemplateItem, onSuccess: refresh, onError });
  const removeItem = useMutation({ mutationFn: removePreconTemplateItem, onSuccess: refresh, onError });
  const saveSettings = useMutation({
    mutationFn: (s: PreconSettings) => savePreconSettings(s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["precon-settings"] });
      qc.invalidateQueries({ queryKey: ["precon"] });
      toast({ title: "Saved" });
    },
    onError,
  });

  const active = items.filter((i) => i.active).sort((a, b) => a.sort_order - b.sort_order);
  const inactive = items.filter((i) => !i.active);
  const move = async (i: number, dir: -1 | 1) => {
    const a = active[i];
    const b = active[i + dir];
    if (!a || !b) return;
    await savePreconTemplateItem({ id: a.id, label: a.label, sort_order: b.sort_order });
    await savePreconTemplateItem({ id: b.id, label: b.label, sort_order: a.sort_order });
    refresh();
  };
  const valid = !!draft && [draft.warn_days, draft.locate_wait_days, draft.locate_valid_days].every((v) => Number.isInteger(v) && v >= 0) && draft.warn_days >= 1 && draft.locate_valid_days >= 1;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5 pb-20">
      <MobilePageHeader title="Pre-construction" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Pre-construction checklist</h1>
      </div>

      <section className="card-surface p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Checklist</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every won job starts with these. Items marked “auto” check themselves off from the app; you can still override them on a job.
          Changes here apply to new jobs — a job that already has its checklist keeps its own list (edit it from the job's
          Pre-construction card).
        </p>
        <ul className="mt-3 divide-y divide-hairline">
          {active.map((it, i) => (
            <TemplateRow
              key={it.id}
              item={it}
              first={i === 0}
              last={i === active.length - 1}
              onMove={(d) => void move(i, d)}
              onSave={(patch) => saveItem.mutate({ id: it.id, label: patch.label ?? it.label, ...patch })}
              onRemove={() => removeItem.mutate(it)}
            />
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Add an item, e.g. Dumpster ordered" className="h-10" />
          <Button
            className="h-10"
            disabled={!newLabel.trim() || saveItem.isPending}
            onClick={() => {
              saveItem.mutate({ label: newLabel, required: true, sort_order: (active[active.length - 1]?.sort_order ?? 0) + 10 });
              setNewLabel("");
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        {inactive.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground">Turned off</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {inactive.map((it) => (
                <Button key={it.id} size="sm" variant="outline" className="h-8 text-xs" onClick={() => saveItem.mutate({ id: it.id, label: it.label, active: true })}>
                  <Plus className="mr-1 h-3 w-3" /> {it.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      {draft && (
        <section className="card-surface space-y-4 p-5 md:p-6">
          <h2 className="text-[17px] font-bold tracking-tight text-foreground">Reminders & 811</h2>
          <NumberField
            label="Remind me this many days before the start"
            value={draft.warn_days}
            onChange={(v) => setDraft({ ...draft, warn_days: v })}
            hint="Required items still open then show in Needs you, as a notification, and as Blocked."
          />
          <NumberField
            label="811: working days to wait before digging"
            value={draft.locate_wait_days}
            onChange={(v) => setDraft({ ...draft, locate_wait_days: v })}
          />
          <NumberField
            label="811: working days a ticket stays valid"
            value={draft.locate_valid_days}
            onChange={(v) => setDraft({ ...draft, locate_valid_days: v })}
            hint="This varies by state — check your state's 811 center rules and set it to match."
          />
          <div className="flex justify-end">
            <Button disabled={!valid || saveSettings.isPending || JSON.stringify(draft) === JSON.stringify(settings)} onClick={() => saveSettings.mutate(draft)}>
              Save
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function NumberField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block max-w-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Input inputMode="numeric" value={String(value)} onChange={(e) => onChange(Math.floor(Number(e.target.value) || 0))} className="mt-1 h-10 w-28" />
      {hint && <span className="mt-1 block text-[11px] text-muted-subtle">{hint}</span>}
    </label>
  );
}

function TemplateRow({
  item,
  first,
  last,
  onMove,
  onSave,
  onRemove,
}: {
  item: PreconTemplateItem;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onSave: (patch: Partial<PreconTemplateItem>) => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  useEffect(() => setLabel(item.label), [item.label]);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <div className="flex flex-col">
        <button type="button" disabled={first} onClick={() => onMove(-1)} className="text-muted-foreground disabled:opacity-30" aria-label="Move up">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={last} onClick={() => onMove(1)} className="text-muted-foreground disabled:opacity-30" aria-label="Move down">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== item.label && onSave({ label: label.trim() })}
        className="h-9 min-w-0 flex-1"
      />
      {AUTO_KINDS.has(item.kind) && <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-bold text-info">auto</span>}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch checked={item.required} onCheckedChange={(v) => onSave({ required: v })} />
        Required
      </label>
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${item.label}`}>
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
