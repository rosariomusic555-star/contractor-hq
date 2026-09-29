import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import {
  deleteAutomationRule,
  getNotificationSettings,
  listAutomationRules,
  saveAutomationRule,
  saveNotificationSettings,
  type AutomationRule,
  type AutomationTrigger,
  type NotificationSettings,
} from "@/lib/api";

const TOGGLES: { key: keyof NotificationSettings; label: string; hint: string }[] = [
  { key: "quote_first_open", label: "A client opens a quote for the first time", hint: "\"Greg Gray just opened your Greg Patio quote\"" },
  { key: "quote_selections", label: "A client changes selections or optional items", hint: "Grouped — at most one per quote per hour" },
  { key: "quote_decided", label: "A quote is signed or declined", hint: "When the client does it, not when you mark it in the app" },
  { key: "quote_viewed_again", label: "A client views a quote again", hint: "A \"viewed again\" summary, at most once a day per quote" },
  { key: "change_order_decided", label: "A change order is signed or declined", hint: "When the client does it, not when you mark it approved in the app" },
];

const PRECON_TOGGLES: typeof TOGGLES = [
  {
    key: "precon",
    label: "Pre-construction",
    hint: "A job starting soon with required items open, a job ready to start, an 811 ticket expiring",
  },
];

const MAINTENANCE_TOGGLES: typeof TOGGLES = [
  {
    key: "maintenance",
    label: "Maintenance reminders",
    hint: "A past client's maintenance is coming due, and a client requests service from the Client Hub",
  },
];

const TIMESHEET_TOGGLES: typeof TOGGLES = [
  { key: "timesheets", label: "Timesheets", hint: "An employee submits a timesheet, and timesheets are waiting for approval" },
];

const REVIEW_TOGGLES: typeof TOGGLES = [
  {
    key: "review_activity",
    label: "Review requests",
    hint: "A finished job is ready to ask for a review, and a client opens your review link",
  },
];

const SCHEDULE_TOGGLES: typeof TOGGLES = [
  {
    key: "weather_risk",
    label: "Weather risk on upcoming work days",
    hint: "Each morning, scheduled work days in the next 3 days that newly became risky — again only if it gets worse",
  },
];

const TRIGGERS: { value: AutomationTrigger; label: string }[] = [
  { value: "quote_viewed", label: "Quote viewed" },
  { value: "quote_not_opened", label: "Quote not opened after X days" },
  { value: "quote_viewed_not_signed", label: "Quote viewed but not signed after Y days" },
  { value: "review_eligible", label: "Project ready for a review request" },
  { value: "review_requested", label: "Review requested" },
  { value: "review_link_clicked", label: "Review link clicked" },
  { value: "precon_overdue", label: "Pre-construction item overdue" },
  { value: "precon_ready", label: "Project ready to start" },
  { value: "locate_expiring", label: "811 ticket expiring" },
  { value: "maintenance_due", label: "Maintenance due soon" },
  { value: "maintenance_overdue", label: "Maintenance overdue" },
];

const TASK_TYPES = [
  { value: "follow_up", label: "Follow up" },
  { value: "call", label: "Call" },
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
];

/**
 * Settings › Notifications (0117) — real now (this page used to be
 * decorative): which in-app notifications you get, when a quote counts as
 * "going cold", and automations that create follow-up tasks from quote
 * activity. Notifications are in-app (the bell) — email / text / push
 * aren't available yet.
 */
export function SettingsNotificationsView() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useQuery({ queryKey: ["notification-settings"], queryFn: getNotificationSettings });
  const { data: rules = [] } = useQuery({ queryKey: ["automation-rules"], queryFn: listAutomationRules });
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  useEffect(() => {
    if (settings) {
      setX(String(settings.cold_unopened_days));
      setY(String(settings.cold_unsigned_days));
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: (patch: Partial<NotificationSettings>) => saveNotificationSettings(patch),
    onMutate: (patch) => qc.setQueryData(["notification-settings"], (old: NotificationSettings | undefined) => (old ? { ...old, ...patch } : old)),
    onSettled: () => qc.invalidateQueries({ queryKey: ["notification-settings"] }),
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  const xn = Number(x);
  const yn = Number(y);
  const thresholdsValid = Number.isInteger(xn) && xn > 0 && Number.isInteger(yn) && yn > 0;
  const thresholdsDirty = !!settings && (xn !== settings.cold_unopened_days || yn !== settings.cold_unsigned_days);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Notifications" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Notifications</h1>
      </div>

      <section className="card-surface p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Quote activity</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">In-app notifications (the bell). Email, text and push aren't available yet.</p>
        <div className="mt-2 divide-y divide-hairline">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
              <div>
                <div className="text-sm font-semibold text-foreground">{t.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.hint}</div>
              </div>
              <Switch checked={!!settings?.[t.key]} disabled={!settings} onCheckedChange={(v) => save.mutate({ [t.key]: v } as Partial<NotificationSettings>)} />
            </label>
          ))}
        </div>
      </section>

      <section className="card-surface p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Schedule & reviews</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">What counts as risky is set in Settings › Schedule & weather.</p>
        <div className="mt-2 divide-y divide-hairline">
          {[...SCHEDULE_TOGGLES, ...PRECON_TOGGLES, ...REVIEW_TOGGLES, ...MAINTENANCE_TOGGLES, ...TIMESHEET_TOGGLES].map((t) => (
            <label key={t.key} className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
              <div>
                <div className="text-sm font-semibold text-foreground">{t.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.hint}</div>
              </div>
              <Switch checked={!!settings?.[t.key]} disabled={!settings} onCheckedChange={(v) => save.mutate({ [t.key]: v } as Partial<NotificationSettings>)} />
            </label>
          ))}
        </div>
      </section>

      <section className="card-surface space-y-3 p-5 md:p-6">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">"Going cold"</h2>
        <p className="text-xs text-muted-foreground">Flag a sent quote on the pipeline and quotes list when it's been quiet too long.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Not opened after (days) — X</span>
            <Input inputMode="numeric" value={x} onChange={(e) => setX(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Viewed but not signed after (days) — Y</span>
            <Input inputMode="numeric" value={y} onChange={(e) => setY(e.target.value)} className="mt-1" />
          </label>
        </div>
        {!thresholdsValid && <p className="text-xs text-destructive">Use whole days, 1 or more.</p>}
        <div className="flex justify-end">
          <Button size="sm" disabled={!thresholdsDirty || !thresholdsValid || save.isPending} onClick={() => save.mutate({ cold_unopened_days: xn, cold_unsigned_days: yn })}>
            Save
          </Button>
        </div>
      </section>

      <AutomationsCard rules={rules} x={settings?.cold_unopened_days ?? 3} y={settings?.cold_unsigned_days ?? 5} />
    </div>
  );
}

function AutomationsCard({ rules, x, y }: { rules: AutomationRule[]; x: number; y: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [trigger, setTrigger] = useState<AutomationTrigger>("quote_not_opened");
  const [title, setTitle] = useState("Follow up with {client} about their quote");
  const [type, setType] = useState("follow_up");
  const [due, setDue] = useState("0");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["automation-rules"] });
  const save = useMutation({
    mutationFn: (r: Omit<AutomationRule, "id"> & { id?: string }) => saveAutomationRule(r),
    onSuccess: () => {
      invalidate();
      setAdding(false);
    },
    onError: (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" }),
  });
  const remove = useMutation({ mutationFn: deleteAutomationRule, onSuccess: invalidate });
  const triggerLabel = (t: AutomationTrigger) =>
    t === "quote_not_opened"
      ? `Quote not opened after ${x} days`
      : t === "quote_viewed_not_signed"
        ? `Quote viewed but not signed after ${y} days`
        : (TRIGGERS.find((o) => o.value === t)?.label ?? t);

  return (
    <section className="card-surface space-y-3 p-5 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">Automations</h2>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Create a follow-up task automatically — once per quote per automation.</p>

      {rules.length === 0 && !adding && <p className="text-sm text-muted-foreground">No automations yet.</p>}
      <ul className="divide-y divide-hairline">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">When: {triggerLabel(r.trigger)}</div>
              <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                Create task "{r.task_title}" · due {r.due_in_days ? `in ${r.due_in_days} day${r.due_in_days === 1 ? "" : "s"}` : "today"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Switch checked={r.enabled} onCheckedChange={(v) => save.mutate({ ...r, enabled: v })} aria-label="Enabled" />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(r.id)} aria-label="Delete automation">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="space-y-1.5">
            <Label>When</Label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomationTrigger)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {triggerLabel(t.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auto-title">Task</Label>
            <Input id="auto-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <p className="text-[11px] text-muted-subtle">{"{client}"} and {"{project}"} are filled in.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auto-due">Due in (days)</Label>
              <Input id="auto-due" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!title.trim() || !(Number(due) >= 0) || save.isPending}
              onClick={() => save.mutate({ trigger, enabled: true, task_title: title, task_type: type, due_in_days: Math.floor(Number(due) || 0) })}
            >
              Save automation
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
