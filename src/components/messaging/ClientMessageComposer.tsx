import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Mail, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { sendClientMessage, type MessageChannel } from "@/lib/clientMessaging";

/**
 * The shared "message a client" block (Client heads-up, review requests):
 * editable message, big Text / Email buttons (only when that contact info
 * exists — otherwise "No phone number on file · Add"), Copy, optional Skip,
 * then "Mark as sent?" — the app can't see the send itself. Everything goes
 * out through sendClientMessage().
 */
export function ClientMessageComposer({
  message,
  onMessageChange,
  subject,
  phone,
  email,
  clientId,
  clientName,
  onMarkSent,
  marking,
  onSkip,
  skipping,
}: {
  message: string;
  onMessageChange: (v: string) => void;
  subject: string;
  phone: string | null | undefined;
  email: string | null | undefined;
  clientId?: string | null;
  clientName?: string | null;
  onMarkSent: (channel: MessageChannel) => void;
  marking: boolean;
  onSkip?: () => void;
  skipping?: boolean;
}) {
  const { toast } = useToast();
  const [asked, setAsked] = useState<MessageChannel | null>(null);
  const tel = phone?.trim() || null;
  const mail = email?.trim() || null;

  const send = async (channel: MessageChannel) => {
    const r = await sendClientMessage(channel, channel === "text" ? tel : channel === "email" ? mail : null, message, subject);
    if (r.status === "failed") return toast({ title: "Couldn't open that", description: r.error, variant: "destructive" });
    if (r.status === "copied") toast({ title: "Message copied" });
    if (r.status === "sent") return onMarkSent(channel);
    setAsked(channel);
  };

  return (
    <>
      <Textarea
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
        rows={4}
        className="text-sm"
        aria-label={`Message to ${clientName ?? "client"}`}
      />
      {asked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-info/10 p-2.5">
          <span className="text-sm font-semibold text-foreground">Mark as sent?</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAsked(null)}>
              Not yet
            </Button>
            <Button
              size="sm"
              className="font-bold"
              disabled={marking}
              onClick={() => {
                onMarkSent(asked);
                setAsked(null);
              }}
            >
              Yes, sent
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {tel ? (
              <Button className="h-12 text-base font-bold" onClick={() => void send("text")}>
                <MessageSquareText className="mr-2 h-5 w-5" /> Text
              </Button>
            ) : (
              <MissingContact label="No phone number on file" clientId={clientId} />
            )}
            {mail ? (
              <Button variant="outline" className="h-12 text-base font-bold" onClick={() => void send("email")}>
                <Mail className="mr-2 h-5 w-5" /> Email
              </Button>
            ) : (
              <MissingContact label="No email on file" clientId={clientId} />
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" className="h-9" onClick={() => void send("copy")}>
              <Copy className="mr-1.5 h-4 w-4" /> Copy
            </Button>
            {onSkip && (
              <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" disabled={skipping} onClick={onSkip}>
                Skip
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}

function MissingContact({ label, clientId }: { label: string; clientId?: string | null }) {
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
