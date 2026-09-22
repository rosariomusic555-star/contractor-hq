import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Building2, ImagePlus, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  getBusinessProfile,
  saveBusinessProfile,
  uploadBusinessLogo,
  getSignedImageUrls,
  BUSINESS_PROFILE_FALLBACK,
  type BusinessProfile,
} from "@/lib/api";

const FIELD_LABEL = "text-[10px] font-bold uppercase tracking-wider text-muted-subtle";
const FIELD_INPUT = "h-11 rounded-xl border-transparent bg-muted px-3.5 focus-visible:border-primary focus-visible:bg-card";

/** Real, persisted (0055) — the address here is what the Dashboard Weather
 * Strip geocodes. Previously this whole screen was hardcoded defaultValue
 * props with a Save button wired to nothing. */
export function SettingsBusinessProfileView() {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });

  const seed = (): BusinessProfile => data ?? BUSINESS_PROFILE_FALLBACK;
  const [draft, setDraft] = useState<BusinessProfile>(seed);
  const dirty = useRef(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const { data: logoUrls = {} } = useQuery({
    queryKey: ["business-profile-logo-url", data?.logo_url],
    queryFn: () => getSignedImageUrls([data!.logo_url!]),
    enabled: !!data?.logo_url,
  });
  const logoPreviewUrl = data?.logo_url ? logoUrls[data.logo_url] : null;

  const logoMut = useMutation({
    mutationFn: async (file: File) => {
      if (!session?.user.id) throw new Error("Not signed in.");
      const path = await uploadBusinessLogo(session.user.id, file);
      await saveBusinessProfile({ logo_url: path });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-profile"] }),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (dirty.current) return;
    setDraft(seed());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const edit = (patch: Partial<BusinessProfile>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };

  const saveMut = useMutation({
    mutationFn: () => saveBusinessProfile(draft),
    onSuccess: () => {
      dirty.current = false;
      qc.invalidateQueries({ queryKey: ["business-profile"] });
      toast({ title: "Business profile saved" });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Business profile" back={{ to: "/settings", label: "Settings" }} />

      <div className="hidden md:block">
        <Link
          to="/settings"
          className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Settings
        </Link>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Business profile</h1>
      </div>

      <div className="overflow-hidden rounded-card border-2 border-primary shadow-card">
        <div className="flex items-center gap-3 bg-sidebar px-5 py-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.16] text-background">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-bold text-background">Company details</span>
        </div>

        <div className="grid grid-cols-1 gap-5 bg-card p-5 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <div className={FIELD_LABEL}>
              Logo <span className="normal-case text-muted-foreground">(shown in the Client Hub)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoMut.isPending}
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-border bg-muted text-muted-subtle transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {logoMut.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : logoPreviewUrl ? (
                  <img src={logoPreviewUrl} alt="Business logo" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) logoMut.mutate(file);
                }}
              />
              <p className="text-[11px] text-muted-subtle">Square images work best.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Company name</div>
            <Input
              value={draft.company_name ?? ""}
              onChange={(e) => edit({ company_name: e.target.value || null })}
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Phone</div>
            <Input
              value={draft.phone ?? ""}
              onChange={(e) => edit({ phone: e.target.value || null })}
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Business email</div>
            <Input
              value={draft.email ?? ""}
              onChange={(e) => edit({ email: e.target.value || null })}
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>License #</div>
            <Input
              value={draft.license ?? ""}
              onChange={(e) => edit({ license: e.target.value || null })}
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className={FIELD_LABEL}>Address</div>
            <Input
              value={draft.address ?? ""}
              onChange={(e) => edit({ address: e.target.value || null })}
              placeholder="128 Pine St, Northampton MA 01060"
              className={FIELD_INPUT}
            />
            <p className="text-[11px] text-muted-subtle">Used to geocode the Dashboard's 7-day weather strip.</p>
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Crew start time</div>
            <Input
              type="time"
              value={draft.crew_start_time}
              onChange={(e) => edit({ crew_start_time: e.target.value || "07:00" })}
              className={FIELD_INPUT}
            />
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Crew end time</div>
            <Input
              type="time"
              value={draft.crew_end_time}
              onChange={(e) => edit({ crew_end_time: e.target.value || "17:00" })}
              className={FIELD_INPUT}
            />
            <p className="text-[11px] text-muted-subtle md:col-span-2">
              Scopes the weather strip's rain % to when a crew is actually outside.
            </p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <div className={FIELD_LABEL}>Account email</div>
            <Input
              value={session?.user.email ?? ""}
              readOnly
              disabled
              className={FIELD_INPUT}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-border">
        <div className="bg-muted/50 px-5 py-3">
          <span className="text-[15px] font-bold text-foreground">Material budget alerts</span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Thresholds for the early-warning chips on a tracked project's Materials card.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 bg-card p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Over-order margin</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="1"
                value={draft.material_over_order_margin_pct}
                onChange={(e) => edit({ material_over_order_margin_pct: parseFloat(e.target.value) || 0 })}
                className={FIELD_INPUT}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-subtle">Flag a line once Ordered exceeds Estimated by more than this.</p>
          </div>
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Not-ordered warning</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="1"
                value={draft.material_not_ordered_alert_days}
                onChange={(e) => edit({ material_not_ordered_alert_days: parseFloat(e.target.value) || 0 })}
                className={FIELD_INPUT}
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <p className="text-[11px] text-muted-subtle">Flag an unordered line within this many days of the scheduled start.</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-border">
        <div className="bg-muted/50 px-5 py-3">
          <span className="text-[15px] font-bold text-foreground">Labor rates</span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Prefills a Labor Plan or labor log entry when the worker isn't an employee with their own rate
            (Settings &gt; Employees).
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 bg-card p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className={FIELD_LABEL}>Default hourly rate</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={draft.default_labor_rate}
                onChange={(e) => edit({ default_labor_rate: parseFloat(e.target.value) || 0 })}
                className={FIELD_INPUT}
              />
              <span className="text-sm text-muted-foreground">/ hr</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          className="h-11 rounded-xl font-bold"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || isLoading}
        >
          {saveMut.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
