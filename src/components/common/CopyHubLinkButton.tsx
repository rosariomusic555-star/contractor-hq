import { Link2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

/**
 * Copies a Client Hub address to paste into a text or email. The client
 * opens it, types their email once and gets the sign-in link (the Hub only
 * accepts magic-link sign-ins, 0140). If the browser blocks the clipboard,
 * the toast shows the address so it can still be copied by hand.
 */
export function CopyHubLinkButton({
  url,
  label = "Copy Hub link",
  ...buttonProps
}: { url: string; label?: string } & Omit<ButtonProps, "onClick" | "children">) {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Client Hub link copied", description: "Paste it in a text or email — they sign in with their email, no password." });
    } catch {
      toast({ title: "Copy this Client Hub link", description: url });
    }
  };
  return (
    <Button type="button" onClick={copy} {...buttonProps}>
      <Link2 className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  );
}
