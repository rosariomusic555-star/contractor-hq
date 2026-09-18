import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, CalendarRange } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import {
  getBacklogSettings,
  saveBacklogSettings,
  BACKLOG_SETTINGS_FALLBACK,
  type BacklogSettings,
} from "@/lib/api";

/** Real, persisted (0054) — backs the Dashboard Seasonal Backlog card's
 * per-month capacity figure. */
export function SettingsCapacityView() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["backlog-settings"], queryFn: getBacklogSettings });

  const seed = (): BacklogSettings => data ?? BACKLOG_SETTINGS_FALLBACK;
  const [draft, setDraft] = useState<BacklogSettings>(seed);
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const edit = (patch: Partial<BacklogSettings>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const revert = () => {
    dirty.current = false;
    setDraft(seed());
  };

  const saveMut = useMutation({
    mutationFn: () => saveBacklogSettings(draft),
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["backlog-settings"] });
      toast({ title: "Seasonal capacity saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Seasonal capacity" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Seasonal capacity</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <CalendarRange className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Drives the Dashboard backlog card</span>
        </div>

        <div className="space-y-5 bg-card p-5">
          <p className="text-sm text-muted-foreground">
            How much committed work (approved/invoiced/paid jobs) you can take on in a single calendar
            month, in dollars. The Seasonal Backlog card compares each month's committed contract value
            against this to show "Full" / "Room for N" / "Open."
          </p>

          <div className="max-w-xs">
            <div className="text-xs font-semibold text-muted-foreground">Capacity per month</div>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                type="number"
                min="0"
                step="1000"
                inputMode="decimal"
                value={draft.capacity_dollars_per_month}
                onChange={(e) => edit({ capacity_dollars_per_month: parseFloat(e.target.value) || 0 })}
                className="h-10 pl-6"
              />
            </div>
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
          {saveMut.isPending ? "Saving…" : "Save capacity"}
        </Button>
      </div>
    </div>
  );
}
