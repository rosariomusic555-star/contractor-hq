import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { requestPortalLink } from "@/lib/portalApi";

/**
 * The Client Hub's own sign-in screen — email in, magic link out. No
 * password, no account creation UI: entering an email either matches a
 * client record somewhere and gets a link, or doesn't, and the screen
 * looks identical either way (see portal-request-link's own doc comment
 * for why that's a hard requirement, not an oversight).
 */
export function PortalSignIn({ initialEmail = "", notice }: { initialEmail?: string; notice?: string } = {}) {
  const { toast } = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState<string | null>(null);

  const requestMut = useMutation({
    mutationFn: (value: string) => requestPortalLink(value),
    onSuccess: (_data, value) => setSent(value),
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  if (sent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-bold text-foreground">Check your email</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          If <span className="font-semibold text-foreground">{sent}</span> matches an account, we've
          sent a sign-in link. Open it on any device; each link works once.
        </p>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-2 text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-5 text-center">
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-foreground">{notice ? "Let's get you a new link" : "Client sign-in"}</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send you a link to view your project.
          </p>
        </div>
        {notice && (
          <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-foreground">
            {notice}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = email.trim();
            if (value && !requestMut.isPending) requestMut.mutate(value);
          }}
          className="space-y-3"
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="h-11 text-center"
            autoFocus
            autoComplete="email"
          />
          <Button type="submit" className="h-11 w-full font-bold" disabled={!email.trim() || requestMut.isPending}>
            {requestMut.isPending ? "Sending…" : notice ? "Send me a new link" : "Send sign-in link"}
          </Button>
        </form>
      </div>
    </div>
  );
}
