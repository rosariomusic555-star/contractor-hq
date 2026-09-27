import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MobilePageHeader } from "@/components/common/MobilePageHeader";
import { BackLink } from "@/components/common/BackLink";
import { useToast } from "@/hooks/use-toast";
import { getBusinessProfile, listMessageTemplates, listProjects, resetMessageTemplate, saveMessageTemplate } from "@/lib/api";
import {
  DEFAULT_TEMPLATES,
  PLACEHOLDERS,
  TEMPLATE_LABEL,
  clientHubLink,
  fillTemplate,
  templateVars,
  reviewLink,
  reviewVars,
  unknownPlaceholders,
  type TemplateKey,
  type TemplateVars,
} from "@/lib/messageTemplates";
import { addWorkingDays } from "@/lib/scheduleShift";
import { isoDate } from "@/lib/weatherRisk";

const KEYS: TemplateKey[] = ["rain_delay", "schedule_change", "start_confirmed", "review_request", "review_reminder"];
const WHEN: Record<TemplateKey, string> = {
  rain_delay: "Used when a delay's reason is Rain or Weather.",
  schedule_change: "Used for other delay reasons and when you change a job's dates.",
  start_confirmed: "Used for “Confirm start date with client” and a job's first start date.",
  review_request: "Asking for a review once a job is finished. {review_link} is your tracked link.",
  review_reminder: "The one reminder, if the client hasn't opened the review link after a few days.",
};

/**
 * Settings › Messages (0121) — the client heads-up templates, with a live
 * preview filled from one of your real jobs. Messages open in your own
 * Messages / Mail app from the heads-up step; nothing is sent from here.
 */
export function SettingsMessagesView() {
  const { data: saved = [] } = useQuery({ queryKey: ["message-templates"], queryFn: listMessageTemplates });
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });

  // Preview sample: a real scheduled job with a client if there is one.
  const sample = projects.find((p) => p.client?.name && p.scheduled_start_date) ?? projects.find((p) => p.client?.name) ?? null;
  const start = sample?.scheduled_start_date ?? addWorkingDays(isoDate(new Date()), 3);
  const end = sample?.scheduled_end_date ?? addWorkingDays(start, 4);
  const sampleVars = (key: TemplateKey): TemplateVars =>
    key === "review_request" || key === "review_reminder"
      ? reviewVars({
          clientName: sample?.client?.name ?? "Greg Gray",
          companyName: profile?.company_name,
          projectName: sample?.name ?? "Greg Patio",
          reviewLink: reviewLink("sample"),
          hubLink: clientHubLink(sample?.id ?? "example"),
        })
      : templateVars({
      update: {
        source: key === "start_confirmed" ? "confirm" : "delay",
        reason: key === "rain_delay" ? "rain" : "material",
        from_start: start,
        from_end: end,
        to_start: key === "start_confirmed" ? start : addWorkingDays(start, 1),
        to_end: key === "start_confirmed" ? end : addWorkingDays(end, 1),
      },
      clientName: sample?.client?.name ?? "Greg Gray",
      companyName: profile?.company_name,
      projectName: sample?.name ?? "Greg Patio",
      hubLink: clientHubLink(sample?.id ?? "example"),
      delayDay: start,
      daysDelayed: 1,
    });

  return (
    <div className="mx-auto max-w-2xl animate-fade-in space-y-5">
      <MobilePageHeader title="Messages" back={{ to: "/settings", label: "Settings" }} />
      <div className="hidden md:block">
        <BackLink to="/settings" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground">
          Settings
        </BackLink>
        <h1 className="mt-2 text-[28px] font-bold tracking-tight text-foreground">Messages</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Client heads-ups after a schedule change. They open pre-written in your phone's Messages or Mail app — you hit send.
        {!profile?.company_name && (
          <>
            {" "}
            <Link to="/settings/business-profile" className="font-semibold text-primary hover:text-primary/80">
              Add your company name
            </Link>{" "}
            so {"{company_name}"} isn't “your contractor”.
          </>
        )}
      </p>
      {KEYS.map((key) => (
        <TemplateCard key={key} templateKey={key} saved={saved.find((t) => t.key === key)} vars={sampleVars(key)} sampleName={sample?.name ?? null} />
      ))}
    </div>
  );
}

function TemplateCard({
  templateKey,
  saved,
  vars,
  sampleName,
}: {
  templateKey: TemplateKey;
  saved?: { subject: string | null; body: string };
  vars: TemplateVars;
  sampleName: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const def = DEFAULT_TEMPLATES[templateKey];
  const current = { subject: saved?.subject ?? def.subject, body: saved?.body ?? def.body };
  const [subject, setSubject] = useState(current.subject);
  const [body, setBody] = useState(current.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setSubject(current.subject);
    setBody(current.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.subject, saved?.body]);

  const dirty = subject !== current.subject || body !== current.body;
  const unknown = unknownPlaceholders(`${subject} ${body}`);
  const onError = (err: Error) => toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
  const save = useMutation({
    mutationFn: () => saveMessageTemplate({ key: templateKey, subject: subject.trim() || null, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      toast({ title: `${TEMPLATE_LABEL[templateKey]} saved` });
    },
    onError,
  });
  const reset = useMutation({
    mutationFn: () => resetMessageTemplate(templateKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      setSubject(def.subject);
      setBody(def.body);
    },
    onError,
  });

  const insert = (key: string) => {
    const el = bodyRef.current;
    const token = `{${key}}`;
    if (!el) return setBody((b) => b + token);
    const [a, b] = [el.selectionStart ?? body.length, el.selectionEnd ?? body.length];
    setBody(body.slice(0, a) + token + body.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  return (
    <section className="card-surface space-y-3 p-5 md:p-6">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight text-foreground">{TEMPLATE_LABEL[templateKey]}</h2>
        <p className="text-xs text-muted-foreground">{WHEN[templateKey]}</p>
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">Email subject</span>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">Message</span>
        <Textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-1" />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {PLACEHOLDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            title={p.label}
            onClick={() => insert(p.key)}
            className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted"
          >
            {`{${p.key}}`}
          </button>
        ))}
      </div>
      {unknown.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
          <AlertTriangle className="h-3.5 w-3.5" /> Not a placeholder: {unknown.map((u) => `{${u}}`).join(", ")}
        </p>
      )}
      <div className="rounded-xl bg-muted/50 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-subtle">Preview{sampleName ? ` · ${sampleName}` : " · sample job"}</p>
        <p className="mt-1 text-xs font-semibold text-muted-foreground">{fillTemplate(subject, vars)}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground [overflow-wrap:anywhere]">{fillTemplate(body, vars)}</p>
      </div>
      <div className="flex justify-end gap-2">
        {saved && (
          <Button size="sm" variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate()}>
            Reset to default
          </Button>
        )}
        <Button size="sm" disabled={!dirty || !body.trim() || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </section>
  );
}
