import { Copy, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { withErrorBoundary } from "@/components/common/withErrorBoundary";

/**
 * Shared "here's the link" dialog for quotes and invoices. Copy puts the link
 * on the clipboard; Text / Email deep-link to the device's own Messages / Mail
 * app with the link pre-filled — no server-side sending.
 */
function ShareLinkDialogInner({
  open,
  onOpenChange,
  url,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  kind: "quote" | "invoice" | "change order" | "receipt";
}) {
  const { toast } = useToast();

  const message = `Here's your ${kind}: ${url}`;
  const smsHref = `sms:?&body=${encodeURIComponent(message)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(`Your ${kind}`)}&body=${encodeURIComponent(message)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied to clipboard" });
    } catch {
      toast({ title: "Share link", description: url });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this {kind}</DialogTitle>
          <DialogDescription>
            {kind === "receipt"
              ? "Send your client their receipt — they can view it and download a PDF. Nothing goes out until you send it."
              : `Send your client the link so they can review${kind === "quote" ? " and approve" : ""} it — nothing goes out until you send it.`}
          </DialogDescription>
        </DialogHeader>

        <Input
          readOnly
          value={url}
          className="font-mono text-sm"
          onFocus={(e) => e.currentTarget.select()}
        />

        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="outline" onClick={copy}>
            <Copy className="mr-1.5 h-4 w-4" />
            Copy
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href={smsHref}>
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Text
            </a>
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href={mailHref}>
              <Mail className="mr-1.5 h-4 w-4" />
              Email
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// A crash inside stays inside (see ErrorBoundary).
export const ShareLinkDialog = withErrorBoundary(ShareLinkDialogInner, "ShareLinkDialog");
