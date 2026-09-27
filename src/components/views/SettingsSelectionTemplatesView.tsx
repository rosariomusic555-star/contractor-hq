import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { deleteSelectionTemplate, listSelectionTemplates, saveSelectionTemplate, type SelectionGroupTemplate } from "@/lib/api";
import { priceLabel } from "@/lib/selections";

type Opt = SelectionGroupTemplate["options"][number] & { key: string; price: string; cost: string };
const toOpt = (o: Partial<SelectionGroupTemplate["options"][number]>): Opt => ({
  key: crypto.randomUUID(),
  name: o.name ?? "",
  description: o.description ?? null,
  image_path: o.image_path ?? null,
  catalog_product_id: o.catalog_product_id ?? null,
  color: o.color ?? null,
  price_delta: Number(o.price_delta) || 0,
  cost_delta: Number(o.cost_delta) || 0,
  is_default: !!o.is_default,
  price: o.price_delta ? String(o.price_delta) : "",
  cost: o.cost_delta ? String(o.cost_delta) : "",
});

/**
 * Settings › Selection templates (0115): the client-selection groups saved
 * for reuse ("Save group as template" / "Insert saved group" on a quote
 * section). Editing a template never changes quotes it was already used on.
 */
export function SettingsSelectionTemplatesView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: templates = [] } = useQuery({ queryKey: ["selection-templates"], queryFn: listSelectionTemplates });
  const [editing, setEditing] = useState<SelectionGroupTemplate | "new" | null>(null);
  const remove = useMutation({
    mutationFn: deleteSelectionTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["selection-templates"] });
      toast({ title: "Template deleted" });
    },
  });
  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Selection templates" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Selection templates</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Client selection groups you reuse — insert one on any quote section with "Insert saved group". Changing a template doesn't change quotes it's already on.
      </p>
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-1 h-4 w-4" />
          New template
        </Button>
      </div>
      {templates.length === 0 ? (
        <p className="card-surface p-5 text-sm text-muted-foreground">No templates yet. Save one from a quote with "Also save this group as a template".</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="card-surface flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="font-semibold text-foreground">
                  {t.name}
                  <span className="ml-1.5 text-xs font-normal text-muted-subtle">
                    {t.required ? "Required" : "Optional"}
                    {t.multi ? " · multiple" : ""}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.options.map((o) => `${o.name} (${priceLabel(Number(o.price_delta))})`).join(" · ")}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(t.id)} aria-label={`Delete ${t.name}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateDialog template={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateDialog({ template, onClose }: { template: SelectionGroupTemplate | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(template?.name ?? "");
  const [help, setHelp] = useState(template?.help_text ?? "");
  const [required, setRequired] = useState(template?.required ?? true);
  const [multi, setMulti] = useState(template?.multi ?? false);
  const [opts, setOpts] = useState<Opt[]>((template?.options ?? []).map(toOpt));
  const edit = (key: string, patch: Partial<Opt>) => setOpts((os) => os.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const save = useMutation({
    mutationFn: () =>
      saveSelectionTemplate({
        id: template?.id,
        name,
        help_text: help,
        required,
        multi,
        options: opts.map(({ key, price, cost, ...o }) => ({ ...o, price_delta: Number(price) || 0, cost_delta: Number(cost) || 0 })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["selection-templates"] });
      toast({ title: "Template saved" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  const invalid = !name.trim() || opts.length < 2 || opts.some((o) => !o.name.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Prices: a positive number adds, a negative number is a discount, 0 is included.</DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Paver color" />
        <Input value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Help text (optional)" />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={required} onCheckedChange={(v) => setRequired(!!v)} />
            Required
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={multi} onCheckedChange={(v) => setMulti(!!v)} />
            Multiple choice
          </label>
        </div>
        <div className="space-y-2">
          {opts.map((o) => (
            <div key={o.key} className="grid grid-cols-[1fr_90px_90px_auto_auto] items-center gap-1.5">
              <Input value={o.name} onChange={(e) => edit(o.key, { name: e.target.value })} placeholder="Option" className="h-9" />
              <Input inputMode="decimal" value={o.price} onChange={(e) => edit(o.key, { price: e.target.value })} placeholder="Price ±" className="h-9" />
              <Input inputMode="decimal" value={o.cost} onChange={(e) => edit(o.key, { cost: e.target.value })} placeholder="Cost ±" className="h-9" title="Internal only" />
              <label className="flex items-center gap-1 text-[11px]" title="Default">
                <Checkbox checked={o.is_default} onCheckedChange={(v) => setOpts((os) => os.map((x) => (x.key === o.key ? { ...x, is_default: !!v } : multi ? x : { ...x, is_default: v ? false : x.is_default })))} />
                Default
              </label>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpts((os) => os.filter((x) => x.key !== o.key))} aria-label="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setOpts((os) => [...os, toOpt({ is_default: os.length === 0 })])}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add option
          </Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={invalid || save.isPending} onClick={() => save.mutate()}>
            Save template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
