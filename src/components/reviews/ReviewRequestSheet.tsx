import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Star } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getBusinessProfile, getReviewRequest, getReviewSettings, listMessageTemplates, markReviewRequestSent } from "@/lib/api";
import { DEFAULT_TEMPLATES, clientHubLink, fillTemplate, reviewLink, reviewVars } from "@/lib/messageTemplates";
import { hasReviewLink } from "@/lib/reviews";
import type { MessageChannel } from "@/lib/clientMessaging";
import { ClientMessageComposer } from "@/components/messaging/ClientMessageComposer";
import { invalidateReviews } from "./reviewQueries";

/**
 * Ask a client for a review (0122) — the same message block as Client
 * heads-up (Text / Email / Copy → "Mark as sent?"). The message carries the
 * tracked link /r/{token}. Every client asked gets the same link — no
 * satisfaction check in between (Google's no-review-gating rule).
 */
export function ReviewRequestSheet({
  open,
  onOpenChange,
  projectId,
  reminder,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  reminder: boolean;
}) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rr, isLoading } = useQuery({ queryKey: ["review-request", projectId], queryFn: () => getReviewRequest(projectId), enabled: open });
  const { data: settings } = useQuery({ queryKey: ["review-settings"], queryFn: getReviewSettings, enabled: open });
  const { data: templates = [] } = useQuery({ queryKey: ["message-templates"], queryFn: listMessageTemplates, enabled: open });
  const { data: profile } = useQuery({ queryKey: ["business-profile"], queryFn: getBusinessProfile, enabled: open });

  const key = reminder ? "review_reminder" : "review_request";
  const saved = templates.find((t) => t.key === key);
  const t = { subject: saved?.subject ?? DEFAULT_TEMPLATES[key].subject, body: saved?.body ?? DEFAULT_TEMPLATES[key].body };
  const vars = rr
    ? reviewVars({
        clientName: rr.client?.name,
        companyName: profile?.company_name,
        projectName: rr.project?.name ?? "project",
        reviewLink: reviewLink(rr.token),
        hubLink: clientHubLink(projectId),
      })
    : null;
  const filled = vars ? fillTemplate(t.body, vars) : "";

  const [message, setMessage] = useState("");
  const [edited, setEdited] = useState(false);
  const [sentVia, setSentVia] = useState<MessageChannel | null>(null);
  useEffect(() => {
    if (open) {
      setEdited(false);
      setSentVia(null);
    }
  }, [open]);
  useEffect(() => {
    if (!edited) setMessage(filled);
  }, [filled, edited]);

  const mark = useMutation({
    mutationFn: (channel: MessageChannel) => markReviewRequestSent(projectId, channel, message, reminder),
    onSuccess: (_d, channel) => {
      setSentVia(channel);
      invalidateReviews(qc);
    },
    onError: (err: Error) => toast({ title: "Couldn't mark as sent", description: err.message, variant: "destructive" }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("flex flex-col gap-0 overflow-y-auto p-0", isMobile ? "max-h-[92vh] rounded-t-2xl" : "w-full sm:max-w-md")}
      >
        <SheetHeader className="border-b border-hairline px-5 pb-3 pt-5 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-warning" />
            {reminder ? "Remind about the review" : "Ask for a review"}
          </SheetTitle>
          <SheetDescription className="truncate">
            {rr ? `${rr.client?.name ?? "Client"} · ${rr.project?.name ?? ""}` : "…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 px-5 py-4">
          {isLoading || !settings ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !rr ? (
            <p className="text-sm text-muted-foreground">Review requests are for completed jobs with a client.</p>
          ) : !settings.enabled || !hasReviewLink(settings) ? (
            <p className="text-sm text-muted-foreground">
              Add your Google review link in{" "}
              <Link to="/settings/reviews" className="font-semibold text-primary" onClick={() => onOpenChange(false)}>
                Settings › Reviews
              </Link>{" "}
              first.
            </p>
          ) : sentVia ? (
            <div className="space-y-2 rounded-xl bg-success/10 p-4 text-sm">
              <p className="flex items-center gap-1.5 font-bold text-success">
                <Check className="h-4 w-4" /> {reminder ? "Reminder" : "Request"} marked as sent
              </p>
              <p className="text-muted-foreground">You'll get a notification when {rr.client?.name?.split(/\s+/)[0] ?? "they"} opens the review link.</p>
            </div>
          ) : (
            <div className="space-y-2.5 rounded-xl border border-border p-3">
              {rr.client?.no_review_requests && (
                <p className="rounded-lg bg-warning-strong/10 p-2 text-xs text-foreground">
                  This client is set to “Don't ask for reviews”. You can still send it by hand.
                </p>
              )}
              <ClientMessageComposer
                message={message}
                onMessageChange={(v) => {
                  setEdited(true);
                  setMessage(v);
                }}
                subject={vars ? fillTemplate(t.subject, vars) : ""}
                phone={rr.client?.phone}
                email={rr.client?.email}
                clientId={rr.client?.id}
                clientName={rr.client?.name}
                onMarkSent={(ch) => mark.mutate(ch)}
                marking={mark.isPending}
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-hairline bg-background px-5 py-3">
          <Button className="h-12 w-full text-base font-bold" variant={sentVia ? "default" : "outline"} onClick={() => onOpenChange(false)}>
            {sentVia ? "Done" : "Close"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
