import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Mail, MessageSquare, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getBusinessProfile,
  listMessageTemplates,
  listScheduleUpdates,
  markHeadsUpSent,
  setScheduleUpdatesClientVisible,
  updateScheduleUpdate,
  type ScheduleUpdate,
} from "@/lib/api";
import { sendClientMessage, type MessageChannel } from "@/lib/clientMessaging";
import {
  DEFAULT_TEMPLATES,
  clientHubLink,
  fillTemplate,
  templateKeyFor,
  templateVars,
  type TemplateKey,
} from "@/lib/messageTemplates";
import { changeSummary } from "@/lib/scheduleShift";
import { invalidateHeadsUp } from "./useUndoScheduleDelay";

export type HeadsUpScope = { delayId: string } | { ids: string[] } | { projectId: string };

/** Hub-postable: a real change to existing dates (not a confirmation or a
 * first-time schedule). */
const hubEligible = (u: ScheduleUpdate) => u.source !== "confirm" && !!u.from_start;

/**
 * Client heads-up (0121): one card per affected job — its client, old →
 * new dates and the filled-in message (editable) — with Text / Email / Copy
 * through sendClientMessage(), then "Mark as sent?". Skip per client. A
 * Client Hub toggle covers the Hub posts for these changes (default on).
 * Closing is fine: anything still pending shows as a reminder on the job's
 * Schedule card.
 */
export function HeadsUpStep({ scope, onDone }: { scope: HeadsUpScope; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const filter = "delayId" in scope ? { delayId: scope.delayId } : "ids" in scope ? { ids: scope.ids } : { projectId: scope.projectId, pendingOnly: true };
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["schedule-updates", "step", filter],
    queryFn: () => listScheduleUpdates(filter),
  });
  // The delayed job first, then the jobs it cascaded into.
  const updates = [...rows].sort((a, b) => Number(b.delay?.project_id === b.project_id) - Number(a.delay?.project_id === a.project_id));
  const { data: templates = [] } = useQuery({ queryKey: ["message-templates"], queryFn: listMessageTemplates });
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile });

  const eligible = updates.filter(hubEligible);
  const hubOn = eligible.length > 0 && eligible.every((u) => u.client_visible);
  const hubMut = useMutation({
    mutationFn: (v: boolean) => setScheduleUpdatesClientVisible(eligible.map((u) => u.id), v),
    onSuccess: () => invalidateHeadsUp(qc),
    onError: (err: Error) => toast({ title: "Couldn't update the Client Hub", description: err.message, variant: "destructive" }),
  });

  const template = (key: TemplateKey) => {
    const saved = templates.find((t) => t.key === key);
    return { subject: saved?.subject ?? DEFAULT_TEMPLATES[key].subject, body: saved?.body ?? DEFAULT_TEMPLATES[key].body };
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-3 px-5 py-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <MessageSquare className="h-4 w-4" /> Let affected clients know
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients to update — none of these jobs has a client, or they're all done.</p>
        ) : (
          <>
            {eligible.length > 0 && (
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
                <span>
                  <span className="block text-sm font-semibold text-foreground">Post in the Client Hub</span>
                  <span className="block text-xs text-muted-foreground">Shows the new dates on each client's project page — only their own job</span>
                </span>
                <Switch checked={hubOn} disabled={hubMut.isPending} onCheckedChange={(v) => hubMut.mutate(v)} />
              </label>
            )}
            {updates.map((u) => {
              const key = templateKeyFor(u);
              const t = template(key);
              const vars = templateVars({
                update: u,
                clientName: u.client?.name,
                companyName: profile?.company_name,
                projectName: u.project?.name ?? "project",
                hubLink: clientHubLink(u.project_id),
                delayDay: u.delay?.delay_date ?? null,
                daysDelayed: u.delay?.days ?? null,
              });
              return (
                <HeadsUpCard
                  key={u.id}
                  update={u}
                  templateKey={key}
                  initialMessage={u.message ?? fillTemplate(t.body, vars)}
                  subject={fillTemplate(t.subject, vars)}
                  onChanged={() => invalidateHeadsUp(qc)}
                />
              );
            })}
          </>
        )}
      </div>
      <div className="sticky bottom-0 border-t border-hairline bg-background px-5 py-3">
        <Button className="h-12 w-full text-base font-bold" onClick={onDone}>
          Done
        </Button>
        {updates.some((u) => u.heads_up_status === "pending") && (
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Anything not sent stays as a reminder on the job's Schedule card.</p>
        )}
      </div>
    </div>
  );
}

function HeadsUpCard({
  update: u,
  templateKey,
  initialMessage,
  subject,
  onChanged,
}: {
  update: ScheduleUpdate;
  templateKey: TemplateKey;
  initialMessage: string;
  subject: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [message, setMessage] = useState(initialMessage);
  const [asked, setAsked] = useState<MessageChannel | null>(null);
  // Templates / profile load after the first render — follow them until edited.
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!edited) setMessage(initialMessage);
  }, [initialMessage, edited]);

  const phone = u.client?.phone?.trim() || null;
  const email = u.client?.email?.trim() || null;
  const done = u.heads_up_status !== "pending";

  const send = async (channel: MessageChannel) => {
    const r = await sendClientMessage(channel, channel === "text" ? phone : channel === "email" ? email : null, message, subject);
    if (r.status === "failed") return toast({ title: "Couldn't open that", description: r.error, variant: "destructive" });
    if (r.status === "copied") toast({ title: "Message copied" });
    if (r.status === "sent") return markSent.mutate(channel);
    setAsked(channel);
  };
  const markSent = useMutation({
    mutationFn: (channel: MessageChannel) => markHeadsUpSent(u, channel, message, templateKey),
    onSuccess: () => {
      setAsked(null);
      onChanged();
    },
    onError: (err: Error) => toast({ title: "Couldn't mark as sent", description: err.message, variant: "destructive" }),
  });
  const setStatus = useMutation({
    mutationFn: (status: "skipped" | "pending") => updateScheduleUpdate(u.id, { heads_up_status: status }),
    onSuccess: onChanged,
  });

  return (
    <div className={cn("space-y-2.5 rounded-xl border border-border p-3", done && "bg-muted/30")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{u.client?.name ?? "No client"}</p>
          <p className="truncate text-xs text-muted-foreground">{u.project?.name}</p>
          {u.source !== "confirm" && <p className="text-xs text-muted-foreground">{changeSummary({ from: { start: u.from_start, end: u.from_end }, to: { start: u.to_start, end: u.to_end } })}</p>}
        </div>
        {u.heads_up_status === "sent" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
            <Check className="h-3 w-3" /> Sent{u.channel ? ` · ${u.channel === "copy" ? "copied" : u.channel}` : ""}
          </span>
        )}
        {u.heads_up_status === "skipped" && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Skipped</span>}
      </div>

      {!done && (
        <>
          <Textarea
            value={message}
            onChange={(e) => {
              setEdited(true);
              setMessage(e.target.value);
            }}
            rows={4}
            className="text-sm"
            aria-label={`Message to ${u.client?.name ?? "client"}`}
          />
          {asked ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-info/10 p-2.5">
              <span className="text-sm font-semibold text-foreground">Mark as sent?</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAsked(null)}>
                  Not yet
                </Button>
                <Button size="sm" className="font-bold" disabled={markSent.isPending} onClick={() => markSent.mutate(asked)}>
                  Yes, sent
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {phone ? (
                  <Button className="h-12 text-base font-bold" onClick={() => void send("text")}>
                    <MessageSquareText className="mr-2 h-5 w-5" /> Text
                  </Button>
                ) : (
                  <MissingContact label="No phone number on file" clientId={u.client?.id} />
                )}
                {email ? (
                  <Button variant="outline" className="h-12 text-base font-bold" onClick={() => void send("email")}>
                    <Mail className="mr-2 h-5 w-5" /> Email
                  </Button>
                ) : (
                  <MissingContact label="No email on file" clientId={u.client?.id} />
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" className="h-9" onClick={() => void send("copy")}>
                  <Copy className="mr-1.5 h-4 w-4" /> Copy
                </Button>
                <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" disabled={setStatus.isPending} onClick={() => setStatus.mutate("skipped")}>
                  Skip
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {u.heads_up_status === "skipped" && (
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setStatus.mutate("pending")}>
          Undo skip
        </Button>
      )}
    </div>
  );
}

function MissingContact({ label, clientId }: { label: string; clientId?: string }) {
  return (
    <p className="flex h-12 items-center justify-center rounded-md border border-dashed border-border px-2 text-center text-xs text-muted-foreground">
      {label}
      {clientId && (
        <>
          {" · "}
          <Link to={`/clients/${clientId}`} className="ml-1 font-semibold text-primary hover:text-primary/80">
            Add
          </Link>
        </>
      )}
    </p>
  );
}
