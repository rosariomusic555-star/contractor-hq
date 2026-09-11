import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Calculator } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import {
  getMaterialDefaults,
  saveMaterialDefaults,
  MATERIAL_DEFAULTS_FALLBACK,
  type MaterialDefaults,
} from "@/lib/api";

/**
 * Construction/calculation assumptions used by the Materials Sheet's Smart
 * Calculator (waste factor, base depth) — a real, persisted table
 * (material_defaults, 0034), one row per user. Deliberately its own page
 * rather than folded into Settings > Quote defaults: this is about
 * material math, not quote terms/money — a different category of setting
 * even though both are "defaults you can override per job."
 */
export function SettingsMaterialDefaultsView() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["material-defaults"],
    queryFn: getMaterialDefaults,
  });

  const seed = (): MaterialDefaults => data ?? MATERIAL_DEFAULTS_FALLBACK;
  const [draft, setDraft] = useState<MaterialDefaults>(seed);
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const edit = (patch: Partial<MaterialDefaults>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const revert = () => {
    dirty.current = false;
    setDraft(seed());
  };

  const saveMut = useMutation({
    mutationFn: () => saveMaterialDefaults(draft),
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["material-defaults"] });
      toast({ title: "Material defaults saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Material defaults" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Material defaults</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Calculator className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Used by the Smart Calculator</span>
        </div>

        <div className="space-y-5 bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Pre-fills the Materials Sheet's Smart Calculator — you can override either one per job.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Waste factor"
              suffix="%"
              value={draft.waste_factor_pct}
              onChange={(v) => edit({ waste_factor_pct: v })}
              note="Added to calculated order quantities"
            />
            <NullableNumberField
              label="Base depth"
              suffix="in"
              value={draft.base_depth_default_in}
              onChange={(v) => edit({ base_depth_default_in: v })}
              note="Default compacted-base depth"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2.5">
        <Button variant="outline" onClick={revert} disabled={saveMut.isPending} className="h-11 rounded-xl">
          Revert
        </Button>
        <Button
          className="h-11 rounded-xl font-bold"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || isLoading}
        >
          {saveMut.isPending ? "Saving…" : "Save defaults"}
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  note,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  note: string;
  suffix: string;
  step?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="relative mt-1.5">
        <Input
          type="number"
          step={step ?? "1"}
          min="0"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-10 pr-12"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {suffix}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-subtle">{note}</div>
    </div>
  );
}

/** Same as NumberField, but an empty field means "not set" (null) rather
 * than coercing to 0 — there's no universal base-depth default across
 * build types, so leaving it blank is a real, valid choice. */
function NullableNumberField({
  label,
  value,
  onChange,
  note,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  note: string;
  suffix: string;
}) {
  const [str, setStr] = useState(value == null ? "" : String(value));
  useEffect(() => setStr(value == null ? "" : String(value)), [value]);

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="relative mt-1.5">
        <Input
          type="number"
          step="0.5"
          min="0"
          inputMode="decimal"
          placeholder="Not set"
          value={str}
          onChange={(e) => {
            setStr(e.target.value);
            const parsed = parseFloat(e.target.value);
            onChange(e.target.value.trim() === "" || Number.isNaN(parsed) ? null : parsed);
          }}
          className="h-10 pr-12"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {suffix}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted-subtle">{note}</div>
    </div>
  );
}
