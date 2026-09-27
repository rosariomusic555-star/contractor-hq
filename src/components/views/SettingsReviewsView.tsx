import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getReviewSettings, listReviewRequests, saveReviewSettings, type ReviewSettings, type ReviewSite } from "@/lib/api";
import { reviewSummary } from "@/lib/reviews";

const SITES: { site: ReviewSite; label: string; placeholder: string }[] = [
  { site: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourpage/reviews" },
  { site: "yelp", label: "Yelp", placeholder: "https://yelp.com/biz/your-business" },
  { site: "houzz", label: "Houzz", placeholder: "https://houzz.com/pro/your-business" },
  { site: "angi", label: "Angi", placeholder: "https://angi.com/companylist/…" },
];

const normalizeUrl = (u: string) => {
  const t = u.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

/**
 * Settings › Reviews (0122) — Google review requests. The client always gets
 * the review link when asked; there's deliberately no "only ask happy
 * clients" filter (Google prohibits review gating).
 */
export function SettingsReviewsView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: getReviewSettings });
  const { data: requests = [] } = useQuery({ queryKey: ["review-requests"], queryFn: listReviewRequests });
  const [draft, setDraft] = useState<ReviewSettings | null>(null);
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const save = useMutation({
    mutationFn: (s: ReviewSettings) =>
      saveReviewSettings({
        ...s,
        google_url: normalizeUrl(s.google_url ?? "") || null,
        other_sites: s.other_sites.map((x) => ({ ...x, url: normalizeUrl(x.url) })).filter((x) => x.url),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-settings"] });
      qc.invalidateQueries({ queryKey: ["review-requests"] });
      toast({ title: "Review settings saved" });
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });

  if (!draft) return <p className="text-muted-foreground">Loading…</p>;
  const set = (patch: Partial<ReviewSettings>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const siteUrl = (site: ReviewSite) => draft.other_sites.find((x) => x.site === site)?.url ?? "";
  const setSite = (site: ReviewSite, url: string) =>
    set({ other_sites: [...draft.other_sites.filter((x) => x.site !== site), { site, url }] });
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const reminderOk = Number.isInteger(draft.reminder_days) && draft.reminder_days >= 1 && draft.reminder_days <= 60;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5 pb-20">
      <MobilePageHeader title="Reviews" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Reviews</h1>
      </div>

      <ReviewsSummary requests={requests} />

      <section className="card-surface p-5 md:p-6">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-bold text-foreground">Ask clients for reviews</span>
            <span className="block text-xs text-muted-foreground">Prompts you when a job is finished, and shows a review card in the Client Hub</span>
          </span>
          <Switch checked={draft.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        </label>
      </section>

      <section className={cn("card-surface space-y-4 p-5 md:p-6", !draft.enabled && "opacity-60")}>
        <div>
          <h2 className="text-[17px] font-bold tracking-tight text-foreground">Google review link</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            In your Google Business Profile, open <span className="font-semibold">Ask for reviews</span> (or “Get more reviews”) and copy the link it
            gives you. It looks like <span className="font-mono">https://g.page/r/…/review</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <Input value={draft.google_url ?? ""} onChange={(e) => set({ google_url: e.target.value })} placeholder="https://g.page/r/…/review" />
          <Button
            variant="outline"
            className="shrink-0"
            disabled={!draft.google_url?.trim()}
            onClick={() => window.open(normalizeUrl(draft.google_url ?? ""), "_blank", "noopener")}
          >
            <ExternalLink className="mr-1.5 h-4 w-4" /> Test link
          </Button>
        </div>

        <div>
          <h3 className="text-sm font-bold text-foreground">Other review sites (optional)</h3>
          <p className="text-xs text-muted-foreground">Google is used first. These are only used if you don't have a Google link.</p>
          <div className="mt-2 space-y-2">
            {SITES.map((x) => (
              <label key={x.site} className="grid grid-cols-[72px_1fr] items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{x.label}</span>
                <Input value={siteUrl(x.site)} onChange={(e) => setSite(x.site, e.target.value)} placeholder={x.placeholder} className="h-9" />
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className={cn("card-surface space-y-4 p-5 md:p-6", !draft.enabled && "opacity-60")}>
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">When to ask</h2>
        <Choice
          value={draft.ask_when}
          onChange={(v) => set({ ask_when: v as ReviewSettings["ask_when"] })}
          options={[
            { value: "completed", label: "When the project is marked Complete" },
            { value: "paid", label: "Once it's also fully paid ($0 remaining)" },
          ]}
        />
        <div>
          <span className="text-xs font-semibold text-muted-foreground">Delay</span>
          <Choice
            value={String(draft.delay_days)}
            onChange={(v) => set({ delay_days: Number(v) as ReviewSettings["delay_days"] })}
            options={[
              { value: "0", label: "Same day" },
              { value: "1", label: "1 day after" },
              { value: "3", label: "3 days after" },
            ]}
            inline
          />
        </div>
        <label className="block max-w-[260px]">
          <span className="text-xs font-semibold text-muted-foreground">Remind once if not clicked after (days)</span>
          <Input
            inputMode="numeric"
            value={String(draft.reminder_days)}
            onChange={(e) => set({ reminder_days: Math.floor(Number(e.target.value) || 0) })}
            className="mt-1"
          />
        </label>
        {!reminderOk && <p className="text-xs text-destructive">Use 1–60 days.</p>}
        <p className="text-xs text-muted-foreground">
          The message itself is in{" "}
          <Link to="/settings/messages" className="font-semibold text-primary">
            Settings › Messages
          </Link>{" "}
          (Review request / Review reminder). Every client you ask gets the same review link — there's no “only happy clients” filter, which
          Google doesn't allow.
        </p>
      </section>

      <div className="sticky bottom-20 flex justify-end md:bottom-4">
        <Button className="h-11 font-bold shadow-card" disabled={!dirty || !reminderOk || save.isPending} onClick={() => save.mutate(draft)}>
          Save
        </Button>
      </div>
    </div>
  );
}

function Choice({
  value,
  onChange,
  options,
  inline,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  inline?: boolean;
}) {
  return (
    <div className={cn("mt-1 gap-2", inline ? "flex flex-wrap" : "grid")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors",
            value === o.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ReviewsSummary({ requests }: { requests: Parameters<typeof reviewSummary>[0] }) {
  const [days, setDays] = useState<30 | 90>(30);
  const s = reviewSummary(requests, days);
  return (
    <section className="card-surface p-5 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Summary</h2>
        <div className="flex gap-1">
          {([30, 90] as const).map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} className="h-8" onClick={() => setDays(d)}>
              {d} days
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Requests sent", s.sent],
          ["Clicked", s.clicked],
          ["Marked left", s.left],
          ["Click rate", s.clickRate == null ? "—" : `${s.clickRate}%`],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-muted/40 p-3">
            <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
            <p className="text-xl font-extrabold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
