import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import {
  createMaintenanceItems,
  deleteMaintenanceTemplate,
  listCategories,
  listMaintenanceItems,
  listMaintenanceTemplates,
  listProjectFeatures,
  listProjects,
  saveMaintenanceSettings,
  saveMaintenanceTemplate,
  type MaintenanceSettings,
  type MaintenanceTemplate,
} from "@/lib/api";
import { BUILD_TYPES } from "@/lib/buildTypes";
import { activeFeatures, featureBuildType, featureName } from "@/lib/features";
import { MONTHS, intervalLabel, proposeItems, rollForward, warrantyEnd } from "@/lib/maintenance";
import { isoDate } from "@/lib/weatherRisk";
import { useMaintenanceSettings } from "@/components/maintenance/useMaintenance";

/**
 * Settings › Maintenance (0127) — what each feature type needs and how
 * often (editable suggestions, client-friendly descriptions, "remind in
 * <month>"), warranty years per type, how far ahead to remind, and a
 * one-time setup for jobs completed before this existed.
 */
export function SettingsMaintenanceView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: templates = [] } = useQuery({ queryKey: ["maintenance-templates"], queryFn: listMaintenanceTemplates });
  const { data: settings } = useMaintenanceSettings();
  const [draft, setDraft] = useState<MaintenanceSettings | null>(null);
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const onError = (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["maintenance-templates"] });
  const saveT = useMutation({ mutationFn: saveMaintenanceTemplate, onSuccess: refresh, onError });
  const delT = useMutation({ mutationFn: deleteMaintenanceTemplate, onSuccess: refresh, onError });
  const saveS = useMutation({
    mutationFn: (s: MaintenanceSettings) => saveMaintenanceSettings(s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance-settings"] });
      toast({ title: "Saved" });
    },
    onError,
  });

  const typesWithTemplates = BUILD_TYPES.filter((b) => templates.some((t) => t.build_type === b.id));
  const otherTypes = BUILD_TYPES.filter((b) => !typesWithTemplates.includes(b));
  const [addType, setAddType] = useState("");

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5 pb-20">
      <MobilePageHeader title="Maintenance" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Maintenance reminders</h1>
      </div>

      {typesWithTemplates.map((b) => (
        <section key={b.id} className="card-surface p-5 md:p-6">
          <h2 className="text-[17px] font-bold tracking-tight text-foreground">{b.label}</h2>
          <ul className="mt-2 divide-y divide-hairline">
            {templates
              .filter((t) => t.build_type === b.id)
              .map((t) => (
                <TemplateRow key={t.id} t={t} onSave={(patch) => saveT.mutate({ ...t, ...patch })} onDelete={() => delT.mutate(t.id)} />
              ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-9"
            onClick={() => saveT.mutate({ build_type: b.id, label: "New item", interval_months: 12, sort_order: 100 + templates.length })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add item
          </Button>
        </section>
      ))}

      {otherTypes.length > 0 && (
        <section className="card-surface flex flex-wrap items-center gap-2 p-5 md:p-6">
          <span className="text-sm text-muted-foreground">Add maintenance for another type:</span>
          <Select value={addType} onValueChange={setAddType}>
            <SelectTrigger className="h-10 w-48">
              <SelectValue placeholder="Pick a type" />
            </SelectTrigger>
            <SelectContent>
              {otherTypes.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="h-10"
            disabled={!addType}
            onClick={() => {
              saveT.mutate({ build_type: addType, label: "Inspect & clean", interval_months: 12, sort_order: 10 });
              setAddType("");
            }}
          >
            Add
          </Button>
        </section>
      )}

      {draft && (
        <section className="card-surface space-y-4 p-5 md:p-6">
          <h2 className="text-[17px] font-bold tracking-tight text-foreground">Reminders & warranty</h2>
          <label className="block max-w-sm">
            <span className="text-xs font-semibold text-muted-foreground">Remind me this many days before it's due</span>
            <Input
              inputMode="numeric"
              value={String(draft.lead_days)}
              onChange={(e) => setDraft({ ...draft, lead_days: Math.floor(Number(e.target.value) || 0) })}
              className="mt-1 h-10 w-28"
            />
            <span className="mt-1 block text-[11px] text-muted-subtle">Shows in Needs you, as a task and a notification, and runs “Maintenance due soon” automations.</span>
          </label>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Warranty (years) — optional, shown to the client in the Client Hub</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {BUILD_TYPES.map((b) => (
                <label key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2 text-sm">
                  {b.label}
                  <Input
                    inputMode="decimal"
                    value={draft.warranties?.[b.id] != null ? String(draft.warranties[b.id]) : ""}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const w = { ...(draft.warranties ?? {}) };
                      if (!v || !(Number(v) > 0)) delete w[b.id];
                      else w[b.id] = Number(v);
                      setDraft({ ...draft, warranties: w });
                    }}
                    className="h-9 w-20 text-right"
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={draft.lead_days < 1 || draft.lead_days > 180 || saveS.isPending || JSON.stringify(draft) === JSON.stringify(settings)}
              onClick={() => saveS.mutate(draft)}
            >
              Save
            </Button>
          </div>
        </section>
      )}

      <BulkSetup templates={templates} settings={settings ?? null} />
    </div>
  );
}

function TemplateRow({ t, onSave, onDelete }: { t: MaintenanceTemplate; onSave: (p: Partial<MaintenanceTemplate>) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(t.label);
  const [desc, setDesc] = useState(t.description ?? "");
  const [min, setMin] = useState(t.interval_months ? String(t.interval_months) : "");
  const [max, setMax] = useState(t.interval_months_max ? String(t.interval_months_max) : "");
  useEffect(() => {
    setLabel(t.label);
    setDesc(t.description ?? "");
    setMin(t.interval_months ? String(t.interval_months) : "");
    setMax(t.interval_months_max ? String(t.interval_months_max) : "");
  }, [t]);
  const num = (v: string) => (Number(v) >= 1 && Number(v) <= 240 ? Math.floor(Number(v)) : null);

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label.trim() && label !== t.label && onSave({ label: label.trim() })} className="h-9 flex-1 font-semibold" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={t.active} onCheckedChange={(v) => onSave({ active: v })} />
          On
        </label>
        <button type="button" onClick={onDelete} className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${t.label}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <Textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => desc !== (t.description ?? "") && onSave({ description: desc.trim() || null })}
        rows={2}
        placeholder="What the client sees — why it matters, in plain words"
        className="text-sm"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <Switch checked={t.as_needed} onCheckedChange={(v) => onSave({ as_needed: v })} />
          As needed
        </label>
        {!t.as_needed && (
          <>
            <span>Every</span>
            <Input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} onBlur={() => num(min) && num(min) !== t.interval_months && onSave({ interval_months: num(min) })} className="h-9 w-16" />
            <span>to</span>
            <Input
              inputMode="numeric"
              value={max}
              placeholder="—"
              onChange={(e) => setMax(e.target.value)}
              onBlur={() => num(max) !== t.interval_months_max && onSave({ interval_months_max: num(max) })}
              className="h-9 w-16"
            />
            <span>months · remind in</span>
            <Select value={t.remind_month ? String(t.remind_month) : "any"} onValueChange={(v) => onSave({ remind_month: v === "any" ? null : Number(v) })}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any month</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <span className="basis-full text-[11px] text-muted-subtle">{intervalLabel(t)}{t.remind_month && !t.as_needed ? `, in ${MONTHS[t.remind_month - 1]}` : ""}</span>
      </div>
    </li>
  );
}

/** One-time: reminders for jobs completed before this feature existed. */
function BulkSetup({ templates, settings }: { templates: MaintenanceTemplate[]; settings: MaintenanceSettings | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const { data: items = [] } = useQuery({ queryKey: ["maintenance-items", "all"], queryFn: () => listMaintenanceItems() });
  const withItems = new Set(items.map((i) => i.project_id));
  const candidates = projects.filter((p) => p.status === "complete" && p.client_id && !p.maintenance_dismissed && !withItems.has(p.id));

  const run = useMutation({
    mutationFn: async () => {
      const categories = await listCategories();
      const today = isoDate(new Date());
      let n = 0;
      for (const p of candidates) {
        const completedOn = (p.completed_at ?? p.actual_end_date ?? p.updated_at).slice(0, 10);
        const feats = activeFeatures(await listProjectFeatures(p.id));
        const proposed = proposeItems(
          feats.map((f) => ({ id: f.id, label: featureName(f, categories), category: categories.find((c) => c.id === f.category_id)?.name ?? null })),
          templates,
          completedOn,
        );
        if (!proposed.length) continue;
        await createMaintenanceItems(
          p.id,
          proposed.map((x) => ({
            feature_id: x.feature_id,
            template_id: x.template_id,
            label: x.label,
            description: x.description,
            interval_months: x.interval_months,
            as_needed: x.as_needed,
            remind_month: x.remind_month,
            next_due: rollForward(x.next_due, x, today),
          })),
          feats.flatMap((f) => {
            const bt = featureBuildType(f, categories);
            const end = warrantyEnd(completedOn, bt ? settings?.warranties?.[bt] : null);
            return end ? [{ feature_id: f.id, ends_on: end }] : [];
          }),
        );
        n++;
      }
      return n;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["maintenance-items"] });
      toast({ title: n ? `Reminders set up for ${n} past job${n === 1 ? "" : "s"}` : "No past jobs had matching features" });
    },
    onError: (e: Error) => toast({ title: "Couldn't finish", description: e.message, variant: "destructive" }),
  });

  if (!candidates.length) return null;
  return (
    <section className="card-surface space-y-2 p-5 md:p-6">
      <h2 className="text-[17px] font-bold tracking-tight text-foreground">Past completed jobs</h2>
      <p className="text-sm text-muted-foreground">
        {candidates.length} completed job{candidates.length === 1 ? " has" : "s have"} no maintenance reminders yet. Set them up from the templates above in one go —
        dates already passed roll forward to the next time it's due. You can change or stop any of them on the project.
      </p>
      <Button className="h-10" disabled={run.isPending || !templates.length} onClick={() => run.mutate()}>
        {run.isPending ? "Setting up…" : `Set up ${candidates.length} past job${candidates.length === 1 ? "" : "s"}`}
      </Button>
    </section>
  );
}
